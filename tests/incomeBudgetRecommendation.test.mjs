import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIncomeBudgetRecommendation } from '../src/lib/finance/incomeBudgetRecommendation.mjs';

test('recommends a strongly prioritized budget for salary without blocking income creation', () => {
  const result = buildIncomeBudgetRecommendation({
    incomeId: 'income-123', amount: 180000, source: 'Salaire', categoryId: 'salary',
    date: '2026-11-01', flowType: 'normal',
  });
  assert.equal(result.isSalary, true);
  assert.equal(result.amount, 180000);
  assert.equal(result.target, '/budgets?month=2026-11&incomeId=income-123');
});

test('offers budget planning for every other normal income category', () => {
  const result = buildIncomeBudgetRecommendation({
    incomeId: 'income-456', amount: 25000, source: 'Ventes', categoryId: 'sales',
    date: '2026-11-12',
  });
  assert.equal(result.isSalary, false);
  assert.match(result.target, /income-456/);
});

test('does not suggest budgets for neutral borrowing, repayments, or invalid income data', () => {
  assert.equal(buildIncomeBudgetRecommendation({ incomeId: 'x', amount: 1000, categoryId: 'salary', date: '2026-11-01', flowType: 'debt_borrowed' }), null);
  assert.equal(buildIncomeBudgetRecommendation({ incomeId: 'x', amount: 1000, categoryId: 'debt_repayment_received', date: '2026-11-01' }), null);
  assert.equal(buildIncomeBudgetRecommendation({ incomeId: 'x', amount: 0, categoryId: 'salary', date: '2026-11-01' }), null);
});
