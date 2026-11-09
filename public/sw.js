// public/sw.js
const CACHE_NAME = 'pata-cache-v3';
const urlsToCache = [
  '/',
  '/dashboard',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.filter((name) => name.startsWith('pata-cache-') && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await clients.claim();
  })());
});

/* Clic sur les notifications Pata : ouvrir la route interne sans quitter le domaine. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawTarget = event.notification.data?.url || '/dashboard';
  let target = '/dashboard';
  try {
    const requested = new URL(rawTarget, self.location.origin);
    if (requested.origin === self.location.origin) target = requested.pathname + requested.search + requested.hash;
  } catch { /* garder /dashboard */ }
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(target);
        return;
      }
    }
    await clients.openWindow(target);
  })());
});

/* Web Push standard : le push Pata est affiché même lorsque l'application est fermée. */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  if (payload?.source !== 'pata-webpush') return;
  event.waitUntil(self.registration.showNotification(payload.title || 'Pata', {
    body: payload.body || 'Ouvre Pata pour consulter cette information.',
    icon: payload.icon || '/android-chrome-192x192.png',
    badge: payload.badge || '/android-chrome-192x192.png',
    tag: payload.tag || 'pata-notification',
    renotify: false,
    data: { url: payload.url || '/dashboard' },
  }));
});

// 🟢 Gestionnaire fetch sécurisé
self.addEventListener('fetch', (event) => {
  // On ne gère que les requêtes GET (pas les POST vers l'API)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        return response;
      })
      .catch(async () => {
        // Si le réseau échoue, on cherche dans le cache
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        // Si ce n'est pas en cache, on renvoie une vraie réponse d'erreur
        return new Response('Hors ligne. Impossible de charger cette ressource.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' }),
        });
      })
  );
});
