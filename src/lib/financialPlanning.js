import { EXPENSE_CATEGORIES, normalizeExpenseCategoryId } from '@/lib/constants';

export const FINANCIAL_RESOLUTIONS = [
  { id: 'avoid_new_borrowing', label: 'Éviter tout nouvel emprunt pendant cette période', description: 'Pata te préviendra avant l’enregistrement d’une nouvelle dette contractée.', watches: ['debt_borrowed'] },
  { id: 'reduce_debt_before_borrowing', label: 'Réduire ma dette actuelle avant de reprendre un emprunt', description: 'Un nouvel emprunt déclenchera un rappel tant que cet engagement est actif.', watches: ['debt_borrowed'] },
  { id: 'avoid_new_loans', label: 'Limiter les nouveaux prêts accordés aux autres', description: 'Pata te rappellera cette résolution avant un nouveau prêt accordé.', watches: ['loan_given'] },
  { id: 'protect_food_budget', label: 'Mieux maîtriser mes dépenses de nourriture', description: 'Pata te signalera lorsque tes dépenses alimentaires approcheront ton plafond.', watches: ['expense'] },
  { id: 'avoid_impulse_spending', label: 'Éviter les achats impulsifs et non prévus', description: 'Pata te rappellera cet engagement avant une dépense courante.', watches: ['expense'] },
  { id: 'save_regularly', label: 'Mettre de côté une somme avant les dépenses non essentielles', description: 'Pata suivra ta progression et te proposera des ajustements réalistes.', watches: ['expense'] },
  { id: 'grow_income', label: 'Consacrer du temps à développer mes revenus', description: 'Pata suivra ton objectif de revenus et proposera des pistes adaptées à tes habitudes.', watches: ['income'] },
  { id: 'plan_gifts', label: 'Prévoir mes dons et cadeaux sans dépasser mon budget', description: 'Pata suivra les dons et cadeaux comme une catégorie de dépense à part entière.', watches: ['expense'] },
];

const ROLE_SHARES = {
  employee: { housing: 24, food: 24, transport: 10, internet: 7, health: 7, savings: 15, leisure: 5, contribution: 3, gift_donation: 2, other: 3 },
  student: { housing: 18, food: 30, transport: 12, internet: 10, health: 7, savings: 8, leisure: 5, contribution: 3, gift_donation: 2, other: 5 },
  self_employed: { housing: 18, food: 22, transport: 10, internet: 10, health: 6, savings: 12, leisure: 5, contribution: 3, gift_donation: 2, other: 12 },
  family: { housing: 25, food: 28, transport: 10, internet: 6, health: 8, savings: 10, leisure: 4, contribution: 4, gift_donation: 2, other: 3 },
  retired: { housing: 25, food: 25, transport: 8, internet: 5, health: 15, savings: 8, leisure: 4, contribution: 5, gift_donation: 2, other: 3 },
};

const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10));
const money = (value) => Math.max(0, Math.round(Number(value) || 0));
const addDays = (date, days) => { const result = new Date(date + 'T12:00:00'); result.setDate(result.getDate() + days); return result; };
const iso = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');

export function getPeriodBounds(periodType = 'month', periodKey = '') {
  const today = iso(new Date());
  if (periodType === 'day') return { start: periodKey || today, end: periodKey || today, days: 1 };
  if (periodType === 'week') {
    const source = new Date((periodKey || today) + 'T12:00:00');
    const offset = (source.getDay() + 6) % 7;
    const startDate = new Date(source); startDate.setDate(source.getDate() - offset);
    const endDate = new Date(startDate); endDate.setDate(startDate.getDate() + 6);
    return { start: iso(startDate), end: iso(endDate), days: 7 };
  }
  const month = /^\d{4}-\d{2}$/.test(periodKey) ? periodKey : today.slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  const endDate = new Date(year, monthNumber, 0);
  return { start: month + '-01', end: iso(endDate), days: endDate.getDate() };
}

