export const BUDGET_FREQUENCIES = Object.freeze([
  { id: 'daily', label: 'Par jour', multiplier: 30 },
  { id: 'weekly', label: 'Par semaine', multiplier: 4 },
  { id: 'monthly', label: 'Par mois', multiplier: 1 },
]);

const MULTIPLIERS = Object.freeze(
  Object.fromEntries(BUDGET_FREQUENCIES.map((item) => [item.id, item.multiplier]))
);

export function calculateBudgetLine(item = {}, baseAmount = 0) {
  const calculationType = item.calculationType === 'percentage' ? 'percentage' : 'amount';
  const frequency = Object.prototype.hasOwnProperty.call(MULTIPLIERS, item.frequency)
    ? item.frequency : 'monthly';
  const rawValue = item.value ?? item.percentage ?? item.amount ?? 0;
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < 0 || value > (calculationType === 'percentage' ? 100 : 1_000_000_000)) {
    return {
      categoryId: String(item.categoryId || ''),
      value: 0,
      calculationType,
      frequency,
      amount: 0,
      valid: false,
    };
  }

  const base = Math.max(0, Number(baseAmount) || 0);
  const perOccurrence = calculationType === 'percentage'
    ? base * value / 100
    : value;
  const amount = Math.round(perOccurrence * MULTIPLIERS[frequency]);

  return {
    categoryId: String(item.categoryId || '').trim(),
    value,
    calculationType,
    frequency,
    amount: Number.isSafeInteger(amount) ? amount : 0,
    valid: Number.isSafeInteger(amount) && amount >= 0,
  };
}

export function calculateBudgetPlan(items = [], baseAmount = 0) {
  const rows = (Array.isArray(items) ? items : []).map((item) => calculateBudgetLine(item, baseAmount));
  return {
    rows,
    total: rows.reduce((sum, item) => sum + (item.valid ? item.amount : 0), 0),
    valid: rows.every((item) => item.valid && item.categoryId),
    percentageTotal: rows.reduce((sum, item) => sum + (item.valid && item.calculationType === 'percentage'
      ? item.value * MULTIPLIERS[item.frequency] : 0), 0),
  };
}

export function restoreBudgetPlannerLine(budget = {}) {
  const hasStoredValue = budget.value !== undefined && budget.value !== null && budget.value !== '';
  return {
    categoryId: String(budget.categoryId || ''),
    value: String(hasStoredValue ? budget.value : (Number(budget.amount) || 0)),
    calculationType: budget.calculationType === 'percentage' ? 'percentage' : 'amount',
    frequency: Object.prototype.hasOwnProperty.call(MULTIPLIERS, budget.frequency)
      ? budget.frequency : 'monthly',
  };
}
