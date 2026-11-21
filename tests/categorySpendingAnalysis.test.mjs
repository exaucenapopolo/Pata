import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCategorySpendingAnalysis } from '../src/lib/finance/categorySpendingAnalysis.mjs';

test('analyse les petites dépenses, les opérations importantes et la projection mensuelle', () => {
  const result = buildCategorySpendingAnalysis({
    today: '2026-11-15',
    categories: [{ id: 'food', name: 'Alimentation' }],
    budgets: [{ month: '2026-11', categoryId: 'food', amount: 20000, incomeSourceId: 'all' }],
    expenses: [
      { date: '2026-11-02', amount: 500, categoryId: 'food', note: 'Pain' },
      { date: '2026-11-06', amount: 700, categoryId: 'food', note: 'Boisson' },
      { date: '2026-11-12', amount: 2800, categoryId: 'food', note: 'Marché' },
      { date: '2026-11-13', amount: 12000, categoryId: 'food', note: 'Courses' },
      { date: '2026-11-14', amount: 9000, categoryId: 'food', note: 'Achat' },
      { date: '2026-11-14', amount: 50000, categoryId: 'food', neutralFlow: true },
      { date: '2026-11-16', amount: 10000, categoryId: 'food', note: 'Future' },
    ],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Alimentation');
  assert.equal(result[0].total, 25000);
  assert.equal(result[0].count, 5);
  assert.equal(result[0].smallCount, 2);
  assert.equal(result[0].smallTotal, 1200);
  assert.equal(result[0].daysObserved, 5);
  assert.equal(result[0].projected, 50000);
  assert.equal(result[0].budgetStatus, 'at-risk');
  assert.equal(result[0].largest[0].description, 'Courses');
});

test('compare les objectifs facultatifs quotidiens, hebdomadaires et mensuels aux opérations réelles', () => {
  const result = buildCategorySpendingAnalysis({
    today: '2026-11-15',
    targets: [{ categoryId: 'food', period: 'weekly', amount: 5000 }],
    expenses: [
      { date: '2026-11-09', amount: 1000, categoryId: 'food' },
      { date: '2026-11-11', amount: 2000, categoryId: 'food' },
      { date: '2026-11-15', amount: 3000, categoryId: 'food' },
    ],
  });
  assert.equal(result[0].targets[0].period, 'weekly');
  assert.equal(result[0].targets[0].actual, 6000);
  assert.equal(result[0].targets[0].status, 'over');
});

test('ne projette pas une tendance à partir de trop peu de jours de dépenses', () => {
  const result = buildCategorySpendingAnalysis({
    today: '2026-11-04',
    expenses: [
      { date: '2026-11-03', amount: 1000, categoryId: 'transport' },
      { date: '2026-11-04', amount: 2000, categoryId: 'transport' },
    ],
  });
  assert.equal(result[0].projected, null);
  assert.equal(result[0].projectionReliable, false);
  assert.equal(result[0].budgetStatus, 'unknown');
});

test('ignore les remboursements, les prêts accordés et les sorties neutres', () => {
  const result = buildCategorySpendingAnalysis({
    today: '2026-11-15',
    expenses: [
      { date: '2026-11-03', amount: 10000, categoryId: 'debt_repayment' },
      { date: '2026-11-04', amount: 10000, categoryId: 'loan_given', flowType: 'loan_given' },
      { date: '2026-11-05', amount: 10000, categoryId: 'food', neutralFlow: true },
      { date: '2026-11-06', amount: 1000, categoryId: 'food', expenseType: 'project' },
    ],
  });
  assert.deepEqual(result, []);
});
