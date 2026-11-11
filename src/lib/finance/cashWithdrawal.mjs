function normalizeProviderValue(value) {
  return String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
export function incomeMatchesMobileMoneyProvider(income, provider) {
  if (!income || income.cashPocket === true) return false;
  const values = [income.paymentMethod, income.source, income.details].map(normalizeProviderValue).filter(Boolean);
  if (provider === 'mtn_momo') return values.some((value) => value === 'mtn momo' || value === 'mtn mobile money' || value === 'mtn' || value.includes('mtn momo') || value.includes('mtn mobile money'));
  if (provider === 'orange_money') return values.some((value) => value === 'orange money' || value.includes('orange money'));
  return false;
}
export function getIncomeRemaining(income, expenses = []) {
  const spent = expenses.filter((expense) => expense.incomeSourceId === income?.id).reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  return Math.max(0, (Number(income?.amount) || 0) - spent);
}
export function getWithdrawalFundingSuggestion(incomes = [], expenses = [], provider, amount) {
  const value = Math.max(0, Number(amount) || 0);
  const candidates = incomes.filter((income) => income.neutralFlow !== true && income.cashPocket !== true && incomeMatchesMobileMoneyProvider(income, provider))
    .map((income) => ({ ...income, remaining: getIncomeRemaining(income, expenses) })).filter((income) => income.remaining > 0)
    .sort((a, b) => {
      const enoughA = a.remaining >= value, enoughB = b.remaining >= value;
      if (enoughA !== enoughB) return enoughA ? -1 : 1;
      if (enoughA && enoughB && a.remaining !== b.remaining) return a.remaining - b.remaining;
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
  const totalAvailable = candidates.reduce((sum, income) => sum + income.remaining, 0);
  const single = candidates.find((income) => income.remaining >= value);
  return { candidates, totalAvailable, defaultSourceId: single ? single.id : totalAvailable >= value && candidates.length > 1 ? 'all' : 'external' };
}
