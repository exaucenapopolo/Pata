import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const incomePage = fs.readFileSync(new URL('../src/app/(app)/income/page.js', import.meta.url), 'utf8');
const errorPage = fs.readFileSync(new URL('../src/app/error.js', import.meta.url), 'utf8');
const budgetsPage = fs.readFileSync(new URL('../src/app/(app)/budgets/page.js', import.meta.url), 'utf8');

test('les états lus par le suivi du revenu sont initialisés avant son useEffect', () => {
  const selectedIncomeState = incomePage.indexOf('const [selectedIncome, setSelectedIncome] = useState(null);');
  const expenseDetailsState = incomePage.indexOf('const [incomeExpenseDetails, setIncomeExpenseDetails] = useState(');
  const trackingEffect = incomePage.indexOf('useEffect(() => {\n    if (!selectedIncome?.id');

  assert.notEqual(selectedIncomeState, -1, 'état selectedIncome introuvable');
  assert.notEqual(expenseDetailsState, -1, 'état incomeExpenseDetails introuvable');
  assert.notEqual(trackingEffect, -1, 'effet de suivi du revenu introuvable');
  assert.ok(selectedIncomeState < trackingEffect, 'selectedIncome doit être initialisé avant le useEffect');
  assert.ok(expenseDetailsState < trackingEffect, 'incomeExpenseDetails doit être initialisé avant le useEffect');
});

test('une erreur de rendu affiche une interface de récupération au lieu d’un écran vide', () => {
  assert.match(errorPage, /role="alert"/);
  assert.match(errorPage, /onClick=\{\(\) => reset\(\)\}/);
  assert.match(errorPage, /href="\/support"/);
});


test('une erreur provenant du layout racine est récupérée par le boundary global', () => {
  const globalError = fs.readFileSync(new URL('../src/app/global-error.js', import.meta.url), 'utf8');
  assert.match(globalError, /<html lang="fr">/);
  assert.match(globalError, /<body/);
  assert.match(globalError, /role="alert"/);
  assert.match(globalError, /onClick=\{\(\) => reset\(\)\}/);
  assert.match(globalError, /href="\/support"/);
});


test('les statistiques de téléchargement Android sont bien récupérées par le tableau admin', () => {
  const apiRoute = fs.readFileSync(new URL('../src/app/api/[...path]/route.js', import.meta.url), 'utf8');
  const overviewStart = apiRoute.indexOf('async function handleAdminOverview');
  const overviewEnd = apiRoute.indexOf('async function handleAdminSavings', overviewStart);
  const overview = apiRoute.slice(overviewStart, overviewEnd);
  assert.match(overview, /activeDebts,\s*androidDownloadMetrics(?:,\s*trackedUsers)?\]\s*=\s*await Promise\.all/);
  assert.match(overview, /androidDownloadMetrics\?\.exists/);
  assert.match(overview, /unclassifiedPlatformUsers/);
});

test('la fiche de revenu présente une bannière, les dépenses datées et le suivi du budget', () => {
  assert.match(incomePage, /size="banner"/);
  assert.match(incomePage, /formatIncomeDate\(expense\.date\)/);
  assert.match(incomePage, /Nature des sorties/);
  assert.match(incomePage, /Journée la plus coûteuse/);
  assert.match(incomePage, /Ouvrir la page Dépenses/);
  assert.match(incomePage, /Ouvrir les budgets de ce revenu/);
});

test('les explications visibles ne révèlent plus les limites techniques de chargement', () => {
  assert.doesNotMatch(incomePage, /pour limiter les lectures/i);
  assert.doesNotMatch(incomePage, /groupes? de 50/i);
  assert.doesNotMatch(incomePage, /Charger 50 autres/i);
});

test('les budgets savent ouvrir le mois et le revenu transmis par la fiche de revenu', () => {
  assert.match(budgetsPage, /params\.get\('month'\)/);
  assert.match(budgetsPage, /params\.get\('incomeId'\)/);
});

test('les opérations associées restent visibles pour un emprunt malgré son statut neutre', () => {
  assert.match(incomePage, /isBorrowedIncome = selectedIncome\.flowType === 'debt_borrowed'/);
  assert.match(incomePage, /selectedIncome\.neutralFlow && !isBorrowedIncome/);
  assert.match(incomePage, /isTrackedIncome &&/);
});

