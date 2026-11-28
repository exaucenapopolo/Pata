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


import { calculateBusinessCommitments, calculateBusinessLiquidity } from '../src/lib/business/finance.mjs';

test('calcule la masse salariale et les engagements restant réellement à payer', () => {
  const result = calculateBusinessCommitments([
    { type: 'salary', amount: 180000, amountPaid: 50000, status: 'in_progress' },
    { type: 'commission', amount: 40000, remaining: 40000, status: 'pending' },
    { type: 'rent', amount: 90000, remaining: 90000, status: 'pending' },
    { type: 'supplier', amount: 120000, remaining: 40000, status: 'in_progress' },
    { type: 'tax', amount: 25000, remaining: 25000, affectsFinances: false, status: 'pending' },
    { type: 'other', amount: 10000, remaining: 10000, status: 'completed' },
  ], [
    { salary: 75000, active: true },
    { salary: 60000, active: true },
    { salary: 30000, active: false },
  ]);
  assert.deepEqual(result, {
    peopleCount: 2, monthlyPayroll: 135000, salaryDue: 130000, commissionDue: 40000,
    rentDue: 90000, supplierDue: 40000, utilitiesDue: 0, taxDue: 25000,
    otherDue: 0, loanPayableDue: 0, loanReceivableDue: 0, payablesTracked: 300000,
  });
});

test('sépare la trésorerie réelle des créances attendues et des dettes à payer', () => {
  const result = calculateBusinessLiquidity({ cash: 200000, payables: 260000, receivables: 150000 });
  assert.equal(result.cashAfterPayables, -60000);
  assert.equal(result.projectedAfterReceivablesAndPayables, 90000);
  assert.equal(result.canCoverPayables, false);
  assert.equal(result.coverageRate, 77);
});

test('les prêts reçus sont des dettes et les prêts accordés des créances, sans gonfler les dettes fournisseurs', () => {
  const result = calculateBusinessCommitments([
    { type: 'loan_received', amount: 500000, remaining: 350000, status: 'in_progress' },
    { type: 'loan_granted', amount: 200000, remaining: 150000, status: 'in_progress' },
    { type: 'supplier', amount: 80000, remaining: 80000, status: 'pending' },
  ], []);
  assert.equal(result.loanPayableDue, 350000);
  assert.equal(result.loanReceivableDue, 150000);
  assert.equal(result.payablesTracked, 430000);
});


import { allocateBusinessReceipt, calculateBusinessReservePosition, calculateBusinessCashflowForecast } from '../src/lib/business/finance.mjs';

test('répartit une recette entre réserve, salaires et tiers sans dépasser le montant encaissé', () => {
  const result = allocateBusinessReceipt(500000, [
    { id: 'reserve', label: 'Réserve', percent: 20 },
    { id: 'salary', label: 'Salariés', percent: 30 },
    { id: 'supplier', label: 'Fournisseur', percent: 25 },
    { id: 'partners', label: 'Associés', percent: 15 },
  ]);
  assert.equal(result.assignedAmount, 450000);
  assert.equal(result.unassignedAmount, 50000);
  assert.deepEqual(result.allocations.map(row => row.amount), [100000, 150000, 125000, 75000]);
});

test('refuse une répartition qui dépasse 100 % et conserve le reste non affecté', () => {
  assert.throws(() => allocateBusinessReceipt(500000, [{ percent: 70 }, { percent: 40 }]), /100/);
  assert.equal(allocateBusinessReceipt(1000, [{ percent: 33.33 }]).unassignedAmount, 667);
});

test('suit la réserve réellement constituée et le disponible hors réserve', () => {
  assert.deepEqual(calculateBusinessReservePosition({ cashBalance: 400000, reserveBalance: 120000, targetAmount: 200000 }), {
    cashBalance: 400000, reserveBalance: 120000, targetAmount: 200000,
    targetGap: 80000, targetReached: false, availableOutsideReserve: 280000, reserveShareOfCash: 30,
  });
});

test('prévoit les tensions de trésorerie en ordonnant les encaissements et échéances', () => {
  const forecast = calculateBusinessCashflowForecast({ startingCash: 200000, movements: [
    { date: '2026-12-02', direction: 'outflow', amount: 250000 },
    { date: '2026-12-05', direction: 'inflow', amount: 180000 },
    { date: '2026-12-10', direction: 'outflow', amount: 50000, status: 'paid' },
  ] });
  assert.equal(forecast.firstShortfallDate, '2026-12-02');
  assert.equal(forecast.minimumProjectedCash, -50000);
  assert.equal(forecast.projectedEndingCash, 130000);
});
