const normalize = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const numericAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0;
};
const isoDate = (value) => {
  if (typeof value === 'string') return value.slice(0, 10);
  if (value?.toDate) return value.toDate().toISOString().slice(0, 10);
  return '';
};
const moneyAmountInText = (value = '') => {
  const text = normalize(value);
  const match = text.match(/(?:depenser|depense|achat|acheter|payer)[^0-9]{0,35}([0-9][0-9\s.,]*)/)
    || text.match(/([0-9][0-9\s.,]*)\s*(?:fcfa|xaf|francs?|frs)\b/);
  if (!match) return null;
  const digits = match[1].replace(/\D/g, '');
  const amount = Number(digits);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
};

export function buildDailySpendingFacts({ today, expenses = [], budgets = [], categories = [], proposedSpendText = '' } = {}) {
  const todayDate = isoDate(today);
  const month = todayDate.slice(0, 7);
  const todayRows = expenses.filter((item) => isoDate(item.date) === todayDate);
  const monthlyRows = expenses.filter((item) => isoDate(item.date).slice(0, 7) === month);
  const typeOf = (item) => ['consumption', 'project', 'savings', 'investment'].includes(item.expenseType)
    ? item.expenseType : 'consumption';
  const todayByType = todayRows.reduce((totals, item) => {
    totals[typeOf(item)] += numericAmount(item.amount);
    return totals;
  }, { consumption: 0, project: 0, savings: 0, investment: 0 });
  const todayOperations = todayRows.map((item) => {
    const category = categories.find((candidate) => candidate.id === item.categoryId);
    const categoryName = category?.name || item.categoryName || item.categoryId || 'Catégorie non précisée';
    const typeLabels = {
      consumption: 'Consommation', project: 'Projet', savings: 'Épargne', investment: 'Investissement',
    };
    return {
      amount: numericAmount(item.amount),
      category: String(categoryName).slice(0, 50),
      type: typeLabels[typeOf(item)],
      note: String(item.note || '').slice(0, 100),
    };
  });
  const todayTotal = todayRows.reduce((sum, item) => sum + numericAmount(item.amount), 0);
  const daysInMonth = todayDate
    ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
    : 0;
  const dayOfMonth = todayDate ? Number(todayDate.slice(8, 10)) : 0;
  const daysRemaining = Math.max(1, daysInMonth - dayOfMonth + 1);
  const monthBeforeToday = monthlyRows.filter((item) => isoDate(item.date) < todayDate);
  const budgetFacts = budgets
    .filter((budget) => budget.month === month && numericAmount(budget.amount) > 0 && budget.categoryId)
    .map((budget) => {
      const category = categories.find((candidate) => candidate.id === budget.categoryId);
      const categoryName = String(category?.name || budget.categoryName || budget.categoryId).slice(0, 50);
      const matchesBudget = (expense) => typeOf(expense) === 'consumption'
        && expense.categoryId === budget.categoryId
        && (!budget.incomeSourceId || budget.incomeSourceId === 'all'
          || expense.incomeSourceId === budget.incomeSourceId);
      const spentBeforeToday = monthBeforeToday.filter(matchesBudget)
        .reduce((sum, item) => sum + numericAmount(item.amount), 0);
      const spentToday = todayRows.filter(matchesBudget)
        .reduce((sum, item) => sum + numericAmount(item.amount), 0);
      const budgetAmount = numericAmount(budget.amount);
      const remainingBeforeToday = Math.max(0, budgetAmount - spentBeforeToday);
      const dailyPlan = Math.floor(remainingBeforeToday / daysRemaining);
      const dailyRemaining = Math.max(0, dailyPlan - spentToday);
      const monthlyRemaining = Math.max(0, budgetAmount - spentBeforeToday - spentToday);
      return {
        category: categoryName,
        categoryId: String(budget.categoryId),
        budget: budgetAmount,
        spentBeforeToday,
        spentToday,
        dailyPlan,
        dailyRemaining,
        monthlyRemaining,
        daysRemaining,
        incomeSourceId: budget.incomeSourceId || 'all',
      };
    });
  const amount = moneyAmountInText(proposedSpendText);
  let proposedSpend = null;
  if (amount !== null) {
    const normalizedText = normalize(proposedSpendText);
    const matchingBudget = budgetFacts.find((budget) => {
      const category = normalize(budget.category);
      const categoryId = normalize(budget.categoryId);
      return (category.length > 2 && normalizedText.includes(category))
        || (categoryId.length > 2 && normalizedText.includes(categoryId));
    });
    if (!matchingBudget) {
      proposedSpend = { amount, status: 'category-required' };
    } else {
      const dailyAfter = matchingBudget.dailyRemaining - amount;
      const monthlyAfter = matchingBudget.monthlyRemaining - amount;
      proposedSpend = {
        amount,
        category: matchingBudget.category,
        dailyRemaining: matchingBudget.dailyRemaining,
        monthlyRemaining: matchingBudget.monthlyRemaining,
        dailyAfter: Math.max(0, dailyAfter),
        monthlyAfter: Math.max(0, monthlyAfter),
        status: monthlyAfter < 0 ? 'over-monthly-envelope'
          : dailyAfter < 0 ? 'above-daily-pace-within-monthly-envelope' : 'within-daily-pace',
      };
    }
  }
  return {
    today: todayDate,
    todayTotal,
    todayCount: todayRows.length,
    todayByType,
    todayOperations: todayOperations.slice(0, 35),
    budgets: budgetFacts,
    proposedSpend,
  };
}
