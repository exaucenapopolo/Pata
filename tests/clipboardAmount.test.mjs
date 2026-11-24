import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeClipboardAmount } from '../src/lib/finance/clipboardAmount.mjs';

test('colle un montant avec espaces et devise FCFA', () => {
  assert.equal(normalizeClipboardAmount('1 250 FCFA'), '1250');
  assert.equal(normalizeClipboardAmount('2\u202f500 XAF'), '2500');
});

test('reconnaît les séparateurs de milliers français et anglais', () => {
  assert.equal(normalizeClipboardAmount('1.250'), '1250');
  assert.equal(normalizeClipboardAmount('1,250'), '1250');
  assert.equal(normalizeClipboardAmount('2,500.75 USD'), '2500.75');
  assert.equal(normalizeClipboardAmount('2.500,75 €'), '2500.75');
});

test('conserve les décimales simples et refuse les contenus non numériques', () => {
  assert.equal(normalizeClipboardAmount('1250,50'), '1250.50');
  assert.equal(normalizeClipboardAmount('1250.5'), '1250.5');
  assert.equal(normalizeClipboardAmount('bonjour'), null);
  assert.equal(normalizeClipboardAmount(''), null);
  assert.equal(normalizeClipboardAmount('-500'), null);
  assert.equal(normalizeClipboardAmount('12,3456'), null);
});
