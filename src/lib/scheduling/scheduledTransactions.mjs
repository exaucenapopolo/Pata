const FREQUENCIES = new Set(['daily', 'weekly', 'monthly']);

export function isValidDateKey(value) {
  const key = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const date = new Date(key + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key;
}

export function dateKeyInTimeZone(date = new Date(), timeZone = 'Africa/Douala') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day;
}

export function isRecurringFrequency(value) {
  return FREQUENCIES.has(String(value || ''));
}

export function addScheduledFrequency(dateKey, frequency, anchorDay = Number(String(dateKey).slice(8, 10))) {
  if (!isValidDateKey(dateKey) || !FREQUENCIES.has(frequency)) throw new Error('Fréquence ou date de programmation invalide.');
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (frequency === 'daily') date.setUTCDate(date.getUTCDate() + 1);
  else if (frequency === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
  else {
    const targetDay = Math.min(31, Math.max(1, Number(anchorDay) || day));
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(targetDay, lastDay));
  }
  return date.toISOString().slice(0, 10);
}

export function normalizeScheduledKind(kind) {
  const allowed = new Set(['expense', 'income', 'loan_given', 'debt_borrowed', 'debt_repayment', 'repayment_received']);
  const value = String(kind || '').trim();
  if (!allowed.has(value)) throw new Error('Type d’opération programmée invalide.');
  return value;
}

export function getScheduledOccurrenceId(scheduleId, dateKey) {
  const safeId = String(scheduleId || '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 100);
  if (!safeId || !isValidDateKey(dateKey)) throw new Error('Identifiant d’occurrence invalide.');
  return ('scheduled_' + safeId + '_' + dateKey).slice(0, 140);
}
