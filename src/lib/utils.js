import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from './constants';

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

// 🟢 FONCTION ANTI-UTC : Renvoie le mois local exact (ex: "2026-11")
export function getLocalMonth() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// 🟢 FONCTION ANTI-UTC : Renvoie le premier jour du mois local
export function getFirstOfMonth() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

// 🟢 FONCTION ANTI-UTC : Renvoie le dernier jour du mois local
export function getLastOfMonth() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, d.getMonth() + 1, 0).getDate();
  return `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
}

export function resolveCategory(id, type, customCategories = []) {
  const defaults = type === 'goal' ? GOAL_CATEGORIES : EXPENSE_CATEGORIES;
  const found = defaults.find((c) => c.id === id);
  if (found) return { ...found, label: found.label, name: found.label };
  const custom = customCategories.find((c) => c.id === id);
  if (custom) return { ...custom, label: custom.name, name: custom.name };
  return { id, label: 'Autre', name: 'Autre', color: '#94a3b8' };
}
