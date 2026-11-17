import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DAILY_RETENTION_NOTIFICATIONS,
  MAX_DAILY_NON_ESSENTIAL_NOTIFICATIONS,
  MIN_NON_ESSENTIAL_GAP_MS,
  buildCategoryAdviceNotification,
  claimDailyNonEssentialSlot,
  claimDailyRetentionSlot,
  claimDailyRetentionPassSlot,
  getCategoryAdvice,
  getDoualaDateKey,
  isWithinDoualaEveningWindow,
  selectRetentionCandidates
} from '../src/lib/notifications/retentionEngine.mjs';

test('uses the Cameroon evening window from 17:30 through 22:30 inclusive', () => {
  assert.equal(isWithinDoualaEveningWindow(new Date('2026-11-14T16:29:00.000Z')), false);
  assert.equal(isWithinDoualaEveningWindow(new Date('2026-11-14T16:30:00.000Z')), true);
  assert.equal(isWithinDoualaEveningWindow(new Date('2026-11-14T21:30:00.000Z')), true);
  assert.equal(isWithinDoualaEveningWindow(new Date('2026-11-14T21:31:00.000Z')), false);
});

test('computes the calendar day in Africa/Douala rather than UTC', () => {
  assert.equal(getDoualaDateKey(new Date('2026-11-14T23:30:00.000Z')), '2026-11-15');
});

test('reserves at most two daily retention slots and blocks duplicate keys', () => {
  assert.equal(MAX_DAILY_RETENTION_NOTIFICATIONS, 2);
  const first = claimDailyRetentionSlot({}, '2026-11-14', 'debt-1');
  const duplicate = claimDailyRetentionSlot(first.state, '2026-11-14', 'debt-1');
  const second = claimDailyRetentionSlot(first.state, '2026-11-14', 'bill-2');
  const third = claimDailyRetentionSlot(second.state, '2026-11-14', 'category-food');

  assert.equal(first.allowed, true);
  assert.equal(duplicate.allowed, false);
  assert.equal(duplicate.reason, 'duplicate');
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.equal(third.reason, 'daily_limit');
  assert.equal(second.state.count, 2);
});


test('allows three daytime messages and two independent evening financial reminders', () => {
  const date = '2026-11-14';
  const firstDaytime = claimDailyNonEssentialSlot({}, date, 'feature-discovery', 3, 1000000);
  const secondDaytime = claimDailyNonEssentialSlot(firstDaytime.state, date, 'weekend-message', 3, 1000000 + MIN_NON_ESSENTIAL_GAP_MS);
  const thirdDaytime = claimDailyNonEssentialSlot(secondDaytime.state, date, 'premium-discovery', 3, 1000000 + 2 * MIN_NON_ESSENTIAL_GAP_MS);
  const fourthDaytime = claimDailyNonEssentialSlot(thirdDaytime.state, date, 'another-message', 3, 1000000 + 3 * MIN_NON_ESSENTIAL_GAP_MS);
  const firstEvening = claimDailyRetentionSlot({}, date, 'debt-reminder');
  const secondEvening = claimDailyRetentionSlot(firstEvening.state, date, 'bill-reminder');
  const thirdEvening = claimDailyRetentionSlot(secondEvening.state, date, 'daily-summary');

  assert.equal(firstDaytime.allowed, true);
  assert.equal(secondDaytime.allowed, true);
  assert.equal(thirdDaytime.allowed, true);
  assert.equal(fourthDaytime.allowed, false);
  assert.equal(firstEvening.allowed, true);
  assert.equal(secondEvening.allowed, true);
  assert.equal(thirdEvening.allowed, false);
  assert.equal(thirdEvening.reason, 'daily_limit');
});

test('reserves at most one financial reminder in each of the two evening passes', () => {
  const first = claimDailyRetentionPassSlot({}, '2026-11-17', 'debt-1', 1);
  const extraFirst = claimDailyRetentionPassSlot(first.state, '2026-11-17', 'bill-1', 1);
  const second = claimDailyRetentionPassSlot(first.state, '2026-11-17', 'daily-checkin', 2);
  const extraSecond = claimDailyRetentionPassSlot(second.state, '2026-11-17', 'another-checkin', 2);

  assert.equal(first.allowed, true);
  assert.equal(extraFirst.allowed, false);
  assert.equal(extraFirst.reason, 'pass_limit');
  assert.equal(second.allowed, true);
  assert.equal(second.state.count, 2);
  assert.equal(extraSecond.allowed, false);
  assert.equal(extraSecond.reason, 'daily_limit');
});

