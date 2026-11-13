export const COTISATION_CHAT_PRICE = 500;
export const COTISATION_CHAT_MAX_LENGTH = 1000;
export const COTISATION_CHAT_RETENTION_DAYS = 30;

export function sanitizeCotisationChatMessage(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, COTISATION_CHAT_MAX_LENGTH);
}

export function cotisationChatExpiry(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Date de référence invalide.');
  return new Date(date.getTime() + COTISATION_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}
