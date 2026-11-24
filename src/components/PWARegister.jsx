'use client';

import { useEffect } from 'react';

export function PWARegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    let active = true;
    let hadControllerAtStart = Boolean(navigator.serviceWorker.controller);
    const handleControllerChange = () => {
      if (hadControllerAtStart && active) {
        // A new worker means new Next.js chunks and server-action identifiers.
        // Reload once to avoid mixing them with the previous application shell.
        window.location.reload();
        return;
      }
      hadControllerAtStart = true;
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    const registerAppWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });
        await registration.update().catch(() => {});
      } catch (error) {
        if (active) console.warn('[PATA PWA WORKER]', error?.message || error);
      }
    };

    void registerAppWorker();

    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  return null;
}
