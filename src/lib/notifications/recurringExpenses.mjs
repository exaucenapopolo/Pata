const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_NAMES = new Set([
  'janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre',
  'january','february','march','april','may','june','july','august','september','october','november','december',
]);
const GENERIC_WORDS = new Set([
  'paiement','payer','payement','facture','achat','depense','transaction','transfert',
  'mtn','orange','money','mobile','especes','carte','cash','mensuel','mensuelle',
  'chaque','mois','du','de','des','la','le','les','un','une','pour','chez','via',
]);

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR').replace(/[^a-z0-9]+/g, ' ').trim();
}
function validDateKey(value) {
  const date = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const parsed = new Date(date + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : '';
}
function dateOrdinal(value) {
  const parsed = validDateKey(value);
  return parsed ? Math.floor(Date.parse(parsed + 'T00:00:00.000Z') / DAY_MS) : NaN;
}
function median(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function recurringLabel(expense = {}) {
  const raw = [expense.note, expense.details, expense.merchantName, expense.payee, expense.providerName, expense.name]
    .map((value) => String(value || '').trim()).find((value) => value.length >= 3) || '';
  const normalized = normalizeText(raw);
  const known = [
    [/\b(loyer|rent|location)\b/, 'loyer'],
    [/\b(eneo|electricite|electricity|courant)\b/, 'électricité'],
    [/\b(internet|wifi|wi fi|fibre|box)\b/, 'Internet'],
    [/\b(abonnement|subscription|canal|netflix|spotify|prime video)\b/, 'abonnement'],
    [/\b(scolarite|ecole|school|inscription|frais scolaires|pension scolaire)\b/, 'scolarité'],
    [/\b(cotisation|tontine|association)\b/, 'cotisation'],
    [/\b(camwater|eau|water)\b/, 'eau'],
  ];
  for (const [pattern, label] of known) if (pattern.test(normalized)) return label;
  const words = normalized.split(' ').filter((word) => word.length > 2 && !GENERIC_WORDS.has(word) && !MONTH_NAMES.has(word));
  if (!words.length) return '';
  return words.slice(0, 3).join(' ').slice(0, 48);
}
function makePatternId(categoryId, label) {
  const raw = normalizeText(categoryId + ' ' + label).replace(/\s+/g, '-').replace(/^-|-$/g, '');
  return raw.slice(0, 90) || 'recurring-expense';
}
function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}
function monthDate(year, monthIndex, day) {
  const safeDay = Math.min(Math.max(1, Number(day) || 1), daysInMonth(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, safeDay)).toISOString().slice(0, 10);
}
function nextMonthDate(dateKey, day) {
  const [year, month] = dateKey.slice(0, 7).split('-').map(Number);
  return monthDate(month === 12 ? year + 1 : year, month === 12 ? 0 : month, day);
}

/**
 * Learns monthly recurring payments from three or more similar expenses in
 * distinct calendar months. This function is deliberately deterministic so
 * the same pattern can be safely saved on every subsequent transaction.
 */
export function buildRecurringExpensePatterns(expenses = [], { referenceDate = '' } = {}) {
  const reference = validDateKey(referenceDate) || '9999-12-31';
  const referenceOrdinal = dateOrdinal(reference);
  const earliestAllowed = Number.isFinite(referenceOrdinal) ? referenceOrdinal - 150 : -Infinity;
  const groups = new Map();

  for (const expense of Array.isArray(expenses) ? expenses : []) {
    if (!expense || expense.neutralFlow === true
      || !['', 'normal', 'consumption'].includes(String(expense.flowType || 'normal'))
      || !['', 'consumption'].includes(String(expense.expenseType || 'consumption'))) continue;
    const date = validDateKey(expense.date);
    const ordinal = dateOrdinal(date);
    const amount = Math.round(Number(expense.amount) || 0);
    if (!date || !Number.isFinite(ordinal) || ordinal < earliestAllowed || amount <= 0) continue;

    const categoryId = String(expense.categoryId || 'other').trim().slice(0, 70);
    const label = recurringLabel(expense);
    if (!label) continue;
    const id = makePatternId(categoryId, label);
    const rows = groups.get(id) || [];
    rows.push({ date, amount, categoryId, label });
    groups.set(id, rows);
  }

  const patterns = [];
  for (const [id, rows] of groups) {
    const months = [...new Set(rows.map((row) => row.date.slice(0, 7)))].sort();
    if (months.length < 3) continue;
    const amountMedian = Math.round(median(rows.map((row) => row.amount)));
    if (!amountMedian) continue;
    const consistentAmounts = rows.filter((row) => Math.abs(row.amount - amountMedian) / amountMedian <= 0.4);
    const consistentMonths = [...new Set(consistentAmounts.map((row) => row.date.slice(0, 7)))];
    if (consistentMonths.length < 3) continue;
    const dayOfMonth = Math.round(median(consistentAmounts.map((row) => Number(row.date.slice(8, 10)))));
    const latestDate = consistentAmounts.map((row) => row.date).sort().at(-1);
    patterns.push({
      id,
      categoryId: consistentAmounts[0].categoryId,
      label: consistentAmounts[0].label,
      occurrenceCount: consistentMonths.length,
      amountMedian,
      dayOfMonth,
      latestDate,
      months: consistentMonths.slice(-6),
      active: true,
    });
  }
  return patterns.sort((a, b) => b.occurrenceCount - a.occurrenceCount || a.id.localeCompare(b.id));
}

/**
 * Builds only reminders whose estimated due date is within the next week.
 * A payment already recorded this month moves the next expected due date to
 * the following month. lastReminderDueDate prevents repeat alerts.
 */
export function buildRecurringExpenseReminders(patterns = [], todayKey, lookAheadDays = 7) {
  const today = validDateKey(todayKey);
  if (!today) return [];
  const todayOrdinal = dateOrdinal(today);
  const [year, month] = today.slice(0, 7).split('-').map(Number);
  const currentMonth = today.slice(0, 7);
  const reminders = [];

  for (const pattern of Array.isArray(patterns) ? patterns : []) {
    if (!pattern || pattern.active === false) continue;
    const day = Math.min(31, Math.max(1, Number(pattern.dayOfMonth) || 1));
    let dueDate = monthDate(year, month - 1, day);
    if (dueDate <= today || String(pattern.latestDate || '').slice(0, 7) === currentMonth) {
      dueDate = nextMonthDate(today, day);
    }
    if (String(pattern.lastReminderDueDate || '') === dueDate) continue;
    const daysUntil = dateOrdinal(dueDate) - todayOrdinal;
    if (daysUntil < 0 || daysUntil > Math.max(0, Number(lookAheadDays) || 0)) continue;

    const label = String(pattern.label || 'ce paiement habituel').trim();
    const amount = Math.max(0, Math.round(Number(pattern.amountMedian) || 0));
    const dueLabel = Number(dueDate.slice(8, 10));
    reminders.push({
      key: 'recurring-expense:' + String(pattern.id || makePatternId(pattern.categoryId, label)) + ':' + dueDate,
      topic: 'recurring_expense',
      priority: 94,
      title: 'Un paiement habituel approche',
      body: 'Tu effectues généralement le paiement « ' + label + ' » autour du ' + dueLabel
        + ' du mois.' + (amount > 0 ? ' Le montant habituel est d’environ ' + amount.toLocaleString('fr-FR') + ' FCFA.' : '')
        + ' Prévois-le dans tes budgets pour garder une marge suffisante.',
      target: '/expenses',
      source: 'recurring_expense_reminder',
      patternId: String(pattern.id || ''),
      dueDate,
      estimatedAmount: amount,
    });
  }
  return reminders.sort((a, b) => b.priority - a.priority || a.dueDate.localeCompare(b.dueDate));
}
