import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailySpendingFacts } from '../src/lib/ai/spendingGuidance.mjs';

const sample = {
  today: '2026-11-16',
  expenses: [
    { date: '2026-11-10', amount: 10000, categoryId: 'transport', expenseType: 'consumption' },
    { date: '2026-11-16', amount: 500, categoryId: 'transport', expenseType: 'consumption', note: 'Taxi' },
    { date: '2026-11-16', amount: 2000, categoryId: 'phone', expenseType: 'project', note: 'Accessoire' },
    { date: '2026-11-15', amount: 1000, categoryId: 'food', expenseType: 'consumption' },
  ],
  budgets: [{ month: '2026-11', categoryId: 'transport', amount: 30000, incomeSourceId: 'all' }],
  categories: [{ id: 'transport', name: 'Transport' }],
};

test('calcule les dépenses exactes du jour et distingue consommation, projet et autres sorties', () => {
  const facts = buildDailySpendingFacts(sample);
  assert.equal(facts.todayTotal, 2500);
  assert.equal(facts.todayCount, 2);
  assert.equal(facts.todayByType.consumption, 500);
  assert.equal(facts.todayByType.project, 2000);
  assert.equal(facts.todayOperations[0].category, 'Transport');
});

test('calcule le reste mensuel et le rythme quotidien après les dépenses du jour', () => {
  const facts = buildDailySpendingFacts(sample);
  assert.equal(facts.budgets[0].dailyPlan, 1333);
  assert.equal(facts.budgets[0].dailyRemaining, 833);
  assert.equal(facts.budgets[0].monthlyRemaining, 19500);
});

test('évalue une dépense envisagée avec sa catégorie sans la confondre avec un budget quotidien défini', () => {
  const facts = buildDailySpendingFacts({
    ...sample,
    proposedSpendText: "J'ai envie de dépenser 500 FCFA pour le transport",
  });
  assert.deepEqual(facts.proposedSpend, {
    amount: 500,
    category: 'Transport',
    dailyRemaining: 833,
    monthlyRemaining: 19500,
    dailyAfter: 333,
    monthlyAfter: 19000,
    status: 'within-daily-pace',
  });
});

test('ne valide pas une dépense si sa catégorie ne peut pas être déterminée', () => {
  const facts = buildDailySpendingFacts({
    ...sample,
    proposedSpendText: "J'ai envie de dépenser 500 FCFA",
  });
  assert.equal(facts.proposedSpend.status, 'category-required');
});

test('signale quand une dépense dépasse le rythme du jour sans dépasser l’enveloppe mensuelle', () => {
  const facts = buildDailySpendingFacts({
    ...sample,
    proposedSpendText: "J'ai envie de dépenser 1 000 FCFA pour le transport",
  });
  assert.equal(facts.proposedSpend.status, 'above-daily-pace-within-monthly-envelope');
});

test('une intention d’achat ne crée jamais une dépense sans demande explicite', async () => {
  const { isExplicitSpendRecordingRequest } = await import('../src/lib/ai/spendingGuidance.mjs');
  assert.equal(isExplicitSpendRecordingRequest("J'ai envie d'acheter un téléphone à 50000 FCFA"), false);
  assert.equal(isExplicitSpendRecordingRequest("Je peux dépenser 500 FCFA pour le transport ?"), false);
  assert.equal(isExplicitSpendRecordingRequest("Enregistre cette dépense de 500 FCFA"), true);
  assert.equal(isExplicitSpendRecordingRequest("Ajoute un achat de 500 FCFA"), true);
});
