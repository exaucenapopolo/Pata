import { resolveCategory, formatCurrency } from './utils';

/**
 * Génère une liste de conseils intelligents basés sur les finances de l'utilisateur.
 *
 * @param {Object} data
 * @param {Array} data.expenses - dépenses du mois courant
 * @param {Array} data.previousExpenses - dépenses du mois précédent
 * @param {Array} data.budgets - budgets du mois courant
 * @param {Array} data.goals - objectifs en cours
 * @param {number} data.totalIncome - revenus du mois
 * @param {Array} data.customCategories - catégories custom (expense)
 * @returns {Array<{id, type, title, message, priority}>}
 */
export function generateAdvice({
  expenses = [],
  previousExpenses = [],
  budgets = [],
  goals = [],
  totalIncome = 0,
  customCategories = [],
}) {
  const advices = [];

  const totalExpense = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalBudget = budgets.reduce((s, b) => s + (b.amount || 0), 0);

  /* ────── 1. Taux d'épargne (revenus vs dépenses) ────── */
  if (totalIncome > 0) {
    const savingsRate = ((totalIncome - totalExpense) / totalIncome) * 100;
    if (savingsRate >= 20) {
      advices.push({
        id: 'savings-good',
        type: 'success',
        title: 'Excellent taux d\u2019épargne',
        message: `Tu gardes ${savingsRate.toFixed(0)} % de tes revenus ce mois-ci (${formatCurrency(totalIncome - totalExpense)}). Objectif atteint, continue.`,
        priority: 30,
      });
    } else if (savingsRate >= 0 && savingsRate < 10) {
      advices.push({
        id: 'savings-low',
        type: 'warning',
        title: 'Taux d\u2019épargne faible',
        message: `Tu n\u2019épargnes que ${savingsRate.toFixed(0)} % de tes revenus. Vise 20 % pour plus de sécurité (${formatCurrency(totalIncome * 0.2)}).`,
        priority: 70,
      });
    } else if (savingsRate < 0) {
      advices.push({
        id: 'savings-negative',
        type: 'danger',
        title: 'Dépenses supérieures aux revenus',
        message: `Tu as dépensé ${formatCurrency(Math.abs(totalIncome - totalExpense))} de plus que tes revenus. Réduis immédiatement les dépenses non essentielles.`,
        priority: 100,
      });
    }
  } else if (totalExpense > 0) {
    advices.push({
      id: 'no-income',
      type: 'tip',
      title: 'Déclare tes revenus',
      message: 'Tu as des dépenses mais pas de revenus enregistrés ce mois. Ajoute ton salaire pour un meilleur suivi.',
      priority: 55,
    });
  }

  /* ────── 2. Budgets par catégorie ────── */
  if (totalBudget > 0) {
    const spentByCategory = {};
    expenses.forEach((e) => {
      spentByCategory[e.categoryId] = (spentByCategory[e.categoryId] || 0) + (e.amount || 0);
    });

    budgets.forEach((b) => {
      const spent = spentByCategory[b.categoryId] || 0;
      if (b.amount <= 0) return;
      const usage = (spent / b.amount) * 100;
      const cat = resolveCategory(b.categoryId, 'expense', customCategories);

      if (usage > 100) {
        advices.push({
          id: `over-${b.categoryId}`,
          type: 'danger',
          title: `Budget ${cat.label} dépassé`,
          message: `Tu as dépassé de ${formatCurrency(spent - b.amount)} ton budget ${cat.label}. Réduis tes prochaines dépenses dans cette catégorie.`,
          priority: 92,
        });
      } else if (usage > 80) {
        advices.push({
          id: `near-${b.categoryId}`,
          type: 'warning',
          title: `Budget ${cat.label} bientôt atteint`,
          message: `Il ne reste que ${formatCurrency(b.amount - spent)} sur ton budget ${cat.label}. Ralentis.`,
          priority: 72,
        });
      }
    });
  } else if (totalExpense > 0) {
    advices.push({
      id: 'no-budgets',
      type: 'tip',
      title: 'Définis tes budgets',
      message: 'Applique la répartition suggérée depuis Revenus pour mieux contrôler tes dépenses chaque mois.',
      priority: 60,
    });
  }

  /* ────── 3. Comparaison avec le mois précédent ────── */
  const prevTotal = previousExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  if (prevTotal > 0 && totalExpense > 0) {
    const change = ((totalExpense - prevTotal) / prevTotal) * 100;
    if (change <= -10) {
      advices.push({
        id: 'spending-decrease',
        type: 'success',
        title: 'Dépenses en baisse',
        message: `Bravo ! Tu as dépensé ${Math.abs(change).toFixed(0)} % de moins que le mois dernier (${formatCurrency(prevTotal - totalExpense)} économisés).`,
        priority: 25,
      });
    } else if (change >= 20) {
      advices.push({
        id: 'spending-increase',
        type: 'warning',
        title: 'Dépenses en hausse',
        message: `Tu as dépensé ${change.toFixed(0)} % de plus que le mois dernier (+${formatCurrency(totalExpense - prevTotal)}). Vérifie d\u2019où vient la hausse.`,
        priority: 78,
      });
    }
  }

  /* ────── 4. Catégorie dominante ────── */
  const byCat = {};
  expenses.forEach((e) => {
    byCat[e.categoryId] = (byCat[e.categoryId] || 0) + (e.amount || 0);
  });
  const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  if (sortedCats.length > 0 && totalExpense > 0) {
    const [topId, topAmount] = sortedCats[0];
    const percent = (topAmount / totalExpense) * 100;
    if (percent > 40) {
      const cat = resolveCategory(topId, 'expense', customCategories);
      advices.push({
        id: 'top-category',
        type: 'info',
        title: `Tu dépenses surtout en ${cat.label}`,
        message: `${percent.toFixed(0)} % de tes dépenses (${formatCurrency(topAmount)}) vont en ${cat.label}. C\u2019est là que tu peux économiser le plus.`,
        priority: 45,
      });
    }
  }

  /* ────── 5. Objectifs proches de leur échéance ────── */
  const today = new Date();
  goals.forEach((g) => {
    if (!g.deadline) return;
    const daysLeft = Math.max(0, Math.ceil((new Date(g.deadline) - today) / 86400000));
    if (daysLeft > 0 && daysLeft <= 7) {
      advices.push({
        id: `goal-soon-${g.id}`,
        type: 'warning',
        title: `Objectif « ${g.name} » bientôt terminé`,
        message: `Il te reste ${daysLeft} jour${daysLeft > 1 ? 's' : ''} pour le clôturer. Vérifie sa progression.`,
        priority: 68,
      });
    }
  });

  advices.sort((a, b) => b.priority - a.priority);
  return advices.slice(0, 5);
}

/**
 * Style Tailwind pour chaque type de conseil.
 */
export function adviceStyle(type) {
  switch (type) {
    case 'success':
      return { bg: 'bg-brand-50', border: 'border-brand-200', iconColor: 'text-brand-600', titleColor: 'text-brand-700' };
    case 'danger':
      return { bg: 'bg-red-50', border: 'border-red-200', iconColor: 'text-red-600', titleColor: 'text-red-700' };
    case 'warning':
      return { bg: 'bg-amber-50', border: 'border-amber-200', iconColor: 'text-amber-600', titleColor: 'text-amber-700' };
    case 'tip':
      return { bg: 'bg-blue-50', border: 'border-blue-200', iconColor: 'text-blue-600', titleColor: 'text-blue-700' };
    default:
      return { bg: 'bg-slate-50', border: 'border-slate-200', iconColor: 'text-slate-600', titleColor: 'text-slate-700' };
  }
}

export function adviceIcon(type) {
  switch (type) {
    case 'success': return 'check';
    case 'danger': return 'alert';
    case 'warning': return 'alert';
    case 'tip': return 'lightbulb';
    default: return 'info';
  }
    }
