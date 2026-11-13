'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { subscribeIncomes } from '@/lib/firestore/incomes';

export function useIncomes() {
  const { user } = useAuth();
  const [incomes, setIncomes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIncomes([]);
      setLoading(false);
      return undefined;
    }

    let active = true;
    let currentRows = [];
    let requestSequence = 0;

    const refreshBalances = async () => {
      const sequence = ++requestSequence;
      if (!currentRows.length) {
        if (active) { setIncomes([]); setLoading(false); }
        return;
      }
      try {
        const token = await user.getIdToken();
        const incomeIds = currentRows.map((item) => item.id);
        const idBatches = [];
        for (let offset = 0; offset < incomeIds.length; offset += 100) idBatches.push(incomeIds.slice(offset, offset + 100));
        const batchResults = await Promise.all(idBatches.map(async (ids) => {
          const response = await fetch('/api/incomes/spent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ incomeIds: ids }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de calculer les soldes des revenus.');
          return Array.isArray(result.totals) ? result.totals : [];
        }));
        if (!active || sequence !== requestSequence) return;
        const spentById = new Map(batchResults.flat().map((item) => [item.incomeId, Number(item.spent) || 0]));
        setIncomes(currentRows.map((item) => {
          const spent = Math.max(0, spentById.get(item.id) || 0);
          const remaining = Math.max(0, (Number(item.amount) || 0) - spent);
          return { ...item, spent, remaining, isExhausted: remaining === 0 && spent > 0 };
        }));
        setLoading(false);
      } catch (error) {
        console.warn('[PATA INCOME BALANCES]', error.message || error);
        if (!active || sequence !== requestSequence) return;
        setIncomes(currentRows.map((item) => ({
          ...item,
          spent: Number(item.spent) || 0,
          remaining: Math.max(0, (Number(item.amount) || 0) - (Number(item.spent) || 0)),
        })));
        setLoading(false);
      }
    };

    const unsubscribe = subscribeIncomes(user.uid, (items) => {
      currentRows = items;
      void refreshBalances();
    });
    const handleRefresh = () => { void refreshBalances(); };
    window.addEventListener('pata:income-balances-refresh', handleRefresh);

    return () => {
      active = false;
      requestSequence += 1;
      unsubscribe();
      window.removeEventListener('pata:income-balances-refresh', handleRefresh);
    };
  }, [user]);

  return { incomes, loading };
}
