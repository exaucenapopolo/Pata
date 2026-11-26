import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getAvailableIncomeSources, getAvailableIncomeTotal } from '../src/lib/finance/availableIncomeSources.mjs';

const read = (file) => fs.readFileSync(file, 'utf8');

test('Quick Capture n’affiche que les revenus dont le solde restant a été calculé par le serveur', () => {
  const api = read('src/app/api/quick-capture/options/route.js');
  const component = read('src/components/QuickCaptureCoordinator.jsx');
  assert.match(api, /incomeSpentTotalsVersion === 1/);
  assert.match(api, /balanceIncomeDocs = incomesSnap\.docs/);
  assert.match(api, /incomeSpentTotalsUpdatedAt: FieldValue\.serverTimestamp\(\)/);
  assert.match(api, /AggregateField\.sum\('amount'\)/);
  assert.match(api, /remaining: Math\.max\(0, amount - spent\)/);
  assert.match(api, /\.filter\(\(income\) => income\.remaining > 0\)/);
  assert.match(component, /getAvailableIncomeSources\(captureOptions\.incomes\)/);
  assert.match(component, /Number\(income\.remaining \|\| 0\)\.toLocaleString\('fr-FR'\)\} FCFA restant/);
  assert.match(component, /getAvailableIncomeTotal\(captureOptions\.incomes\)/);
});

test('une source épuisée ou dont le solde n’est pas vérifié reste absente de Quick Capture', () => {
  const options = [
    { id: 'remaining', balanceAvailable: true, remaining: 7500 },
    { id: 'exhausted', balanceAvailable: true, remaining: 0 },
    { id: 'unknown', balanceAvailable: false, remaining: 20000 },
  ];
  assert.deepEqual(getAvailableIncomeSources(options).map((item) => item.id), ['remaining']);
  assert.equal(getAvailableIncomeTotal(options), 7500);
});

test('un revenu emprunté est proposé uniquement lorsque l’utilisateur l’a déclaré disponible comme argent reçu', () => {
  const options = [
    { id: 'loan-cash', balanceAvailable: true, remaining: 5000, neutralFlow: true, flowType: 'debt_borrowed', availableAsFunding: true },
    { id: 'loan-credit', balanceAvailable: true, remaining: 8000, neutralFlow: true, flowType: 'debt_borrowed', availableAsFunding: false },
  ];
  assert.deepEqual(getAvailableIncomeSources(options).map((item) => item.id), ['loan-cash']);
});

test('le paiement d’une facture propose les revenus suivis avec leur solde restant', () => {
  const billsPage = read('src/app/(app)/bills/page.js');
  const billsApi = read('src/app/api/[...path]/route.js');
  assert.match(billsPage, /getAvailableIncomeSources\(incomes\)/);
  assert.match(billsPage, /getAvailableIncomeTotal\(availableBillIncomeSources\)/);
  assert.match(billsPage, /value=\{paymentForm\.incomeSourceId \|\| 'all'\}/);
  assert.match(billsPage, /availableBillIncomeSources\.map/);
  assert.match(billsPage, /Number\(income\.remaining \|\| 0\)\.toLocaleString\('fr-FR'\) \+ ' FCFA restant'/);
  assert.match(billsApi, /incomeSourceId: paymentSource === 'tracked' \? trackedIncomeSourceId : 'all'/);
  assert.ok(billsApi.includes("trackedIncomeSourceId.includes('/')"));
});
