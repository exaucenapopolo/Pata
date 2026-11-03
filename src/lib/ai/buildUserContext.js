import { resolveCategory } from '@/lib/utils';

export function buildUserContext(userData) {
  const { profile, incomes, expenses, goals, budgets } = userData;

  const now = new Date();
  const currentMonthStr = now.toISOString().slice(0, 7);
  
  // Calculs de base
  const totalIncome = incomes.reduce((s, i) => s + (i.amount || 0), 0);
  const totalExpense = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const globalBalance = Math.max(0, totalIncome - totalExpense);

  // Détail des revenus
  const incomeDetails = incomes.map(inc => {
    const linkedExpenses = expenses.filter(e => e.incomeSourceId === inc.id);
    const spent = linkedExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const remaining = Math.max(0, (inc.amount || 0) - spent);
    return { id: inc.id, source: inc.source, remaining, isExhausted: remaining === 0 && spent > 0 };
  });

  const incomeLines = incomeDetails.slice(0, 10).map(inc => 
    `ID: "${inc.id}" | Nom: "${inc.source}" | Reste: ${inc.remaining} FCFA${inc.isExhausted ? ' (ÉPUISÉ)' : ''}`
  ).join('\n');

  // Détail des budgets actuels
  const currentBudgets = budgets.filter(b => b.month === currentMonthStr);
  const budgetLines = currentBudgets.map(b => {
    const cat = resolveCategory(b.categoryId, 'expense');
    return `- ${cat.label} : ${b.amount} FCFA (Source: ${b.incomeSourceName || 'Global'})`;
  }).join('\n');

  // Prévisions vitales
  const vitalNeeds = profile?.vitalNeeds || {};
  const vitalLines = Object.entries(vitalNeeds).map(([key, val]) => {
    const cat = resolveCategory(key, 'expense');
    return `- ${cat.label} : ${val.amount} FCFA / ${val.frequency === 'daily' ? 'jour' : val.frequency === 'weekly' ? 'semaine' : 'mois'}`;
  }).join('\n');

  return `
=== PROFIL ===
Prénom: ${profile?.displayName?.split(' ')[0] || 'Utilisateur'}

=== SITUATION FINANCIÈRE GLOBALE ===
TOTAL DISPONIBLE (Tous revenus - Toutes dépenses) : ${globalBalance} FCFA

=== SOURCES DE REVENUS ===
${incomeLines || 'Aucun revenu enregistré.'}

=== BUDGETS ACTUELS (${currentMonthStr}) ===
${budgetLines || 'Aucun budget défini.'}

=== PRÉVISIONS VITALES CONFIGURÉES ===
${vitalLines || 'Non configurées.'}
`.trim();
                                        }