export function getPeriodKey(periodType = 'month', date = new Date()) {
  const dateKey = iso(date);
  if (periodType === 'day') return dateKey;
  if (periodType === 'week') {
    const current = new Date(dateKey + 'T12:00:00');
    current.setDate(current.getDate() - ((current.getDay() + 6) % 7));
    return iso(current);
  }
  return dateKey.slice(0, 7);
}

export function buildFinancialSuggestions({ periodType = 'month', periodKey = '', incomes = [], expenses = [], debts = [] } = {}) {
  const bounds = getPeriodBounds(periodType, periodKey);
  const startHistory = addDays(bounds.end, -89);
  const historyStart = iso(startHistory);
  const inHistory = (item) => validDate(item.date) && item.date >= historyStart && item.date <= bounds.end;
  const ordinaryIncomes = incomes.filter((item) => inHistory(item) && item.neutralFlow !== true
    && item.flowType !== 'debt_borrowed' && item.categoryId !== 'debt_borrowed');
  const consumption = expenses.filter((item) => inHistory(item) && item.neutralFlow !== true
    && item.flowType !== 'loan_given' && item.flowType !== 'repayment'
    && !['loan_given', 'debt_repayment'].includes(item.categoryId)
    && (!item.expenseType || item.expenseType === 'consumption'));
  const borrowed = incomes.filter((item) => inHistory(item)
    && (item.flowType === 'debt_borrowed' || item.categoryId === 'debt_borrowed'));
  const granted = expenses.filter((item) => inHistory(item)
    && (item.flowType === 'loan_given' || item.categoryId === 'loan_given'));
  const historyDays = 90;
  const monthlyIncome = ordinaryIncomes.reduce((sum, item) => sum + money(item.amount), 0) / 3;
  const monthlyExpense = consumption.reduce((sum, item) => sum + money(item.amount), 0) / 3;
  const monthlyBorrowed = borrowed.reduce((sum, item) => sum + money(item.amount), 0) / 3;
  const monthlyGranted = granted.reduce((sum, item) => sum + money(item.amount), 0) / 3;
  const dailyHistoryIncome = ordinaryIncomes.reduce((sum, item) => sum + money(item.amount), 0) / historyDays;
  const dailyHistoryExpense = consumption.reduce((sum, item) => sum + money(item.amount), 0) / historyDays;
  const dailyHistoryBorrowed = borrowed.reduce((sum, item) => sum + money(item.amount), 0) / historyDays;
  const dailyHistoryGranted = granted.reduce((sum, item) => sum + money(item.amount), 0) / historyDays;
  const payableDebt = debts.filter((debt) => debt.type === 'i_owe' && ['active', 'partial', 'late'].includes(debt.status))
    .reduce((sum, debt) => sum + money(debt.remaining), 0);
  const incomeTarget = ordinaryIncomes.length ? Math.round(dailyHistoryIncome * bounds.days * 1.05) : null;
  const expenseLimit = consumption.length ? Math.round(dailyHistoryExpense * bounds.days * 0.95) : null;
  const debtLimit = borrowed.length ? Math.round(dailyHistoryBorrowed * bounds.days * 0.8) : 0;
  const loanGivenLimit = granted.length ? Math.round(dailyHistoryGranted * bounds.days * 0.9) : null;
  const categoryTotals = new Map();
  consumption.forEach((item) => {
    const id = normalizeExpenseCategoryId(item.categoryId || 'other');
    categoryTotals.set(id, (categoryTotals.get(id) || 0) + money(item.amount));
  });
  const topCategories = [...categoryTotals.entries()].map(([categoryId, amount]) => ({
    categoryId,
    label: EXPENSE_CATEGORIES.find((item) => item.id === categoryId)?.label || categoryId,
    amount: Math.round(amount / 3),
  })).sort((a, b) => b.amount - a.amount).slice(0, 4);
  const resolutions = [];
  if (payableDebt > 0 || borrowed.length > 0) resolutions.push('reduce_debt_before_borrowing');
  if (granted.length > 0) resolutions.push('avoid_new_loans');
  if (categoryTotals.has('food')) resolutions.push('protect_food_budget');
  resolutions.push('avoid_impulse_spending');
  resolutions.push('save_regularly');
  if (ordinaryIncomes.length) resolutions.push('grow_income');
  if (categoryTotals.has('gift_donation')) resolutions.push('plan_gifts');
  return {
    periodType,
    periodKey: periodKey || getPeriodKey(periodType),
    ...bounds,
    incomeTarget: incomeTarget == null ? null : Math.max(0, incomeTarget),
    expenseLimit: expenseLimit == null ? null : Math.max(0, expenseLimit),
    debtLimit: Math.max(0, debtLimit),
    loanGivenLimit: loanGivenLimit == null ? null : Math.max(0, loanGivenLimit),
    topCategories,
    resolutions: [...new Set(resolutions)],
    history: {
      incomeCount: ordinaryIncomes.length, expenseCount: consumption.length,
      borrowedCount: borrowed.length, grantedLoanCount: granted.length,
      averageMonthlyIncome: Math.round(monthlyIncome), averageMonthlyExpense: Math.round(monthlyExpense),
      averageMonthlyBorrowed: Math.round(monthlyBorrowed), averageMonthlyGrantedLoans: Math.round(monthlyGranted),
      coveredDays: historyDays,
    },
  };
}

