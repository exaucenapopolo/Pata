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
 * 🧠 Moteur intelligent : Analyse le nom d'une catégorie personnalisée
 * pour trouver à quelle catégorie parente elle appartient.
 */
function detectCategoryByKeywords(name) {
  if (!name) return null;
  const cleanName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Enlève les accents

  for (const cat of EXPENSE_CATEGORIES) {
    if (cat.keywords && cat.keywords.length > 0) {
      for (const keyword of cat.keywords) {
        if (cleanName.includes(keyword)) {
          return cat;
        }
      }
    }
  }
  return null;
}

/**
 * Retrouve une catégorie par son id, dans les defaults ou les customs.
 * Utilise la détection intelligente si c'est une catégorie custom.
 */
export function resolveCategory(id, type, customCategories = []) {
  const defaults = type === 'goal' ? GOAL_CATEGORIES : EXPENSE_CATEGORIES;
  
  // 1. Chercher dans les catégories par défaut
  const foundDefault = defaults.find((c) => c.id === id);
  if (foundDefault) return { ...foundDefault, label: foundDefault.label, name: foundDefault.label };

  // 2. Chercher dans les catégories personnalisées
  const custom = customCategories.find((c) => c.id === id);
  if (custom) {
    // 🧠 Détection intelligente : si le nom contient des mots-clés, on prend l'image de la catégorie parente
    const detected = detectCategoryByKeywords(custom.name);
    return {
      ...custom,
      label: custom.name,
      name: custom.name,
      color: custom.color || detected?.color || '#94a3b8',
      image: custom.image || detected?.image || EXPENSE_CATEGORIES.find(c => c.id === 'other').image,
    };
  }

  // 3. Fallback
  return { 
    id, 
    label: 'Autre', 
    name: 'Autre', 
    color: '#94a3b8', 
    image: EXPENSE_CATEGORIES.find(c => c.id === 'other').image 
  };
             }
