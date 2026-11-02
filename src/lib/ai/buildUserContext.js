import { resolveCategory } from '@/lib/utils';

/**
 * Construit un contexte ultra-précis sur l'utilisateur.
 * Calcule le solde restant de chaque revenu en soustrayant les dépenses liées.
 */
export function buildUserContext(userData) {
  const { profile, incomes, expenses, goals } = userData;

  const now = new Date();
  const currentMonthStr = now.toISOString().slice(0, 7); // ex: "2026-11"
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthStr = prevMonth.toISOString().slice(0, 7);

  // 1. Calcul des dépenses totales par mois
  const currentExpenses = expenses.filter(e => (e.date || '').startsWith(currentMonthStr));
  const prevExpenses = expenses.filter(e => (e.date || '').startsWith(prevMonthStr));
  
  const curExpenseTotal = currentExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const preExpenseTotal = prevExpenses.reduce((s, e) => s + (e.amount || 0), 0);

  // 2. Analyse détaillée de CHAQUE revenu
  const incomeDetails = incomes.map(inc => {
    // Trouver toutes les dépenses liées à CE revenu spécifique
    const linkedExpenses = expenses.filter(e => e.incomeSourceId === inc.id);
    const spent = linkedExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const remaining = Math.max(0, (inc.amount || 0) - spent);
    
    // Lister les noms des dépenses liées (pour que l'IA sache où l'argent est parti)
    const linkedExpenseLabels = linkedExpenses.map(e => {
      const cat = resolveCategory(e.categoryId, 'expense');
      return `${cat.label} (${e.amount} FCFA)`;
    });

    return {
      source: inc.source,
      date: inc.date,
      initial: inc.amount || 0,
      spent,
      remaining,
      linkedExpenseLabels,
      isExhausted: remaining === 0 && spent > 0
    };
  });

  // Garder les 5 revenus les plus récents pour ne pas surcharger le prompt
  const recentIncomes = incomeDetails.slice(0, 5);

  // 3. Formatage du texte pour l'IA
  const incomeLines = recentIncomes.map(inc => {
    let line = `- REVENU "${inc.source}" (reçu le ${inc.date}) : Montant initial ${inc.initial} FCFA.`;
    if (inc.spent > 0) {
      line += ` Déjà dépensé : ${inc.spent} FCFA. SOLDE RESTANT : ${inc.remaining} FCFA.`;
      if (inc.linkedExpenseLabels.length > 0) {
        line += ` (Détail des dépenses : ${inc.linkedExpenseLabels.join(', ')})`;
      }
    } else {
      line += ` Aucune dépense liée. SOLDE INTACT : ${inc.remaining} FCFA.`;
    }
    return line;
  }).join('\n');

  // 4. Top catégories du mois en cours
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

  // 5. Objectifs actifs
  const activeGoals = goals
    .filter(g => g.type !== 'piggybank' && g.deadline)
    .slice(0, 3)
    .map(g => `${g.name}: objectif ${g.targetAmount} FCFA avant ${g.deadline}`);

  // 6. Construction du contexte final
  return `
=== PROFIL ===
Prénom: ${profile?.displayName?.split(' ')[0] || 'Utilisateur'}
Solde du portefeuille: ${profile?.balance || 0} FCFA

=== SITUATION DES REVENUS (TRÈS IMPORTANT) ===
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
