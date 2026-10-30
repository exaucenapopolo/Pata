import { resolveCategory, formatCurrency } from './utils';

/**
 * Conseils en langage naturel, personnalisés par prénom.
 * @param {Object} data
 * @param {string} [data.userName] - prénom de l'utilisateur (ou 'toi')
 */
export function generateAdvice({
  expenses = [],
  previousExpenses = [],
  budgets = [],
  goals = [],
  totalIncome = 0,
  customCategories = [],
  userName = 'toi',
}) {
  const advices = [];
  const name = userName && userName !== 'toi' ? userName : null;
  const opener = name ? `${name}, ` : '';

  const totalExpense = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalBudget = budgets.reduce((s, b) => s + (b.amount || 0), 0);
  const prevTotal = previousExpenses.reduce((s, e) => s + (e.amount || 0), 0);

  /* ────── 1. Taux d'épargne ────── */
  if (totalIncome > 0) {
    const savingsRate = ((totalIncome - totalExpense) / totalIncome) * 100;
    if (savingsRate >= 20) {
      advices.push({
        id: 'savings-good',
        type: 'success',
        message: `${opener}tu gardes ${savingsRate.toFixed(0)} % de tes revenus ce mois-ci, soit ${formatCurrency(totalIncome - totalExpense)}. C'est solide — continue à ce rythme.`,
        priority: 30,
      });
    } else if (savingsRate >= 0 && savingsRate < 10) {
      advices.push({
        id: 'savings-low',
        type: 'warning',
        message: `${opener}tu n'épargnes que ${savingsRate.toFixed(0)} % de tes revenus. Pour te sentir plus tranquille, vise au moins 20 % — ça représenterait ${formatCurrency(totalIncome * 0.2)} à mettre de côté.`,
        priority: 70,
      });
    } else if (savingsRate < 0) {
      advices.push({
        id: 'savings-negative',
        type: 'danger',
        message: `${opener}tu as dépensé ${formatCurrency(Math.abs(totalIncome - totalExpense))} de plus que ce que tu as gagné ce mois. Il faut identifier tout de suite les dépenses à réduire.`,
        priority: 100,
      });
    }
  } else if (totalExpense > 0) {
    advices.push({
      id: 'no-income',
      type: 'tip',
      message: `${opener}tu as enregistré des dépenses mais pas encore de revenus ce mois-ci. Ajoute ton salaire ou tes entrées d'argent pour que je puisse t'aider à mieux répartir.`,
      priority: 55,
    });
  }

  /* ────── 2. Budgets dépassés ────── */
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
          message: `${opener}tu as dépassé ton budget ${cat.label} de ${formatCurrency(spent - b.amount)}. Là, tu peux freiner tout de suite sur ${cat.label.toLowerCase()} pour ne pas creuser encore.`,
          priority: 92,
        });
      } else if (usage > 80) {
        advices.push({
          id: `near-${b.categoryId}`,
          type: 'warning',
          message: `${opener}il ne te reste que ${formatCurrency(b.amount - spent)} sur ton budget ${cat.label}. Lève le pied sur ce poste pour finir le mois sereinement.`,
          priority: 72,
        });
      }
    });
  } else if (totalExpense > 0) {
    advices.push({
      id: 'no-budgets',
      type: 'tip',
      message: `${opener}tu dépenses sans budgets définis ce mois. Applique la répartition depuis l'onglet Revenus pour que je puisse te prévenir quand tu approches des limites.`,
      priority: 60,
    });
  }

  /* ────── 3. Comparaison mois précédent ────── */
  if (prevTotal > 0 && totalExpense > 0) {
    const change = ((totalExpense - prevTotal) / prevTotal) * 100;
    if (change <= -10) {
      advices.push({
        id: 'spending-decrease',
        type: 'success',
        message: `Bien joué ${name || ''} — tu as dépensé ${Math.abs(change).toFixed(0)} % de moins que le mois dernier. Ça te fait ${formatCurrency(prevTotal - totalExpense)} d'économies. Ce réflexe paie.`,
        priority: 25,
      });
    } else if (change >= 20) {
      advices.push({
        id: 'spending-increase',
        type: 'warning',
        message: `${opener}tu as dépensé ${change.toFixed(0)} % de plus que le mois dernier, soit ${formatCurrency(totalExpense - prevTotal)} en plus. Regarde d'où vient la hausse : souvent c'est un poste précis qui dérape.`,
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
        message: `${opener}${percent.toFixed(0)} % de tes dépenses vont en ${cat.label.toLowerCase()} (${formatCurrency(topAmount)}). C'est ta plus grosse sortie d'argent ce mois — commence par là si tu veux économiser.`,
        priority: 45,
      });
    }
  }

  /* ────── 5. Objectifs bientôt échus ────── */
  const today = new Date();
  goals.forEach((g) => {
    if (!g.deadline) return;
    const daysLeft = Math.max(0, Math.ceil((new Date(g.deadline) - today) / 86400000));
    if (daysLeft > 0 && daysLeft <= 7) {
      advices.push({
        id: `goal-soon-${g.id}`,
        type: 'warning',
        message: `${opener}ton objectif « ${g.name} » se termine dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}. Jette un œil à ta progression pour éviter l'amende.`,
        priority: 68,
      });
    }
  });

  advices.sort((a, b) => b.priority - a.priority);
  return advices.slice(0, 5);
}

export function adviceIconColor(type) {
  switch (type) {
    case 'success': return 'text-brand-600';
    case 'danger': return 'text-red-500';
    case 'warning': return 'text-amber-500';
    case 'tip': return 'text-blue-500';
    default: return 'text-slate-400';
  }
}
