import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecurringExpensePatterns, buildRecurringExpenseReminders } from '../src/lib/notifications/recurringExpenses.mjs';

const monthlyRent = [
  { id: 'aug', categoryId: 'housing', amount: 25000, date: '2026-08-05', note: 'Paiement du loyer' },
  { id: 'sep', categoryId: 'housing', amount: 25000, date: '2026-09-05', note: 'Paiement du loyer' },
  { id: 'oct', categoryId: 'housing', amount: 26000, date: '2026-10-06', note: 'Paiement du loyer' },
];

test('reconnaît un paiement semblable sur au moins trois mois distincts', () => {
  const patterns = buildRecurringExpensePatterns(monthlyRent, { referenceDate: '2026-11-01' });
  assert.equal(patterns.length, 1);
  assert.equal(patterns[0].label, 'loyer');
  assert.equal(patterns[0].occurrenceCount, 3);
  assert.equal(patterns[0].amountMedian, 25000);
  assert.equal(patterns[0].dayOfMonth, 5);
});

test('ne crée pas de motif avec seulement deux occurrences', () => {
  assert.deepEqual(buildRecurringExpensePatterns(monthlyRent.slice(0, 2), { referenceDate: '2026-11-01' }), []);
});

test('ignore les montants trop irréguliers et les mouvements neutres', () => {
  const irregular = [
    ...monthlyRent,
    { categoryId: 'housing', amount: 90000, date: '2026-11-01', note: 'Paiement du loyer', neutralFlow: true },
  ];
  assert.equal(buildRecurringExpensePatterns(irregular, { referenceDate: '2026-11-01' }).length, 1);
  const variable = monthlyRent.map((row, index) => ({ ...row, amount: [25000, 40000, 80000][index] }));
  assert.deepEqual(buildRecurringExpensePatterns(variable, { referenceDate: '2026-11-01' }), []);
});

test('propose un rappel dans la semaine avant la prochaine échéance', () => {
  const [pattern] = buildRecurringExpensePatterns(monthlyRent, { referenceDate: '2026-11-01' });
  const reminders = buildRecurringExpenseReminders([pattern], '2026-11-01');
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].dueDate, '2026-11-05');
  assert.equal(reminders[0].estimatedAmount, 25000);
  assert.match(reminders[0].body, /loyer/i);
});

test('évite un rappel déjà payé ce mois et évite de répéter la même échéance', () => {
  const [pattern] = buildRecurringExpensePatterns([
    ...monthlyRent,
    { categoryId: 'housing', amount: 25000, date: '2026-11-05', note: 'Paiement du loyer' },
  ], { referenceDate: '2026-11-06' });
  assert.equal(buildRecurringExpenseReminders([pattern], '2026-11-06').length, 0);
  assert.equal(buildRecurringExpenseReminders([{ ...pattern, lastReminderDueDate: '2026-12-05' }], '2026-11-29').length, 0);
});
