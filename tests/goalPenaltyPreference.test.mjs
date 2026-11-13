import test from 'node:test';
import assert from 'node:assert/strict';
import { computeGoalPlan } from '../src/lib/goalCalc.js';

const today = new Date('2026-11-13T12:00:00.000Z');
const baseGoal = {
  type: 'goal',
  targetAmount: 700,
  startDate: '2026-10-01',
  deadline: '2026-12-31',
  frequencyDays: 7,
  penaltyPolicyStartedOn: '2026-11-09',
};

test('missed contributions remain tracked without charging an optional penalty', () => {
  const plan = computeGoalPlan({ ...baseGoal, penaltyEnabled: false }, [], today);
  assert.ok(plan.missedPayments > 0);
  assert.equal(plan.penaltyEnabled, false);
  assert.equal(plan.penalty, 0);
  assert.equal(plan.isLate, true);
});

test('the 7 percent adjustment is calculated only when the user enables it', () => {
  const plan = computeGoalPlan({ ...baseGoal, penaltyEnabled: true }, [], today);
  assert.ok(plan.missedPayments > 0);
  assert.equal(plan.penaltyEnabled, true);
  assert.ok(plan.penalty > 0);
  assert.equal(plan.isLate, true);
});
