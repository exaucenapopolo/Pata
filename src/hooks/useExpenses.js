'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { subscribeExpenses } from '@/lib/firestore/expenses';

export function useExpenses(options = {}) {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const startDate = options.startDate || null;
  const endDate = options.endDate || null;
  const days = Number(options.days) || null;
  const limit = Number(options.limit) || 500;

  useEffect(() => {
    if (!user) {
      setExpenses([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    return subscribeExpenses(user.uid, (items) => {
      setExpenses(items);
      setLoading(false);
    }, { startDate, endDate, days, limit });
  }, [user, startDate, endDate, days, limit]);

  return { expenses, loading };
}
