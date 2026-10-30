import { BUDGET_RULES } from './constants';

/**
 * Transforme un revenu mensuel en répartition budgétaire.
 * @param {number} monthlyIncome
 * @returns {{ key: string, label: string, percent: number, amount: number }[]}
 */
export function computeBudgetBreakdown(monthlyIncome) {
  if (!monthlyIncome || monthlyIncome <= 0) return [];
  return Object.entries(BUDGET_RULES).map(([key, rule]) => ({
    key,
    label: rule.label,
    percent: rule.percent,
    amount: Math.round((monthlyIncome * rule.percent) / 100),
  }));
}

/**
 * Vérifie qu'une répartition custom totalise bien 100 %.
 * @param {{ percent: number }[]} allocations
 */
export function validateCustomBudget(allocations) {
  const total = allocations.reduce((s, a) => s + (a.percent || 0), 0);
  return {
    valid: Math.abs(total - 100) < 0.01,
    total,
    difference: +(100 - total).toFixed(2),
  };
}
