import { resolveCategory } from '@/lib/utils';

/**
 * Construit un contexte compact sur l'utilisateur (max ~400 tokens).
 */
export function buildUserContext(userData) {
  const { profile, incomes, expenses, goals } = userData;

  const totalIncome = incomes.reduce((s, i) => s + (i.amount || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const balance = profile?.balance || 0;

  // Dépenses par catégorie (top 3)
  const byCategory = {};
  expenses.forEach(e => {
    byCategory[e.categoryId] = (byCategory[e.categoryId] || 0) + (e.amount || 0);
  });
  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, amount]) => {
      const cat = resolveCategory(id, 'expense');
      return `${cat.label}: ${Math.round(amount).toLocaleString('fr-FR')} FCFA`;
    });

  // Objectifs actifs (max 3)
  const activeGoals = goals
    .filter(g => g.type !== 'piggybank' && g.deadline)
    .slice(0, 3)
    .map(g => `${g.name}: objectif ${Math.round(g.targetAmount).toLocaleString('fr-FR')} FCFA avant ${g.deadline}`);

  // Prévisions vitales
  const vital = profile?.vitalNeeds || {};
  const totalVital = Object.values(vital).reduce((s, v) => s + (Number(v) || 0), 0);

  return [
    `Prénom: ${profile?.displayName?.split(' ')[0] || 'Utilisateur'}`,
    `Solde portefeuille: ${Math.round(balance).toLocaleString('fr-FR')} FCFA`,
    `Revenus totaux déclarés: ${Math.round(totalIncome).toLocaleString('fr-FR')} FCFA`,
    `Dépenses totales enregistrées: ${Math.round(totalExpenses).toLocaleString('fr-FR')} FCFA`,
    `Taux d'épargne actuel: ${totalIncome > 0 ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100) : 0}%`,
    topCategories.length > 0 ? `Top dépenses: ${topCategories.join(' | ')}` : 'Aucune dépense enregistrée',
    activeGoals.length > 0 ? `Objectifs actifs: ${activeGoals.join(' | ')}` : 'Aucun objectif actif',
    totalVital > 0 ? `Besoins vitaux mensuels: ${Math.round(totalVital).toLocaleString('fr-FR')} FCFA` : 'Besoins vitaux non définis',
  ].join('\n');
                              }
