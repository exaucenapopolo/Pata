import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickCapture } from '../src/lib/quickCapture/parser.mjs';
const now = new Date('2026-11-15T12:00:00.000Z');

test('reconnaît une dépense de taxi et son montant', () => {
  const result = parseQuickCapture("J'ai dépensé 1 500 FCFA pour le taxi", now);
  assert.equal(result.type, 'expense');
  assert.equal(result.amount, 1500);
  assert.equal(result.categoryId, 'transport');
  assert.equal(result.date, '2026-11-15');
});
test('reconnaît un revenu de salaire', () => {
  const result = parseQuickCapture("J'ai reçu 15 000 de salaire", now);
  assert.equal(result.type, 'income');
  assert.equal(result.amount, 15000);
  assert.equal(result.categoryId, 'salary');
  assert.equal(result.source, 'Salaire');
});
test('déduit une dépense depuis une saisie courte', () => {
  const result = parseQuickCapture('2 000 repas', now);
  assert.equal(result.type, 'expense');
  assert.equal(result.amount, 2000);
  assert.equal(result.categoryId, 'food');
});
test('ne devine pas le sens si aucune information ne permet de le déterminer', () => {
  const result = parseQuickCapture('15 000', now);
  assert.equal(result.amount, 15000);
  assert.equal(result.type, null);
  assert.equal(result.needsReview, true);
});
test('reconnaît une date relative hier', () => {
  const result = parseQuickCapture('Taxi 1 500 FCFA hier', now);
  assert.equal(result.date, '2026-11-14');
});
