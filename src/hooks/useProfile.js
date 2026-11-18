'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { ensureUserProfile, subscribeUserProfile, updateUserProfile } from '@/lib/firestore/profile';
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
      unsub = subscribeUserProfile(user.uid, (nextProfile) => {
        if (nextProfile) {
          setProfile(nextProfile);
          setPreferredCurrency(nextProfile.currency || 'XAF', nextProfile.currencyRates || null);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }, (error) => {
        console.error('[PATA PROFILE LISTENER]', error);
        setLoading(false);
      });
    }).catch((error) => {
      console.error('[PATA ENSURE PROFILE]', error);
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      if (unsub) unsub();
    };
  }, [user]);

  const save = async (patch) => {
    if (!user) return;
    await updateUserProfile(user.uid, patch);
  };

  return { profile, loading, save };
                                 }
