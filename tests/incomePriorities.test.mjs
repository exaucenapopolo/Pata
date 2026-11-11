import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIncomePriorityReminder } from '../src/lib/finance/incomePriorities.mjs';

test('priorise les dettes à payer et les factures proches après un revenu', () => {
  const result = buildIncomePriorityReminder({
    amount: 75000,
    today: '2026-11-11',
    debts: [
      { type: 'owed_to_me', status: 'active', person: 'Alice', remaining: 20000, dueDate: '2026-11-12' },
      { type: 'i_owe', status: 'active', person: 'Paul', remaining: 15000, dueDate: '2026-11-15' },
    ],
    bills: [
      { active: true, name: 'Facture ENEO', amount: 12000, nextDueDate: '2026-11-20' },
      { active: true, name: 'Loyer', amount: 25000, nextDueDate: '2026-12-20' },
    ],
  });
  assert.equal(result.source, 'income_priority_reminder');
  assert.equal(result.priorityDebtCount, 1);
  assert.equal(result.priorityBillCount, 1);
  assert.equal(result.target, '/debts');
  assert.match(result.body, /15/);
  assert.match(result.body, /Facture ENEO/);
  assert.match(result.body, /ne déplace rien/);
});

test('ignore les créances à recevoir, les dettes soldées et les factures éloignées', () => {
  const result = buildIncomePriorityReminder({
    amount: 10000,
    today: '2026-11-11',
    debts: [
      { type: 'owed_to_me', status: 'active', person: 'Client', remaining: 5000 },
      { type: 'i_owe', status: 'paid', person: 'Fournisseur', remaining: 0 },
    ],
    bills: [{ active: true, name: 'Assurance', amount: 100000, nextDueDate: '2027-02-01' }],
  });
  assert.equal(result, null);
});

test('rappelle une facture en retard et choisit son écran comme destination si aucune dette payable', () => {
  const result = buildIncomePriorityReminder({
    amount: 30000,
    today: '2026-11-11',
    debts: [],
    bills: [{ active: true, name: 'Eau', amount: 4000, nextDueDate: '2026-11-08' }],
  });
  assert.equal(result.target, '/bills');
  assert.match(result.body, /en retard/);
});

test('rejette une date de référence invalide', () => {
  assert.throws(() => buildIncomePriorityReminder({ amount: 10, today: '11-11-2026' }), /date de référence/i);
});

test('rappelle un objectif d’épargne sans lier directement le revenu au versement', () => {
  const result = buildIncomePriorityReminder({
    amount: 50000,
    today: '2026-11-11',
    goals: [{ type: 'goal', name: 'Voiture', deadline: '2027-06-01' }],
  });
  assert.equal(result.priorityGoalCount, 1);
  assert.equal(result.target, '/goals');
  assert.match(result.body, /Voiture/);
  assert.match(result.body, /portefeuille/);
});
