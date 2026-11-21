const amountOf = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0;
};

const dateOf = (value) => {
  if (typeof value === 'string') return value.slice(0, 10);
  if (value?.toDate) return value.toDate().toISOString().slice(0, 10);
  return '';
};

const formatName = (id, categories) => {
  const found = categories.find((item) => String(item.id) === id);
  return String(found?.name || found?.label || id || 'Autres').slice(0, 60);
};

/**
 * Analyse locale des dépenses courantes déjà chargées par l'écran.
 * Aucun appel Firestore : les projections reposent sur les opérations disponibles.
 */
export function buildCategorySpendingAnalysis({
  expenses = [],
  categories = [],
  budgets = [],
  targets = [],
  today = new Date().toISOString().slice(0, 10),
  smallPurchaseThreshold = 1000,
} = {}) {
  const currentDate = dateOf(today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(currentDate)) return [];
  const month = currentDate.slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const elapsedDays = Number(currentDate.slice(8, 10));
  const threshold = Math.max(1, amountOf(smallPurchaseThreshold));
  const weekStartDate = new Date(currentDate + 'T12:00:00.000Z');
  weekStartDate.setUTCDate(weekStartDate.getUTCDate() - ((weekStartDate.getUTCDay() + 6) % 7));
  const weekStart = weekStartDate.toISOString().slice(0, 10);
  const totals = new Map();

  for (const expense of expenses) {
    const date = dateOf(expense?.date);
    if (date.slice(0, 7) !== month || date > currentDate) continue;
    if (expense?.neutralFlow === true || expense?.flowType === 'loan_given'
      || expense?.categoryId === 'loan_given' || expense?.categoryId === 'debt_repayment'
      || (expense?.expenseType && expense.expenseType !== 'consumption')) continue;
    const amount = amountOf(expense?.amount);
    if (!amount) continue;
    const id = String(expense?.categoryId || 'other');
    const item = totals.get(id) || {
      id, name: formatName(id, categories), total: 0, count: 0,
      smallCount: 0, smallTotal: 0, todayTotal: 0, weekTotal: 0, days: new Set(), largest: [],
    };
    item.total += amount;
    if (date === currentDate) item.todayTotal += amount;
    if (date >= weekStart) item.weekTotal += amount;
    item.count += 1;
    item.days.add(date);
    if (amount <= threshold) {
      item.smallCount += 1;
      item.smallTotal += amount;
    }
    item.largest.push({
      amount,
      date,
      description: String(expense?.note || expense?.details || item.name).trim().slice(0, 70),
    });
    totals.set(id, item);
  }

  return [...totals.values()].map((item) => {
    const budget = budgets.find((entry) => entry.month === month
      && entry.categoryId === item.id
      && (!entry.incomeSourceId || entry.incomeSourceId === 'all'));
    const enoughData = elapsedDays >= 3 && item.days.size >= 3;
    const projected = enoughData ? Math.round(item.total / elapsedDays * daysInMonth) : null;
    const target = targets.find((entry) => entry.categoryId === item.id
      && ['daily', 'weekly', 'monthly'].includes(entry.period)
      && amountOf(entry.amount) > 0) || null;
    const targetActual = !target ? null : target.period === 'daily'
      ? item.todayTotal : target.period === 'weekly' ? item.weekTotal : item.total;
    const targetInfo = target ? {
      period: target.period,
      amount: amountOf(target.amount),
      actual: targetActual,
      status: targetActual > amountOf(target.amount) ? 'over' : 'within',
    } : null;
    const budgetAmount = budget ? amountOf(budget.amount) : null;
    const dailyBudgetPace = budgetAmount == null ? null : Math.ceil(budgetAmount / daysInMonth);
    const weeklyBudgetPace = dailyBudgetPace == null ? null : dailyBudgetPace * 7;
    return {
      id: item.id,
      name: item.name,
      total: item.total,
      count: item.count,
      average: Math.round(item.total / Math.max(1, item.count)),
      smallCount: item.smallCount,
      smallTotal: item.smallTotal,
      todayTotal: item.todayTotal,
      weekTotal: item.weekTotal,
      target: targetInfo,
      daysObserved: item.days.size,
      projected,
      projectionReliable: enoughData,
      budget: budgetAmount,
      dailyBudgetPace,
      weeklyBudgetPace,
      budgetStatus: budgetAmount == null || projected == null
        ? 'unknown'
        : projected > budgetAmount ? 'at-risk' : 'on-track',
      largest: item.largest.sort((a, b) => b.amount - a.amount).slice(0, 3),
    };
  }).sort((a, b) => b.total - a.total);
}
