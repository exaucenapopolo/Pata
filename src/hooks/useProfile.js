'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';
import { ensureUserProfile, updateUserProfile } from '@/lib/firestore/profile';
import { setPreferredCurrency } from '@/lib/utils';

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setProfile(null); setPreferredCurrency('XAF'); setLoading(false); return; }

    let active = true;
    let unsub = null;

    ensureUserProfile(user).then(() => {
      if (!active) return;
      unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
        if (snap.exists()) {
          const nextProfile = { id: snap.id, ...snap.data() };
          setProfile(nextProfile);
          setPreferredCurrency(nextProfile.currency || 'XAF', nextProfile.currencyRates || null);
        }
        setLoading(false);
      });
    });

    return () => {
      active = false;
      if (unsub) unsub();
    };
  }, [user]);

  const save = async (patch) => {
    if (!user) return;
    await updateUserProfile(user.uid, patch);
    if (patch.photoURL !== undefined || patch.displayName !== undefined) {
      try {
        const token = await user.getIdToken();
        await fetch('/api/profile/activity', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token },
        });
      } catch (error) {
        console.warn('[PATA USER DIRECTORY SYNC]', error?.message || error);
      }
    }
  };

  return { profile, loading, save };
                                 }
