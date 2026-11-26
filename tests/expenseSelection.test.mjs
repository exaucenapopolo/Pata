import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDayExpenseSelectionKeys,
  getExpenseSelectionKey,
  getSelectedExpenseOperations,
  toggleDayExpenseSelectionKeys,
  toggleExpenseSelectionKey,
} from '../src/lib/finance/expenseSelection.mjs';

const keyMap = new Map([
  ['meal-root', 'meal-root'],
  ['meal-part', 'meal-root'],
  ['bus', 'bus'],
  ['taxi', 'taxi'],
  ['loan', 'loan'],
]);

test('un deuxième tap ajoute une deuxième dépense sans retirer la première', () => {
  let selected = [];
  selected = toggleExpenseSelectionKey(selected, 'bus');
  selected = toggleExpenseSelectionKey(selected, 'taxi');
  assert.deepEqual(selected, ['bus', 'taxi']);
  assert.deepEqual(toggleExpenseSelectionKey(selected, 'bus'), ['taxi']);
});

test('un appui sur la journée ajoute uniquement ses opérations et respecte les sélections précédentes', () => {
  const items = [
    { id: 'bus', amount: 300, date: '2026-11-26' },
    { id: 'taxi', amount: 900, date: '2026-11-26' },
    { id: 'loan', amount: 1000, date: '2026-11-26', neutralFlow: true, debtId: 'd1', flowType: 'loan_given' },
  ];
  const keys = getDayExpenseSelectionKeys(items, keyMap);
  assert.deepEqual(keys, ['bus', 'taxi']);
  assert.deepEqual(toggleDayExpenseSelectionKeys(['other-day'], keys), ['other-day', 'bus', 'taxi']);
  assert.deepEqual(toggleDayExpenseSelectionKeys(['other-day', 'bus', 'taxi'], keys), ['other-day']);
});

test('les lignes de financement d’une dépense partagée forment une seule opération et un montant total', () => {
  const expenses = [
    { id: 'meal-root', sharedExpenseId: 'meal-root', amount: 1500, incomeSourceId: 'salary', date: '2026-11-26' },
    { id: 'meal-part', sharedExpenseId: 'meal-root', splitFromExpenseId: 'meal-root', amount: 500, incomeSourceId: 'side', date: '2026-11-26' },
    { id: 'bus', amount: 300, incomeSourceId: 'salary', date: '2026-11-26' },
  ];
  const selectionKeyMap = new Map([['meal-root', 'meal-root'], ['meal-part', 'meal-root'], ['bus', 'bus']]);
  const mealKey = getExpenseSelectionKey(expenses[1], selectionKeyMap);
  const selected = getSelectedExpenseOperations(expenses, [mealKey]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].root.id, 'meal-root');
  assert.deepEqual(selected[0].rows.map((row) => row.id), ['meal-root', 'meal-part']);
  assert.equal(selected[0].amount, 2000);
});

test('les opérations protégées par le module Dettes ne sont pas proposées dans les actions groupées', () => {
  const expenses = [
    { id: 'bus', amount: 300 },
    { id: 'loan', amount: 1000, neutralFlow: true, debtId: 'd1', flowType: 'loan_given' },
  ];
  const selected = getSelectedExpenseOperations(expenses, ['bus', 'loan']);
  assert.deepEqual(selected.map((operation) => operation.key), ['bus']);
});
