import { resolveCategory } from '@/lib/utils';

export function buildUserContext(userData) {
  const { profile, incomes, expenses, goals } = userData;

  const now = new Date();
  const currentMonthStr = now.toISOString().slice(0, 7);
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthStr = prevMonth.toISOString().slice(0, 7);

  const currentExpenses = expenses.filter(e => (e.date || '').startsWith(currentMonthStr));
  const prevExpenses = expenses.filter(e => (e.date || '').startsWith(prevMonthStr));
  
  const curExpenseTotal = currentExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const preExpenseTotal = prevExpenses.reduce((s, e) => s + (e.amount || 0), 0);

  // 🟢 L'ID EST MAINTENANT LE PREMIER ÉLÉMENT VISIBLE
  const incomeDetails = incomes.map(inc => {
    const linkedExpenses = expenses.filter(e => e.incomeSourceId === inc.id);
    const spent = linkedExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const remaining = Math.max(0, (inc.amount || 0) - spent);
    
    return {
      id: inc.id,
      source: inc.source,
      date: inc.date,
      initial: inc.amount || 0,
      spent,
      remaining,
      isExhausted: remaining === 0 && spent > 0
    };
  });

  const recentIncomes = incomeDetails.slice(0, 10); // On augmente la limite à 10 pour être sûr

  const incomeLines = recentIncomes.map(inc => {
    let line = `ID: "${inc.id}" | Nom: "${inc.source}" | Reste: ${inc.remaining} FCFA`;
    if (inc.isExhausted) line += ` (ÉPUISÉ)`;
    return line;
  }).join('\n');

  const byCategory = {};
  currentExpenses.forEach(e => {
    byCategory[e.categoryId] = (byCategory[e.categoryId] || 0) + (e.amount || 0);
  });
  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, amount]) => {
      const cat = resolveCategory(id, 'expense');
      return `${cat.label}: ${Math.round(amount)} FCFA`;
    });

  const activeGoals = goals
    .filter(g => g.type !== 'piggybank' && g.deadline)
    .slice(0, 3)
    .map(g => `${g.name}: objectif ${g.targetAmount} FCFA avant ${g.deadline}`);

  return `
=== PROFIL ===
Prénom: ${profile?.displayName?.split(' ')[0] || 'Utilisateur'}
Solde du portefeuille: ${profile?.balance || 0} FCFA

=== SITUATION DES REVENUS (UTILISE CES IDS EXACTEMENT) ===
${incomeLines || 'Aucun revenu enregistré.'}

=== DÉPENSES DU MOIS EN COURS (${currentMonthStr}) ===
Total dépensé: ${curExpenseTotal} FCFA
Top catégories: ${topCategories.length > 0 ? topCategories.join(' | ') : 'Aucune'}

=== DÉPENSES DU MOIS PRÉCÉDENT (${prevMonthStr}) ===
Total dépensé: ${preExpenseTotal} FCFA

=== OBJECTIFS D'ÉPARGNE ===
${activeGoals.length > 0 ? activeGoals.join('\n') : 'Aucun objectif en cours.'}
`.trim();
}
