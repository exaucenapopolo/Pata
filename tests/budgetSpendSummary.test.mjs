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

  assert.equal(summary.expenseCount, 2);
  assert.equal(summary.totalAmount, 150);
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

  assert.equal(summary.expenseCount, 1);
  assert.equal(summary.totalAmount, 200);
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

test('counts eligible expenses without a category for the monthly activity summary', () => {
  const summary = buildBudgetSpendSummary([
    { date: '2026-11-13', amount: 45, incomeSourceId: 'salary' },
    { date: '2026-11-14', amount: 70, categoryId: 'loan_given', incomeSourceId: 'salary', neutralFlow: true },
  ], '2026-11');

  assert.equal(summary.expenseCount, 1);
  assert.equal(summary.totalAmount, 45);
  assert.equal(getBudgetSpendAmount(summary, 'other', 'all'), 0);
});

test('counts a shared consumption once but preserves its full amount by source', () => {
  const summary = buildBudgetSpendSummary([
    { id: 'meal-root', sharedExpenseId: 'meal-root', amount: 1000, date: '2026-11-15', categoryId: 'food', incomeSourceId: 'salary' },
    { id: 'meal-part-2', sharedExpenseId: 'meal-root', amount: 600, date: '2026-11-15', categoryId: 'food', incomeSourceId: 'business' },
    { id: 'meal-part-3', sharedExpenseId: 'meal-root', amount: 400, date: '2026-11-15', categoryId: 'food', incomeSourceId: 'side' },
    { id: 'second-meal', amount: 1200, date: '2026-11-15', categoryId: 'food', incomeSourceId: 'salary' },
    { id: 'third-meal', amount: 800, date: '2026-11-15', categoryId: 'food', incomeSourceId: 'salary' },
  ], '2026-11');

  assert.equal(summary.expenseCount, 3);
  assert.equal(summary.totalAmount, 4000);
  assert.equal(getBudgetSpendAmount(summary, 'food', 'all'), 4000);
  assert.equal(getBudgetSpendAmount(summary, 'food', 'salary'), 3000);
  assert.equal(getBudgetSpendAmount(summary, 'food', 'business'), 600);
  assert.equal(getBudgetSpendAmount(summary, 'food', 'side'), 400);
});

test('applies all shared allocations while incrementing the operation count only once', () => {
  let summary = buildBudgetSpendSummary([], '2026-11');
  const allocations = [
    { amount: 500, categoryId: 'food', date: '2026-11-19', incomeSourceId: 'salary' },
    { amount: 300, categoryId: 'food', date: '2026-11-19', incomeSourceId: 'business' },
    { amount: 200, categoryId: 'food', date: '2026-11-19', incomeSourceId: 'side' },
  ];
  allocations.forEach((row, index) => {
    summary = applyBudgetSpendDelta(summary, row, 1, { countOperation: index === 0 });
  });

  assert.equal(summary.expenseCount, 1);
  assert.equal(summary.totalAmount, 1000);
  assert.equal(getBudgetSpendAmount(summary, 'food', 'salary'), 500);
  assert.equal(getBudgetSpendAmount(summary, 'food', 'business'), 300);
  assert.equal(getBudgetSpendAmount(summary, 'food', 'side'), 200);
});