test('resets both evening passes at the next Cameroon calendar day', () => {
  const first = claimDailyRetentionPassSlot({}, '2026-11-17', 'debt-1', 1);
  const second = claimDailyRetentionPassSlot(first.state, '2026-11-17', 'bill-1', 2);
  const nextDay = claimDailyRetentionPassSlot(second.state, '2026-11-18', 'new-day-reminder', 1);

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(nextDay.allowed, true);
  assert.equal(nextDay.state.count, 1);
  assert.equal(nextDay.state.pass1Count, 1);
  assert.equal(nextDay.state.pass2Count, 0);
});

test('resets the retention counter on the next Cameroon calendar date', () => {
  const full = { date: '2026-11-14', count: 2, keys: ['debt-1', 'bill-1'] };
  const nextDay = claimDailyRetentionSlot(full, '2026-11-15', 'category-food');
  assert.equal(nextDay.allowed, true);
  assert.equal(nextDay.state.count, 1);
});

test('caps all non-essential messages at three per day and enforces a spacing gap', () => {
  assert.equal(MAX_DAILY_NON_ESSENTIAL_NOTIFICATIONS, 3);
  const start = 1000000;
  const first = claimDailyNonEssentialSlot({}, '2026-11-14', 'retention-1', 3, start);
  const tooSoon = claimDailyNonEssentialSlot(first.state, '2026-11-14', 'weekend-1', 3, start + 30 * 60 * 1000);
  const second = claimDailyNonEssentialSlot(first.state, '2026-11-14', 'weekend-1', 3, start + MIN_NON_ESSENTIAL_GAP_MS);
  const third = claimDailyNonEssentialSlot(second.state, '2026-11-14', 'feature-1', 3, start + 2 * MIN_NON_ESSENTIAL_GAP_MS);
  const fourth = claimDailyNonEssentialSlot(third.state, '2026-11-14', 'extra-1', 3, start + 3 * MIN_NON_ESSENTIAL_GAP_MS);

  assert.equal(first.allowed, true);
  assert.equal(tooSoon.allowed, false);
  assert.equal(tooSoon.reason, 'minimum_gap');
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, true);
  assert.equal(fourth.allowed, false);
  assert.equal(fourth.reason, 'daily_limit');
  assert.equal(third.state.count, 3);
});

test('resets the shared non-essential counter on the next local day', () => {
  const full = { date: '2026-11-14', count: 3, keys: ['a', 'b', 'c'], lastAt: 1000000 };
  const nextDay = claimDailyNonEssentialSlot(full, '2026-11-15', 'weekend-next', 3, 1000100);
  assert.equal(nextDay.allowed, true);
  assert.equal(nextDay.state.count, 1);
  assert.deepEqual(nextDay.state.keys, ['weekend-next']);
});

test('selects at most two different priorities without duplicating a topic', () => {
  const selected = selectRetentionCandidates([
    { key: 'tip', topic: 'advice', title: 'Conseil', body: 'Texte', priority: 10 },
    { key: 'bill', topic: 'bills', title: 'Facture', body: 'Texte', priority: 90 },
    { key: 'bill-second', topic: 'bills', title: 'Facture 2', body: 'Texte', priority: 80 },
    { key: 'debt', topic: 'debts', title: 'Dette', body: 'Texte', priority: 70 }
  ]);
  assert.deepEqual(selected.map((item) => item.key), ['bill', 'debt']);
});

test('rotates category advice and builds a message with actual monthly and daily totals', () => {
  const dayOne = getCategoryAdvice('food', '2026-11-14');
  const dayTwo = getCategoryAdvice('food', '2026-11-15');
  assert.notEqual(dayOne, dayTwo);

  const notification = buildCategoryAdviceNotification({
    categoryId: 'food',
    categoryLabel: 'Alimentation',
    monthlyAmount: 38500,
    todayAmount: 900,
    dateKey: '2026-11-14'
  });
  assert.match(notification.title, /alimentation/i);
  assert.match(notification.body, /38 ?500|38 500|38,500/);
  assert.match(notification.body, /900/);
  assert.match(notification.body, /placards|courses|repas|prix|enveloppe/i);
  assert.equal(notification.target, '/reports');
  assert.equal(buildCategoryAdviceNotification({ categoryId: 'food', monthlyAmount: 0, todayAmount: 100, dateKey: '2026-11-14' }), null);
});
