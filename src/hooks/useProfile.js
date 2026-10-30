'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/client';
import { ensureUserProfile, updateUserProfile } from '@/lib/firestore/profile';

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setProfile(null); setLoading(false); return; }

    let active = true;
    let unsub = null;

    ensureUserProfile(user).then(() => {
      if (!active) return;
      unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
        if (snap.exists()) {
          setProfile({ id: snap.id, ...snap.data() });
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
  };

  return { profile, loading, save };
                                 }
