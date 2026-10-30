'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { ensureUserProfile, updateUserProfile } from '@/lib/firestore/profile';

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setProfile(null); setLoading(false); return; }
    let active = true;
    ensureUserProfile(user).then((p) => {
      if (active) { setProfile(p); setLoading(false); }
    });
    return () => { active = false; };
  }, [user]);

  const save = async (patch) => {
    if (!user) return;
    await updateUserProfile(user.uid, patch);
    setProfile((p) => ({ ...p, ...patch }));
  };

  return { profile, loading, save };
}
