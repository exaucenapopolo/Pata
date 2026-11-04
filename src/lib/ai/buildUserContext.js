import { resolveCategory } from '@/lib/utils';

const money = (value) => Math.round(Number(value) || 0).toLocaleString('fr-FR');
const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value);

export function buildUserContext(userData) {
  const {
    profile = {}, incomes = [], expenses = [], goals = [], budgets = [],
    automations = [], memories = [], categories = [], now: providedNow,
  } = userData || {};

  const now = providedNow instanceof Date ? providedNow : new Date();
  const customCategoryNames = new Map(categories.filter((item) => item.type === 'expense').map((item) => [item.id, item.name]));
  const expenseCategoryLabel = (id) => customCategoryNames.get(id) || resolveCategory(id, 'expense').label;
  const localParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit',
  }).formatToParts(now);
  const year = Number(localParts.find((part) => part.type === 'year')?.value);
  const monthNumber = Number(localParts.find((part) => part.type === 'month')?.value);
  const currentMonth = `${year}-${String(monthNumber).padStart(2, '0')}`;
  const previousDate = new Date(Date.UTC(year, monthNumber - 2, 1));
  const previousMonth = `${previousDate.getUTCFullYear()}-${String(previousDate.getUTCMonth() + 1).padStart(2, '0')}`;
  const completedMonths = [0, 1, 2].map((offset) => {
    const date = new Date(Date.UTC(year, monthNumber - 2 - offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });

  const totalIncome = incomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalExpense = expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const currentIncomes = incomes.filter((item) => validDate(item.date) && item.date.slice(0, 7) === currentMonth);
  const currentExpenses = expenses.filter((item) => validDate(item.date) && item.date.slice(0, 7) === currentMonth);
  const previousIncomes = incomes.filter((item) => validDate(item.date) && item.date.slice(0, 7) === previousMonth);
  const previousExpenses = expenses.filter((item) => validDate(item.date) && item.date.slice(0, 7) === previousMonth);

  const sourceBalances = incomes.map((income) => {
    const linked = expenses.filter((expense) => expense.incomeSourceId === income.id);
    const spent = linked.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    return {
      id: income.id,
      name: income.source || 'Revenu sans nom',
      amount: Number(income.amount) || 0,
      spent,
      remaining: Math.max(0, (Number(income.amount) || 0) - spent),
      date: income.date || 'Date inconnue',
    };
  });

  const incomeLines = sourceBalances
    .sort((a, b) => a.remaining - b.remaining)
    .slice(0, 30)
    .map((item) => `- ID EXACT: ${item.id} | Source: ${item.name} | Reçu: ${money(item.amount)} FCFA | Dépensé: ${money(item.spent)} FCFA | Disponible: ${money(item.remaining)} FCFA | Date: ${item.date}`)
    .join('\n');

  const globalBalance = totalIncome - totalExpense;
  const currentIncomeTotal = currentIncomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const currentExpenseTotal = currentExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const previousIncomeTotal = previousIncomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const previousExpenseTotal = previousExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const monthlyTrend = completedMonths.map((period) => {
    const periodIncome = incomes.filter((item) => validDate(item.date) && item.date.slice(0, 7) === period)
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const periodExpense = expenses.filter((item) => validDate(item.date) && item.date.slice(0, 7) === period)
      .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    return { period, income: periodIncome, expense: periodExpense, net: periodIncome - periodExpense };
  });
  const averageMonthlyIncome = monthlyTrend.reduce((sum, item) => sum + item.income, 0) / monthlyTrend.length;
  const averageMonthlyExpense = monthlyTrend.reduce((sum, item) => sum + item.expense, 0) / monthlyTrend.length;

  const expensesByCategory = {};
  currentExpenses.forEach((item) => {
    const categoryLabel = expenseCategoryLabel(item.categoryId);
    expensesByCategory[categoryLabel] = (expensesByCategory[categoryLabel] || 0) + (Number(item.amount) || 0);
  });
  const categoryLines = Object.entries(expensesByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, amount]) => `- ${name}: ${money(amount)} FCFA`)
    .join('\n');

  const recentExpenses = [...expenses]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 15)
    .map((item) => {
      const categoryLabel = expenseCategoryLabel(item.categoryId);
      const source = sourceBalances.find((income) => income.id === item.incomeSourceId);
      return `- ID EXACT: ${item.id} | ${item.date || 'Date inconnue'} | ${categoryLabel} | ${money(item.amount)} FCFA | ${item.note || 'Sans note'} | Source: ${source?.name || item.incomeSourceName || 'Non associée'}`;
    }).join('\n');

  const currentBudgets = budgets.filter((item) => item.month === currentMonth);
  const budgetLines = currentBudgets.map((budget) => {
    const categoryLabel = expenseCategoryLabel(budget.categoryId);
    const linkedSpent = currentExpenses
      .filter((expense) => expense.categoryId === budget.categoryId &&
        (!budget.incomeSourceId || budget.incomeSourceId === 'all' || expense.incomeSourceId === budget.incomeSourceId))
      .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    return `- ${categoryLabel}: budget ${money(budget.amount)} FCFA, consommé ${money(linkedSpent)} FCFA, disponible ${money(Math.max(0, Number(budget.amount || 0) - linkedSpent))} FCFA, source ${budget.incomeSourceId || 'all'}`;
  }).join('\n');

  const goalLines = goals.map((goal) => {
    const totalDeposited = (goal.deposits || []).reduce((sum, deposit) => sum + (Number(deposit.amount) || 0), 0);
    const progress = Number(goal.targetAmount) > 0
      ? Math.round((totalDeposited / Number(goal.targetAmount)) * 100)
      : null;
    return `- ID: ${goal.id} | ${goal.name || 'Objectif'} | Cible: ${money(goal.targetAmount)} FCFA | Déjà déposé: ${money(totalDeposited)} FCFA | Échéance: ${goal.deadline || 'non définie'}${progress === null ? '' : ` | Progression réelle calculée: ${progress}%`} | Dette: ${money(goal.debtBalance)} FCFA`;
  }).join('\n');

  const automationLines = automations.map((item) =>
    `- ID: ${item.id} | ${money(item.amount)} FCFA | ${resolveCategory(item.categoryId, 'expense').label} | fréquence: ${item.frequency} | prochaine: ${item.nextRun || 'non définie'} | état: ${item.active === false ? 'en pause' : 'active'} | source: ${item.incomeSourceName || item.incomeSourceId || 'Tous les revenus'}`
  ).join('\n');

  const memoryLines = memories.map((item) => `- [${item.kind || 'contexte'}] ${item.fact}`).join('\n');
  const vitalNeeds = profile?.vitalNeeds || {};
  const vitalLines = Object.entries(vitalNeeds).map(([key, value]) => {
    const category = resolveCategory(key, 'expense');
    return `- ${category.label}: ${money(value?.amount)} FCFA / ${value?.frequency === 'daily' ? 'jour' : value?.frequency === 'weekly' ? 'semaine' : 'mois'}`;
  }).join('\n');

  return `
=== PROFIL ET PARAMÈTRES ===
Prénom: ${profile?.displayName?.split(' ')[0] || 'Utilisateur'}
Devise: ${profile?.currency || 'XAF'} (FCFA au Cameroun si aucune autre précision)
Date locale de référence: ${now.toLocaleString('fr-CM', { timeZone: 'Africa/Douala' })}

=== BILAN GLOBAL CUMULÉ DES DONNÉES ENREGISTRÉES ===
Revenus enregistrés: ${money(totalIncome)} FCFA
Dépenses enregistrées: ${money(totalExpense)} FCFA
Solde calculé: ${money(globalBalance)} FCFA
Attention: ce solde est un calcul des revenus moins les dépenses récupérés dans Pata, pas une lecture d'un compte bancaire externe. Les données récupérées sont plafonnées à 100 revenus et 200 dépenses récentes pour maîtriser les lectures Firestore.

=== COMPARAISON MENSUELLE ===
Mois courant ${currentMonth}: revenus ${money(currentIncomeTotal)} FCFA; dépenses ${money(currentExpenseTotal)} FCFA; différence ${money(currentIncomeTotal - currentExpenseTotal)} FCFA.
Mois précédent ${previousMonth}: revenus ${money(previousIncomeTotal)} FCFA; dépenses ${money(previousExpenseTotal)} FCFA; différence ${money(previousIncomeTotal - previousExpenseTotal)} FCFA.
Moyenne mensuelle des 3 derniers mois complets (${completedMonths.join(', ')}): revenus ${money(averageMonthlyIncome)} FCFA; dépenses ${money(averageMonthlyExpense)} FCFA; solde moyen estimé ${money(averageMonthlyIncome - averageMonthlyExpense)} FCFA. Il s’agit d’une moyenne descriptive, pas d’une garantie de revenu futur.

=== REVENUS ET SOLDES PAR SOURCE ===
Chaque dépense doit être associée à l'ID exact de sa source si l'utilisateur désigne une source. Le nom ne doit jamais être utilisé comme note pour remplacer l'association.
${incomeLines || 'Aucun revenu enregistré.'}

=== CATÉGORIES PERSONNALISÉES ===
${categories.filter((item) => item.type === 'expense').map((item) => `- ID EXACT: ${item.id} | Nom: ${item.name}`).join('\n') || 'Aucune catégorie personnalisée.'}

=== DÉPENSES PAR CATÉGORIE — MOIS COURANT ===
${categoryLines || 'Aucune dépense enregistrée ce mois.'}

=== DÉPENSES RÉCENTES ===
${recentExpenses || 'Aucune dépense enregistrée.'}

=== BUDGETS DU MOIS ===
${budgetLines || 'Aucun budget défini pour ce mois.'}

=== OBJECTIFS ===
${goalLines || 'Aucun objectif enregistré.'}

=== AUTOMATISATIONS ===
${automationLines || 'Aucune automatisation enregistrée.'}

=== BESOINS RÉCURRENTS DÉCLARÉS ===
${vitalLines || 'Non configurés.'}

=== MÉMOIRE EXPLICITEMENT DÉCLARÉE PAR L'UTILISATEUR ===
${memoryLines || 'Aucune préférence/mémoire enregistrée.'}
`.trim();
}
