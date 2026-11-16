import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSmsBillPayment } from '../src/lib/bills/smsBillPayment.mjs';

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