test('les prêts accordés depuis un revenu affichent le bénéficiaire, la date et le montant', () => {
  assert.match(incomePage, /loanGivenRows = visibleExpenses\.filter/);
  assert.match(incomePage, /loan\.person \|\| loan\.counterpartyName/);
  assert.match(incomePage, /formatIncomeDate\(loan\.date\)/);
  assert.match(incomePage, /formatCurrency\(loan\.amount\)/);
  assert.match(incomePage, /loan\.dueDate/);
});

test('le solde affiche la formule historique entrées cumulées moins sorties cumulées', () => {
  const dashboardPage = fs.readFileSync(new URL('../src/app/(app)/dashboard/page.js', import.meta.url), 'utf8');
  const apiRoute = fs.readFileSync(new URL('../src/app/api/[...path]/route.js', import.meta.url), 'utf8');
  assert.match(dashboardPage, /const globalBalance = totalIncome - totalExpense;/);
  assert.match(apiRoute, /globalBalance: totalIncome - totalExpense/);
  assert.doesNotMatch(apiRoute, /buildDashboardMoneySummary/);
});

test('les trois indicateurs du tableau de bord sont compacts et affichent leurs montants', () => {
  const dashboardPage = fs.readFileSync(new URL('../src/app/(app)/dashboard/page.js', import.meta.url), 'utf8');
  assert.match(dashboardPage, /grid grid-cols-3 gap-2 border-t/);
  assert.match(dashboardPage, /formatCurrency\(periodIncomeTotal\)/);
  assert.match(dashboardPage, /formatCurrency\(periodExpenseTotal\)/);
  assert.match(dashboardPage, /formatCurrency\(globalBalance\)/);
});

test('la liste des revenus possède des filtres de catégorie, de disponibilité, de montant et de tri', () => {
  assert.match(incomePage, /incomeFilterCategory/);
  assert.match(incomePage, /incomeAvailability/);
  assert.match(incomePage, /incomeMinAmount/);
  assert.match(incomePage, /incomeMaxAmount/);
  assert.match(incomePage, /amount_high/);
  assert.match(incomePage, /date_oldest/);
  assert.match(incomePage, /filteredIncomes\.map/);
});

test('la liste des dépenses possède des filtres de catégorie, de date, de montant, de paiement et de source', () => {
  const expensePage = fs.readFileSync(new URL('../src/app/(app)/expenses/page.js', import.meta.url), 'utf8');
  assert.match(expensePage, /filterCategory/);
  assert.match(expensePage, /filterSort/);
  assert.match(expensePage, /filterPaymentMethod/);
  assert.match(expensePage, /filterIncomeSource/);
  assert.match(expensePage, /filterMinAmount/);
  assert.match(expensePage, /filterMaxAmount/);
  assert.match(expensePage, /filterSearch/);
  assert.match(expensePage, /EXPENSE_CATEGORIES\.map/);
});

test('une dette en argent ne finance des dépenses que si l’utilisateur a confirmé avoir reçu de l’argent', () => {
  const expensePage = fs.readFileSync(new URL('../src/app/(app)/expenses/page.js', import.meta.url), 'utf8');
  const financialTools = fs.readFileSync(new URL('../src/lib/ai/financialTools.js', import.meta.url), 'utf8');
  const apiRoute = fs.readFileSync(new URL('../src/app/api/[...path]/route.js', import.meta.url), 'utf8');

  assert.match(incomePage, /availableAsFunding: form\.flowType === 'debt_borrowed' \? form\.availableAsFunding : false/);
  assert.match(incomePage, /checked=\{form\.availableAsFunding === true\}/);
  assert.match(incomePage, /checked=\{form\.availableAsFunding === false\}/);
  assert.match(expensePage, /income\.flowType === 'debt_borrowed' && income\.availableAsFunding === true/);
  assert.match(financialTools, /income\.flowType === 'debt_borrowed' && income\.availableAsFunding === true/);
  assert.match(apiRoute, /const availableAsFunding = flowType === 'debt_borrowed' && body\.availableAsFunding === true/);
  assert.match(apiRoute, /availableAsFunding,\s*debtId: newDebtRef\.id/);
});

