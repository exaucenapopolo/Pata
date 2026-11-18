'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { subscribeIncomes } from '@/lib/firestore/incomes';
import { subscribeUserProfile } from '@/lib/firestore/profile';

// Les soldes d'un revenu ne changent que lorsqu'un revenu ou une dépense liée
// change. On réutilise donc le dernier calcul pendant 5 minutes, et on invalide
// immédiatement ce cache lorsqu'une écriture locale est confirmée.
const BALANCE_CACHE_TTL_MS = 5 * 60 * 1000;
const balanceCache = new Map();
const balanceRequests = new Map();

function getIncomeSignature(rows) {
  return rows
    .map((item) => `${item.id}:${Number(item.amount) || 0}`)
    .sort()
    .join('|');
}

async function fetchIncomeBalances(user, incomeIds, signature) {
  const requestKey = user.uid + ':' + signature;
  const existingRequest = balanceRequests.get(requestKey);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const token = await user.getIdToken();
    const response = await fetch('/api/incomes/spent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ incomeIds }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success || !Array.isArray(result.totals)) {
      throw new Error(result.error || 'Impossible de calculer les soldes des revenus.');
    }

    const totals = new Map(result.totals.map((item) => [
      String(item.incomeId),
      Number(item.spent),
    ]));
    const missingId = incomeIds.find((id) => !totals.has(id) || !Number.isFinite(totals.get(id)));
    if (missingId) throw new Error('Le calcul des dépenses a renvoyé un résultat incomplet.');
    return totals;
  })();

  balanceRequests.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (balanceRequests.get(requestKey) === request) balanceRequests.delete(requestKey);
  }
}

function applyIncomeBalances(rows, totals) {
  return rows.map((item) => {
    const spent = Math.max(0, Number(totals.get(item.id)) || 0);
    const remaining = Math.max(0, (Number(item.amount) || 0) - spent);
    return {
      ...item,
      spent,
      remaining,
      isExhausted: remaining === 0 && spent > 0,
      balanceAvailable: true,
    };
  });
}

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
    let currentSignature = '';
    let currentProfile = null;
    let profileLoaded = false;
    let requestSequence = 0;
    lastKnownBalancesRef.current.clear();
    setIncomes([]);
    setLoading(true);
    setBalancesReady(false);
    setBalanceError('');

    const applyProfileBalances = (profile) => {
      if (!profile || profile.incomeSpentTotalsVersion !== 1) return false;
      currentProfile = profile;
      const totals = new Map(
        Object.entries(profile.incomeSpentTotals || {}).map(([id, amount]) => [String(id), Number(amount) || 0])
      );
      balanceCache.set(user.uid, { signature: currentSignature, totals, fetchedAt: Date.now() });
      if (!currentRows.length) return true;
      const nextRows = applyIncomeBalances(currentRows, totals);
      lastKnownBalancesRef.current = new Map(nextRows.map((item) => [
        item.id,
        { spent: item.spent, remaining: item.remaining, isExhausted: item.isExhausted },
      ]));
      if (active) {
        setIncomes(nextRows);
        setBalancesReady(true);
        setBalanceError('');
        setLoading(false);
      }
      return true;
    };

    const refreshBalances = async (force = false) => {
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

      const incomeIds = currentRows.map((item) => item.id).filter(Boolean);
      const signature = currentSignature;
      const cached = balanceCache.get(user.uid);
      const cacheMatches = cached?.signature === signature;
      const cacheIsFresh = cacheMatches && Date.now() - cached.fetchedAt < BALANCE_CACHE_TTL_MS;

      if (!force && cacheIsFresh) {
        const cachedRows = applyIncomeBalances(currentRows, cached.totals);
        lastKnownBalancesRef.current = new Map(cachedRows.map((item) => [
          item.id,
          { spent: item.spent, remaining: item.remaining, isExhausted: item.isExhausted },
        ]));
        if (active) {
          setIncomes(cachedRows);
          setBalancesReady(true);
          setBalanceError('');
          setLoading(false);
        }
        return;
      }

      // Affiche tout de suite le dernier solde connu pendant l'actualisation.
      if (cacheMatches && active) {
        const cachedRows = applyIncomeBalances(currentRows, cached.totals);
        setIncomes(cachedRows);
        setBalancesReady(true);
        setLoading(false);
      }

      try {
        const totals = await fetchIncomeBalances(user, incomeIds, signature);
        if (!active || sequence !== requestSequence) return;

        balanceCache.set(user.uid, { signature, totals, fetchedAt: Date.now() });
        const nextRows = applyIncomeBalances(currentRows, totals);
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

        // Ne jamais remettre un solde à zéro si son actualisation échoue.
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

    const unsubscribeProfile = subscribeUserProfile(user.uid, (profile) => {
      currentProfile = profile;
      profileLoaded = true;
      if (!applyProfileBalances(profile) && currentRows.length) {
        // Migration des anciens profils : le résumé sera ensuite entretenu
        // transactionnellement et propagé par ce même listener.
        void refreshBalances(true);
      }
    }, (error) => {
      profileLoaded = true;
      console.error('[PATA INCOME PROFILE SUMMARY]', error?.message || error);
      if (currentRows.length) void refreshBalances();
    });

    const unsubscribe = subscribeIncomes(user.uid, (items) => {
      currentRows = items;
      currentSignature = getIncomeSignature(items);
      // Le document profil transporte déjà les soldes : pas de requête API
      // supplémentaire lorsque son résumé est disponible.
      if (profileLoaded && !applyProfileBalances(currentProfile)) void refreshBalances();
    });

    const handleRefresh = () => {
      if (!applyProfileBalances(currentProfile)) void refreshBalances(true);
    };
    const refreshIfStaleOnReturn = () => {
      if (document.visibilityState !== 'visible') return;
      const cached = balanceCache.get(user.uid);
      if (!cached || Date.now() - cached.fetchedAt >= BALANCE_CACHE_TTL_MS) {
        if (!applyProfileBalances(currentProfile)) void refreshBalances(true);
      }
    };

    window.addEventListener('pata:income-balances-refresh', handleRefresh);
    document.addEventListener('visibilitychange', refreshIfStaleOnReturn);

    return () => {
      active = false;
      requestSequence += 1;
      unsubscribe();
      unsubscribeProfile();
      window.removeEventListener('pata:income-balances-refresh', handleRefresh);
      document.removeEventListener('visibilitychange', refreshIfStaleOnReturn);
    };
  }, [user]);

  return { incomes, loading, balancesReady, balanceError };
}
