import test from 'node:test';
import assert from 'node:assert/strict';
import { getIncomeRemaining, getWithdrawalFundingSuggestion, incomeMatchesMobileMoneyProvider } from '../src/lib/finance/cashWithdrawal.mjs';

test('reconnaît uniquement les revenus du même opérateur Mobile Money', () => {
  assert.equal(incomeMatchesMobileMoneyProvider({ paymentMethod: 'mtn_momo' }, 'mtn_momo'), true);
  assert.equal(incomeMatchesMobileMoneyProvider({ source: 'MTN Mobile Money' }, 'mtn_momo'), true);
  assert.equal(incomeMatchesMobileMoneyProvider({ source: 'Orange Money' }, 'mtn_momo'), false);
  assert.equal(incomeMatchesMobileMoneyProvider({ cashPocket: true, source: 'Espèces · MTN MoMo' }, 'mtn_momo'), false);
});
test('calcule le solde restant après les dépenses déjà liées', () => {
  assert.equal(getIncomeRemaining({ id: 'a', amount: 2000 }, [{ incomeSourceId: 'a', amount: 500 }, { incomeSourceId: 'b', amount: 900 }]), 1500);
});
test('propose le revenu du même opérateur qui couvre le mieux le retrait', () => {
  const incomes = [
    { id: 'old', source: 'MTN MoMo', paymentMethod: 'mtn_momo', amount: 5000, date: '2026-11-01' },
    { id: 'exact', source: 'MTN Mobile Money', amount: 2000, date: '2026-11-11' },
    { id: 'orange', source: 'Orange Money', paymentMethod: 'orange_money', amount: 9000, date: '2026-11-11' },
  ];
  const result = getWithdrawalFundingSuggestion(incomes, [], 'mtn_momo', 2000);
  assert.equal(result.defaultSourceId, 'exact');
  assert.deepEqual(result.candidates.map((item) => item.id), ['exact', 'old']);
  assert.equal(result.totalAvailable, 7000);
});
test('propose de combiner plusieurs entrées du même opérateur si nécessaire', () => {
  const incomes = [
    { id: 'a', source: 'MTN MoMo', paymentMethod: 'mtn_momo', amount: 1000, date: '2026-11-10' },
    { id: 'b', source: 'MTN MoMo', paymentMethod: 'mtn_momo', amount: 1500, date: '2026-11-11' },
  ];
  const result = getWithdrawalFundingSuggestion(incomes, [], 'mtn_momo', 2000);
  assert.equal(result.defaultSourceId, 'all');
  assert.equal(result.totalAvailable, 2500);
});
test('ne propose pas un revenu insuffisant ou provenant de l’autre opérateur', () => {
  const incomes = [
    { id: 'mtn', source: 'MTN MoMo', paymentMethod: 'mtn_momo', amount: 1200 },
    { id: 'orange', source: 'Orange Money', paymentMethod: 'orange_money', amount: 5000 },
  ];
  const result = getWithdrawalFundingSuggestion(incomes, [], 'mtn_momo', 2000);
  assert.equal(result.defaultSourceId, 'external');
  assert.equal(result.totalAvailable, 1200);
});