test('la nature du revenu reste modifiable, mais son montant est verrouillé après une dépense liée', () => {
  const apiRoute = fs.readFileSync(new URL('../src/app/api/[...path]/route.js', import.meta.url), 'utf8');

  assert.match(incomePage, /amountLocked: income\.balanceAvailable !== true \|\| Number\(income\.spent\) > 0/);
  assert.match(incomePage, /disabled=\{form\.amountLocked === true && !!form\.id\}/);
  assert.match(incomePage, /<option value="normal">Revenu normal<\/option>/);
  assert.match(incomePage, /<option value="debt_borrowed">Dette contractée/);
  assert.match(apiRoute, /if \(alreadySpent && amount !== currentAmount\)/);
  assert.match(apiRoute, /previous\.flowType === 'debt_borrowed' && Boolean\(previous\.debtId\)/);
  assert.match(apiRoute, /convertedToIncome: true/);
});

test('la page Dettes distingue un emprunt reçu en argent des achats pris à crédit', () => {
  const debtsPage = fs.readFileSync(new URL('../src/app/(app)/debts/page.js', import.meta.url), 'utf8');
  assert.match(debtsPage, /debt\.availableAsFunding === true/);
  assert.match(debtsPage, /argent reçu/);
  assert.match(debtsPage, /Biens ou services pris à crédit/);
});

test('aucune nature de dette n’est présélectionnée pour une dette nouvelle ou ancienne non qualifiée', () => {
  assert.match(incomePage, /availableAsFunding: null/);
  assert.match(incomePage, /availableAsFunding: typeof income\.availableAsFunding === 'boolean' \? income\.availableAsFunding : null/);
  assert.match(incomePage, /typeof form\.availableAsFunding !== 'boolean'/);
  assert.match(incomePage, /checked=\{form\.availableAsFunding === false\}/);
  const apiRoute = fs.readFileSync(new URL('../src/app/api/[...path]/route.js', import.meta.url), 'utf8');
  assert.match(apiRoute, /hasOwnProperty\.call\(body, 'availableAsFunding'\)/);
  assert.match(apiRoute, /Choisis si tu as reçu de l’argent ou des biens\/services à crédit/);
});


test('un prêt en argent confirmé entre comptes rend aussi le financement disponible chez l’emprunteur', () => {
  const apiRoute = fs.readFileSync(new URL('../src/app/api/[...path]/route.js', import.meta.url), 'utf8');
  assert.match(apiRoute, /kind === 'lent' \? \{ availableAsFunding: true \}/);
  assert.match(apiRoute, /flowType: 'debt_borrowed',[\s\S]{0,100}availableAsFunding: true/);
});

