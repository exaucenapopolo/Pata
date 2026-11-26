import { countExpenseOperations } from './expenseOperations.mjs';
import { isBudgetCountedExpense } from './budgetSpendSummary.mjs';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function toUtcDateKey(value) {
  const key = String(value || '').slice(0, 10);
  if (!DATE_KEY.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function dateKey(date) {
  return date.getUTCFullYear() + '-'
    + String(date.getUTCMonth() + 1).padStart(2, '0') + '-'
    + String(date.getUTCDate()).padStart(2, '0');
}

function daysBetween(from, to) {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

function addDays(key, days) {
  const date = toUtcDateKey(key);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + Math.max(0, Math.floor(Number(days) || 0)));
  return dateKey(date);
}

/**
 * Estime l'épuisement d'une enveloppe avec le rythme réellement observé.
 *
 * L'observation couvre tous les jours calendaires depuis la première dépense,
 * pas uniquement les jours où une dépense a été enregistrée. Les jours sans
 * dépense ralentissent donc correctement la moyenne quotidienne.
 * Aucune lecture Firestore n'est effectuée : le calcul travaille sur les lignes
 * de dépenses déjà chargées par la page Budgets.
 */
export function buildBudgetRunway({
  expenses = [],
  remaining = 0,
  asOfDate,
  horizons = [3, 7, 30],
} = {}) {
  const asOf = toUtcDateKey(asOfDate);
  const rows = (Array.isArray(expenses) ? expenses : []).filter((expense) => {
    const date = toUtcDateKey(expense?.date);
    return date && asOf && date.getTime() <= asOf.getTime() && isBudgetCountedExpense(expense);
  });
  const validDates = rows
    .map((expense) => String(expense.date).slice(0, 10))
    .sort();
  const spendDateKeys = [...new Set(validDates)];
  const firstSpendDate = spendDateKeys[0] || null;
  const observedDays = firstSpendDate && asOf
    ? Math.max(1, daysBetween(toUtcDateKey(firstSpendDate), asOf) + 1)
    : 0;
  const totalSpent = rows.reduce((sum, expense) => {
    const amount = Number(expense?.amount);
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
  const remainingAmount = Number(remaining);
  const safeRemaining = Number.isFinite(remainingAmount) ? remainingAmount : 0;
  const spendingDays = spendDateKeys.length;
  const averageDailySpend = observedDays > 0 ? totalSpent / observedDays : 0;
  const averageSpendPerActiveDay = spendingDays > 0 ? totalSpent / spendingDays : 0;
  const spendingDaysPerWeek = observedDays > 0 ? (spendingDays / observedDays) * 7 : 0;
  const hasUsablePace = totalSpent > 0 && averageDailySpend > 0 && observedDays > 0;
  const daysUntilEmpty = safeRemaining <= 0
    ? 0
    : hasUsablePace ? Math.ceil(safeRemaining / averageDailySpend) : null;
  const estimatedExhaustionDate = daysUntilEmpty === null || !asOf
    ? null
    : addDays(String(asOfDate).slice(0, 10), daysUntilEmpty);
  const confidence = observedDays >= 21 && spendingDays >= 5
    ? 'high'
    : observedDays >= 10 && spendingDays >= 3
      ? 'medium'
      : observedDays > 0 ? 'low' : 'none';
  const projectionDays = [...new Set((Array.isArray(horizons) ? horizons : [])
    .map((value) => Math.floor(Number(value)))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 365))].sort((a, b) => a - b);
  const projections = projectionDays.map((days) => {
    const projectedSpend = hasUsablePace ? Math.round(averageDailySpend * days) : 0;
    const projectedRemaining = Math.round(safeRemaining - projectedSpend);
    return {
      days,
      projectedSpend,
      projectedRemaining,
      willBeDepleted: safeRemaining <= 0 || (hasUsablePace && projectedSpend >= safeRemaining),
    };
  });

  return {
    totalSpent: Math.round(totalSpent),
    remaining: Math.round(safeRemaining),
    expenseCount: countExpenseOperations(rows),
    spendingDays,
    observedDays,
    firstSpendDate,
    averageDailySpend: Math.round(averageDailySpend),
    averageSpendPerActiveDay: Math.round(averageSpendPerActiveDay),
    spendingDaysPerWeek: Math.round(spendingDaysPerWeek * 10) / 10,
    daysUntilEmpty,
    estimatedExhaustionDate,
    confidence,
    hasUsablePace,
    projections,
  };
}
