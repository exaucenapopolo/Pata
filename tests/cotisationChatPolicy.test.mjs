import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COTISATION_CHAT_DAILY_FREE_LIMIT,
  COTISATION_CHAT_PACK_PRICE,
  COTISATION_CHAT_PACK_SIZE,
  COTISATION_CHAT_MAX_LENGTH,
  COTISATION_CHAT_RETENTION_DAYS,
  sanitizeCotisationChatMessage,
  summarizeCotisationChatQuota,
  consumeCotisationChatQuota,
  cotisationChatExpiry,
} from '../src/lib/cotisations/chatPolicy.mjs';

test('the group chat gives 10 free messages per member and day', () => {
  assert.equal(COTISATION_CHAT_DAILY_FREE_LIMIT, 10);
  assert.deepEqual(summarizeCotisationChatQuota({}), {
    freeLimit: 10, freeUsed: 0, freeRemaining: 10,
    bonusPurchased: 0, bonusUsed: 0, bonusRemaining: 0, remaining: 10,
  });
});

test('a 100 XAF pack grants 10 additional messages without removing the free allowance', () => {
  assert.equal(COTISATION_CHAT_PACK_PRICE, 100);
  assert.equal(COTISATION_CHAT_PACK_SIZE, 10);
  assert.equal(summarizeCotisationChatQuota({ freeUsed: 10, bonusPurchased: 10 }).remaining, 10);
});

test('free messages are consumed first, then purchased messages', () => {
  let usage = {};
  for (let i = 0; i < 10; i += 1) {
    const result = consumeCotisationChatQuota(usage);
    assert.equal(result.success, true);
    usage = result.usage;
  }
  assert.equal(summarizeCotisationChatQuota(usage).remaining, 0);
  usage = { ...usage, bonusPurchased: 10 };
  for (let i = 0; i < 10; i += 1) {
    const result = consumeCotisationChatQuota(usage);
    assert.equal(result.success, true);
    usage = result.usage;
  }
  assert.equal(summarizeCotisationChatQuota(usage).remaining, 0);
  assert.equal(consumeCotisationChatQuota(usage).success, false);
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
