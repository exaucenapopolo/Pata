import { resolveCategory } from '@/lib/utils';

export function buildUserContext(userData) {
  const { profile, incomes, expenses, goals, budgets } = userData;

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const currentMonthStr = `${year}-${month}`;

  const totalIncome = incomes.reduce((s, i) => s + (i.amount || 0), 0);
  const totalExpense = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const globalBalance = totalIncome - totalExpense;

  const incomeDetails = incomes.map(inc => {
    const linkedExpenses = expenses.filter(e => e.incomeSourceId === inc.id);
    const spent = linkedExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const remaining = Math.max(0, (inc.amount || 0) - spent);
    return { id: inc.id, source: inc.source, remaining, isExhausted: remaining === 0 && spent > 0 };
  });

  // 🟢 Affichage du solde global et du solde par revenu
  const incomeLines = incomeDetails.slice(0, 10).map(inc => 
    `ID: "${inc.id}" | Nom: "${inc.source}" | Reste: ${inc.remaining} FCFA${inc.isExhausted ? ' (ÉPUISÉ)' : ''}`
  ).join('\n');

  const currentBudgets = budgets.filter(b => b.month === currentMonthStr);
  const budgetLines = currentBudgets.map(b => {
    const cat = resolveCategory(b.categoryId, 'expense');
    return `- ${cat.label} : ${b.amount} FCFA (Source: ${b.incomeSourceName || 'Global'})`;
  }).join('\n');

  const vitalNeeds = profile?.vitalNeeds || {};
  const vitalLines = Object.entries(vitalNeeds).map(([key, val]) => {
    const cat = resolveCategory(key, 'expense');
    return `- ${cat.label} : ${val.amount} FCFA / ${val.frequency === 'daily' ? 'jour' : val.frequency === 'weekly' ? 'semaine' : 'mois'}`;
  }).join('\n');

  const recentExpenses = expenses
    .filter(e => (e.date || '').startsWith(currentMonthStr))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map(e => {
        const cat = resolveCategory(e.categoryId, 'expense');
        return `- ${cat.label} : ${e.amount} FCFA ${e.incomeSourceName ? `[Lié à : ${e.incomeSourceName}]` : '[Global]'}`;
    }).join('\n');

  return `
=== PROFIL ===
Prénom: ${profile?.displayName?.split(' ')[0] || 'Utilisateur'}

=== SITUATION FINANCIÈRE (CALCULÉE PAR L'APPLICATION) ===
SOLDE GLOBAL TOTAL : ${globalBalance} FCFA (Tous les revenus - Toutes les dépenses)

=== DÉTAIL DES REVENUS (UTILISE L'ID EXACT POUR LES DÉPENSES) ===
${incomeLines || 'Aucun revenu.'}

=== DERNIÈRES DÉPENSES (POUR ANALYSE) ===
${recentExpenses || 'Aucune dépense ce mois.'}

=== BUDGETS ACTUELS ===
${budgetLines || 'Aucun budget.'}

=== PRÉVISIONS VITALES ===
${vitalLines || 'Non configurées.'}
`.trim();
}
