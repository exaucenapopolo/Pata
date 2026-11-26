import test from 'node:test';
import assert from 'node:assert/strict';
import { getAvailableIncomeSources, getAvailableIncomeTotal } from '../src/lib/finance/availableIncomeSources.mjs';

test('n’affiche que les revenus vérifiés avec un solde strictement positif', () => {
  const sources = getAvailableIncomeSources([
    { id: 'salary', balanceAvailable: true, remaining: 40000 },
    { id: 'spent', balanceAvailable: true, remaining: 0 },
    { id: 'unknown', balanceAvailable: false, remaining: 90000 },
    { id: 'borrowed-cash', balanceAvailable: true, remaining: 15000, flowType: 'debt_borrowed', availableAsFunding: true, neutralFlow: true },
    { id: 'borrowed-credit', balanceAvailable: true, remaining: 25000, flowType: 'debt_borrowed', availableAsFunding: false, neutralFlow: true },
    { id: 'transfer', balanceAvailable: true, remaining: 5000, neutralFlow: true },
  ]);
  assert.deepEqual(sources.map((item) => item.id), ['salary', 'borrowed-cash']);
});

test('respecte la réservation d’une source à un projet', () => {
  const sources = getAvailableIncomeSources([
    { id: 'general', balanceAvailable: true, remaining: 12000 },
    { id: 'project-a', balanceAvailable: true, remaining: 30000, projectId: 'a' },
    { id: 'project-b', balanceAvailable: true, remaining: 40000, projectId: 'b' },
  ], { projectId: 'a' });
  assert.deepEqual(sources.map((item) => item.id), ['general', 'project-a']);
});

test('calcule le montant disponible à partir des soldes restants, pas des montants initiaux', () => {
  assert.equal(getAvailableIncomeTotal([
    { id: 'a', balanceAvailable: true, remaining: 3000 },
    { id: 'b', balanceAvailable: true, remaining: 7000 },
    { id: 'spent', balanceAvailable: true, remaining: 0 },
  ]), 10000);
});
