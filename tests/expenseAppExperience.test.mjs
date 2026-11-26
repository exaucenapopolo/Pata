import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getExpenseOperationKeys, sortExpenseOperationsForSourceReassignment } from '../src/lib/finance/expenseOperations.mjs';
import { getDayExpenseSelectionKeys, getSelectedExpenseOperations, toggleDayExpenseSelectionKeys, toggleExpenseSelectionKey } from '../src/lib/finance/expenseSelection.mjs';
import { createExpenseBatchDraftRow, getExpenseBatchFingerprint, getExpenseBatchIdempotencyKey, getExpenseBatchSourceTotals, getExpenseBatchTotal, validateExpenseBatchRows } from '../src/lib/finance/expenseBatch.mjs';

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
  assert.match(page, /getSelectedExpenseOperations\(expenses, selectedExpenseKeys\)/);
  assert.match(page, /selectedExpenseOperations = useMemo/);
  assert.match(page, /getExpenseOperationKeys\(expenses\)/);
});

test('la sélection multiple combine appui prolongé, touches simples et sélection indépendante par journée', () => {
  const page = read('src/app/(app)/expenses/page.js');
  const helper = read('src/lib/finance/expenseSelection.mjs');
  assert.match(page, /setTimeout\(\(\) => \{/);
  assert.match(page, /\}, 420\)/);
  assert.match(page, /onPointerDown=\{\(event\) => startExpenseLongPress/);
  assert.match(page, /onPointerMove=\{moveExpenseLongPress\}/);
  assert.doesNotMatch(page, /onPointerLeave=\{endExpenseLongPress\}/);
  assert.match(page, /if \(selectionMode\)\s*\{\s*toggleExpenseSelection\(expense\)/);
  assert.match(page, /toggleExpenseDaySelection\(items\)/);
  assert.match(page, /Sélectionner la journée/);
  assert.match(page, /selectionMode && \(\(\) => \{/);
  assert.match(page, /{selectionMode && \(/);
  assert.match(page, /Regrouper les revenus/);
  assert.match(page, /handleBulkDelete\(\)/);
  assert.match(helper, /toggleExpenseSelectionKey/);
  assert.match(helper, /toggleDayExpenseSelectionKeys/);
  assert.doesNotMatch(page, /Tout sélectionner|Sélectionner toutes les dépenses/i);
});

test('les actions groupées utilisent les endpoints atomiques pour supprimer et rattacher les dépenses', () => {
  const page = read('src/app/(app)/expenses/page.js');
  const client = read('src/lib/firestore/expenses.js');
  const route = read('src/app/api/[...path]/route.js');
  const finance = read('src/lib/ai/financialTools.js');

  assert.match(page, /deleteExpenseOperations\(/);
  assert.match(page, /selectedExpenseOperations\.map\(\(operation\) => operation\.root\.id\)/);
  assert.match(page, /reassignExpensesToIncome\(user\.uid, expenseIds, selectedSource\.id\)/);
  assert.match(client, /postExpenseAction\('delete-many'/);
  assert.match(client, /postExpenseAction\('reassign-source'/);
  assert.match(route, /'expenses\/delete-many': \{ POST: handleDeleteExpensesBulk \}/);
  assert.match(route, /'expenses\/reassign-source': \{ POST: handleReassignExpenseSource \}/);
  assert.match(route, /deleteExpenseOperationsForUser\(decoded\.uid, body\.expenseIds\)/);
  assert.match(finance, /export async function deleteExpenseOperationsForUser/);
  assert.match(finance, /export async function reassignExpenseOperationsToSourceForUser/);
  assert.match(page, /isBulkSelectableExpense/);
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

test('les écrans financiers et les composants principaux utilisent les dialogues Pata, pas les popups du navigateur', () => {
  const files = [
    'src/app/(app)/bills/page.js',
    'src/app/(app)/budgets/page.js',
    'src/app/(app)/expenses/page.js',
    'src/app/(app)/goals/page.jsx',
    'src/app/(app)/income/page.js',
    'src/app/(app)/reports/page.js',
    'src/app/(app)/settings/page.js',
    'src/app/admin/page.jsx',
    'src/components/ai/AssistantChat.jsx',
    'src/components/legal/LegalSummaryButton.jsx',
    'src/components/ui/CategoryManager.jsx',
  ];
  const nativePopup = /(?:window\.)?(?:alert|confirm|prompt)\s*\(/;
  for (const file of files) {
    const content = read(file);
    assert.doesNotMatch(content, nativePopup, file + ' must not use browser alert/confirm/prompt');
    assert.match(content, /useAppDialog|AppDialog/, file + ' must use the branded Pata dialog');
  }
});

test('le dialogue Pata gère aussi la saisie de texte sans prompt natif', () => {
  const dialog = read('src/components/ui/AppDialog.jsx');
  const hook = read('src/hooks/useAppDialog.jsx');
  assert.match(hook, /const appPrompt = useCallback/);
  assert.match(hook, /mode: 'prompt'/);
  assert.match(hook, /settle\(options\?\.mode === 'prompt' \? promptValue : true\)/);
  assert.match(dialog, /promptMultiline/);
  assert.match(dialog, /onPromptChange/);
  assert.match(dialog, /<textarea/);
  assert.match(dialog, /<input/);
});

test('la sélection simple permet de cocher plusieurs opérations indépendantes et de les décocher', () => {
  let selected = [];
  selected = toggleExpenseSelectionKey(selected, 'food-1');
  selected = toggleExpenseSelectionKey(selected, 'transport-2');
  assert.deepEqual(selected, ['food-1', 'transport-2']);
  selected = toggleExpenseSelectionKey(selected, 'food-1');
  assert.deepEqual(selected, ['transport-2']);
});

test('la sélection d’une journée coche uniquement ses opérations et conserve les autres journées', () => {
  const keyById = new Map([['shared-root', 'shared-root'], ['shared-part', 'shared-root']]);
  const items = [
    { id: 'shared-root' },
    { id: 'shared-part' },
    { id: 'normal-day' },
    { id: 'protected-debt', repaymentDebtId: 'debt-1' },
  ];
  const dayKeys = getDayExpenseSelectionKeys(items, keyById);
  assert.deepEqual(dayKeys, ['shared-root', 'normal-day']);
  const selected = toggleDayExpenseSelectionKeys(['other-day'], dayKeys);
  assert.deepEqual(selected, ['other-day', 'shared-root', 'normal-day']);
  assert.deepEqual(toggleDayExpenseSelectionKeys(selected, dayKeys), ['other-day']);
});

test('une sélection partagée expose une seule opération avec son montant total et son ID principal', () => {
  const expenses = [
    { id: 'root', sharedExpenseId: 'root', amount: 1200, incomeSourceId: 'income-a' },
    { id: 'part', sharedExpenseId: 'root', splitFromExpenseId: 'root', amount: 800, incomeSourceId: 'income-b' },
    { id: 'separate', amount: 300, incomeSourceId: 'income-a' },
  ];
  const operations = getSelectedExpenseOperations(expenses, ['root', 'separate']);
  assert.equal(operations.length, 2);
  assert.equal(operations[0].root.id, 'root');
  assert.equal(operations[0].amount, 2000);
  assert.equal(operations[0].rows.length, 2);
  assert.equal(operations[1].amount, 300);
});

test('la saisie multiple crée des lignes indépendantes et calcule les sources distinctes', () => {
  const first = { ...createExpenseBatchDraftRow('a', '2026-11-26'), amount: '1500', categoryId: 'food', incomeSourceId: 'salary' };
  const second = { ...createExpenseBatchDraftRow('b', '2026-11-26'), amount: '600', categoryId: 'transport', incomeSourceId: 'bonus' };
  const automatic = { ...createExpenseBatchDraftRow('c', '2026-11-26'), amount: '300', categoryId: 'internet', incomeSourceId: 'all' };
  assert.equal(getExpenseBatchTotal([first, second, automatic]), 2400);
  assert.deepEqual(getExpenseBatchSourceTotals([first, second, automatic]), { salary: 1500, bonus: 600 });
  assert.equal(first.categoryId, 'food');
  assert.equal(second.categoryId, 'transport');
  assert.notEqual(first.incomeSourceId, second.incomeSourceId);
});

test('la saisie multiple refuse les montants cumulés qui dépassent une source', () => {
  const rows = [
    { ...createExpenseBatchDraftRow('a', '2026-11-26'), amount: '6000', incomeSourceId: 'salary' },
    { ...createExpenseBatchDraftRow('b', '2026-11-26'), amount: '5000', incomeSourceId: 'salary' },
  ];
  const result = validateExpenseBatchRows(rows, {
    balancesReady: true,
    sourceBalances: [{ id: 'salary', source: 'Salaire', remaining: 10000 }],
    freeRemaining: 60,
  });
  assert.equal(result.valid, false);
  assert.match(result.error, /il ne reste que 10/);
});

test('la saisie multiple refuse une quantité au-delà du quota avant d’enregistrer la première ligne', () => {
  const rows = [
    { ...createExpenseBatchDraftRow('a', '2026-11-26'), amount: '500', categoryId: 'food' },
    { ...createExpenseBatchDraftRow('b', '2026-11-26'), amount: '300', categoryId: 'transport' },
  ];
  const result = validateExpenseBatchRows(rows, {
    balancesReady: true,
    sourceBalances: [{ id: 'salary', remaining: 10000 }],
    freeRemaining: 1,
  });
  assert.equal(result.valid, false);
  assert.match(result.error, /Il te reste 1/);
});

test('le formulaire de saisie multiple s’ouvre au-dessus de la barre et ferme le mode sélection', () => {
  const page = read('src/app/(app)/expenses/page.js');
  const openStart = page.indexOf('const openBatchEntry =');
  const openEnd = page.indexOf('const updateBatchRow =', openStart);
  const openHandler = page.slice(openStart, openEnd);
  assert.match(openHandler, /clearExpenseSelection\(\)/);
  assert.match(page, /<Modal open=\{batchModalOpen\} priority/);
});

test('la page propose une sélection explicite, une sélection par journée et les actions de suppression et de source', () => {
  const page = read('src/app/(app)/expenses/page.js');
  assert.match(page, /Terminer la sélection/);
  assert.match(page, /Sélectionner la journée/);
  assert.match(page, /Regrouper les revenus/);
  assert.match(page, /role="menu"/);
  assert.match(page, /MoreVertical/);
  assert.doesNotMatch(page, /onPointerLeave=\{endExpenseLongPress\}/);
  assert.match(page, /onPointerMove=\{moveExpenseLongPress\}/);
});

test('la saisie multiple enregistre chaque ligne par createExpense avec sa propre catégorie, date et source', () => {
  const page = read('src/app/(app)/expenses/page.js');
  assert.match(page, /<Modal open=\{batchModalOpen\}/);
  assert.match(page, /batchExpenseCategories\.map/);
  assert.match(page, /availableBatchIncomeSources/);
  assert.match(page, /date=|type="date"/);
  assert.match(page, /createExpense\(user\.uid, payload\)/);
  assert.match(page, /batchIdempotencyKey: getExpenseBatchIdempotencyKey\(row\)/);
  assert.ok(read('src/app/api/[...path]/route.js').includes('body.batchIdempotencyKey'));
  assert.match(page, /row\.categoryId/);
  assert.match(page, /row\.date/);
  assert.match(page, /row\.incomeSourceId/);
  assert.match(page, /const orderedRows = \[/);
  assert.match(page, /const remainingRows = orderedRows\.slice\(index\)/);
});

test('un nouvel appui réinitialise le clic supprimé après un long press Android, même en mode sélection', () => {
  const page = read('src/app/(app)/expenses/page.js');
  const start = page.indexOf('const startExpenseLongPress =');
  const end = page.indexOf('const moveExpenseLongPress =', start);
  assert.ok(start >= 0 && end > start);
  const handler = page.slice(start, end);
  assert.match(handler, /longPressTriggeredRef\.current = false;\s*if \(selectionMode/);
  assert.match(handler, /if \(selectionMode \|\| !isBulkSelectableExpense/);
  assert.match(page, /if \(selectionMode\) \{\s*toggleExpenseSelection\(expense\)/);
});

test('les dialogues Pata et la fenêtre de changement de source passent au-dessus de la barre de sélection', () => {
  const dialog = read('src/components/ui/AppDialog.jsx');
  const modal = read('src/components/ui/Modal.jsx');
  const page = read('src/app/(app)/expenses/page.js');
  assert.match(dialog, /<Modal open=\{open\}[^>]*priority/);
  assert.match(page, /<Modal open=\{bulkSourceOpen\} priority/);
  assert.match(modal, /priority \? 'z-\[130\]' : 'z-50'/);
  assert.match(page, /role="menu"/);
  assert.match(page, /MoreVertical/);
});

test('les actions groupées sont proposées dans un menu vertical en haut de la page, sans barre flottante en bas', () => {
  const page = read('src/app/(app)/expenses/page.js');
  assert.match(page, /MoreVertical/);
  assert.match(page, /aria-haspopup="menu"/);
  assert.match(page, /role="menu"/);
  assert.match(page, /Modifier ensemble/);
  assert.match(page, /Changer la date/);
  assert.match(page, /Regrouper les revenus/);
  assert.match(page, /handleBulkDelete\(\)/);
  assert.doesNotMatch(page, /pointer-events-none fixed inset-x-2 bottom-/);
});

test('la sélection dispose des commandes, même avant la première dépense cochée', () => {
  const page = read('src/app/(app)/expenses/page.js');
  assert.match(page, /Sélection des dépenses/);
  assert.match(page, /onClick=\{clearExpenseSelection\}/);
  assert.match(page, /handleBulkDelete\(\)/);
  assert.match(page, /openBulkSourceModal\(\)/);
});

test('le changement groupé de source est atomique et met à jour revenus et budgets dans la même transaction', () => {
  const finance = read('src/lib/ai/financialTools.js');
  const route = read('src/app/api/[...path]/route.js');
  const client = read('src/lib/firestore/expenses.js');
  const page = read('src/app/(app)/expenses/page.js');
  const start = finance.indexOf('export async function reassignExpenseOperationsToSourceForUser');
  const end = finance.indexOf('export async function deleteExpenseForUser', start);
  assert.ok(start >= 0 && end > start);
  const handler = finance.slice(start, end);
  assert.match(handler, /adminDb\.runTransaction/);
  assert.match(handler, /getExpenseOperationKeys/);
  assert.match(handler, /buildIncomeBalancesFromTotals/);
  assert.match(handler, /incomeSpentTotalsVersion: 1/);
  assert.match(handler, /applyBudgetSpendDelta/);
  assert.match(handler, /transaction\.delete\(expensesRef\.doc\(part\.id\)\)/);
  assert.match(handler, /transaction\.update\(operation\.ref/);
  assert.match(handler, /confirmationRequired/);
  assert.match(route, /'expenses\/reassign-source': \{ POST: handleReassignExpenseSource \}/);
  assert.match(route, /reassignExpenseOperationsToSourceForUser\(/);
  assert.match(client, /postExpenseAction\('reassign-source'/);
  const actionStart = page.indexOf('const handleBulkAssignSource =');
  const actionEnd = page.indexOf('const makeExpenseRecurring =', actionStart);
  const action = page.slice(actionStart, actionEnd);
  assert.match(action, /reassignExpensesToIncome\(user\.uid, expenseIds, selectedSource\.id\)/);
  assert.doesNotMatch(action, /for \(const operation of/);
  assert.match(action, /confirmBudgetOverrun: true/);
});

test('la saisie multiple traite chaque ligne comme une dépense indépendante et conserve les lignes restantes', () => {
  const page = read('src/app/(app)/expenses/page.js');
  const start = page.indexOf('const submitExpenseBatch =');
  const end = page.indexOf('const clearExpenseSelection =', start);
  const handler = page.slice(start, end);
  assert.match(page, /<Modal open=\{batchModalOpen\}/);
  assert.match(page, /batchExpenseCategories\.map/);
  assert.match(page, /availableBatchIncomeSources/);
  assert.match(handler, /createExpense\(user\.uid, payload\)/);
  assert.match(handler, /const remainingRows = orderedRows\.slice\(index\)/);
  assert.match(handler, /setBatchRows\(remainingRows\)/);
  assert.match(handler, /validateExpenseBatchRows/);
});

test('la sélection multiple affiche des commandes réelles pour modifier, dater, regrouper ou supprimer', () => {
  const page = read('src/app/(app)/expenses/page.js');
  assert.match(page, /Modifier ensemble/);
  assert.match(page, /Changer la date/);
  assert.match(page, /Regrouper les revenus/);
  assert.match(page, /handleBulkDelete\(\)/);
  assert.match(page, /const openBulkEditModal =/);
  assert.match(page, /setBatchMode\('edit'\)/);
  assert.match(page, /updateExpense\(user\.uid, row\.expenseId, payload\)/);
  assert.match(page, /OptionalTransactionFields value=\{row\}/);
  assert.match(page, /selectedFundingSources\.map/);
  assert.match(page, /bulkSourceAlreadyUnified/);
});

test('le changement groupé de date conserve les répartitions et actualise les budgets atomiquement', () => {
  const finance = read('src/lib/ai/financialTools.js');
  const route = read('src/app/api/[...path]/route.js');
  const client = read('src/lib/firestore/expenses.js');
  const page = read('src/app/(app)/expenses/page.js');
  const start = finance.indexOf('export async function updateExpenseOperationsDateForUser');
  const end = finance.indexOf('export async function reassignExpenseOperationsToSourceForUser', start);
  assert.ok(start >= 0 && end > start);
  const handler = finance.slice(start, end);
  assert.match(handler, /adminDb\.runTransaction/);
  assert.match(handler, /getExpenseOperationKeys/);
  assert.match(handler, /transaction\.update\(expensesRef\.doc\(part\.id\), \{\s*date: targetDate/);
  assert.match(handler, /applyBudgetSpendDelta/);
  assert.match(handler, /getBudgetSpendAmount/);
  assert.match(handler, /confirmationRequired/);
  assert.match(route, /'expenses\/update-date-many': \{ POST: handleUpdateExpensesDateBulk \}/);
  assert.match(route, /updateExpenseOperationsDateForUser\(/);
  assert.match(client, /postExpenseAction\('update-date-many'/);
  assert.match(page, /updateExpenseOperationsDate\(/);
  assert.match(page, /confirmBudgetOverrun: true/);
});

test('une tentative réseau répétée conserve la clé mais modifie l’empreinte lorsque la dépense change', () => {
  const first = {
    id: 'batch-unique-1', amount: '1500', categoryId: 'food',
    date: '2026-11-26', note: 'Marché', incomeSourceId: 'salary',
  };
  const retry = { ...first };
  const edited = { ...first, amount: '1700', categoryId: 'transport', incomeSourceId: 'bonus' };
  assert.equal(getExpenseBatchIdempotencyKey(first), getExpenseBatchIdempotencyKey(retry));
  assert.equal(getExpenseBatchIdempotencyKey(first), getExpenseBatchIdempotencyKey(edited));
  assert.equal(getExpenseBatchFingerprint(first), getExpenseBatchFingerprint(retry));
  assert.notEqual(getExpenseBatchFingerprint(first), getExpenseBatchFingerprint(edited));
  assert.match(getExpenseBatchIdempotencyKey(first), /^batch_[A-Za-z0-9_-]{8,120}$/);
  assert.match(getExpenseBatchFingerprint(first), /^fp_[A-Za-z0-9_-]{7,64}$/);
  assert.throws(() => getExpenseBatchIdempotencyKey({}), /Identifiant de ligne manquant/);
});

test('le serveur refuse le rejeu si une ligne déjà créée est modifiée ou si son ancienne empreinte manque', () => {
  const finance = read('src/lib/ai/financialTools.js');
  const route = read('src/app/api/[...path]/route.js');
  assert.match(finance, /previousFingerprint !== currentFingerprint/);
  assert.match(finance, /fingerprint: String\(idempotencyFingerprint/);
  assert.match(route, /body\.batchIdempotencyFingerprint/);
  assert.match(route, /empreinte de saisie multiple/i);
  assert.match(route, /empreinte\|déjà enregistrée/);
});

test('la suppression groupée est atomique et recalcule les soldes, budgets et historique', () => {
  const finance = read('src/lib/ai/financialTools.js');
  const route = read('src/app/api/[...path]/route.js');
  const client = read('src/lib/firestore/expenses.js');
  const page = read('src/app/(app)/expenses/page.js');
  const start = finance.indexOf('export async function deleteExpenseOperationsForUser');
  const end = finance.indexOf('export async function deleteExpenseForUser', start);
  assert.ok(start >= 0 && end > start);
  const handler = finance.slice(start, end);
  assert.match(handler, /adminDb\.runTransaction/);
  assert.match(handler, /calculateIncomeSpentTotals/);
  assert.match(handler, /incomeSpentTotalsVersion: 1/);
  assert.match(handler, /applyBudgetSpendDelta/);
  assert.match(handler, /transaction\.create\(activityRefs\[index\]/);
  assert.match(handler, /transaction\.delete\(expensesRef\.doc\(part\.id\)\)/);
  assert.match(route, /'expenses\/delete-many': \{ POST: handleDeleteExpensesBulk \}/);
  assert.match(route, /deleteExpenseOperationsForUser\(/);
  assert.match(client, /postExpenseAction\('delete-many'/);
  const actionStart = page.indexOf('const handleBulkDelete =');
  const actionEnd = page.indexOf('const openBulkSourceModal =', actionStart);
  const action = page.slice(actionStart, actionEnd);
  assert.match(action, /deleteExpenseOperations\(/);
  assert.doesNotMatch(action, /for \(const operation of/);
  assert.match(action, /Aucune suppression partielle/);
});

test('les transactions groupées refusent une répartition trop volumineuse avant toute écriture', () => {
  const finance = read('src/lib/ai/financialTools.js');
  const reassignmentStart = finance.indexOf('export async function reassignExpenseOperationsToSourceForUser');
  const deleteStart = finance.indexOf('export async function deleteExpenseOperationsForUser');
  const afterDelete = finance.indexOf('export async function deleteExpenseForUser', deleteStart);
  assert.ok(reassignmentStart >= 0 && deleteStart > reassignmentStart && afterDelete > deleteStart);
  const reassign = finance.slice(reassignmentStart, deleteStart);
  const deletion = finance.slice(deleteStart, afterDelete);
  for (const handler of [reassign, deletion]) {
    assert.match(handler, /totalFundingRows = operations\.reduce/);
    assert.match(handler, /totalFundingRows > 350/);
    assert.ok(handler.indexOf('totalFundingRows > 350') < handler.indexOf('transaction\.set('));
  }
});


test('le suivi budgétaire est calculé pour la bonne catégorie et la bonne source avant chaque dépense', () => {
  const finance = read('src/lib/ai/financialTools.js');
  const page = read('src/app/(app)/expenses/page.js');
  const createStart = finance.indexOf('export async function createExpenseForUser');
  const createEnd = finance.indexOf('export async function updateExpenseForUser', createStart);
  const updateStart = createEnd;
  const updateEnd = finance.indexOf('export async function reassignExpenseOperationsToSourceForUser', updateStart);
  const create = finance.slice(createStart, createEnd);
  const update = finance.slice(updateStart, updateEnd);
  assert.match(create, /getBudgetSpendAmount\(budgetSpendSummary, categoryId, sourceId\)/);
  assert.match(create, /const planned = sourceId === 'all' \? amount : \(plannedBySource\.get\(sourceId\) \|\| 0\)/);
  assert.match(create, /status = spentAfter > limit \? 'over_limit' : percentUsed >= 90 \? 'near_limit'/);
  assert.match(create, /budgetImpact,/);
  assert.match(update, /getBudgetSpendAmount\(summaryForBudgetCheck, categoryId, budgetSourceId\)/);
  assert.match(update, /budgetImpact,/);
  assert.match(page, /budgetFeedbackEnabled/);
  assert.match(page, /Suivi automatique des enveloppes/);
  assert.match(page, /item\.incomeSourceName/);
  assert.match(page, /item\.alreadySpent/);
  assert.match(page, /item\.remaining/);
  assert.match(page, /Afficher automatiquement ce suivi après chaque dépense/);
});

test('la préférence de suivi automatique des enveloppes est enregistrée sur le profil utilisateur', () => {
  const page = read('src/app/(app)/expenses/page.js');
  assert.match(page, /const \{ profile, save: saveProfile \} = useProfile\(\)/);
  assert.match(page, /profile\.budgetFeedbackEnabled !== false/);
  assert.match(page, /await saveProfile\(\{ budgetFeedbackEnabled: nextValue \}\)/);
  assert.match(page, /setBudgetFeedbackPreferenceError/);
  assert.match(page, /budgetFeedbackEnabled && budgetImpactToShow\.length/);
});

test('les alertes de proximité et de dépassement peuvent interrompre la sauvegarde pour confirmation', () => {
  const finance = read('src/lib/ai/financialTools.js');
  const page = read('src/app/(app)/expenses/page.js');
  assert.match(finance, /if \(warnings\.length && input\.confirmBudgetOverrun !== true && !skipBudgetConfirmation\)/);
  assert.match(finance, /if \(budgetWarnings\.length && input\.confirmBudgetOverrun !== true\)/);
  assert.match(finance, /confirmationRequired: true/);
  assert.match(page, /result\.confirmationRequired/);
  assert.match(page, /confirmBudgetOverrun: true/);
});
