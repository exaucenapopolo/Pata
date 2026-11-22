import test from 'node:test';
import assert from 'node:assert/strict';
import { sumIncomeSpendTotals, isIncomeCountedAsSource } from '../src/lib/finance/incomeBalances.mjs';

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
