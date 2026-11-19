import test from 'node:test';
import assert from 'node:assert/strict';
import { countExpenseOperations, getExpenseOperationKeys } from '../src/lib/finance/expenseOperations.mjs';

const createdAt = { toMillis: () => 1795000000000 };

test('counts a new shared expense once while retaining repeated ordinary expenses', () => {
  const rows = [
    { id: 'meal-a', sharedExpenseId: 'meal-a', amount: 1000, date: '2026-11-19', categoryId: 'food' },
    { id: 'meal-b', sharedExpenseId: 'meal-a', amount: 600, date: '2026-11-19', categoryId: 'food' },
    { id: 'meal-c', sharedExpenseId: 'meal-a', amount: 400, date: '2026-11-19', categoryId: 'food' },
    { id: 'meal-second', amount: 1000, date: '2026-11-19', categoryId: 'food' },
    { id: 'meal-third', amount: 1000, date: '2026-11-19', categoryId: 'food' },
  ];
  assert.equal(countExpenseOperations(rows), 3);
});

test('counts existing update-generated split rows from splitFromExpenseId once', () => {
  const rows = [
    { id: 'root', amount: 500, date: '2026-11-19', categoryId: 'food' },
    { id: 'part-2', splitFromExpenseId: 'root', amount: 300, date: '2026-11-19', categoryId: 'food' },
    { id: 'part-3', splitFromExpenseId: 'root', amount: 200, date: '2026-11-19', categoryId: 'food' },
    { id: 'separate', amount: 500, date: '2026-11-19', categoryId: 'food' },
  ];
  assert.equal(countExpenseOperations(rows), 2);
});

test('recovers legacy "(Partagé)" rows only when one unambiguous transaction parent exists', () => {
  const rows = [
    { id: 'legacy-root', note: 'Repas', date: '2026-11-19', categoryId: 'food', createdAt },
    { id: 'legacy-part', note: 'Repas (Partagé)', date: '2026-11-19', categoryId: 'food', createdAt },
    { id: 'another-meal', note: 'Autre repas', date: '2026-11-19', categoryId: 'food', createdAt: { toMillis: () => 1795000005000 } },
  ];
  assert.deepEqual(getExpenseOperationKeys(rows), ['legacy-root', 'legacy-root', 'another-meal']);
  assert.equal(countExpenseOperations(rows), 2);
});

test('does not merge ambiguous old rows or repeated expenses with different timestamps', () => {
  const rows = [
    { id: 'root-1', note: 'Repas', date: '2026-11-19', categoryId: 'food', createdAt },
    { id: 'root-2', note: 'Repas', date: '2026-11-19', categoryId: 'food', createdAt },
    { id: 'part', note: 'Repas (Partagé)', date: '2026-11-19', categoryId: 'food', createdAt },
    { id: 'new-meal', note: 'Repas', date: '2026-11-19', categoryId: 'food', createdAt: { toMillis: () => 1795000005000 } },
  ];
  assert.equal(countExpenseOperations(rows), 4);
});

test('excludes neutral movements from the expense operation count', () => {
  assert.equal(countExpenseOperations([
    { id: 'expense', amount: 100, neutralFlow: false },
    { id: 'transfer-1', sharedExpenseId: 'transfer', amount: 40, neutralFlow: true },
    { id: 'transfer-2', sharedExpenseId: 'transfer', amount: 60, neutralFlow: true },
  ]), 1);
});
