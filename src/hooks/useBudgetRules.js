'use client';

import { useEffect, useMemo, useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import {
  buildRulesList, getDefaultBudgetRules, rulesToObject,
} from '@/lib/budgetRules';

export function useBudgetRules() {
  const { profile, save } = useProfile();
  const { customCategories } = useCustomCategories('expense');

  const [rules, setRules] = useState(getDefaultBudgetRules());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const stored = profile.budgetRules;
    setRules(buildRulesList(stored, customCategories));
    setLoading(false);
  }, [profile, customCategories]);

  const total = useMemo(
    () => rules.reduce((s, r) => s + (Number(r.percent) || 0), 0),
    [rules]
  );

  const isValid = Math.abs(total - 100) < 0.01;

  const saveRules = async (nextRules) => {
    const obj = rulesToObject(nextRules);
    await save({ budgetRules: obj });
    setRules(nextRules);
  };

  const resetRules = async () => {
    await save({ budgetRules: null });
    setRules(getDefaultBudgetRules());
  };

  const updatePercent = (key, percent) => {
    setRules((prev) =>
      prev.map((r) => (r.key === key ? { ...r, percent: Number(percent) || 0 } : r))
    );
  };

  return {
    rules,
    setRules,
    updatePercent,
    saveRules,
    resetRules,
    total,
    isValid,
    loading,
  };
}
