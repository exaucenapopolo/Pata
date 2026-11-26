import test from 'node:test';
import assert from 'node:assert/strict';
import { sumIncomeSpendTotals, isIncomeCountedAsSource, sumAvailableIncomeBalances } from '../src/lib/finance/incomeBalances.mjs';

test('additionne les dépenses réparties sur plusieurs lignes par revenu', () => {
  const totals = sumIncomeSpendTotals(['salary', 'side'], [
    { incomeSourceId: 'salary', amount: 25000 },
    { incomeSourceId: 'side', amount: 12000 },
    { incomeSourceId: 'salary', amount: 15000 },
    { incomeSourceId: 'other', amount: 9000 },
  ]);
  assert.deepEqual(totals, [
    { incomeId: 'salary', spent: 40000 },
    { incomeId: 'side', spent: 12000 },
  ]);
});

test('retourne zéro sans dépense et ignore les montants invalides', () => {
  const totals = sumIncomeSpendTotals(['unused', 'salary'], [
    { incomeSourceId: 'salary', amount: 1000 },
    { incomeSourceId: 'salary', amount: 'not-a-number' },
    { incomeSourceId: 'salary', amount: -300 },
  ]);
  assert.deepEqual(totals, [
    { incomeId: 'unused', spent: 0 },
    { incomeId: 'salary', spent: 1000 },
  ]);
});

test('supprime les identifiants invalides et les doublons', () => {
  const totals = sumIncomeSpendTotals(['salary', 'salary', '', 'bad/id'], []);
  assert.deepEqual(totals, [{ incomeId: 'salary', spent: 0 }]);
});

test('les emprunts en argent sont inclus dans les revenus encaissés, sans inclure les achats à crédit', () => {
  assert.equal(isIncomeCountedAsSource({ flowType: 'debt_borrowed', neutralFlow: true, availableAsFunding: true }), true);
  assert.equal(isIncomeCountedAsSource({ flowType: 'debt_borrowed', neutralFlow: false, availableAsFunding: false }), false);
  assert.equal(isIncomeCountedAsSource({ categoryId: 'debt_borrowed', availableAsFunding: true }), true);
  assert.equal(isIncomeCountedAsSource({ flowType: 'cash_withdrawal', cashPocket: true, neutralFlow: true }), false);
  assert.equal(isIncomeCountedAsSource({ flowType: 'normal', neutralFlow: false }), true);
});


test('le disponible réutilise les soldes vérifiés des sources de revenus, comme la page Revenus', () => {
  const incomes = [
    { amount: 50000, remaining: 35000, balanceAvailable: true, flowType: 'normal' },
    { amount: 30000, remaining: 25000, balanceAvailable: true, flowType: 'debt_borrowed', availableAsFunding: true, neutralFlow: true },
    { amount: 10000, remaining: 10000, balanceAvailable: true, flowType: 'debt_borrowed', availableAsFunding: false, neutralFlow: true },
    { amount: 5000, remaining: 5000, balanceAvailable: true, flowType: 'repayment_received' },
    { amount: 4000, remaining: 4000, balanceAvailable: true, categoryId: 'debt_repayment_received' },
    { amount: 2000, remaining: 2000, balanceAvailable: true, cashPocket: true },
    { amount: 1000, remaining: 0, balanceAvailable: true, isExhausted: true, flowType: 'normal' },
  ];

  assert.equal(sumAvailableIncomeBalances(incomes, true), 60000);
});

test('le disponible reste indisponible tant qu’un solde de revenu n’est pas vérifié', () => {
  assert.equal(sumAvailableIncomeBalances([
    { remaining: 5000, balanceAvailable: true, flowType: 'normal' },
    { remaining: null, balanceAvailable: false, flowType: 'normal' },
  ], true), null);
  assert.equal(sumAvailableIncomeBalances([
    { remaining: 5000, balanceAvailable: true, flowType: 'normal' },
  ], false), null);
});

test('le disponible vaut zéro lorsqu’aucune source encaissée ne reste disponible', () => {
  assert.equal(sumAvailableIncomeBalances([
    { remaining: 0, balanceAvailable: true, isExhausted: true, flowType: 'normal' },
    { remaining: 10000, balanceAvailable: true, flowType: 'debt_borrowed', availableAsFunding: false },
  ], true), 0);
});
