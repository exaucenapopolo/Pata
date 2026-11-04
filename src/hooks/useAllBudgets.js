'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { subscribeAllBudgets } from '@/lib/firestore/budgets';

export function useAllBudgets() {
  const { user } = useAuth();
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!user) { setBudgets([]); setLoading(false); return; }
    return subscribeAllBudgets(user.uid, (items) => { setBudgets(items); setLoading(false); });
  }, [user]);
  return { budgets, loading };
}
