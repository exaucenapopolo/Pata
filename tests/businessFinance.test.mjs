import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBusinessSummary, canManageBusiness, canViewBusiness, classifyBusinessMovement, normalizeBusinessAmount } from '../src/lib/business/finance.mjs';

test('sépare la trésorerie, le résultat, les apports et les retraits', () => {
  const summary = calculateBusinessSummary([{ balance: 100000 }, { balance: 35000 }], {
    income: 250000, expense: 140000, ownerContributions: 50000, ownerWithdrawals: 10000,
  });
  assert.deepEqual(summary, {
    cashBalance: 135000, income: 250000, expense: 140000,
    ownerContributions: 50000, ownerWithdrawals: 10000, result: 110000,
  });
});

test('la consultation reste possible après expiration mais la gestion exige Premium', () => {
  assert.equal(canViewBusiness({ premiumActive: false, membershipActive: true }), true);
  assert.equal(canViewBusiness({ membershipActive: false }), false);
  assert.equal(canManageBusiness({ premiumActive: false, role: 'owner' }), false);
  assert.equal(canManageBusiness({ premiumActive: true, role: 'viewer' }), false);
  assert.equal(canManageBusiness({ premiumActive: true, role: 'finance' }), true);
});

test('valide les montants professionnels sans accepter les valeurs nulles ou excessives', () => {
  assert.equal(normalizeBusinessAmount('2500'), 2500);
  assert.equal(normalizeBusinessAmount(-2), null);
  assert.equal(normalizeBusinessAmount('abc'), null);
  assert.equal(normalizeBusinessAmount(1_000_000_001), null);
});

test('identifie les apports et retraits sans les confondre avec le chiffre d’affaires', () => {
  assert.equal(classifyBusinessMovement({ flowType: 'owner_contribution', type: 'inflow' }), 'owner_contribution');
  assert.equal(classifyBusinessMovement({ flowType: 'owner_withdrawal', type: 'expense' }), 'owner_withdrawal');
  assert.equal(classifyBusinessMovement({ type: 'expense' }), 'expense');
  assert.equal(classifyBusinessMovement({ type: 'income' }), 'income');
});


import { calculateBusinessProfitability, validateBusinessPeoplePercentages } from '../src/lib/business/finance.mjs';
test('les parts de capital et de bénéfices sont indépendantes et le partage respecte le bénéfice distribuable',()=>{const people=[{id:'f',name:'Fondateur',capitalPercent:70,profitPercent:50},{id:'a',name:'Associé',capitalPercent:30,profitPercent:25},{id:'e',name:'Employé',capitalPercent:0,profitPercent:25}];const totals=validateBusinessPeoplePercentages(people);assert.equal(totals.capitalValid,true);assert.equal(totals.profitValid,true);const r=calculateBusinessProfitability({income:3000000,directCosts:1200000,operatingCosts:160000,salaries:75000,reservePercent:10,people});assert.equal(r.grossMargin,1800000);assert.equal(r.netProfit,1565000);assert.equal(r.reserve,156500);assert.equal(r.distributableProfit,1408500);assert.deepEqual(r.shares.map(x=>x.amount),[704250,352125,352125]);});
test('les pertes ne génèrent aucun bénéfice distribuable',()=>{const r=calculateBusinessProfitability({income:10000,directCosts:15000,people:[{name:'A',profitPercent:100}]});assert.equal(r.netProfit,-5000);assert.equal(r.distributableProfit,0);assert.equal(r.shares[0].amount,0);});
