import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../src/app/(app)/dashboard/page.js', import.meta.url), 'utf8');

test('le tableau de bord réutilise le calcul partagé des soldes de la page Revenus', () => {
  assert.match(dashboard, /import \{ isIncomeCountedAsSource, sumAvailableIncomeBalances \} from '@\/lib\/finance\/incomeBalances\.mjs';/);
  assert.match(dashboard, /const periodIncomeSources = useMemo\(\(\) => periodIncomes\.filter\(/);
  assert.match(dashboard, /income\.flowType !== 'repayment_received'/);
  assert.match(dashboard, /income\.categoryId !== 'debt_repayment_received'/);
  assert.match(dashboard, /sumAvailableIncomeBalances\(periodIncomeSources, balancesReady\)/);
  assert.match(dashboard, /globalBalance == null \? '—' : formatCurrency\(globalBalance\)/);
  assert.match(dashboard, /Disponible \(dettes incluses\)/);
  assert.doesNotMatch(dashboard, /formatCurrency\(periodIncomeTotal - periodExpenseTotal\)/);
});
