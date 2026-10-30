'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { subscribeBudgets } from '@/lib/firestore/budgets';

export function useBudgets(month) {
  const { user } = useAuth();
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !month) { setBudgets([]); setLoading(false); return; }
    const unsub = subscribeBudgets(user.uid, month, (items) => {
      setBudgets(items); setLoading(false);
    });
    return unsub;
  }, [user, month]);

  return { budgets, loading };
}
