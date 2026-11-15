import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PREMIUM_REMINDER_COOLDOWN_MS,
  getPremiumUntilDate,
  isPremiumActive,
  shouldShowPremiumReminder,
} from '../src/lib/premiumReminderPolicy.mjs';

test('convertit les dates Firestore et les dates simples de manière sûre', () => {
  const target = new Date('2027-01-10T12:00:00.000Z');
  assert.equal(getPremiumUntilDate({ toDate: () => target }).getTime(), target.getTime());
  assert.equal(getPremiumUntilDate({ seconds: target.getTime() / 1000 }).getTime(), target.getTime());
  assert.equal(getPremiumUntilDate(target.toISOString()).getTime(), target.getTime());
  assert.equal(getPremiumUntilDate(null), null);
  assert.equal(getPremiumUntilDate('not-a-date'), null);
});

test('un abonnement actif masque le rappel Premium', () => {
  const now = Date.parse('2026-11-15T12:00:00.000Z');
  assert.equal(isPremiumActive(now + 86400000, now), true);
  assert.equal(isPremiumActive(now - 1, now), false);
  assert.equal(isPremiumActive(null, now), false);
});

test('le rappel peut apparaître au premier lancement puis au plus une fois tous les sept jours', () => {
  const now = Date.parse('2026-11-15T12:00:00.000Z');
  assert.equal(shouldShowPremiumReminder(null, now), true);
  assert.equal(shouldShowPremiumReminder(String(now - 6 * 86400000), now), false);
  assert.equal(shouldShowPremiumReminder(String(now - PREMIUM_REMINDER_COOLDOWN_MS), now), true);
  assert.equal(shouldShowPremiumReminder('invalid', now), true);
  assert.equal(shouldShowPremiumReminder(String(now + 86400000), now), false);
});
