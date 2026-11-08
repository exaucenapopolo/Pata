// public/sw.js
const CACHE_NAME = 'pata-cache-v2';
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
