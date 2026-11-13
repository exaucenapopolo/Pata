import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COTISATION_CHAT_PRICE,
  COTISATION_CHAT_MAX_LENGTH,
  COTISATION_CHAT_RETENTION_DAYS,
  sanitizeCotisationChatMessage,
  cotisationChatExpiry,
} from '../src/lib/cotisations/chatPolicy.mjs';

test('the group chat access fee is a one-time 500 XAF amount', () => {
  assert.equal(COTISATION_CHAT_PRICE, 500);
});

test('messages are trimmed, control characters are removed and the length is capped', () => {
  assert.equal(sanitizeCotisationChatMessage('  Bonjour\u0000\nà tous  '), 'Bonjour\nà tous');
  assert.equal(sanitizeCotisationChatMessage('   '), '');
  assert.equal(sanitizeCotisationChatMessage('x'.repeat(1200)).length, COTISATION_CHAT_MAX_LENGTH);
  assert.equal(sanitizeCotisationChatMessage({ text: 'bad' }), '');
});

test('chat messages expire exactly 30 days after creation', () => {
  const created = new Date('2026-11-13T00:00:00.000Z');
  const expires = cotisationChatExpiry(created);
  assert.equal(COTISATION_CHAT_RETENTION_DAYS, 30);
  assert.equal(expires.toISOString(), '2026-12-13T00:00:00.000Z');
});
