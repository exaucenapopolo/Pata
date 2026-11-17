function validDate(value) {
  const date = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const parsed = new Date(date + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : '';
}

/**
 * Gives every ordinary income a budget-planning entry point. Salary is marked
 * as strongly recommended, but this helper never blocks the income itself.
 */
export function buildIncomeBudgetRecommendation({
  incomeId,
  amount,
  source,
  categoryId,
  date,
  flowType = 'normal',
} = {}) {
  const safeId = String(incomeId || '').trim().slice(0, 150);
  const safeCategory = String(categoryId || 'other_income').trim().slice(0, 80);
  const safeSource = String(source || 'Revenu').trim().slice(0, 100);
  const safeDate = validDate(date);
  const safeAmount = Math.round(Number(amount) || 0);
  const normalizedSource = safeSource.normalize('NFD').replace(/[\u0300-\u036f]/g, ' ').toLocaleLowerCase('fr-FR');
  const isSalary = safeCategory === 'salary'
    || /\b(salaire|salary|paie|payroll|remuneration)\b/i.test(normalizedSource);
  if (!safeId || safeId.includes('/') || !safeDate || !Number.isSafeInteger(safeAmount)
    || safeAmount <= 0 || flowType !== 'normal'
    || !safeCategory || ['debt_borrowed', 'debt_repayment_received'].includes(safeCategory)) return null;

  const month = safeDate.slice(0, 7);
  return {
    incomeId: safeId,
    amount: safeAmount,
    source: safeSource,
    categoryId: safeCategory,
    date: safeDate,
    month,
    isSalary,
    target: '/budgets?month=' + month + '&incomeId=' + encodeURIComponent(safeId),
  };
}
