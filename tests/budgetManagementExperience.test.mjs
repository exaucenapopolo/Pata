import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const budgetsPage = fs.readFileSync(new URL('../src/app/(app)/budgets/page.js', import.meta.url), 'utf8');
const apiRoute = fs.readFileSync(new URL('../src/app/api/[...path]/route.js', import.meta.url), 'utf8');

test('les détails et les prévisions réutilisent les dépenses déjà chargées par la page Budgets', () => {
  assert.equal((budgetsPage.match(/useExpenses\(/g) || []).length, 1);
  assert.match(budgetsPage, /useExpenses\(\{ startDate: month \+ '-01', endDate: getMonthEndDate\(month\), limit: 1000 \}\)/);
  assert.match(budgetsPage, /isBudgetCountedExpense\(e\)/);
  assert.match(budgetsPage, /buildBudgetRunway\(/);
  assert.match(budgetsPage, /liveDetails\.expenses/);
  assert.match(budgetsPage, /detailsRunway\.projections\.map/);
  assert.match(budgetsPage, /detailsRunway\.spendingDays/);
  assert.match(budgetsPage, /formatBudgetDate\(expense\.date, language\)/);
  assert.match(budgetsPage, /expense\.paymentMethod/);
  assert.match(budgetsPage, /expense\.incomeSourceName/);
});

test('la suppression complète demande de taper SUPPRIMER et conserve les dépenses', () => {
  assert.match(budgetsPage, /<ConfirmDialog/);
  assert.match(budgetsPage, /confirmWord=\{isEnglish \? 'DELETE' : 'SUPPRIMER'\}/);
  assert.match(budgetsPage, /SUPPRIMER pour confirmer/);
  assert.match(budgetsPage, /close this editor and use “Delete entire budget”/);
  assert.match(budgetsPage, /Supprimer tout le budget/);
  assert.match(budgetsPage, /items: \[\]/);
  assert.match(budgetsPage, /replaceExisting: true/);
  assert.match(budgetsPage, /Les dépenses, la source de revenu et son historique seront conservés/);
});

test('le serveur supprime toutes les enveloppes d’une source en une transaction de remplacement', () => {
  const start = apiRoute.indexOf('async function handleUpsertBudgets(request) {');
  const end = apiRoute.indexOf('\nasync function handleBudgetTemplates', start);
  assert.ok(start >= 0 && end > start, 'le gestionnaire de remplacement complet doit exister');
  const handler = apiRoute.slice(start, end);
  assert.match(handler, /const replaceExisting = body\.replaceExisting === true/);
  assert.match(handler, /transaction\.get\(budgetCollection\.where\('month', '==', month\)\.where\('incomeSourceId', '==', incomeSourceId\)\)/);
  assert.match(handler, /const omittedDeleteCount = replaceExisting/);
  assert.match(handler, /if \(replaceExisting\) \{/);
  assert.match(handler, /transaction\.delete\(document\.ref\)/);
  assert.match(handler, /transaction\.get\(incomeRef\)/);
});
