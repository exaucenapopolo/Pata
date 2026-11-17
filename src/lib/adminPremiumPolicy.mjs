export const PREMIUM_DURATION_DAYS = 30;
export const MAX_ADMIN_PREMIUM_AMOUNT = 100000000;

function toValidDate(value) {
  let candidate = value;
  if (typeof value?.toDate === 'function') {
    try { candidate = value.toDate(); } catch { return null; }
  } else if (value && typeof value === 'object' && Number.isFinite(Number(value.seconds))) {
    candidate = Number(value.seconds) * 1000;
  }
  const date = candidate instanceof Date ? new Date(candidate.getTime()) : new Date(candidate || 0);
  return Number.isFinite(date.getTime()) && date.getTime() > 0 ? date : null;
}

export function getNextAdminPremiumUntil(currentPremiumUntil, months = 1, now = new Date()) {
  const safeMonths = Number(months);
  if (!Number.isInteger(safeMonths) || safeMonths < 1 || safeMonths > 12) {
    throw new Error('La durée Premium doit être comprise entre 1 et 12 mois.');
  }
  const nowDate = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (!Number.isFinite(nowDate.getTime())) throw new Error('Date de référence invalide.');
  const currentDate = toValidDate(currentPremiumUntil);
  const baseDate = currentDate && currentDate > nowDate ? currentDate : nowDate;
  return new Date(baseDate.getTime() + safeMonths * PREMIUM_DURATION_DAYS * 86400000).toISOString();
}

export function validateAdminPremiumAmount(value, label = 'Montant') {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_ADMIN_PREMIUM_AMOUNT) {
    throw new Error(label + ' invalide. Saisis un montant entier positif en FCFA.');
  }
  return amount;
}
