import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DAILY_RETENTION_NOTIFICATIONS,
  buildCategoryAdviceNotification,
  claimDailyRetentionSlot,
  getCategoryAdvice,
  getDoualaDateKey,
  isWithinDoualaEveningWindow,
  selectRetentionCandidates
} from '../src/lib/notifications/retentionEngine.mjs';

test('uses the requested Cameroon evening window, including 19:00 and excluding 22:00', () => {
  // Cameroon is UTC+1: 18:00 UTC is 19:00 locally; 21:00 UTC is 22:00 locally.
  assert.equal(isWithinDoualaEveningWindow(new Date('2026-11-14T18:00:00.000Z')), true);
  assert.equal(isWithinDoualaEveningWindow(new Date('2026-11-14T20:59:00.000Z')), true);
  assert.equal(isWithinDoualaEveningWindow(new Date('2026-11-14T21:00:00.000Z')), false);
  assert.equal(isWithinDoualaEveningWindow(new Date('2026-11-14T17:59:00.000Z')), false);
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

test('resets the shared daily budget on the next Cameroon calendar date', () => {
  const full = { date: '2026-11-14', count: 2, keys: ['debt-1', 'bill-1'] };
  const nextDay = claimDailyRetentionSlot(full, '2026-11-15', 'category-food');
  assert.equal(nextDay.allowed, true);
  assert.equal(nextDay.state.count, 1);
  assert.deepEqual(nextDay.state.keys, ['category-food']);
});

test('selects at most two distinct high-priority topics', () => {
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
