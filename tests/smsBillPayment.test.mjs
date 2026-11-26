import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSmsBillPayment } from '../src/lib/bills/smsBillPayment.mjs';
import { resolveSmsBillChoice, getAvailableSmsBillsForPayment } from '../src/lib/sms/smsBillChoice.mjs';
import fs from 'node:fs';
import path from 'node:path';

test('prépare une facture récurrente payée avec sa prochaine échéance', () => {
  const bill = normalizeSmsBillPayment({
    name: 'Facture ENEO',
    billType: 'electricity',
    frequency: 'monthly',
    nextDueDate: '2026-12-15',
    expenseCategoryId: 'housing',
  }, '2026-11-15');
  assert.equal(bill.name, 'Facture ENEO');
  assert.equal(bill.nextDueDate, '2026-12-15');
  assert.equal(bill.dueDay, 15);
  assert.equal(bill.active, true);
  assert.equal(bill.pendingDetails, false);
  assert.equal(bill.reminderDaysBefore, 3);
});

test('une facture ponctuelle déjà payée est conservée sans rappel futur', () => {
  const bill = normalizeSmsBillPayment({
    name: 'Facture exceptionnelle',
    billType: 'other',
    frequency: 'once',
    expenseCategoryId: 'other',
  }, '2026-11-15');
  assert.equal(bill.nextDueDate, '2026-11-15');
  assert.equal(bill.active, false);
});

test('refuse une facture récurrente sans prochaine échéance', () => {
  assert.throws(() => normalizeSmsBillPayment({
    name: 'Internet',
    billType: 'internet',
    frequency: 'monthly',
    expenseCategoryId: 'internet',
  }, '2026-11-15'), /prochaine échéance/);
});

test('refuse une échéance antérieure ou égale à la date du paiement', () => {
  assert.throws(() => normalizeSmsBillPayment({
    name: 'Internet',
    billType: 'internet',
    frequency: 'monthly',
    nextDueDate: '2026-11-15',
    expenseCategoryId: 'internet',
  }, '2026-11-15'), /postérieure/);
});

test('refuse les dates calendaires invalides', () => {
  assert.throws(() => normalizeSmsBillPayment({
    name: 'Internet',
    billType: 'internet',
    frequency: 'monthly',
    nextDueDate: '2026-02-30',
    expenseCategoryId: 'internet',
  }, '2026-02-01'), /date|échéance/i);
});

test('refuse un type ou une catégorie de facture non autorisés', () => {
  assert.throws(() => normalizeSmsBillPayment({
    name: 'Facture test',
    billType: 'unknown',
    frequency: 'once',
    expenseCategoryId: 'housing',
  }, '2026-11-15'), /type de facture/);
});

test('une sortie Mobile Money classée comme facture est ponctuelle par défaut', () => {
  const choice = resolveSmsBillChoice({
    direction: 'expense',
    eventType: 'send',
    counterparty: 'Phinéas',
  }, {});

  assert.equal(choice.billName, 'Facture Phinéas');
  assert.equal(choice.billType, 'other');
  assert.equal(choice.billExpenseCategoryId, 'other');
  assert.equal(choice.billFrequency, 'once');

  const bill = normalizeSmsBillPayment({
    name: choice.billName,
    billType: choice.billType,
    frequency: choice.billFrequency,
    expenseCategoryId: choice.billExpenseCategoryId,
  }, '2026-11-16');
  assert.equal(bill.active, false);
  assert.equal(bill.nextDueDate, '2026-11-16');
});

test('la catégorie de la dépense précédente ne remplace pas la catégorie propre à la facture', () => {
  const choice = resolveSmsBillChoice({
    direction: 'expense',
    eventType: 'send',
    counterparty: 'ENEO',
  }, { categoryId: 'transport' });

  assert.equal(choice.billType, 'electricity');
  assert.equal(choice.billExpenseCategoryId, 'housing');
  assert.equal(choice.billFrequency, 'once');
});

test('une sortie SMS peut toujours être transformée en facture récurrente explicitement choisie', () => {
  const choice = resolveSmsBillChoice({
    direction: 'expense',
    eventType: 'send',
    counterparty: 'ENEO',
  }, { billFrequency: 'monthly', billNextDueDate: '2026-12-16' });

  assert.equal(choice.billType, 'electricity');
  assert.equal(choice.billExpenseCategoryId, 'housing');
  assert.equal(choice.billFrequency, 'monthly');

  const bill = normalizeSmsBillPayment({
    name: choice.billName,
    billType: choice.billType,
    frequency: choice.billFrequency,
    nextDueDate: '2026-12-16',
    expenseCategoryId: choice.billExpenseCategoryId,
  }, '2026-11-16');
  assert.equal(bill.active, true);
  assert.equal(bill.nextDueDate, '2026-12-16');
});

test('les champs du formulaire facture sont résolus dans la portée de chaque SMS affiché', () => {
  const component = fs.readFileSync(
    path.join(process.cwd(), 'src/components/SmsImportCoordinator.jsx'),
    'utf8'
  );
  const mapStart = component.indexOf('pending.map((item) => {');
  const mapEnd = component.indexOf('return (', mapStart);
  assert.ok(mapStart >= 0 && mapEnd > mapStart, 'la carte de chaque SMS doit avoir un bloc de préparation');
  const itemScope = component.slice(mapStart, mapEnd);
  assert.match(
    itemScope,
    /const \{ billName, billType, billFrequency, billExpenseCategoryId \} = resolveSmsBillChoice\(item, choice\);/
  );
  assert.match(component, /value=\{billType\}/);
  assert.match(component, /value=\{billExpenseCategoryId\}/);
  assert.match(component, /value=\{billFrequency\}/);
});

