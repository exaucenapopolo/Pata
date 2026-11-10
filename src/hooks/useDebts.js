'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { subscribeDebts } from '@/lib/firestore/debts';

export function useDebts() {
  const { user } = useAuth();
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setDebts([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    return subscribeDebts(user.uid, (items) => {
      setDebts(items);
      setLoading(false);
    });
  }, [user]);

  return { debts, loading };
}
