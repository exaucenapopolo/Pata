'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { subscribeCategories } from '@/lib/firestore/categories';
import { EXPENSE_CATEGORIES, GOAL_CATEGORIES } from '@/lib/constants';

export function useCustomCategories(type) {
  const { user } = useAuth();
  const [custom, setCustom] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setCustom([]); setLoading(false); return; }
    const unsub = subscribeCategories(user.uid, (items) => {
      setCustom(items.filter((c) => c.type === type));
      setLoading(false);
    });
    return unsub;
  }, [user, type]);

  const all = useMemo(() => {
    const defaults = type === 'goal' ? GOAL_CATEGORIES : EXPENSE_CATEGORIES;
    return [
      ...defaults.map((c) => ({ ...c, isCustom: false })),
      ...custom.map((c) => ({ ...c, isCustom: true })),
    ];
  }, [custom, type]);

  return { categories: all, customCategories: custom, loading };
          }