test('ne propose que les factures actives dont la prochaine échéance reste impayée', () => {
  const available = getAvailableSmsBillsForPayment([
    { id: 'eneo', name: 'Facture ENEO', active: true, nextDueDate: '2026-11-30', lastPaidDueDate: '2026-10-30' },
    { id: 'water-paid', name: 'CAMWATER', active: true, nextDueDate: '2026-11-20', lastPaidDueDate: '2026-11-20' },
    { id: 'inactive', name: 'Ancienne facture', active: false, nextDueDate: '2026-11-21' },
    { id: 'incomplete', name: 'Facture incomplète', active: true, pendingDetails: true, nextDueDate: '2026-11-22' },
    { id: 'no-date', name: 'Sans échéance', active: true, nextDueDate: '' },
    { id: 'frequency-pending', name: 'Fréquence à confirmer', active: true, frequencyPending: true, nextDueDate: '2026-11-23' },
    { id: 'rent', name: 'Loyer', active: true, nextDueDate: '2026-11-10' },
  ]);

  assert.deepEqual(available.map((bill) => bill.id), ['rent', 'eneo']);
});

test('ne retourne aucune facture déjà réglée ou désactivée', () => {
  assert.deepEqual(getAvailableSmsBillsForPayment([
    { id: 'paid', active: true, nextDueDate: '2026-11-10', lastPaidDueDate: '2026-11-10' },
    { id: 'disabled', active: false, nextDueDate: '2026-11-11' },
  ]), []);
});

test('le flux SMS propose les factures impayées puis transmet l’identifiant et l’échéance choisis', () => {
  const component = fs.readFileSync(
    path.join(process.cwd(), 'src/components/SmsImportCoordinator.jsx'),
    'utf8'
  );
  assert.match(component, /subscribeBills\(/);
  assert.match(component, /getAvailableSmsBillsForPayment\(bills\)/);
  assert.match(component, /value=\{choice\.billId \|\| ''\}/);
  assert.match(component, /billId: selectedSmsBill\?\.id \|\| \(createNewBill \? 'new' : ''\)/);
  assert.match(component, /billDueDate: selectedSmsBill\?\.nextDueDate \|\| ''/);
  assert.match(component, /Cette facture était déjà marquée comme payée/);
  assert.match(component, /getSmsChoiceForItem\(item, choices\[item\.id\]\)/);
  assert.match(component, /Confirmation à reprendre|confirmation à reprendre/i);
});

test('le paiement SMS d’une facture existante réutilise le traitement idempotent des factures', () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), 'src/app/api/sms-import/route.js'),
    'utf8'
  );
  const billsRoute = fs.readFileSync(
    path.join(process.cwd(), 'src/app/api/[...path]/route.js'),
    'utf8'
  );
  const claimAt = route.indexOf("if (claim.existingBillId)");
  const regularExpenseAt = route.indexOf("} else if (isExpense) {", claimAt);

  assert.ok(claimAt >= 0, 'une facture sélectionnée doit emprunter le flux de paiement des factures');
  assert.ok(regularExpenseAt > claimAt, 'la dépense SMS standard ne doit pas être utilisée pour une facture existante');
  assert.match(route.slice(claimAt, regularExpenseAt), /new URL\('\/api\/bills\/pay', request\.url\)/);
  assert.match(route.slice(claimAt, regularExpenseAt), /paymentSource: item\.provider/);
  assert.match(billsRoute, /bill_pay_' \+ billId \+ '_' \+ dueDate/);
  assert.match(billsRoute, /alreadyPaid: true/);
  assert.match(billsRoute, /lastPaidExpenseId/);
});

test('le paiement SMS d’une facture existante réutilise le paiement sécurisé de la facture', () => {
  const route = fs.readFileSync('src/app/api/sms-import/route.js', 'utf8');
  const billsRoute = fs.readFileSync('src/app/api/[...path]/route.js', 'utf8');
  const claimAt = route.indexOf('if (claim.existingBillId)');
  const standardExpenseAt = route.indexOf('} else if (isExpense) {', claimAt);
  assert.ok(claimAt >= 0 && standardExpenseAt > claimAt);
  const selectedBillBranch = route.slice(claimAt, standardExpenseAt);
  assert.match(selectedBillBranch, /new URL\('\/api\/bills\/pay', request\.url\)/);
  assert.match(selectedBillBranch, /billId: claim\.existingBillId/);
  assert.match(selectedBillBranch, /dueDate: claim\.billDueDate/);
  assert.match(selectedBillBranch, /paymentSource: item\.provider/);
  assert.match(route, /alreadyPaid = Boolean\(claim\.existingBillId && operationResult\.alreadyPaid === true\)/);
  assert.match(billsRoute, /bill_pay_' \+ billId \+ '_' \+ dueDate/);
  assert.match(billsRoute, /lastPaidExpenseId/);
  assert.match(route, /persistedBillAssociation = Boolean\(persistedBillId && persistedBillDueDate\)/);
  assert.match(route, /shouldRecordBill = recordBill \|\| persistedBillAssociation/);
  assert.match(route, /selectedBillId = persistedBillAssociation \? persistedBillId : requestedBillId/);
});

test('le serveur vérifie que la facture appartient au compte et que son échéance est toujours la même', () => {
  const route = fs.readFileSync('src/app/api/sms-import/route.js', 'utf8');
  assert.match(route, /userRef\.collection\('bills'\)\.doc\(selectedBillId\)/);
  assert.match(route, /if \(!selectedBillSnap\.exists\)/);
  assert.match(route, /selectedBill\.active === false/);
  assert.match(route, /String\(selectedBill\.nextDueDate \|\| ''\) !== selectedBillDueDate/);
  assert.match(route, /!\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
});
