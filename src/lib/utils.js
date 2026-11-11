import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { translateText } from './i18n/translations';
// 🟢 IMPORT CRITIQUE AJOUTÉ
import { 
  DEFAULT_CURRENCY, 
  DEFAULT_LOCALE, 
  EXPENSE_CATEGORIES, 
  GOAL_CATEGORIES,
  normalizeExpenseCategoryId,
} from './constants';

export { normalizeExpenseCategoryId };

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const FALLBACK_XAF_RATES = { XAF: 1, EUR: 1 / 655.957, USD: 1 / 600 };

export function setPreferredCurrency(currency, rates = null) {
  if (typeof window === 'undefined') return;
  const supported = ['XAF', 'EUR', 'USD'].includes(currency) ? currency : DEFAULT_CURRENCY;
  window.__PATA_CURRENCY__ = supported;
  window.__PATA_CURRENCY_RATES__ = { ...FALLBACK_XAF_RATES, ...(rates && typeof rates === 'object' ? rates : {}) };
}

export function getPreferredCurrencyCode() {
  return (typeof window !== 'undefined' && window.__PATA_CURRENCY__) || DEFAULT_CURRENCY;
}

export function convertCurrencyAmount(amount, currency = null) {
  const activeCurrency = currency || getPreferredCurrencyCode();
  const rates = (typeof window !== 'undefined' && window.__PATA_CURRENCY_RATES__) || FALLBACK_XAF_RATES;
  return Number(amount || 0) * (Number(rates[activeCurrency]) || 1);
}

export function getPreferredLocale() {
  if (typeof document !== 'undefined' && document.documentElement?.lang === 'en') return 'en-GB';
  return DEFAULT_LOCALE;
}

export function formatCurrency(amount, currency = null, locale = null) {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  const activeCurrency = currency || getPreferredCurrencyCode();
  const convertedAmount = convertCurrencyAmount(amount, activeCurrency);
  return new Intl.NumberFormat(locale || getPreferredLocale(), {
    style: 'currency',
    currency: activeCurrency,
    maximumFractionDigits: activeCurrency === 'XAF' ? 0 : 2,
  }).format(convertedAmount);
}

export function formatDate(date, opts) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(
    getPreferredLocale(),
    opts || { day: '2-digit', month: 'short', year: 'numeric' }
  ).format(d);
}

// 🟢 ANTI-UTC
export function getLocalMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function getFirstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function getLastOfMonth() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, d.getMonth() + 1, 0).getDate();
  return `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
}

export function resolveCategory(id, type, customCategories = []) {
  const normalizedId = type === 'goal' ? id : normalizeExpenseCategoryId(id);
  const defaults = type === 'goal' ? GOAL_CATEGORIES : EXPENSE_CATEGORIES;
  const found = defaults.find((c) => c.id === normalizedId);
  if (found) {
    const language = typeof document !== 'undefined' ? document.documentElement?.lang : 'fr';
    const label = translateText(found.label, language);
    return { ...found, label, name: label };
  }
  const custom = customCategories.find((c) => c.id === normalizedId);
  if (custom) return { ...custom, id: normalizedId, label: custom.name, name: custom.name };
  const language = typeof document !== 'undefined' ? document.documentElement?.lang : 'fr';
  const fallbackLabel = translateText('Autre', language);
  return { id: normalizedId, label: fallbackLabel, name: fallbackLabel, color: '#94a3b8' };
}
