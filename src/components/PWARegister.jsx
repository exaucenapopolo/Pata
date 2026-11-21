'use client';

import { useEffect } from 'react';

export function PWARegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    let active = true;

    const registerAppWorker = async () => {
      try {
        // Un seul enregistrement au démarrage. Le navigateur vérifie lui-même
        // les mises à jour du worker lors de ses contrôles habituels.
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      } catch (error) {
        if (active) console.warn('[PATA PWA WORKER]', error?.message || error);
      }
    };

    void registerAppWorker();

    return () => {
      active = false;
    };
  }, []);

  return null;
}
