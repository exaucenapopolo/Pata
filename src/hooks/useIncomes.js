'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { subscribeIncomes } from '@/lib/firestore/incomes';

export function useIncomes() {
  const { user } = useAuth();
  const [incomes, setIncomes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [balancesReady, setBalancesReady] = useState(false);
  const [balanceError, setBalanceError] = useState('');
  const lastKnownBalancesRef = useRef(new Map());

  useEffect(() => {
    if (!user) {
      lastKnownBalancesRef.current.clear();
      setIncomes([]);
      setLoading(false);
      setBalancesReady(true);
      setBalanceError('');
      return undefined;
    }

    let active = true;
    let currentRows = [];
    let requestSequence = 0;
    lastKnownBalancesRef.current.clear();
    setIncomes([]);
    setLoading(true);
    setBalancesReady(false);
    setBalanceError('');

    const refreshBalances = async () => {
      const sequence = ++requestSequence;
      if (!currentRows.length) {
        if (active) {
          lastKnownBalancesRef.current.clear();
          setIncomes([]);
          setLoading(false);
          setBalancesReady(true);
          setBalanceError('');
        }
        return;
      }

      try {
        const token = await user.getIdToken();
        const incomeIds = currentRows.map((item) => item.id).filter(Boolean);
        const idBatches = [];
        // Firestore "in" queries accept at most 30 values.
        for (let offset = 0; offset < incomeIds.length; offset += 30) {
          idBatches.push(incomeIds.slice(offset, offset + 30));
        }

        const batchResults = await Promise.all(idBatches.map(async (ids) => {
          const response = await fetch('/api/incomes/spent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ incomeIds: ids }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.success || !Array.isArray(result.totals)) {
            throw new Error(result.error || 'Impossible de calculer les soldes des revenus.');
          }
          return result.totals;
        }));

        if (!active || sequence !== requestSequence) return;
        const spentById = new Map(batchResults.flat().map((item) => [
          String(item.incomeId),
          Number(item.spent),
        ]));
        const missingId = incomeIds.find((id) => !spentById.has(id) || !Number.isFinite(spentById.get(id)));
        if (missingId) throw new Error('Le calcul des dépenses a renvoyé un résultat incomplet.');

        const nextRows = currentRows.map((item) => {
          const spent = Math.max(0, spentById.get(item.id));
          const remaining = Math.max(0, (Number(item.amount) || 0) - spent);
          return {
            ...item,
            spent,
            remaining,
            isExhausted: remaining === 0 && spent > 0,
            balanceAvailable: true,
          };
        });
        lastKnownBalancesRef.current = new Map(nextRows.map((item) => [
          item.id,
          { spent: item.spent, remaining: item.remaining, isExhausted: item.isExhausted },
        ]));
        setIncomes(nextRows);
        setBalancesReady(true);
        setBalanceError('');
        setLoading(false);
      } catch (error) {
        console.error('[PATA INCOME BALANCES]', error?.message || error);
        if (!active || sequence !== requestSequence) return;

        // Never reset spent to zero when a balance refresh fails.
        const nextRows = currentRows.map((item) => {
          const known = lastKnownBalancesRef.current.get(item.id);
          if (known) return { ...item, ...known, balanceAvailable: true };
          return {
            ...item,
            spent: null,
            remaining: null,
            isExhausted: false,
            balanceAvailable: false,
          };
        });
        setIncomes(nextRows);
        setBalancesReady(nextRows.every((item) => item.balanceAvailable));
        setBalanceError('Le solde des revenus n’a pas pu être actualisé. Les montants précédemment vérifiés sont conservés.');
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

  return { incomes, loading, balancesReady, balanceError };
}
