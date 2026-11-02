// src/components/AutomationRunner.jsx
'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

export function AutomationRunner() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    
    // On appelle l'API pour vérifier et exécuter les automations
    const runAutomations = async () => {
      try {
        const token = await user.getIdToken();
        await fetch('/api/automations/run', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (e) {
        console.error('Erreur automation:', e);
      }
    };

    runAutomations();
  }, [user]);

  return null;
}
