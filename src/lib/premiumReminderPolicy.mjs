export const PREMIUM_REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function getPremiumUntilDate(value) {
  if (!value) return null;

  let parsed = value;
  if (typeof value?.toDate === 'function') {
    try {
      parsed = value.toDate();
    } catch {
      return null;
    }
  } else if (typeof value === 'object' && Number.isFinite(value.seconds)) {
    parsed = value.seconds * 1000;
  }

  const date = parsed instanceof Date ? parsed : new Date(parsed);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function isPremiumActive(premiumUntil, now = Date.now()) {
  const expiresAt = getPremiumUntilDate(premiumUntil);
  const currentTime = now instanceof Date ? now.getTime() : Number(now);
  return Boolean(expiresAt && Number.isFinite(currentTime) && expiresAt.getTime() > currentTime);
}

export function shouldShowPremiumReminder(
  lastShownAt,
  now = Date.now(),
  cooldownMs = PREMIUM_REMINDER_COOLDOWN_MS
) {
  if (lastShownAt === null || lastShownAt === undefined || lastShownAt === '') return true;

  const lastShown = Number(lastShownAt);
  const currentTime = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(lastShown) || lastShown <= 0 || !Number.isFinite(currentTime)) return true;
  return currentTime - lastShown >= cooldownMs;
}
