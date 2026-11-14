'use client';

import { useEffect, useRef } from 'react';

export function NotificationOpportunityTrigger({ user }) {
  const attemptedUserRef = useRef('');

  useEffect(() => {
    if (!user?.uid || attemptedUserRef.current === user.uid) return undefined;
    attemptedUserRef.current = user.uid;
    let active = true;
    const sessionKey = 'pata-feature-discovery:' + user.uid;

    try {
      if (window.sessionStorage.getItem(sessionKey) === 'sent') return () => { active = false; };
      window.sessionStorage.setItem(sessionKey, 'sent');
    } catch {
      // Le serveur applique aussi un délai de sécurité, même sans stockage local.
    }

    const notify = async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/notifications/opportunity', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Authorization: 'Bearer ' + token },
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Suggestion de fonctionnalité indisponible.');
        }
      } catch (error) {
        if (active) console.warn('[PATA FEATURE DISCOVERY]', error?.message || error);
      }
    };

    void notify();
    return () => { active = false; };
  }, [user]);

  return null;
}
