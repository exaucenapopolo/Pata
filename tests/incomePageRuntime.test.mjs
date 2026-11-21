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
  assert.match(dashboardPage, /formatCurrency\(totalIncome\)/);
  assert.match(dashboardPage, /formatCurrency\(totalExpense\)/);
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

  assert.match(incomePage, /availableAsFunding: form\.flowType === 'debt_borrowed' && form\.availableAsFunding === true/);
  assert.match(incomePage, /checked=\{form\.availableAsFunding === true\}/);
  assert.match(incomePage, /checked=\{form\.availableAsFunding !== true\}/);
  assert.match(expensePage, /income\.flowType === 'debt_borrowed' && income\.availableAsFunding === true/);
  assert.match(financialTools, /income\.flowType === 'debt_borrowed' && income\.availableAsFunding === true/);
  assert.match(apiRoute, /const availableAsFunding = flowType === 'debt_borrowed' && body\.availableAsFunding === true/);
  assert.match(apiRoute, /availableAsFunding,\s*debtId: newDebtRef\.id/);
});

test('la nature du revenu reste modifiable, mais son montant est verrouillé après une dépense liée', () => {
  const apiRoute = fs.readFileSync(new URL('../src/app/api/[...path]/route.js', import.meta.url), 'utf8');

  assert.match(incomePage, /amountLocked: Number\(income\.spent\) > 0/);
  assert.match(incomePage, /disabled=\{form\.amountLocked === true && !!form\.id\}/);
  assert.match(incomePage, /<option value="normal">Revenu normal<\/option>/);
  assert.match(incomePage, /<option value="debt_borrowed">Dette contractée/);
  assert.match(apiRoute, /if \(alreadySpent && amount !== currentAmount\)/);
  assert.match(apiRoute, /previous\.flowType === 'debt_borrowed' && Boolean\(previous\.debtId\)/);
  assert.match(apiRoute, /convertedToIncome: true/);
});

test('la page Dettes distingue un emprunt reçu en argent des achats pris à crédit', () => {
  const debtsPage = fs.readFileSync(new URL('../src/app/(app)/debts/page.js', import.meta.url), 'utf8');
  assert.match(debtsPage, /dette\.availableAsFunding === true/);
  assert.match(debtsPage, /argent reçu/);
  assert.match(debtsPage, /Biens ou services pris à crédit/);
});
