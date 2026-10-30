'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { subscribeGoals, subscribeDeposits } from '@/lib/firestore/goals';

export function useGoals() {
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setGoals([]); setLoading(false); return; }
    const unsub = subscribeGoals(user.uid, (items) => {
      setGoals(items); setLoading(false);
    });
    return unsub;
  }, [user]);

  return { goals, loading };
}

export function useDeposits(goalId) {
  const { user } = useAuth();
  const [deposits, setDeposits] = useState([]);

  useEffect(() => {
    if (!user || !goalId) { setDeposits([]); return; }
    return subscribeDeposits(user.uid, goalId, setDeposits);
  }, [user, goalId]);

  return deposits;
}
