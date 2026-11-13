import test from 'node:test';
import assert from 'node:assert/strict';
import { sumIncomeSpendTotals } from '../src/lib/finance/incomeBalances.mjs';

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
