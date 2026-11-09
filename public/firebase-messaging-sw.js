/* Le gestionnaire de clic doit être enregistré avant Firebase Messaging pour rester prioritaire. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawTarget = event.notification.data?.url || '/dashboard';
  const requestedTarget = new URL(rawTarget, self.location.origin);
  const target = requestedTarget.origin === self.location.origin ? requestedTarget.href : new URL('/dashboard', self.location.origin).href;
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

importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

const params = new URL(self.location.href).searchParams;
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

if (firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    if (payload.notification) return;
    return self.registration.showNotification(payload.data?.title || 'Pata', {
      body: payload.data?.body || 'Ouvre Pata pour consulter ton suivi financier.',
      icon: '/android-chrome-192x192.png',
      badge: '/android-chrome-192x192.png',
      data: { url: payload.data?.url || '/dashboard' },
      tag: payload.data?.tag || 'pata-notification',
      renotify: false,
    });
  });
}
