import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getExpenseOperationKeys, sortExpenseOperationsForSourceReassignment } from '../src/lib/finance/expenseOperations.mjs';

const read = (file) => fs.readFileSync(file, 'utf8');

test('la réaffectation libère en premier les opérations déjà financées par la source cible', () => {
  const operations = [
    { key: 'other-source-a', rows: [{ incomeSourceId: 'income-b', amount: 4000 }] },
    { key: 'target-source', rows: [{ incomeSourceId: 'income-a', amount: 2000 }] },
    { key: 'other-source-b', rows: [{ incomeSourceId: 'income-c', amount: 3000 }] },
    { key: 'shared-target', rows: [
      { incomeSourceId: 'income-b', amount: 1000 },
      { incomeSourceId: 'income-a', amount: 500 },
    ] },
  ];
  const ordered = sortExpenseOperationsForSourceReassignment(operations, 'income-a');
  assert.deepEqual(ordered.map((operation) => operation.key), [
    'target-source',
    'shared-target',
    'other-source-a',
    'other-source-b',
  ]);
});

test('une dépense répartie entre plusieurs sources reste une seule opération sélectionnable', () => {
  const rows = [
    { id: 'meal-root', sharedExpenseId: 'meal-root', incomeSourceId: 'income-a', amount: 1500, date: '2026-11-20' },
    { id: 'meal-part', sharedExpenseId: 'meal-root', splitFromExpenseId: 'meal-root', incomeSourceId: 'income-b', amount: 500, date: '2026-11-20' },
  ];
  const keys = getExpenseOperationKeys(rows);
  assert.deepEqual(keys, ['meal-root', 'meal-root']);

  const page = read('src/app/(app)/expenses/page.js');
  assert.match(page, /expenseRowsByOperation/);
  assert.match(page, /rows,\s*amount/);
  assert.match(page, /rows\.reduce\(\(sum, row\)/);
});

test('la sélection multiple démarre par appui prolongé et permet de sélectionner chaque journée séparément', () => {
  const page = read('src/app/(app)/expenses/page.js');
  assert.match(page, /setTimeout\(\(\) => \{/);
  assert.match(page, /\}, 480\)/);
  assert.match(page, /onPointerDown=\{\(event\) => startExpenseLongPress/);
  assert.match(page, /toggleExpenseDaySelection\(items\)/);
  assert.match(page, /Journée/);
  assert.doesNotMatch(page, /Tout sélectionner|Sélectionner toutes les dépenses/i);
});

test('les actions groupées utilisent les opérations financières sécurisées et protègent les mouvements spéciaux', () => {
  const page = read('src/app/(app)/expenses/page.js');
  assert.match(page, /deleteExpense\(user\.uid, operation\.root\.id\)/);
  assert.match(page, /updateExpense\(user\.uid, operation\.root\.id, payload\)/);
  assert.match(page, /sortExpenseOperationsForSourceReassignment/);
  assert.match(page, /incomeSpentTotals|Les sources de financement et les soldes ont été mis à jour/);
  assert.match(page, /expense\.neutralFlow !== true/);
  assert.match(page, /!expense\.debtId/);
  assert.match(page, /!expense\.repaymentDebtId/);
  assert.match(page, /expense\.cashWithdrawal !== true/);
});

test('les alertes de la page Dépenses utilisent le composant de dialogue Pata', () => {
  const page = read('src/app/(app)/expenses/page.js');
  const dialog = read('src/components/ui/AppDialog.jsx');
  assert.match(page, /import \{ AppDialog \}/);
  assert.match(page, /<AppDialog/);
  assert.match(page, /requestActionDialog/);
  assert.doesNotMatch(page, /window\.(alert|confirm|prompt)\s*\(/);
  assert.match(dialog, /<Modal open=\{open\}/);
  assert.match(dialog, /bg-rose-50|bg-amber-50|bg-emerald-50/);

  const billsPage = read('src/app/(app)/bills/page.js');
  assert.match(billsPage, /import \{ AppDialog \}/);
  assert.match(billsPage, /<AppDialog/);
  assert.doesNotMatch(billsPage, /window\.(alert|confirm|prompt)\s*\(/);
});
