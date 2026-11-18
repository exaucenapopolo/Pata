import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBudgetSpendDelta,
  buildBudgetSpendSummary,
  getBudgetSpendAmount,
} from '../src/lib/finance/budgetSpendSummary.mjs';

test('builds monthly budget totals and ignores neutral or non-consumption flows', () => {
  const summary = buildBudgetSpendSummary([
    { date: '2026-11-01', amount: 100, categoryId: 'food', incomeSourceId: 'salary' },
    { date: '2026-11-02', amount: 50, categoryId: 'food', incomeSourceId: 'business', expenseType: 'consumption' },
    { date: '2026-11-03', amount: 200, categoryId: 'food', incomeSourceId: 'salary', neutralFlow: true },
    { date: '2026-11-04', amount: 300, categoryId: 'food', incomeSourceId: 'salary', expenseType: 'savings' },
    { date: '2026-10-31', amount: 400, categoryId: 'food', incomeSourceId: 'salary' },
  ], '2026-11');

  assert.equal(getBudgetSpendAmount(summary, 'food', 'all'), 150);
  assert.equal(getBudgetSpendAmount(summary, 'food', 'salary'), 100);
  assert.equal(getBudgetSpendAmount(summary, 'food', 'business'), 50);
});

test('applies and reverses updates without changing unrelated categories or sources', () => {
  let summary = buildBudgetSpendSummary([
    { date: '2026-11-10', amount: 125, categoryId: 'food', incomeSourceId: 'salary' },
  ], '2026-11');

  summary = applyBudgetSpendDelta(summary, {
    date: '2026-11-10', amount: 125, categoryId: 'food', incomeSourceId: 'salary',
  }, -1);
  summary = applyBudgetSpendDelta(summary, {
    date: '2026-11-10', amount: 200, categoryId: 'transport', incomeSourceId: 'business',
  }, 1);

  assert.equal(getBudgetSpendAmount(summary, 'food', 'all'), 0);
  assert.equal(getBudgetSpendAmount(summary, 'transport', 'business'), 200);
  assert.equal(getBudgetSpendAmount(summary, 'transport', 'all'), 200);
});

test('legacy expenses without an expenseType count as consumption; neutral pending repayments do not', () => {
  const summary = buildBudgetSpendSummary([
    { date: '2026-11-11', amount: 75, categoryId: 'food', incomeSourceId: 'salary' },
    { date: '2026-11-12', amount: 90, categoryId: 'debt_repayment', incomeSourceId: 'salary', neutralFlow: true },
  ], '2026-11');

  assert.equal(getBudgetSpendAmount(summary, 'food'), 75);
  assert.equal(getBudgetSpendAmount(summary, 'debt_repayment'), 0);
});
