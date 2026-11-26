// Pata PWA — cache applicatif et navigation hors connexion.
const CACHE_VERSION = 'v9';
const STATIC_CACHE = 'pata-static-' + CACHE_VERSION;
const PAGE_CACHE = 'pata-pages-' + CACHE_VERSION;
const ROUTE_CACHE = 'pata-rsc-' + CACHE_VERSION;
const OFFLINE_URL = '/offline.html';
const PRECACHE_URLS = ['/', '/dashboard', OFFLINE_URL, '/manifest.json'];
const MAX_PAGE_ENTRIES = 40;
const MAX_ROUTE_ENTRIES = 80;
const ROUTE_CACHE_TTL_MS = 60 * 1000;

function isCacheableResponse(response) {
  if (!response || response.status !== 200 || response.type === 'opaque' || response.redirected) return false;
  const cacheControl = response.headers.get('Cache-Control') || '';
  return !/\b(private|no-store)\b/i.test(cacheControl);
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  const excess = keys.length - maxEntries;
  if (excess <= 0) return;
  await Promise.all(keys.slice(0, excess).map((request) => cache.delete(request)));
}

async function storeWithTimestamp(cache, request, response) {
  const headers = new Headers(response.headers);
  headers.set('x-pata-cached-at', String(Date.now()));
  const cachedResponse = new Response(response.clone().body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  await cache.put(request, cachedResponse);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    // Une ressource non disponible ne doit pas empêcher l'installation du worker.
    await Promise.allSettled(PRECACHE_URLS.map(async (url) => {
      const response = await fetch(url, { cache: 'reload' });
      if (isCacheableResponse(response)) {
        try { await cache.put(url, response); } catch { /* le cache ne doit jamais bloquer l'installation */ }
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    const ownedCache = /^pata-(?:cache|static|pages|rsc)-/;
    await Promise.all(cacheNames
      .filter((name) => ownedCache.test(name) && ![STATIC_CACHE, PAGE_CACHE, ROUTE_CACHE].includes(name))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

/* Clic sur les notifications Pata : ouvrir une route interne du même domaine. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawTarget = event.notification.data?.url || '/dashboard';
  let target = '/dashboard';
  try {
    const requested = new URL(rawTarget, self.location.origin);
    if (requested.origin === self.location.origin) target = requested.pathname + requested.search + requested.hash;
  } catch { /* garder /dashboard */ }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(target);
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

/* Web Push : les notifications continuent de fonctionner lorsque Pata est fermé. */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  if (payload?.source !== 'pata-webpush') return;
  event.waitUntil(self.registration.showNotification(payload.title || 'Pata', {
    body: payload.body || 'Ouvre Pata pour consulter cette information.',
    icon: payload.icon || '/pata-notification.svg',
    badge: payload.badge || '/pata-notification-badge.svg',
    tag: payload.tag || 'pata-notification',
    renotify: false,
    data: { url: payload.url || '/dashboard' },
    ...(typeof payload.image === 'string' && payload.image.startsWith('https://') ? { image: payload.image } : {}),
  }));
});

async function handleStaticAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && response.type !== 'opaque') {
      try { await cache.put(request, response.clone()); } catch { /* conserver la réponse réseau même si le cache est plein */ }
    }
    return response;
  } catch {
    return new Response('Ressource indisponible hors connexion.', {
      status: 504,
      statusText: 'Gateway Timeout',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function handleNavigation(request) {
  const url = new URL(request.url);
  const pageKey = new URL(url.pathname, self.location.origin).toString();

  try {
    const response = await fetch(request);
    const contentType = response.headers.get('Content-Type') || '';
    if (response.ok && !response.redirected && /text\/html/i.test(contentType) && isCacheableResponse(response)) {
      const cache = await caches.open(PAGE_CACHE);
      await cache.put(pageKey, response.clone());
      await trimCache(cache, MAX_PAGE_ENTRIES);
    }
    return response;
  } catch {
    const cache = await caches.open(PAGE_CACHE);
    const cachedPage = await cache.match(pageKey);
    if (cachedPage) return cachedPage;

    // A brief retry helps on unstable networks without replacing a usable
    // cached page or showing the offline surface for a momentary radio drop.
    if (self.navigator?.onLine !== false) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      try {
        const retryResponse = await fetch(request.clone());
        const contentType = retryResponse.headers.get('Content-Type') || '';
        if (retryResponse.ok && !retryResponse.redirected && /text\/html/i.test(contentType) && isCacheableResponse(retryResponse)) {
          await cache.put(pageKey, retryResponse.clone());
          await trimCache(cache, MAX_PAGE_ENTRIES);
        }
        return retryResponse;
      } catch { /* la connexion reste indisponible : afficher le dernier secours */ }
    }

    const offlinePage = await caches.match(OFFLINE_URL);
    if (offlinePage) return offlinePage;

    return new Response('Pata est hors connexion.', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function handleNextRouteData(request) {
  const cache = await caches.open(ROUTE_CACHE);
  const cached = await cache.match(request);
  const cachedAt = Number(cached?.headers.get('x-pata-cached-at')) || 0;

  // Réutilise brièvement les données de navigation déjà obtenues. Si le cache
  // est ancien, tente le réseau ; en cas de coupure, garde la dernière version.
  if (cached && Date.now() - cachedAt < ROUTE_CACHE_TTL_MS) return cached;

  try {
    const response = await fetch(request);
    const contentType = response.headers.get('Content-Type') || '';
    if (response.ok && /text\/x-component/i.test(contentType) && isCacheableResponse(response)) {
      await storeWithTimestamp(cache, request, response);
      await trimCache(cache, MAX_ROUTE_ENTRIES);
    }
    return response;
  } catch {
    if (cached) return cached;
    throw new Error('Route Pata indisponible hors connexion.');
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Ne jamais mettre en cache les API, paiements, authentifications ou réponses
  // contenant des données métier dynamiques : Firestore gère son propre cache.
  if (
    url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/_next/image')
    || url.pathname === '/sw.js'
  ) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Les réponses App Router sont conservées par requête, en respectant les
  // en-têtes Vary de Next.js et uniquement lorsqu'elles ne sont pas privées.
  if (request.headers.get('RSC') === '1' || request.headers.get('Next-Router-Prefetch') === '1') {
    event.respondWith(handleNextRouteData(request));
    return;
  }

  const isNextStatic = url.pathname.startsWith('/_next/static/');
  const isPublicAsset = /\.(?:css|js|mjs|woff2?|ttf|otf|png|jpe?g|webp|avif|gif|svg|ico)$/i.test(url.pathname);
  if (isNextStatic || isPublicAsset) {
    event.respondWith(handleStaticAsset(request));
  }
});
