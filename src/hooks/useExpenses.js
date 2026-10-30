'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { subscribeExpenses } from '@/lib/firestore/expenses';

export function useExpenses() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setExpenses([]); setLoading(false); return; }
    const unsub = subscribeExpenses(user.uid, (items) => {
      setExpenses(items); setLoading(false);
    });
    return unsub;
  }, [user]);

  return { expenses, loading };
                                    }
