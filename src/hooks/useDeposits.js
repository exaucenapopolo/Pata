'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { subscribeDeposits } from '@/lib/firestore/deposits';

export function useDeposits() {
  const { user } = useAuth();
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setDeposits([]); setLoading(false); return; }
    const unsub = subscribeDeposits(user.uid, (items) => {
      setDeposits(items);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  return { deposits, loading };
}
