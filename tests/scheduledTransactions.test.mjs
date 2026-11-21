import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseQuickCapture } from '../src/lib/quickCapture/parser.mjs';
import { addScheduledFrequency, isValidDateKey, getScheduledOccurrenceId } from '../src/lib/scheduling/scheduledTransactions.mjs';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const now = new Date('2026-11-17T12:00:00.000Z');

test('Quick Capture recognizes a scheduled expense for tomorrow', () => {
  const result = parseQuickCapture('programme 500 transport demain', now);
  assert.equal(result.type, 'expense');
  assert.equal(result.amount, 500);
  assert.equal(result.categoryId, 'transport');
  assert.equal(result.date, '2026-11-18');
  assert.equal(result.isScheduled, true);
  assert.equal(result.recurrenceEnabled, false);
});

test('Quick Capture recognizes a scheduled expense with day-of-month syntax', () => {
  const result = parseQuickCapture('programme 250 nourriture le 20', now);
  assert.equal(result.type, 'expense');
  assert.equal(result.amount, 250);
  assert.equal(result.categoryId, 'food');
  assert.equal(result.date, '2026-11-20');
  assert.equal(result.isScheduled, true);
});

test('Quick Capture schedules a general income with its named source', () => {
  const result = parseQuickCapture('programme revenu 5000 Diane 2026-11-21', now);
  assert.equal(result.type, 'income');
  assert.equal(result.amount, 5000);
  assert.equal(result.categoryId, 'other_income');
  assert.equal(result.source, 'Diane');
  assert.equal(result.date, '2026-11-21');
  assert.equal(result.isScheduled, true);
  assert.equal(result.recurrenceEnabled, false);
});

test('salary scheduling defaults to monthly recurrence and can be made explicit', () => {
  const result = parseQuickCapture('programme salaire 100000 20 novembre chaque mois', now);
  assert.equal(result.type, 'income');
  assert.equal(result.categoryId, 'salary');
  assert.equal(result.amount, 100000);
  assert.equal(result.date, '2026-11-20');
  assert.equal(result.isScheduled, true);
  assert.equal(result.recurrenceEnabled, true);
  assert.equal(result.frequency, 'monthly');
});

test('Quick Capture separates the scheduled date from a borrowed debt due date', () => {
  const result = parseQuickCapture('programme emprunt 25 000 chez Paul le 22 novembre échéance 22 décembre', now);
  assert.equal(result.type, 'debt_borrowed');
  assert.equal(result.amount, 25000);
  assert.equal(result.person, 'Paul');
  assert.equal(result.date, '2026-11-22');
  assert.equal(result.dueDate, '2026-12-22');
  assert.equal(result.isScheduled, true);
});

test('Quick Capture schedules a loan given and a debt repayment', () => {
  const loan = parseQuickCapture('programme prêt 5 000 à Diane le 20 novembre échéance 20 décembre', now);
  assert.equal(loan.type, 'loan_given');
  assert.equal(loan.person, 'Diane');
  assert.equal(loan.date, '2026-11-20');
  assert.equal(loan.dueDate, '2026-12-20');
  assert.equal(loan.isScheduled, true);

  const repayment = parseQuickCapture('programme remboursement 500 de dette à Paul demain', now);
  assert.equal(repayment.type, 'debt_repayment');
  assert.equal(repayment.person, 'Paul');
  assert.equal(repayment.date, '2026-11-18');
  assert.equal(repayment.isScheduled, true);
});

test('scheduled Quick Capture matches a user-created category', () => {
  const result = parseQuickCapture('programme bière 500 demain', now, {
    categories: [{ id: 'custom_beer', name: 'Bière', type: 'expense' }],
  });
  assert.equal(result.type, 'expense');
  assert.equal(result.categoryId, 'custom_beer');
  assert.equal(result.amount, 500);
  assert.equal(result.date, '2026-11-18');
  assert.equal(result.isScheduled, true);
});

