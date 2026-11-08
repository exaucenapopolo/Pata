import { resolveCategory } from '@/lib/utils';

const money = (value) => Math.round(Number(value) || 0).toLocaleString('fr-FR');
const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value);

export function buildUserContext(userData) {
  const {
    profile = {}, incomes = [], expenses = [], goals = [], budgets = [], projects = [],
    cotisations = [], automations = [], memories = [], categories = [], now: providedNow,
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
  const getExpenseType = (item) => ['consumption', 'project', 'savings', 'investment'].includes(item.expenseType) ? item.expenseType : 'consumption';
  const typeTotals = expenses.reduce((totals, item) => {
    totals[getExpenseType(item)] += Number(item.amount) || 0;
    return totals;
  }, { consumption: 0, project: 0, savings: 0, investment: 0 });
  const currentIncomes = incomes.filter((item) => validDate(item.date) && item.date.slice(0, 7) === currentMonth);
  const currentExpenses = expenses.filter((item) => validDate(item.date) && item.date.slice(0, 7) === currentMonth);
  const currentTypeTotals = currentExpenses.reduce((totals, item) => {
    totals[getExpenseType(item)] += Number(item.amount) || 0;
    return totals;
  }, { consumption: 0, project: 0, savings: 0, investment: 0 });
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
  const previousIncomeSpend = currentExpenses.reduce((sum, expense) => {
    const source = sourceBalances.find((income) => income.id === expense.incomeSourceId);
    return source && String(source.date || '').slice(0, 7) < currentMonth
      ? sum + (Number(expense.amount) || 0) : sum;
  }, 0);
  const currentMonthIncomeGap = Math.max(0, currentExpenseTotal - currentIncomeTotal);
  const previousMonthFundsExplainingGap = Math.min(previousIncomeSpend, currentMonthIncomeGap);
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
  currentExpenses.filter((item) => getExpenseType(item) === 'consumption').forEach((item) => {
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
      const typeLabel = ({ consumption: 'Dépense courante', project: 'Projet', savings: 'Épargne', investment: 'Investissement' })[getExpenseType(item)];
      return `- ID EXACT: ${item.id} | ${item.date || 'Date inconnue'} | ${typeLabel} | ${categoryLabel} | ${money(item.amount)} FCFA | ${item.note || 'Sans note'} | Projet: ${item.projectName || 'Aucun'} | Source: ${source?.name || item.incomeSourceName || 'Non associée'}`;
    }).join('\n');

  const currentBudgets = budgets.filter((item) => item.month === currentMonth);
  const budgetLines = currentBudgets.map((budget) => {
    const categoryLabel = expenseCategoryLabel(budget.categoryId);
    const linkedSpent = currentExpenses
      .filter((expense) => getExpenseType(expense) === 'consumption' && expense.categoryId === budget.categoryId &&
        (!budget.incomeSourceId || budget.incomeSourceId === 'all' || expense.incomeSourceId === budget.incomeSourceId))
      .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    return `- ${categoryLabel}: budget ${money(budget.amount)} FCFA, consommé ${money(linkedSpent)} FCFA, disponible ${money(Math.max(0, Number(budget.amount || 0) - linkedSpent))} FCFA, source ${budget.incomeSourceId || 'all'}`;
  }).join('\n');

  const goalLines = goals.map((goal) => {
    const totalDeposited = (goal.deposits || []).filter((deposit) => deposit.source !== 'loan').reduce((sum, deposit) => sum + (Number(deposit.amount) || 0), 0);
    const progress = Number(goal.targetAmount) > 0
      ? Math.round((totalDeposited / Number(goal.targetAmount)) * 100)
      : null;
    return `- ID: ${goal.id} | ${goal.name || 'Objectif'} | Cible: ${money(goal.targetAmount)} FCFA | Déjà déposé: ${money(totalDeposited)} FCFA | Échéance: ${goal.deadline || 'non définie'}${progress === null ? '' : ` | Progression réelle calculée: ${progress}%`} | Dette: ${money(goal.debtBalance)} FCFA`;
  }).join('\n');

  const automationLines = automations.map((item) =>
    `- ID: ${item.id} | ${money(item.amount)} FCFA | ${expenseCategoryLabel(item.categoryId)} | fréquence: ${item.frequency} | prochaine: ${item.nextRun || 'non définie'} | état: ${item.active === false ? 'en pause' : 'active'} | source: ${item.incomeSourceName || item.incomeSourceId || 'Tous les revenus'}`
  ).join('\n');

  const projectLines = projects.map((project) => {
    const linkedExpenses = expenses.filter((item) => item.projectId === project.id);
    const linkedIncomes = incomes.filter((item) => item.projectId === project.id);
    const spent = linkedExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const allocatedIncome = linkedIncomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    return `- ID EXACT: ${project.id} | ${project.name || 'Projet'} | Statut: ${project.status || 'active'} | Budget indicatif: ${money(project.targetAmount)} FCFA | Revenus réservés: ${money(allocatedIncome)} FCFA | Sorties liées: ${money(spent)} FCFA | Écart: ${money(allocatedIncome - spent)} FCFA`;
  }).join('\n');
  const cotisationLines = cotisations.map((group) => {
    const memberLines = (group.members || []).map((member) => {
      const markers = [member.isMe ? 'Utilisateur' : '', member.isOwner ? 'Chef' : ''].filter(Boolean).join(', ');
      return \`  • Position \${member.position || '—'} : \${member.displayName}\${markers ? ' (' + markers + ')' : ''} | Principal versé : \${money(member.principalPaid)} FCFA | Majoration réglée : \${money(member.penaltyPaid)} FCFA | Total confirmé : \${money(member.totalPaid)} FCFA | Reste principal : \${money(member.remainingPrincipal)} FCFA\`;
    }).join('\\n');
    return [
      \`- ID EXACT: \${group.id} | \${group.name} | Rôle: \${group.role} | État: \${group.status} | Lancée: \${group.started ? 'oui' : 'non'}\`,
      \`  Fréquence: \${group.frequency} | Contribution par personne: \${money(group.contributionAmount)} FCFA | Participants: \${group.memberCount}/\${group.expectedMembers}\`,
      \`  Position de l’utilisateur: \${group.myPosition || 'non définie'} | Bénéficiaire du tour: \${group.currentBeneficiary} (position \${group.beneficiaryPosition || '—'}) | C’est son tour: \${group.myTurnToReceive ? 'oui' : 'non'}\`,
      \`  Échéance: \${group.dueAt} | Délai de grâce: \${group.graceDays} jour(s), jusqu’au \${group.graceEndDate} | Majoration: \${group.lateFeeLabel} | Majoration actuellement due par l’utilisateur: \${money(group.lateFeeDue)} FCFA\`,
      \`  Pot de base: \${money(group.basePot)} FCFA | Total confirmé (principal + majorations): \${money(group.totalCollected)} FCFA | Objectif total du tour: \${money(group.totalTargetWithLateFees)} FCFA | Reste à collecter: \${money(group.remainingToCollect)} FCFA | Statut du cycle: \${group.cycleStatus}\`,
      \`  Versement personnel confirmé: principal \${money(group.myPrincipalPaid)} FCFA + majoration \${money(group.myPenaltyPaid)} FCFA | Reste de principal: \${money(group.myRemaining)} FCFA\`,
      '  Participants et contributions :',
      memberLines || '  • Aucun membre disponible.',
    ].join('\\n');
  }).join('\\n\\n');
  const memoryLines = memories.map((item) => `- [${item.kind || 'contexte'}] ${item.fact}`).join('\n');
  const vitalNeeds = profile?.vitalNeeds || {};
  const vitalLines = Object.entries(vitalNeeds).map(([key, value]) => {
    const categoryLabel = expenseCategoryLabel(key);
    return `- ${categoryLabel}: ${money(value?.amount)} FCFA / ${value?.frequency === 'daily' ? 'jour' : value?.frequency === 'weekly' ? 'semaine' : 'mois'}`;
  }).join('\n');

  return `
=== PROFIL ET PARAMÈTRES ===
Prénom: ${profile?.displayName?.split(' ')[0] || 'Utilisateur'}
Devise d’affichage: ${profile?.currency || 'XAF'} (les montants financiers de référence sont stockés en XAF). Facteurs de conversion connus : EUR ${Number(profile?.currencyRates?.EUR || (1 / 655.957)).toFixed(8)} par FCFA ; USD ${Number(profile?.currencyRates?.USD || (1 / 600)).toFixed(8)} par FCFA. Si l’utilisateur a choisi EUR ou USD, affiche les réponses monétaires dans cette devise et précise une seule fois que la conversion est indicative.
Solde du portefeuille Pata: ${money(profile?.balance)} FCFA. Il s’agit d’un solde interne Pata, pas d’un compte bancaire.
Statut Premium: ${profile?.premiumUntil && new Date(profile.premiumUntil) > now ? `actif jusqu’au ${new Date(profile.premiumUntil).toLocaleDateString('fr-FR')}` : 'non actif'}.
Prévisions de durée du capital enregistrées: ${(Array.isArray(profile?.durationForecasts) ? profile.durationForecasts : []).map((item) => `${item.name}: ${money(item.capital)} FCFA, environ ${item.estimatedDays} jours, fin estimée ${item.estimatedEndDate}`).join(' ; ') || 'Aucune'}.
Date locale de référence: ${now.toLocaleString('fr-CM', { timeZone: 'Africa/Douala' })}

=== BILAN GLOBAL CUMULÉ DES DONNÉES ENREGISTRÉES ===
Revenus enregistrés: ${money(totalIncome)} FCFA
Sorties d’argent enregistrées (toutes natures): ${money(totalExpense)} FCFA
Dépenses courantes / consommation: ${money(typeTotals.consumption)} FCFA
Sorties de projets: ${money(typeTotals.project)} FCFA
Épargne enregistrée comme sortie: ${money(typeTotals.savings)} FCFA
Investissements enregistrés comme sortie: ${money(typeTotals.investment)} FCFA
Solde calculé: ${money(globalBalance)} FCFA
Attention: ce solde est calculé après toutes les sorties, mais la consommation, les projets, l’épargne et les investissements doivent rester distingués. Les données récupérées sont plafonnées à 100 revenus et 200 dépenses récentes pour maîtriser les lectures Firestore.

=== COMPARAISON MENSUELLE ===
Mois courant ${currentMonth}: revenus reçus pendant ce mois ${money(currentIncomeTotal)} FCFA; toutes les sorties pendant ce mois ${money(currentExpenseTotal)} FCFA.
Répartition des sorties : consommation ${money(currentTypeTotals.consumption)} FCFA ; projets ${money(currentTypeTotals.project)} FCFA ; épargne ${money(currentTypeTotals.savings)} FCFA ; investissements ${money(currentTypeTotals.investment)} FCFA.
Sorties du mois financées par des revenus reçus avant ce mois: ${money(previousIncomeSpend)} FCFA. Partie des sorties financée par ces revenus antérieurs: ${money(previousMonthFundsExplainingGap)} FCFA.
RÈGLE D'INTERPRÉTATION: ne dis jamais que l'utilisateur a dépensé plus que ses moyens, qu'il est en déficit ou que son solde est négatif en comparant uniquement les revenus reçus ce mois-ci aux sorties du mois. Il peut utiliser des revenus enregistrés les mois précédents. Présente séparément les revenus reçus pendant la période, les dépenses de la période et la part financée par les revenus antérieurs. Le solde global cumulé et les soldes par source restent les références pour juger des ressources réellement disponibles.
Mois précédent ${previousMonth}: revenus ${money(previousIncomeTotal)} FCFA; sorties ${money(previousExpenseTotal)} FCFA; différence ${money(previousIncomeTotal - previousExpenseTotal)} FCFA.
Moyenne mensuelle des 3 derniers mois complets (${completedMonths.join(', ')}): revenus ${money(averageMonthlyIncome)} FCFA; sorties totales ${money(averageMonthlyExpense)} FCFA; solde moyen estimé ${money(averageMonthlyIncome - averageMonthlyExpense)} FCFA. Il s’agit d’une moyenne descriptive, pas d’une garantie de revenu futur.

=== REVENUS ET SOLDES PAR SOURCE ===
Chaque dépense doit être associée à l'ID exact de sa source si l'utilisateur désigne une source. Le nom ne doit jamais être utilisé comme note pour remplacer l'association.
${incomeLines || 'Aucun revenu enregistré.'}

=== CATÉGORIES PERSONNALISÉES ===
${categories.filter((item) => item.type === 'expense').map((item) => `- ID EXACT: ${item.id} | Nom: ${item.name}`).join('\n') || 'Aucune catégorie personnalisée.'}

=== DÉPENSES COURANTES PAR CATÉGORIE — MOIS COURANT ===
${categoryLines || 'Aucune dépense enregistrée ce mois.'}

=== DÉPENSES RÉCENTES ===
${recentExpenses || 'Aucune dépense enregistrée.'}

=== PROJETS PREMIUM ===
${projectLines || 'Aucun projet enregistré.'}

=== GROUPES DE COTISATION ===
${cotisationLines || 'Aucun groupe de cotisation enregistré pour cet utilisateur.'}

RÈGLE DE CLASSIFICATION : une dépense courante (nourriture, transport, loyer, loisirs) est de la consommation. Une sortie liée à un projet finance un achat ou une réalisation identifiable (construction, équipement, téléphone, ordinateur). Une sortie de type épargne ou investissement est une affectation d’argent, pas une consommation. Toutes réduisent le solde disponible, mais seule la consommation sert à juger si l’utilisateur dépense trop au quotidien. Présente ces quatre montants séparément et ne qualifie jamais automatiquement un projet, une épargne ou un investissement de perte.

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