export function buildBudgetSuggestions({ incomes = [], expenses = [], categories = EXPENSE_CATEGORIES, persona = 'employee', month = getPeriodKey('month') } = {}) {
  const shares = ROLE_SHARES[persona] || ROLE_SHARES.employee;
  const end = month + '-' + String(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()).padStart(2, '0');
  const start = iso(addDays(end, -89));
  const inHistory = (item) => validDate(item.date) && item.date >= start && item.date <= end;
  const normalIncomes = incomes.filter((item) => inHistory(item) && item.neutralFlow !== true
    && item.flowType !== 'debt_borrowed' && item.categoryId !== 'debt_borrowed');
  const normalExpenses = expenses.filter((item) => inHistory(item) && item.neutralFlow !== true
    && item.flowType !== 'loan_given' && item.flowType !== 'repayment'
    && !['loan_given', 'debt_repayment'].includes(item.categoryId)
    && (!item.expenseType || item.expenseType === 'consumption'));
  const averageMonthlyIncome = normalIncomes.reduce((sum, item) => sum + money(item.amount), 0) / 3;
  const averageMonthlyExpense = normalExpenses.reduce((sum, item) => sum + money(item.amount), 0) / 3;
  const base = Math.round(averageMonthlyIncome > 0 ? averageMonthlyIncome : averageMonthlyExpense);
  if (!base) return [];
  const historyByCategory = new Map();
  normalExpenses.forEach((item) => {
    const id = normalizeExpenseCategoryId(item.categoryId || 'other');
    historyByCategory.set(id, (historyByCategory.get(id) || 0) + money(item.amount));
  });
  const totalHistory = [...historyByCategory.values()].reduce((sum, value) => sum + value, 0);
  const available = categories.filter((category) => !['loan_given', 'debt_repayment'].includes(category.id));
  let items = available.map((category) => {
    const id = normalizeExpenseCategoryId(category.id);
    const historicalShare = totalHistory > 0 ? (historyByCategory.get(id) || 0) / totalHistory * 100 : shares[id] || 0;
    const profileShare = shares[id] || 0;
    const blendedShare = totalHistory > 0 ? historicalShare * 0.65 + profileShare * 0.35 : profileShare;
    const reduction = ['food', 'leisure', 'other', 'gift_donation'].includes(id) ? 0.95 : 1;
    return { categoryId: id, label: category.label || category.name || id, amount: Math.max(0, Math.round(base * blendedShare / 100 * reduction)) };
  });
  // Keep a budget that can actually fit the user's usual monthly resources.
  const sum = items.reduce((total, item) => total + item.amount, 0);
  if (sum > base && sum > 0) items = items.map((item) => ({ ...item, amount: Math.round(item.amount * base / sum) }));
  return items.filter((item) => item.amount > 0);
}