test('scheduled phrases accept explicit full dates and reject invalid calendar dates', () => {
  const future = parseQuickCapture('programme 500 transport 17/12/2026', now);
  const invalid = parseQuickCapture('programme 500 transport 31/11/2026', now);
  assert.equal(future.date, '2026-12-17');
  assert.equal(future.isScheduled, true);
  assert.equal(invalid.date, '2026-11-17');
  assert.equal(invalid.isScheduled, true);
});

test('schedule date helpers validate dates and clamp monthly end-of-month dates', () => {
  assert.equal(isValidDateKey('2026-11-17'), true);
  assert.equal(isValidDateKey('2026-02-29'), false);
  assert.equal(addScheduledFrequency('2027-01-31', 'monthly', 31), '2027-02-28');
  assert.equal(addScheduledFrequency('2028-01-31', 'monthly', 31), '2028-02-29');
  assert.equal(addScheduledFrequency('2026-11-17', 'weekly'), '2026-11-24');
  assert.equal(addScheduledFrequency('2026-11-17', 'daily'), '2026-11-18');
});

test('scheduled occurrence IDs are stable and scoped to the due date', () => {
  assert.equal(getScheduledOccurrenceId('schedule-1', '2026-11-20'), 'scheduled_schedule_1_2026-11-20');
  assert.notEqual(getScheduledOccurrenceId('schedule-1', '2026-11-20'), getScheduledOccurrenceId('schedule-1', '2026-12-20'));
});

test('scheduled transactions are Premium-only and run through a separate daily processor', () => {
  const api = read('src/app/api/scheduled-transactions/route.js');
  const processor = read('src/app/api/scheduled-transactions/process/route.js');
  const vercel = read('vercel.json');
  assert.match(api, /premiumActive/);
  assert.match(api, /scheduledTransactions/);
  assert.match(api, /futureIncomeSourceName/);
  assert.match(processor, /scheduledTransactionRuns/);
  assert.match(processor, /createScheduledIncome/);
  assert.match(processor, /createScheduledExpense/);
  assert.match(processor, /awaitingIncomeSource: true/);
  assert.match(processor, /sendScheduledNotification/);
  assert.match(vercel, /api\/scheduled-transactions\/process/);
});

test('expense and income forms expose scheduling while preserving recurrence choices', () => {
  const expenses = read('src/app/(app)/expenses/page.js');
  const incomes = read('src/app/(app)/income/page.js');
  assert.match(expenses, /scheduleEnabled/);
  assert.match(expenses, /futureIncomeSourceName/);
  assert.match(expenses, /Programmer cette opération/);
  assert.match(expenses, /recurrenceEnabled/);
  assert.match(expenses, /linkSource/);
  assert.match(incomes, /Programmer cette opération/);
  assert.match(incomes, /recurrenceEnabled: id === 'salary' \? true/);
  assert.match(incomes, /Créer.*récurrente|Rendre ce revenu récurrent/);
});

test('Quick Capture saves scheduled requests instead of immediately recording them', () => {
  const route = read('src/app/api/quick-capture/route.js');
  assert.match(route, /parsed\?\.isScheduled === true/);
  assert.match(route, /scheduleRef\.create\(schedulePayload\)/);
  assert.match(route, /date <= doualaToday\(\)/);
  assert.match(route, /'debt_repayment'/);
  assert.match(route, /repaymentDebtId = matches\[0\]\.id/);
  const processor = read('src/app/api/scheduled-transactions/process/route.js');
  assert.match(processor, /export async function POST/);
  assert.match(processor, /adminAuth\.verifyIdToken/);
  const panel = read('src/components/transactions/ScheduledTransactionsPanel.jsx');
  assert.match(panel, /retryScheduledTransaction/);
  assert.match(panel, /Réessayer/);
});

test('help center documents scheduled expenses, incomes, recurring options and future source linking', () => {
  const help = read('src/lib/ai/helpKnowledge.mjs');
  for (const phrase of [
    'programme 500 transport demain',
    'programme 250 nourriture le 20',
    '17/05/2027',
    'récurrence mensuelle est activée par défaut',
    'relier à un revenu disponible',
    'Rendre cette opération récurrente',
    'peut-on programmer un emprunt',
  ]) assert.ok(help.toLowerCase().includes(phrase.toLowerCase()), 'Missing scheduled transaction help: ' + phrase);
});
