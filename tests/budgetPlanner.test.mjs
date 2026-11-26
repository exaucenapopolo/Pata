import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUDGET_FREQUENCIES,
  calculateBudgetLine,
  calculateBudgetPlan,
  restoreBudgetPlannerLine,
} from '../src/lib/finance/budgetPlanner.mjs';

test('calculates monthly envelopes from fixed daily, weekly and monthly amounts', () => {
  const plan = calculateBudgetPlan([
    { categoryId: 'food', value: 2000, calculationType: 'amount', frequency: 'daily' },
    { categoryId: 'transport', value: 8000, calculationType: 'amount', frequency: 'weekly' },
    { categoryId: 'rent', value: 50000, calculationType: 'amount', frequency: 'monthly' },
  ]);

  assert.equal(plan.valid, true);
  assert.equal(plan.rows[0].amount, 60000);
  assert.equal(plan.rows[1].amount, 32000);
  assert.equal(plan.rows[2].amount, 50000);
  assert.equal(plan.total, 142000);
});

test('calculates percentage envelopes against the selected income source and frequency', () => {
  const plan = calculateBudgetPlan([
    { categoryId: 'food', value: 5, calculationType: 'percentage', frequency: 'daily' },
    { categoryId: 'transport', value: 2.5, calculationType: 'percentage', frequency: 'weekly' },
    { categoryId: 'rent', value: 10, calculationType: 'percentage', frequency: 'monthly' },
  ], 200000);

  assert.equal(plan.rows[0].amount, 300000);
  assert.equal(plan.rows[1].amount, 20000);
  assert.equal(plan.rows[2].amount, 20000);
  assert.equal(plan.total, 340000);
  assert.equal(plan.percentageTotal, 170);
});

test('rounds computed FCFA amounts and rejects invalid values or missing categories', () => {
  assert.equal(calculateBudgetLine({
    categoryId: 'food', value: 2.333, calculationType: 'percentage', frequency: 'monthly',
  }, 100000).amount, 2333);
  assert.equal(calculateBudgetLine({
    categoryId: 'food', value: 101, calculationType: 'percentage', frequency: 'monthly',
  }, 100000).valid, false);
  assert.equal(calculateBudgetPlan([{ categoryId: '', value: 1000 }]).valid, false);
});

test('restores legacy monthly budgets and new percentage-based templates into the same planner', () => {
  assert.deepEqual(restoreBudgetPlannerLine({
    categoryId: 'food',
    amount: 25000,
  }), {
    categoryId: 'food',
    value: '25000',
    calculationType: 'amount',
    frequency: 'monthly',
  });
  assert.deepEqual(restoreBudgetPlannerLine({
    categoryId: 'transport',
    amount: 8000,
    value: 4,
    calculationType: 'percentage',
    frequency: 'weekly',
  }), {
    categoryId: 'transport',
    value: '4',
    calculationType: 'percentage',
    frequency: 'weekly',
  });
});

test('exposes the same supported frequency choices to both planner pages', () => {
  assert.deepEqual(BUDGET_FREQUENCIES.map((item) => item.id), ['daily', 'weekly', 'monthly']);
});
