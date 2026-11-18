export const BUDGET_SPEND_SUMMARY_VERSION = 1;

function safeAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0;
}

function safeMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function isBudgetCountedExpense(expense = {}) {
  if (expense.neutralFlow === true) return false;
  const type = ['consumption', 'project', 'savings', 'investment'].includes(expense.expenseType)
    ? expense.expenseType : 'consumption';
  return type === 'consumption' && Boolean(String(expense.categoryId || '').trim());
}

export function normalizeBudgetSpendSummary(value, month) {
  const raw = value && typeof value === 'object' ? value : {};
  const categoryTotals = {};
  const sourceCategoryTotals = {};
  for (const [categoryId, amount] of Object.entries(safeMap(raw.categoryTotals))) {
    const normalized = safeAmount(amount);
    if (categoryId && normalized > 0) categoryTotals[categoryId] = normalized;
  }
  for (const [sourceId, categories] of Object.entries(safeMap(raw.sourceCategoryTotals))) {
    const normalizedCategories = {};
    for (const [categoryId, amount] of Object.entries(safeMap(categories))) {
      const normalized = safeAmount(amount);
      if (categoryId && normalized > 0) normalizedCategories[categoryId] = normalized;
    }
    if (sourceId && Object.keys(normalizedCategories).length) sourceCategoryTotals[sourceId] = normalizedCategories;
  }
  return {
    version: BUDGET_SPEND_SUMMARY_VERSION,
    month: String(month || raw.month || ''),
    categoryTotals,
    sourceCategoryTotals,
  };
}

export function buildBudgetSpendSummary(expenses = [], month) {
  let summary = normalizeBudgetSpendSummary(null, month);
  for (const expense of expenses || []) {
    if (String(expense?.date || '').slice(0, 7) !== String(month || '')) continue;
    summary = applyBudgetSpendDelta(summary, expense, 1);
  }
  return summary;
}

export function applyBudgetSpendDelta(value, expense, direction = 1) {
  const month = String(value?.month || '').slice(0, 7);
  const summary = normalizeBudgetSpendSummary(value, month);
  if (!isBudgetCountedExpense(expense)
    || String(expense?.date || '').slice(0, 7) !== month) return summary;

  const categoryId = String(expense.categoryId || '').trim();
  const sourceId = String(expense.incomeSourceId || 'unassigned').trim() || 'unassigned';
  const amount = safeAmount(expense.amount) * (Number(direction) < 0 ? -1 : 1);
  if (!categoryId || !amount) return summary;

  const nextCategory = Math.max(0, (Number(summary.categoryTotals[categoryId]) || 0) + amount);
  if (nextCategory) summary.categoryTotals[categoryId] = nextCategory;
  else delete summary.categoryTotals[categoryId];

  const sourceTotals = { ...safeMap(summary.sourceCategoryTotals[sourceId]) };
  const nextSource = Math.max(0, (Number(sourceTotals[categoryId]) || 0) + amount);
  if (nextSource) sourceTotals[categoryId] = nextSource;
  else delete sourceTotals[categoryId];
  const allSourceTotals = { ...summary.sourceCategoryTotals };
  if (Object.keys(sourceTotals).length) allSourceTotals[sourceId] = sourceTotals;
  else delete allSourceTotals[sourceId];
  summary.sourceCategoryTotals = allSourceTotals;
  return summary;
}

export function getBudgetSpendAmount(summary, categoryId, incomeSourceId = 'all') {
  const normalized = normalizeBudgetSpendSummary(summary, summary?.month);
  const category = String(categoryId || '').trim();
  if (!category) return 0;
  if (!incomeSourceId || incomeSourceId === 'all') {
    return Number(normalized.categoryTotals[category]) || 0;
  }
  return Number(normalized.sourceCategoryTotals[String(incomeSourceId)]?.[category]) || 0;
}
