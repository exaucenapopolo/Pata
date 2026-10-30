import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  DEFAULT_CURRENCY, DEFAULT_LOCALE, EXPENSE_CATEGORIES, GOAL_CATEGORIES,
} from './constants';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount, currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE) {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export function formatDate(date, opts) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(
    'fr-FR',
    opts || { day: '2-digit', month: 'short', year: 'numeric' }
  ).format(d);
}

/**
 * Retrouve une catégorie par son id, dans les defaults ou les customs.
 * @param {string} id
 * @param {'expense'|'goal'} type
 * @param {Array} customCategories - liste custom venant de Firestore
 */
export function resolveCategory(id, type, customCategories = []) {
  const defaults = type === 'goal' ? GOAL_CATEGORIES : EXPENSE_CATEGORIES;
  const found = defaults.find((c) => c.id === id);
  if (found) return { ...found, label: found.label, name: found.label };
  const custom = customCategories.find((c) => c.id === id);
  if (custom) return { ...custom, label: custom.name, name: custom.name };
  return { id, label: 'Autre', name: 'Autre', color: '#94a3b8' };
      }
