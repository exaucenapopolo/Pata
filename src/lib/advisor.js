import { resolveCategory, formatCurrency } from './utils';

/**
 * Génère une liste de conseils personnalisés, intelligents et pertinents.
 *
 * @param {Object} data
 * @param {string} data.userName - prénom
 * @param {Array} data.expenses - dépenses de la période courante
 * @param {Array} data.previousExpenses - dépenses de la période précédente (même durée)
 * @param {number} data.totalIncome - revenus perçus sur la période
 * @param {number} data.previousIncome - revenus perçus sur la période précédente
 * @param {Array} data.budgets - budgets de la période
 * @param {Array} data.goals - objectifs
 * @param {Array} data.customCategories
 */
export function generateAdvice({
  expenses = [],
  previousExpenses = [],
  budgets = [],
  goals = [],
  totalIncome = 0,
  previousIncome = 0,
  previousIncomeSpend = 0,
  incomeTarget = 0,
  expenseLimit = 0,
  debtLimit = 0,
  borrowedDebtTotal = 0,
  previousBorrowedDebtTotal = 0,
  openDebtBalance = 0,
  customCategories = [],
  userName = 'toi',
}) {
  const advices = [];
  const name = userName && userName !== 'toi' ? userName : null;
  const opener = name ? `${name}, ` : '';

  const totalExpense = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const prevTotal = previousExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalBudget = budgets.reduce((s, b) => s + (b.amount || 0), 0);

  /* ────── 1. Catégorie dominante (LA BASE) ────── */
  const byCat = {};
  expenses.forEach((e) => {
    byCat[e.categoryId] = (byCat[e.categoryId] || 0) + (e.amount || 0);
  });
  const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  if (sortedCats.length > 0 && totalExpense > 0) {
    const [topId, topAmount] = sortedCats[0];
    const percent = (topAmount / totalExpense) * 100;
    const cat = resolveCategory(topId, 'expense', customCategories);

    const tipsByCategory = {
      food: 'Essaie de cuisiner à la maison quelques jours par semaine, ou compare les prix au marché. Même 500 FCFA économisés par jour font 15 000 FCFA sur le mois.',
      transport: 'Envisage le covoiturage, la marche pour les courtes distances, ou négocie un forfait mensuel avec ton chauffeur habituel.',
      housing: 'Le logement est difficile à réduire court terme. Vérifie tes charges (électricité, eau) pour voir si tu peux optimiser.',
      internet: 'Compare les forfaits opérateurs. Souvent, un forfait mensuel est moins cher que les recharges quotidiennes.',
      leisure: 'Fixer un plafond hebdomadaire pour les sorties peut libérer facilement 10-15% de ton budget loisirs.',
      health: 'Si tu dépenses beaucoup en pharmacie, souscris une mutuelle si possible. Sinon, fais des bilans réguliers pour prévenir.',
      investment: 'Attention à ne pas mettre plus que ce que tu peux perdre. Diversifie tes placements.',
      contribution: 'Les cotisations sociales sont importantes, mais priorise celles qui te rapportent vraiment (tontines sécurisées).',
      savings: 'Bonne nouvelle : ton épargne n\'est pas une dépense, c\'est un investissement en toi-même.',
      other: 'Essaie de catégoriser ces dépenses pour mieux les comprendre la prochaine fois.',
    };

    advices.push({
      id: 'top-category',
      type: percent > 40 ? 'warning' : 'info',
      message: `${opener}tu dépenses le plus en ${cat.label.toLowerCase()} : ${formatCurrency(topAmount)}, soit ${percent.toFixed(0)}% de tes dépenses. ${tipsByCategory[topId] || ''}`,
      priority: 90,
    });
  }

  /* ────── 2. Comparaison des dépenses avec la période précédente ────── */
  if (prevTotal > 0 && totalExpense > 0) {
    const change = ((totalExpense - prevTotal) / prevTotal) * 100;
    if (change <= -10) {
      advices.push({
        id: 'spending-decrease',
        type: 'success',
        message: `Bien joué${name ? ' ' + name : ''} ! Tu as dépensé ${Math.abs(change).toFixed(0)}% de moins que la période précédente, soit ${formatCurrency(prevTotal - totalExpense)} d'économies. Continue sur cette lancée.`,
        priority: 60,
      });
    } else if (change >= 15) {
      advices.push({
        id: 'spending-increase',
        type: 'danger',
        message: `${opener}tu as dépensé ${change.toFixed(0)}% de plus que la période précédente (+${formatCurrency(totalExpense - prevTotal)}). Regarde dans quelle catégorie cette hausse s'est produite.`,
        priority: 85,
      });
    }
  }

  /* ────── 3. Comparaison des revenus ────── */
  if (previousIncome > 0 && totalIncome > 0) {
    const incomeChange = ((totalIncome - previousIncome) / previousIncome) * 100;
    if (incomeChange >= 10) {
      advices.push({
        id: 'income-up',
        type: 'success',
        message: `Tes revenus ont augmenté de ${incomeChange.toFixed(0)}% (+${formatCurrency(totalIncome - previousIncome)}). Pense à épargner une partie de cette hausse au lieu de l'absorber dans les dépenses.`,
        priority: 50,
      });
    } else if (incomeChange <= -10) {
      advices.push({
        id: 'income-down',
        type: 'warning',
        message: `Tes revenus ont baissé de ${Math.abs(incomeChange).toFixed(0)}%. Sois prudent sur les dépenses non essentielles ce mois-ci.`,
        priority: 75,
      });
    }
  }

  /* ────── 4. Taux d'épargne ────── */
  if (totalIncome > 0 && totalExpense > 0) {
    const availableForPeriod = totalIncome + Math.max(0, Number(previousIncomeSpend) || 0);
    const periodRemainder = availableForPeriod - totalExpense;
    const savingsRate = availableForPeriod > 0 ? (periodRemainder / availableForPeriod) * 100 : null;
    if (previousIncomeSpend > 0 && totalExpense > totalIncome) {
      advices.push({
        id: 'previous-reserve-used',
        type: 'success',
        message: `Tu as utilisé ${formatCurrency(previousIncomeSpend)} de revenus conservés lors des périodes précédentes pour financer une partie de tes dépenses actuelles. C’est une réserve que tu avais déjà constituée, pas un revenu qui a disparu. Continue à suivre son évolution.`,
        priority: 88,
      });
    }
    if (savingsRate !== null && savingsRate >= 20) {
      advices.push({
        id: 'savings-good',
        type: 'success',
        message: `Après prise en compte de tes réserves antérieures, il te reste ${formatCurrency(Math.max(0, periodRemainder))} sur les ressources disponibles pour cette période.`,
        priority: 40,
      });
    } else if (savingsRate !== null && savingsRate >= 0 && savingsRate < 10) {
      advices.push({
        id: 'savings-low',
        type: 'warning',
        message: `Il te reste peu de marge sur les ressources disponibles pour cette période. Vérifie les dépenses variables avant les prochaines sorties d’argent.`,
        priority: 70,
      });
    } else if (savingsRate !== null && savingsRate < 0 && previousIncomeSpend <= 0) {
      advices.push({
        id: 'savings-negative',
        type: 'warning',
        message: `Les dépenses enregistrées dépassent les revenus saisis pour cette période. Vérifie si certaines réserves ou sources de financement ne sont pas encore enregistrées dans Pata.`,
        priority: 100,
      });
    }
  }

  /* ────── 5. Budgets dépassés ────── */
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
          message: `Tu as dépassé ton budget ${cat.label.toLowerCase()} de ${formatCurrency(spent - b.amount)}. Freine ce poste jusqu'à la prochaine période.`,
          priority: 95,
        });
      }
    });
  }

  /* ────── 6. Objectifs financiers choisis par l’utilisateur ────── */
  if (incomeTarget > 0) {
    const remainingIncome = Math.max(0, incomeTarget - totalIncome);
    if (totalIncome >= incomeTarget) {
      advices.push({ id: 'income-target-reached', type: 'success', message: `Tu as atteint ton objectif de revenus de ${formatCurrency(incomeTarget)}. Protège une partie de ce résultat au lieu de l’absorber dans les dépenses.`, priority: 68 });
    } else {
      advices.push({ id: 'income-target-progress', type: 'info', message: `Tu as enregistré ${formatCurrency(totalIncome)} sur ton objectif de ${formatCurrency(incomeTarget)}. Il reste ${formatCurrency(remainingIncome)} à atteindre. Identifie une source de revenu réaliste pour progresser.`, priority: 48 });
    }
  }
  if (expenseLimit > 0 && totalExpense > 0) {
    const usage = (totalExpense / expenseLimit) * 100;
    if (usage > 100) advices.push({ id: 'expense-target-exceeded', type: 'danger', message: `Tu as dépassé ton plafond de dépenses courantes de ${formatCurrency(totalExpense - expenseLimit)}. Mets en pause les dépenses non prioritaires et réajuste ton plan.`, priority: 102 });
    else if (usage >= 80) advices.push({ id: 'expense-target-near', type: 'warning', message: `Tu as déjà utilisé ${usage.toFixed(0)}% de ton plafond de dépenses courantes. Garde une marge pour les besoins essentiels du reste du mois.`, priority: 83 });
  }
  if (debtLimit > 0 && borrowedDebtTotal > 0) {
    const usage = (borrowedDebtTotal / debtLimit) * 100;
    if (usage > 100) advices.push({ id: 'debt-target-exceeded', type: 'danger', message: `Tu as dépassé ton plafond de nouveaux emprunts de ${formatCurrency(borrowedDebtTotal - debtLimit)}. Évite un nouvel emprunt avant d’avoir revu tes remboursements et tes priorités.`, priority: 110 });
    else if (usage >= 80) advices.push({ id: 'debt-target-near', type: 'warning', message: `Tu as déjà utilisé ${usage.toFixed(0)}% de ton plafond de nouveaux emprunts. Vérifie que tes remboursements actuels restent supportables avant d’emprunter davantage.`, priority: 92 });
  }
  if (openDebtBalance > 0 && borrowedDebtTotal > previousBorrowedDebtTotal) {
    advices.push({ id: 'debt-balance-reminder', type: 'warning', message: `Il te reste ${formatCurrency(openDebtBalance)} à rembourser. Évite d’empiler les emprunts : planifie d’abord les échéances et remboursements déjà engagés.`, priority: 78 });
  }

  /* ────── 7. Petites dépenses fréquentes (les "tueurs silencieux") ────── */
  if (expenses.length > 0) {
    const smallExpenses = expenses.filter(e => e.amount < 2000);
    const smallTotal = smallExpenses.reduce((s, e) => s + e.amount, 0);
    if (smallExpenses.length >= 5 && smallTotal > totalExpense * 0.2) {
      advices.push({
        id: 'small-expenses',
        type: 'info',
        message: `${opener}tu as fait ${smallExpenses.length} petites dépenses (moins de 2 000 FCFA) qui totalisent ${formatCurrency(smallTotal)}. Ce sont souvent les plus faciles à réduire sans impact sur ta vie.`,
        priority: 55,
      });
    }
  }

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
