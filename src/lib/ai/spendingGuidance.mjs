const normalize = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function isExplicitSpendRecordingRequest(value = '') {
  const text = normalize(value);
  return /\b(?:ajout\w*|enregistr\w*|sais\w*|not\w*|declar\w*|inscri\w*|sauvegard\w*|add|record|save|log)\b/.test(text);
}
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

export function buildDailySpendingFacts({ today, expenses = [], budgets = [], categories = [], incomes = [], financialTargets = null, proposedSpendText = '' } = {}) {
  const todayDate = isoDate(today);
  const month = todayDate.slice(0, 7);
  const todayRows = expenses.filter((item) => isoDate(item.date) === todayDate);
  const monthlyRows = expenses.filter((item) => isoDate(item.date).slice(0, 7) === month);
  // Reproduit exactement les exclusions du contrôle financier Pata pour expenseLimit.
  const isOrdinaryExpense = (item) => !(
    item.neutralFlow === true
    || item.flowType === 'loan_given'
    || item.flowType === 'repayment'
    || ['loan_given', 'debt_repayment'].includes(item.categoryId)
    || (item.expenseType && item.expenseType !== 'consumption')
  );
  const typeOf = (item) => {
    if (['project', 'savings', 'investment'].includes(item.expenseType)) return item.expenseType;
    return isOrdinaryExpense(item) ? 'consumption' : 'other';
  };
  const monthConsumptionRows = monthlyRows.filter(isOrdinaryExpense);
  const todayConsumptionRows = todayRows.filter(isOrdinaryExpense);
  const todayByType = todayRows.reduce((totals, item) => {
    totals[typeOf(item)] += numericAmount(item.amount);
    return totals;
  }, { consumption: 0, project: 0, savings: 0, investment: 0, other: 0 });
  const todayOperations = todayRows.map((item) => {
    const category = categories.find((candidate) => candidate.id === item.categoryId);
    const categoryName = category?.name || item.categoryName || item.categoryId || 'Catégorie non précisée';
    const typeLabels = {
      consumption: 'Consommation',
      project: 'Projet',
      savings: 'Épargne',
      investment: 'Investissement',
      other: 'Autre sortie / flux neutre',
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
  const globalMonthlyLimitValue = financialTargets?.expenseLimit;
  const hasGlobalMonthlyLimit = globalMonthlyLimitValue !== undefined
    && globalMonthlyLimitValue !== null
    && Number.isFinite(Number(globalMonthlyLimitValue))
    && Number(globalMonthlyLimitValue) >= 0;
  const globalMonthlyLimit = hasGlobalMonthlyLimit ? Math.round(Number(globalMonthlyLimitValue)) : null;
  const globalMonthlySpentBeforeToday = monthConsumptionRows
    .filter((item) => isoDate(item.date) < todayDate)
    .reduce((sum, item) => sum + numericAmount(item.amount), 0);
  const globalMonthlySpent = monthConsumptionRows
    .reduce((sum, item) => sum + numericAmount(item.amount), 0);
  const globalMonthlyRemaining = hasGlobalMonthlyLimit
    ? Math.max(0, globalMonthlyLimit - globalMonthlySpent)
    : null;
  const globalDailyPlan = hasGlobalMonthlyLimit
    ? Math.floor(Math.max(0, globalMonthlyLimit - globalMonthlySpentBeforeToday) / daysRemaining)
    : null;
  const globalDailyRemaining = hasGlobalMonthlyLimit
    ? Math.max(0, globalDailyPlan - todayConsumptionRows.reduce((sum, item) => sum + numericAmount(item.amount), 0))
    : null;

  const monthBeforeToday = monthlyRows.filter((item) => isoDate(item.date) < todayDate);
  const budgetFacts = budgets
    .filter((budget) => budget.month === month && numericAmount(budget.amount) > 0 && budget.categoryId)
    .map((budget) => {
      const category = categories.find((candidate) => candidate.id === budget.categoryId);
      const categoryName = String(category?.name || budget.categoryName || budget.categoryId).slice(0, 50);
      const matchesBudget = (expense) => isOrdinaryExpense(expense)
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
      const incomeSource = incomes.find((item) => item.id === budget.incomeSourceId);
      const sourceLabel = !budget.incomeSourceId || budget.incomeSourceId === 'all'
        ? 'Toutes les sources'
        : String(incomeSource?.source || incomeSource?.name || budget.incomeSourceId).slice(0, 60);
      return {
        category: categoryName,
        categoryId: String(budget.categoryId),
        sourceLabel,
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
    const matchingBudgets = budgetFacts.filter((budget) => {
      const category = normalize(budget.category);
      const categoryId = normalize(budget.categoryId);
      return (category.length > 2 && normalizedText.includes(category))
        || (categoryId.length > 2 && normalizedText.includes(categoryId));
    });
    const explicitSourceBudget = matchingBudgets.find((budget) => {
      if (budget.incomeSourceId === 'all') return false;
      const sourceLabel = normalize(budget.sourceLabel);
      const sourceId = normalize(budget.incomeSourceId);
      return (sourceLabel.length > 2 && normalizedText.includes(sourceLabel))
        || (sourceId.length > 2 && normalizedText.includes(sourceId));
    });
    const generalBudget = matchingBudgets.find((budget) => budget.incomeSourceId === 'all');
    const selectedBudgets = explicitSourceBudget
      ? [explicitSourceBudget]
      : generalBudget ? [generalBudget] : matchingBudgets;
    const matchingBudget = selectedBudgets.length === 1 ? selectedBudgets[0] : null;
    const globalMonthlyAfter = hasGlobalMonthlyLimit
      ? globalMonthlyRemaining - amount : null;
    const globalDailyAfter = hasGlobalMonthlyLimit
      ? globalDailyRemaining - amount : null;
    const globalStatus = !hasGlobalMonthlyLimit ? 'no-global-limit'
      : globalMonthlyAfter < 0 ? 'over-global-monthly-limit'
        : globalDailyAfter < 0 ? 'above-global-daily-pace' : 'within-global-daily-pace';
    if (matchingBudgets.length > 1 && !explicitSourceBudget && !generalBudget) {
      proposedSpend = {
        amount,
        category: matchingBudgets[0].category,
        status: 'source-required',
        availableSources: matchingBudgets.map((budget) => budget.sourceLabel),
      };
    } else if (!matchingBudget) {
      proposedSpend = hasGlobalMonthlyLimit
        ? {
            amount,
            status: 'global-target-only',
            categoryRequired: true,
            globalMonthlyLimit,
            globalMonthlySpent,
            globalMonthlyRemaining,
            globalMonthlyAfter: Math.max(0, globalMonthlyAfter),
            globalDailyRemaining,
            globalDailyAfter: Math.max(0, globalDailyAfter),
            globalStatus,
          }
        : { amount, status: 'category-required' };
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
        globalMonthlyLimit,
        globalMonthlyRemaining,
        globalMonthlyAfter: hasGlobalMonthlyLimit ? Math.max(0, globalMonthlyAfter) : null,
        globalDailyRemaining,
        globalDailyAfter: hasGlobalMonthlyLimit ? Math.max(0, globalDailyAfter) : null,
        globalStatus,
        status: monthlyAfter < 0 || globalStatus === 'over-global-monthly-limit'
          ? 'over-monthly-envelope'
          : dailyAfter < 0 || globalStatus === 'above-global-daily-pace'
            ? 'above-daily-pace-within-monthly-envelope' : 'within-daily-pace',
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
    hasGlobalMonthlyLimit,
    globalMonthlyLimit,
    globalMonthlySpent,
    globalMonthlyRemaining,
    globalDailyPlan,
    globalDailyRemaining,
    proposedSpend,
  };
}
