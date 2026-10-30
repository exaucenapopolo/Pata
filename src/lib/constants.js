export const APP_NAME = 'Pata';
export const DEFAULT_CURRENCY = 'XAF';
export const DEFAULT_LOCALE = 'fr-CM';

// 🖼️ URLs des illustrations (hébergées sur ton GitHub)
const IMAGES = {
  savings: 'https://raw.githubusercontent.com/exaucenapopolo/Pata/refs/heads/main/illustrations/%C3%A9pargne.jpg',
  transport: 'https://raw.githubusercontent.com/exaucenapopolo/Pata/refs/heads/main/illustrations/transport.jpg',
  health: 'https://raw.githubusercontent.com/exaucenapopolo/Pata/refs/heads/main/illustrations/sant%C3%A9.jpg',
  food: 'https://raw.githubusercontent.com/exaucenapopolo/Pata/refs/heads/main/illustrations/nourriture.jpg',
  leisure: 'https://raw.githubusercontent.com/exaucenapopolo/Pata/refs/heads/main/illustrations/loisirs.jpg',
  housing: 'https://raw.githubusercontent.com/exaucenapopolo/Pata/refs/heads/main/illustrations/logement.jpg',
  investment: 'https://raw.githubusercontent.com/exaucenapopolo/Pata/refs/heads/main/illustrations/investissement.jpg',
  internet: 'https://raw.githubusercontent.com/exaucenapopolo/Pata/refs/heads/main/illustrations/internet.jpg',
  contribution: 'https://raw.githubusercontent.com/exaucenapopolo/Pata/refs/heads/main/illustrations/cotisation.jpg',
  other: 'https://raw.githubusercontent.com/exaucenapopolo/Pata/refs/heads/main/illustrations/autre.jpg',
};

// 📊 Catégories par défaut avec leurs mots-clés pour la détection intelligente
export const EXPENSE_CATEGORIES = [
  { 
    id: 'food', 
    label: 'Nourriture', 
    color: '#f59e0b', 
    image: IMAGES.food,
    keywords: ['resto', 'bouffe', 'supermarché', 'marché', 'épicerie', 'cantine', 'fast-food', 'alimentation', 'viande', 'poisson', 'légume']
  },
  { 
    id: 'transport', 
    label: 'Transport', 
    color: '#10b981', 
    image: IMAGES.transport,
    keywords: ['taxi', 'bus', 'essence', 'carburant', 'moto', 'voyage', 'train', 'avion', 'déplacement', 'uber', 'yango']
  },
  { 
    id: 'housing', 
    label: 'Logement', 
    color: '#6366f1', 
    image: IMAGES.housing,
    keywords: ['loyer', 'maison', 'eau', 'électricité', 'charges', 'entretien', 'réparation', 'meuble']
  },
  { 
    id: 'internet', 
    label: 'Télécom / Internet', 
    color: '#3b82f6', 
    image: IMAGES.internet,
    keywords: ['téléphone', 'forfait', 'wifi', 'internet', 'crédit', 'orange', 'mtn', 'abonnement']
  },
  { 
    id: 'health', 
    label: 'Santé', 
    color: '#ef4444', 
    image: IMAGES.health,
    keywords: ['pharmacie', 'médecin', 'hôpital', 'clinique', 'médicament', 'santé', 'dentiste', 'analyse']
  },
  { 
    id: 'leisure', 
    label: 'Loisirs', 
    color: '#ec4899', 
    image: IMAGES.leisure,
    keywords: ['cinéma', 'bar', 'sortie', 'jeu', 'loisir', 'vacances', 'fête', 'boîte', 'concert', 'abonnement tv']
  },
  { 
    id: 'investment', 
    label: 'Investissement', 
    color: '#8b5cf6', 
    image: IMAGES.investment,
    keywords: ['crypto', 'bourse', 'trading', 'paris sportifs', 'business', 'affaire', 'placement', 'investissement', 'achat immobilier']
  },
  { 
    id: 'contribution', 
    label: 'Cotisation', 
    color: '#14b8a6', 
    image: IMAGES.contribution,
    keywords: ['tontine', 'association', 'église', 'mutuelle', 'cotisation', 'cagnotte', 'solidarité', 'réunion']
  },
  { 
    id: 'savings', 
    label: 'Épargne', 
    color: '#0ea5e9', 
    image: IMAGES.savings,
    keywords: ['épargne', 'livret', 'objectif', 'économie']
  },
  { 
    id: 'other', 
    label: 'Autre', 
    color: '#94a3b8', 
    image: IMAGES.other,
    keywords: [] // Catégorie par défaut
  },
];

export const GOAL_CATEGORIES = [
  { id: 'savings',   label: 'Épargne générale', color: '#10b981', image: IMAGES.savings },
  { id: 'transport', label: 'Transport',        color: '#3b82f6', image: IMAGES.transport },
  { id: 'food',      label: 'Nourriture',       color: '#f59e0b', image: IMAGES.food },
  { id: 'housing',   label: 'Logement',         color: '#6366f1', image: IMAGES.housing },
  { id: 'health',    label: 'Santé',            color: '#ef4444', image: IMAGES.health },
  { id: 'other',     label: 'Autre',            color: '#94a3b8', image: IMAGES.other },
];

export const BUDGET_RULES = {
  housing:   { label: 'Logement',         percent: 20 },
  food:      { label: 'Nourriture',       percent: 20 },
  transport: { label: 'Transport',        percent: 10 },
  internet:  { label: 'Télécom',          percent: 5  },
  savings:   { label: 'Épargne',          percent: 20 },
  leisure:   { label: 'Loisirs',          percent: 10 },
  health:    { label: 'Santé / Urgences', percent: 10 },
  other:     { label: 'Autre',            percent: 5  },
};

export const PENALTY_DEFAULT = 700;
