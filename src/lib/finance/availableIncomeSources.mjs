/**
 * Returns only funding sources that Pata has successfully balance-checked
 * and that still have money available for a new expense.
 *
 * Borrowed money is eligible only when the user explicitly marked it as
 * received in cash and available for funding. Neutral movements are excluded.
 */
export function getAvailableIncomeSources(incomes = [], options = {}) {
  const rows = Array.isArray(incomes) ? incomes : [];
  const projectId = String(options.projectId || '');
  return rows.filter((income) => {
    if (!income?.id || income.balanceAvailable !== true) return false;
    const borrowedFunding = income.flowType === 'debt_borrowed'
      && income.availableAsFunding === true;
    if (income.neutralFlow === true && !borrowedFunding) return false;
    if (income.projectId && income.projectId !== projectId) return false;
    return Math.max(0, Number(income.remaining) || 0) > 0;
  });
}

export function getAvailableIncomeTotal(incomes = []) {
  return getAvailableIncomeSources(incomes)
    .reduce((sum, income) => sum + Math.max(0, Number(income.remaining) || 0), 0);
}
