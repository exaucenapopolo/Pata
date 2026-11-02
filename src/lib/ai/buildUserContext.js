import { resolveCategory } from '@/lib/utils';

/**
 * Construit un contexte compact sur l'utilisateur (max ~500 tokens).
 * Sépare les données du mois en cours de celles du mois précédent.
 */
export function buildUserContext(userData) {
  const { profile, incomes, expenses, goals } = userData;

  const now = new Date();
  const currentMonthStr = now.toISOString().slice(0, 7); // ex: "2026-11"
  
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthStr = prevMonth.toISOString().slice(0, 7);

  // Filtrer par mois
  const currentIncomes = incomes.filter(i => (i.date || '').startsWith(currentMonthStr));
  const prevIncomes = incomes.filter(i => (i.date || '').startsWith(prevMonthStr));

  const currentExpenses = expenses.filter(e => (e.date || '').startsWith(currentMonthStr));
  const prevExpenses = expenses.filter(e => (e.date || '').startsWith(prevMonthStr));

  const sum = (arr, key) => arr.reduce((s, item) => s + (Number(item[key]) || 0), 0);

  const curIncome = sum(currentIncomes, 'amount');
  const curExpense = sum(currentExpenses, 'amount');
  const preIncome = sum(prevIncomes, 'amount');
  const preExpense = sum(prevExpenses, 'amount');

  // Top catégories du mois en cours
  const byCategory = {};
  currentExpenses.forEach(e => {
    byCategory[e.categoryId] = (byCategory[e.categoryId] || 0) + (e.amount || 0);
  });
  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, amount]) => {
      const cat = resolveCategory(id, 'expense');
      return `${cat.label}: ${Math.round(amount).toLocaleString('fr-FR')} FCFA`;
    });

  // Objectifs actifs
  const activeGoals = goals
    .filter(g => g.type !== 'piggybank' && g.deadline)
    .slice(0, 3)
    .map(g => `${g.name}: objectif ${Math.round(g.targetAmount).toLocaleString('fr-FR')} FCFA avant ${g.deadline}`);

  // Revenus non épuisés
  const allIncomesWithSpent = incomes.map(inc => {
    const spent = expenses.filter(e => e.incomeSourceId === inc.id).reduce((s, e) => s + (e.amount || 0), 0);
    return { ...inc, remaining: Math.max(0, (inc.amount || 0) - spent) };
  });
  const activeIncomes = allIncomesWithSpent.filter(i => i.remaining > 0).map(i => `${i.source}: ${Math.round(i.remaining).toLocaleString('fr-FR')} FCFA restants`);

  return [
    `Prénom de l'utilisateur: ${profile?.displayName?.split(' ')[0] || 'Utilisateur'}`,
    `Solde portefeuille: ${Math.round(profile?.balance || 0).toLocaleString('fr-FR')} FCFA`,
    `--- MOIS EN COURS (${currentMonthStr}) ---`,
    `Revenus perçus ce mois: ${Math.round(curIncome).toLocaleString('fr-FR')} FCFA`,
    `Dépenses effectuées ce mois: ${Math.round(curExpense).toLocaleString('fr-FR')} FCFA`,
    topCategories.length > 0 ? `Où il dépense le plus ce mois: ${topCategories.join(' | ')}` : 'Aucune dépense ce mois',
    `--- MOIS PRÉCÉDENT (${prevMonthStr}) ---`,
    `Revenus perçus le mois dernier: ${Math.round(preIncome).toLocaleString('fr-FR')} FCFA`,
    `Dépenses effectuées le mois dernier: ${Math.round(preExpense).toLocaleString('fr-FR')} FCFA`,
    `--- AUTRES INFOS ---`,
    activeGoals.length > 0 ? `Objectifs actifs: ${activeGoals.join(' | ')}` : 'Aucun objectif actif',
    activeIncomes.length > 0 ? `Revenus avec de l'argent disponible: ${activeIncomes.join(' | ')}` : 'Tous les revenus sont épuisés',
  ].join('\n');
    }
