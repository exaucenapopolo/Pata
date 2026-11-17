import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getNextAdminPremiumUntil,
  validateAdminPremiumAmount,
} from '../src/lib/adminPremiumPolicy.mjs';

const DAY = 86400000;

test('prolonge un Premium actif à partir de sa date d’expiration', () => {
  const now = new Date('2026-11-17T08:00:00.000Z');
  const current = '2026-11-27T08:00:00.000Z';
  assert.equal(
    getNextAdminPremiumUntil(current, 1, now),
    new Date(Date.parse(current) + 30 * DAY).toISOString()
  );
});

test('démarre un nouvel accès à partir de maintenant si le compte est expiré', () => {
  const now = new Date('2026-11-17T08:00:00.000Z');
  assert.equal(
    getNextAdminPremiumUntil('2026-10-01T00:00:00.000Z', 2, now),
    new Date(now.getTime() + 60 * DAY).toISOString()
  );
});

test('accepte les montants entiers et refuse les montants vides, décimaux ou excessifs', () => {
  assert.equal(validateAdminPremiumAmount('2500'), 2500);
  assert.throws(() => validateAdminPremiumAmount(''));
  assert.throws(() => validateAdminPremiumAmount('12.5'));
  assert.throws(() => validateAdminPremiumAmount('100000001'));
});

test('refuse les durées hors limites', () => {
  const now = new Date('2026-11-17T08:00:00.000Z');
  assert.throws(() => getNextAdminPremiumUntil(null, 0, now));
  assert.throws(() => getNextAdminPremiumUntil(null, 13, now));
});
