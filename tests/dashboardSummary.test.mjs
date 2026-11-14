import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardMoneySummary } from '../src/lib/finance/dashboardSummary.mjs';

test('exclut les emprunts et les transferts vers la poche espèces des revenus gagnés', () => {
  assert.deepEqual(buildDashboardMoneySummary({
    totalIncome: 150000,
    borrowedIncome: 30000,
    cashPocketIncome: 10000,
    totalExpense: 45000,
  }), {
    accumulatedIncome: 110000,
    totalOutflow: 45000,
    remainingBalance: 65000,
  });
});

test('exclut les retraits internes et les remboursements non confirmés des sorties', () => {
  assert.deepEqual(buildDashboardMoneySummary({
    totalIncome: 90000,
    totalExpense: 70000,
    cashWithdrawals: 15000,
    pendingOutflows: 5000,
  }), {
    accumulatedIncome: 90000,
    totalOutflow: 50000,
    remainingBalance: 40000,
  });
});

test('conserve les prêts accordés, les versements d’épargne et les investissements parmi les sorties', () => {
  assert.deepEqual(buildDashboardMoneySummary({
    totalIncome: 100000,
    totalExpense: 80000,
  }), {
    accumulatedIncome: 100000,
    totalOutflow: 80000,
    remainingBalance: 20000,
  });
});

test('les données invalides ne provoquent ni NaN ni montants négatifs artificiels', () => {
  assert.deepEqual(buildDashboardMoneySummary({
    totalIncome: 'invalide',
    borrowedIncome: 500,
    totalExpense: 100,
    cashWithdrawals: 500,
  }), {
    accumulatedIncome: 0,
    totalOutflow: 0,
    remainingBalance: 0,
  });
});