test('les emprunts reçus en argent comptent comme revenus encaissés sans perdre leur nature de dette', () => {
  const apiRoute = fs.readFileSync(new URL('../src/app/api/[...path]/route.js', import.meta.url), 'utf8');
  const reportsPage = fs.readFileSync(new URL('../src/app/(app)/reports/page.js', import.meta.url), 'utf8');
  const dashboardPage = fs.readFileSync(new URL('../src/app/(app)/dashboard/page.js', import.meta.url), 'utf8');
  const budgetsPage = fs.readFileSync(new URL('../src/app/(app)/budgets/page.js', import.meta.url), 'utf8');

  assert.match(apiRoute, /const neutralFlow = flowType === 'debt_borrowed' && availableAsFunding !== true/);
  assert.match(apiRoute, /if \(!neutralFlow\) \{[\s\S]{0,400}profilePatch\.lifetimeIncomeAmount = FieldValue\.increment\(amount\)/);
  assert.match(incomePage, /monthIncomes\.filter\(isIncomeCountedAsSource\)/);
  assert.match(dashboardPage, /periodIncomes\.filter\(isIncomeCountedAsSource\)/);
  assert.match(reportsPage, /periodIncomes\.filter\(isIncomeCountedAsSource\)/);
  assert.match(budgetsPage, /isIncomeCountedAsSource\(income\)/);
  assert.match(incomePage, /Elle reste toutefois une dette à rembourser/);
});

test('la programmation d’un emprunt en argent met à jour les revenus lorsqu’elle est exécutée', () => {
  const processRoute = fs.readFileSync(new URL('../src/app/api/scheduled-transactions/process/route.js', import.meta.url), 'utf8');
  assert.match(processRoute, /const neutralFlow = isBorrowed && schedule\.availableAsFunding !== true/);
  assert.match(processRoute, /if \(!neutralFlow\) \{[\s\S]{0,400}lifetimeIncomeAmount: FieldValue\.increment\(amount\)/);
});

test('le serveur refuse une nouvelle dette lorsque sa nature argent ou biens à crédit n’est pas choisie', () => {
  const incomeApi = fs.readFileSync(new URL('../src/app/api/[...path]/route.js', import.meta.url), 'utf8');
  const quickCapture = fs.readFileSync(new URL('../src/app/api/quick-capture/route.js', import.meta.url), 'utf8');
  const scheduled = fs.readFileSync(new URL('../src/app/api/scheduled-transactions/route.js', import.meta.url), 'utf8');
  assert.match(incomeApi, /flowType === 'debt_borrowed' && typeof body\.availableAsFunding !== 'boolean'/);
  assert.match(quickCapture, /type === 'debt_borrowed' && typeof body\.incomeAvailableAsFunding !== 'boolean'/);
  assert.match(quickCapture, /incomeFlowType === 'debt_borrowed' && typeof body\.incomeAvailableAsFunding !== 'boolean'/);
  assert.match(scheduled, /typeof body\.availableAsFunding !== 'boolean'/);
});


test('le rapport hebdomadaire inclut les emprunts en argent mais sépare leur nature de dette', () => {
  const financialTools = fs.readFileSync(new URL('../src/lib/ai/financialTools.js', import.meta.url), 'utf8');
  assert.match(financialTools, /sum\(currentIncome\.filter\(isIncomeCountedAsSource\)\)/);
  assert.match(financialTools, /sum\(previousIncome\.filter\(isIncomeCountedAsSource\)\)/);
  assert.match(financialTools, /const totalIncome = sum\(currentIncome\.filter\(isIncomeCountedAsSource\)\)/);
  assert.match(financialTools, /Aucun revenu encaissé n’a été enregistré cette semaine/);
});


test('le rapport hebdomadaire compte les emprunts en argent comme entrées encaissées', () => {
  const financialTools = fs.readFileSync(new URL('../src/lib/ai/financialTools.js', import.meta.url), 'utf8');
  assert.match(financialTools, /const totalIncome = sum\(currentIncome\.filter\(isIncomeCountedAsSource\)\)/);
  assert.match(financialTools, /const previousIncomeTotal = sum\(previousIncome\.filter\(isIncomeCountedAsSource\)\)/);
  assert.match(financialTools, /const totalIncome = sum\(currentIncome\.filter\(isIncomeCountedAsSource\)\)/);
  assert.match(financialTools, /Aucun revenu encaissé n’a été enregistré cette semaine/);
});

test('la page Revenus distingue le nombre de sources issues de dettes du total des sources', () => {
  assert.match(incomePage, /const monthDebtIncomeSources = useMemo\(\(\) => monthEarningSources\.filter/);
  assert.match(incomePage, /income\.flowType === 'debt_borrowed' \|\| income\.categoryId === 'debt_borrowed'/);
  assert.match(incomePage, /Revenus issus de dettes/);
  assert.match(incomePage, /\{monthDebtIncomeSources\.length\}/);
  assert.match(incomePage, /grid grid-cols-2 gap-2 sm:grid-cols-5/);
});

test('les indicateurs revenus séparent le total encaissé, les emprunts et le revenu gagné', () => {
  assert.match(incomePage, /const debtIncomeAmount = monthDebtIncomeSources\.reduce\(\(sum, income\) => sum \+ \(Number\(income\.amount\) \|\| 0\), 0\)/);
  assert.match(incomePage, /const earnedWithoutDebtThisMonth = Math\.max\(0, earnedThisMonth - debtIncomeAmount\)/);
  assert.match(incomePage, /Total encaissé \(dettes incluses\)/);
  assert.match(incomePage, /Total gagné sans dettes/);
  assert.match(incomePage, /Emprunts reçus/);
  assert.match(incomePage, /Montant : \{formatCurrency\(debtIncomeAmount\)\}/);
  assert.match(incomePage, /Disponible \(dettes incluses\)/);
  assert.match(incomePage, /activeMonthSources\.reduce\(\(sum, income\) => sum \+ \(Number\(income\.remaining\) \|\| 0\), 0\)/);
  assert.match(incomePage, /grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6/);
});
