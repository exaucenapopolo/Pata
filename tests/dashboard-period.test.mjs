import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../src/app/(app)/dashboard/page.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/app/api/[...path]/route.js', import.meta.url), 'utf8');

test('le tableau de bord limite la période par défaut au premier jour du mois et à aujourd’hui', () => {
  assert.match(dashboard, /const startDate = showCustomPeriod \? customStart : getFirstOfMonth\(\);/);
  assert.match(dashboard, /const endDate = showCustomPeriod \? customEnd : todayIso\(\);/);
});

test('le bilan du tableau de bord est rechargé quand les dates sélectionnées changent', () => {
  assert.match(dashboard, /startDate=.+endDate=/);
  assert.match(dashboard, /\}, \[user, startDate, endDate\]\);/);
  assert.match(dashboard, /globalFinanceSummary\?\.totalIncome/);
  assert.match(dashboard, /globalFinanceSummary\?\.totalExpense/);
  assert.doesNotMatch(dashboard, /lifetimeIncomeAmount \?\?/);
  assert.doesNotMatch(dashboard, /lifetimeExpenseAmount \?\?/);
});

test('les agrégations serveur filtrent revenus et dépenses avec les deux dates inclusives', () => {
  const start = api.indexOf('async function handleGlobalFinanceSummary(request) {');
  const end = api.indexOf('\nasync function handleIncomeSpendTotals(request) {', start);
  const handler = api.slice(start, end);
  assert.match(handler, /where\('date', '>=', startDate\)/);
  assert.match(handler, /where\('date', '<=', endDate\)/);
  assert.match(handler, /globalBalance: totalIncome - totalExpense/);
  assert.match(handler, /if \(!isValidDate\(startDate\) \|\| !isValidDate\(endDate\) \|\| startDate > endDate\)/);
});

test('Mč reçoit explicitement la période sélectionnée depuis le tableau de bord', () => {
  assert.match(dashboard, /uniquement pour la période du \\$\{startDate\} au \\$\{endDate\}/);
  assert.match(dashboard, /Count no income or expense dated before/);
});
