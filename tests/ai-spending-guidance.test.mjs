import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailySpendingFacts } from '../src/lib/ai/spendingGuidance.mjs';

const sample = {
  today: '2026-11-16',
  expenses: [
    { date: '2026-11-10', amount: 10000, categoryId: 'transport', expenseType: 'consumption' },
    { date: '2026-11-11', amount: 3000, categoryId: 'transport', expenseType: 'consumption', neutralFlow: true, flowType: 'repayment' },
    { date: '2026-11-16', amount: 500, categoryId: 'transport', expenseType: 'consumption', note: 'Taxi' },
    { date: '2026-11-16', amount: 2000, categoryId: 'phone', expenseType: 'project', note: 'Accessoire' },
    { date: '2026-11-16', amount: 3000, categoryId: 'debt_repayment', expenseType: 'consumption', neutralFlow: true, flowType: 'repayment', note: 'Remboursement' },
    { date: '2026-11-15', amount: 1000, categoryId: 'food', expenseType: 'consumption' },
  ],
  budgets: [{ month: '2026-11', categoryId: 'transport', amount: 30000, incomeSourceId: 'all' }],
  categories: [{ id: 'transport', name: 'Transport' }],
};

test('calcule les dépenses exactes du jour et distingue consommation, projet et autres sorties', () => {
  const facts = buildDailySpendingFacts(sample);
  assert.equal(facts.todayTotal, 5500);
  assert.equal(facts.todayCount, 3);
  assert.equal(facts.todayByType.consumption, 500);
  assert.equal(facts.todayByType.project, 2000);
  assert.equal(facts.todayByType.other, 3000);
  assert.equal(facts.todayOperations[2].type, 'Autre sortie / flux neutre');
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
  assert.equal(facts.proposedSpend.amount, 500);
  assert.equal(facts.proposedSpend.category, 'Transport');
  assert.equal(facts.proposedSpend.dailyRemaining, 833);
  assert.equal(facts.proposedSpend.monthlyRemaining, 19500);
  assert.equal(facts.proposedSpend.dailyAfter, 333);
  assert.equal(facts.proposedSpend.monthlyAfter, 19000);
  assert.equal(facts.proposedSpend.status, 'within-daily-pace');
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

test('tient compte du plafond global mensuel défini par l’utilisateur pour le rythme et le reste disponibles', () => {
  const facts = buildDailySpendingFacts({
    ...sample,
    financialTargets: { expenseLimit: 50000 },
  });
  assert.equal(facts.hasGlobalMonthlyLimit, true);
  assert.equal(facts.globalMonthlySpent, 11500);
  assert.equal(facts.globalMonthlyRemaining, 38500);
  assert.equal(facts.globalDailyPlan, 2600);
  assert.equal(facts.globalDailyRemaining, 2100);
});

test('évalue un montant sans catégorie par rapport au plafond global, sans prétendre connaître son enveloppe', () => {
  const facts = buildDailySpendingFacts({
    ...sample,
    financialTargets: { expenseLimit: 50000 },
    proposedSpendText: "J'ai envie de dépenser 500 FCFA",
  });
  assert.equal(facts.proposedSpend.status, 'global-target-only');
  assert.equal(facts.proposedSpend.categoryRequired, true);
  assert.equal(facts.proposedSpend.globalMonthlyAfter, 38000);
  assert.equal(facts.proposedSpend.globalDailyAfter, 1600);
});

test('respecte aussi un plafond global de dépenses défini à zéro', () => {
  const facts = buildDailySpendingFacts({
    ...sample,
    financialTargets: { expenseLimit: 0 },
    proposedSpendText: "Je voudrais dépenser 500 FCFA",
  });
  assert.equal(facts.hasGlobalMonthlyLimit, true);
  assert.equal(facts.globalMonthlyRemaining, 0);
  assert.equal(facts.proposedSpend.globalStatus, 'over-global-monthly-limit');
});

test('les remboursements et flux neutres ne consomment pas une enveloppe de dépenses courantes', () => {
  const facts = buildDailySpendingFacts(sample);
  assert.equal(facts.budgets[0].spentBeforeToday, 10000);
  assert.equal(facts.budgets[0].monthlyRemaining, 19500);
  assert.equal(facts.globalMonthlySpent, 11500);
});

test('ne choisit pas arbitrairement entre plusieurs enveloppes de sources différentes', () => {
  const facts = buildDailySpendingFacts({
    ...sample,
    budgets: [
      { month: '2026-11', categoryId: 'transport', amount: 30000, incomeSourceId: 'salary' },
      { month: '2026-11', categoryId: 'transport', amount: 12000, incomeSourceId: 'business' },
    ],
    incomes: [
      { id: 'salary', source: 'Salaire' },
      { id: 'business', source: 'Activité' },
    ],
    proposedSpendText: "J'ai envie de dépenser 500 FCFA pour le transport",
  });
  assert.equal(facts.proposedSpend.status, 'source-required');
  assert.deepEqual(facts.proposedSpend.availableSources, ['Salaire', 'Activité']);
});

test('utilise l’enveloppe générale quand elle existe, sans la confondre avec les enveloppes propres aux revenus', () => {
  const facts = buildDailySpendingFacts({
    ...sample,
    budgets: [
      { month: '2026-11', categoryId: 'transport', amount: 30000, incomeSourceId: 'all' },
      { month: '2026-11', categoryId: 'transport', amount: 12000, incomeSourceId: 'salary' },
    ],
    incomes: [{ id: 'salary', source: 'Salaire' }],
    proposedSpendText: "J'ai envie de dépenser 500 FCFA pour le transport",
  });
  assert.equal(facts.proposedSpend.status, 'within-daily-pace');
  assert.equal(facts.proposedSpend.monthlyRemaining, 19500);
});
