export const COTISATION_CHAT_DAILY_FREE_LIMIT = 10;
export const COTISATION_CHAT_PACK_SIZE = 10;
export const COTISATION_CHAT_PACK_PRICE = 100;
export const COTISATION_CHAT_MAX_LENGTH = 1000;
export const COTISATION_CHAT_RETENTION_DAYS = 30;

export function sanitizeCotisationChatMessage(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, COTISATION_CHAT_MAX_LENGTH);
}

export function summarizeCotisationChatQuota(usage = {}) {
  const freeUsed = Math.max(0, Math.min(COTISATION_CHAT_DAILY_FREE_LIMIT, Math.floor(Number(usage.freeUsed) || 0)));
  const bonusPurchased = Math.max(0, Math.floor(Number(usage.bonusPurchased) || 0));
  const bonusUsed = Math.max(0, Math.min(bonusPurchased, Math.floor(Number(usage.bonusUsed) || 0)));
  const freeRemaining = Math.max(0, COTISATION_CHAT_DAILY_FREE_LIMIT - freeUsed);
  const bonusRemaining = Math.max(0, bonusPurchased - bonusUsed);
  return {
    freeLimit: COTISATION_CHAT_DAILY_FREE_LIMIT,
    freeUsed,
    freeRemaining,
    bonusPurchased,
    bonusUsed,
    bonusRemaining,
    remaining: freeRemaining + bonusRemaining,
  };
}

export function consumeCotisationChatQuota(usage = {}) {
  const quota = summarizeCotisationChatQuota(usage);
  if (quota.remaining <= 0) return { success: false, usage: { ...usage }, quota };
  const nextUsage = quota.freeRemaining > 0
    ? { ...usage, freeUsed: quota.freeUsed + 1 }
    : { ...usage, bonusUsed: quota.bonusUsed + 1 };
  return { success: true, usage: nextUsage, quota: summarizeCotisationChatQuota(nextUsage) };
}

export function cotisationChatExpiry(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Date de référence invalide.');
  return new Date(date.getTime() + COTISATION_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}
