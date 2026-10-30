export const APP_NAME = 'Pata';
export const DEFAULT_CURRENCY = 'XAF';
export const DEFAULT_LOCALE = 'fr-CM';

export const EXPENSE_CATEGORIES = [
  { id: 'housing',   label: 'Logement',           icon: 'Home',           color: '#6366f1' },
  { id: 'food',      label: 'Nourriture',         icon: 'Utensils',       color: '#f59e0b' },
  { id: 'transport', label: 'Transport',          icon: 'Car',            color: '#10b981' },
  { id: 'telecom',   label: 'Télécom / Internet', icon: 'Smartphone',     color: '#3b82f6' },
  { id: 'leisure',   label: 'Loisirs',            icon: 'PartyPopper',    color: '#ec4899' },
  { id: 'health',    label: 'Santé',              icon: 'HeartPulse',     color: '#ef4444' },
  { id: 'savings',   label: 'Épargne',            icon: 'PiggyBank',      color: '#8b5cf6' },
  { id: 'other',     label: 'Autre',              icon: 'MoreHorizontal', color: '#94a3b8' },
];

export const BUDGET_RULES = {
  housing:   { label: 'Logement',         percent: 20 },
  food:      { label: 'Nourriture',       percent: 20 },
  transport: { label: 'Transport',        percent: 10 },
  telecom:   { label: 'Télécom',          percent: 5  },
  savings:   { label: 'Épargne',          percent: 20 },
  leisure:   { label: 'Loisirs',          percent: 10 },
  health:    { label: 'Santé / Urgences', percent: 10 },
  other:     { label: 'Autre',            percent: 5  },
};

export const PENALTY_DEFAULT = 500;
