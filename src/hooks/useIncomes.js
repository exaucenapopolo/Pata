'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { subscribeIncomes } from '@/lib/firestore/incomes';

export function useIncomes() {
  const { user } = useAuth();
  const [incomes, setIncomes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setIncomes([]); setLoading(false); return; }
    const unsub = subscribeIncomes(user.uid, (items) => {
      setIncomes(items); setLoading(false);
    });
    return unsub;
  }, [user]);

  return { incomes, loading };
}
