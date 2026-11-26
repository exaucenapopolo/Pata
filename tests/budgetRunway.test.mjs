import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBudgetRunway } from '../src/lib/finance/budgetRunway.mjs';

test('la prévision compte aussi les jours sans dépense dans le rythme quotidien', () => {
  const runway = buildBudgetRunway({
    asOfDate: '2026-11-06',
    remaining: 1500,
    expenses: [
      { id: 'a', date: '2026-11-01', amount: 1000, categoryId: 'transport' },
      { id: 'b', date: '2026-11-04', amount: 500, categoryId: 'transport' },
    ],
  });

  assert.equal(runway.totalSpent, 1500);
  assert.equal(runway.spendingDays, 2);
  assert.equal(runway.observedDays, 6);
  assert.equal(runway.averageDailySpend, 250);
  assert.equal(runway.spendingDaysPerWeek, 2.3);
  assert.equal(runway.daysUntilEmpty, 6);
  assert.equal(runway.estimatedExhaustionDate, '2026-11-12');
  assert.deepEqual(runway.projections, [
    { days: 3, projectedSpend: 750, projectedRemaining: 750, willBeDepleted: false },
    { days: 7, projectedSpend: 1750, projectedRemaining: -250, willBeDepleted: true },
    { days: 30, projectedSpend: 7500, projectedRemaining: -6000, willBeDepleted: true },
  ]);
});

test('ignore les dépenses futures, neutres et hors consommation', () => {
  const runway = buildBudgetRunway({
    asOfDate: '2026-11-10',
    remaining: 900,
    expenses: [
      { id: 'a', date: '2026-11-08', amount: 300, categoryId: 'food' },
      { id: 'b', date: '2026-11-09', amount: 400, categoryId: 'food', neutralFlow: true },
      { id: 'c', date: '2026-11-09', amount: 500, categoryId: 'food', expenseType: 'savings' },
      { id: 'd', date: '2026-11-12', amount: 700, categoryId: 'food' },
    ],
  });

  assert.equal(runway.totalSpent, 300);
  assert.equal(runway.observedDays, 3);
  assert.equal(runway.expenseCount, 1);
  assert.equal(runway.averageDailySpend, 100);
});

test('signale une enveloppe épuisée sans produire une date future', () => {
  const runway = buildBudgetRunway({
    asOfDate: '2026-11-10',
    remaining: -250,
    expenses: [{ id: 'a', date: '2026-11-08', amount: 500, categoryId: 'food' }],
  });

  assert.equal(runway.daysUntilEmpty, 0);
  assert.equal(runway.estimatedExhaustionDate, '2026-11-10');
  assert.equal(runway.projections.every((item) => item.willBeDepleted), true);
});

test('ne fabrique pas de prévision lorsque la catégorie n’a pas encore été utilisée', () => {
  const runway = buildBudgetRunway({
    asOfDate: '2026-11-10',
    remaining: 5000,
    expenses: [],
  });

  assert.equal(runway.hasUsablePace, false);
  assert.equal(runway.daysUntilEmpty, null);
  assert.equal(runway.estimatedExhaustionDate, null);
  assert.equal(runway.confidence, 'none');
});

test('compte une dépense partagée par source comme une opération, sans perdre ses montants alloués', () => {
  const runway = buildBudgetRunway({
    asOfDate: '2026-11-15',
    remaining: 10000,
    expenses: [
      { id: 'shared-a', sharedExpenseId: 'shared', date: '2026-11-12', amount: 600, categoryId: 'food', incomeSourceId: 'salary' },
      { id: 'shared-b', sharedExpenseId: 'shared', date: '2026-11-12', amount: 400, categoryId: 'food', incomeSourceId: 'business' },
    ],
  });

  assert.equal(runway.totalSpent, 1000);
  assert.equal(runway.expenseCount, 1);
});
