import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../src/app/(app)/dashboard/page.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/app/api/[...path]/route.js', import.meta.url), 'utf8');

test('le tableau de bord limite la période par défaut au premier jour du mois et à aujourd’hui', () => {
  assert.match(dashboard, /const startDate = showCustomPeriod \? customStart : getFirstOfMonth\(\);/);
  assert.match(dashboard, /const endDate = showCustomPeriod \? customEnd : todayIso\(\);/);
});

test('les entrées du tableau de bord suivent les sources encaissées de la page Revenus', () => {
  assert.match(dashboard, /const periodIncomeSources = useMemo\(\(\) => periodIncomes\.filter\(/);
  assert.match(dashboard, /income\.flowType !== 'repayment_received'/);
  assert.match(dashboard, /income\.categoryId !== 'debt_repayment_received'/);
  assert.match(dashboard, /const periodIncomeTotal = periodIncomeSources\.reduce\(/);
  assert.match(dashboard, /const totalIncome = periodIncomeTotal;/);
  assert.match(dashboard, /const totalExpense = periodExpenseTotal;/);
  assert.match(dashboard, /\{formatCurrency\(periodIncomeTotal\)\}/);
  assert.match(dashboard, /\{formatCurrency\(periodExpenseTotal\)\}/);
  assert.doesNotMatch(dashboard, /const globalBalance = totalIncome - totalExpense/);
});

test('le disponible du tableau de bord réutilise les soldes de la page Revenus', () => {
  assert.match(dashboard, /sumAvailableIncomeBalances\(periodIncomeSources, balancesReady\)/);
  assert.match(dashboard, /Disponible \(dettes incluses\)/);
  assert.match(dashboard, /globalBalance == null \? '—' : formatCurrency\(globalBalance\)/);
  assert.match(dashboard, /calculée comme dans la page Revenus/);
  assert.doesNotMatch(dashboard, /formatCurrency\(periodIncomeTotal - periodExpenseTotal\)/);
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

test('les montants de la bannière affichent directement les totaux de la période', () => {
  assert.match(dashboard, /Entrées de la période/);
  assert.match(dashboard, /Sorties de la période/);
  assert.match(dashboard, /Solde de la période/);
  assert.match(dashboard, /Période comptée : \{formatDate\(startDate\)\}/);
  assert.match(dashboard, /\{formatCurrency\(periodIncomeTotal\)\}/);
  assert.match(dashboard, /\{formatCurrency\(periodExpenseTotal\)\}/);
  assert.doesNotMatch(dashboard, /globalFinanceSummary/);
});

test('le résumé de période somme les documents filtrés sans index composite SUM(amount)', () => {
  const start = api.indexOf('async function handleGlobalFinanceSummary(request) {');
  const end = api.indexOf('\nasync function handleIncomeSpendTotals(request) {', start);
  const handler = api.slice(start, end);
  assert.match(handler, /incomePeriod\.get\(\)/);
  assert.match(handler, /expensePeriod\.get\(\)/);
  assert.match(handler, /snapshot\.docs\.reduce/);
  assert.doesNotMatch(handler, /aggregate\(\{ total: AggregateField\.sum/);
});

test('Mč récupère toutes les opérations de la période et calcule ses totaux sans requête SUM indexée', () => {
  const api = fs.readFileSync(new URL('../src/app/api/[...path]/route.js', import.meta.url), 'utf8');
  assert.match(api, /incomePeriodQuery\.orderBy\('date', 'desc'\)\.get\(\)/);
  assert.match(api, /expensePeriodQuery\.orderBy\('date', 'desc'\)\.get\(\)/);
  assert.match(api, /periodIncomeTotal = periodIncomeRows\.reduce/);
  assert.match(api, /periodExpenseTotal = periodExpenseRows\.reduce/);
  assert.doesNotMatch(api, /incomePeriodQuery\.aggregate/);
  assert.doesNotMatch(api, /expensePeriodQuery\.aggregate/);
});
