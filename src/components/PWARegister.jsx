'use client';

import { useEffect } from 'react';

export function PWARegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    let active = true;
    let registration = null;
    const registerAppWorker = async () => {
      try {
        registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
        if (!active) return;
        await registration.update().catch(() => {});
      } catch (error) {
        console.warn('[PATA PWA WORKER]', error?.message || error);
      }
    };
    const refreshWorker = () => {
      if (document.visibilityState === 'visible' && registration) registration.update().catch(() => {});
    };
    void registerAppWorker();
    window.addEventListener('online', refreshWorker);
    document.addEventListener('visibilitychange', refreshWorker);
    return () => {
      active = false;
      window.removeEventListener('online', refreshWorker);
      document.removeEventListener('visibilitychange', refreshWorker);
    };
  }, []);

  return null;
}
