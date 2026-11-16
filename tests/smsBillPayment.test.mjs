import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSmsBillPayment } from '../src/lib/bills/smsBillPayment.mjs';
import { resolveSmsBillChoice } from '../src/lib/sms/smsBillChoice.mjs';
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
