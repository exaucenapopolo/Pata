'use client';

import { useEffect } from 'react';
import { getMessaging, isSupported, onMessage } from 'firebase/messaging';
import app from '@/lib/firebase/client';
import { useAuth } from '@/hooks/useAuth';

export function PushMessageListener() {
  const { user } = useAuth();

  useEffect(() => {
    let active = true;
    let unsubscribe = null;

    const start = async () => {
      try {
        if (!user || typeof window === 'undefined' || !('Notification' in window)) return;
        if (Notification.permission !== 'granted' || !(await isSupported())) return;
        const messaging = getMessaging(app);
        unsubscribe = onMessage(messaging, (payload) => {
          if (!active || Notification.permission !== 'granted') return;
          const title = payload.data?.title || payload.notification?.title || 'Pata';
          const options = {
            body: payload.data?.body || payload.notification?.body || 'Ouvre Pata pour consulter ton suivi.',
            icon: '/android-chrome-192x192.png',
            badge: '/android-chrome-192x192.png',
            tag: payload.data?.tag || 'pata-foreground',
            renotify: false,
            data: { url: payload.data?.url || '/dashboard' },
          };
          void (async () => {
            try {
              const registration = await navigator.serviceWorker.getRegistration('/firebase-messaging/');
              if (registration?.active && typeof registration.showNotification === 'function') {
                await registration.showNotification(title, options);
              } else if (Notification.permission === 'granted') {
                new Notification(title, options);
              }
            } catch (error) {
              console.warn('[PATA PUSH FOREGROUND]', error?.message || error);
            }
          })();
        });
      } catch (error) {
        console.warn('[PATA PUSH LISTENER]', error?.message || error);
      }
    };

    start();
    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  return null;
}
