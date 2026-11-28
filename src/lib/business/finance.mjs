export const BUSINESS_TRANSACTION_TYPES = Object.freeze(['income', 'expense', 'owner_contribution', 'owner_withdrawal']);

export function calculateBusinessSummary(accounts = [], monthly = {}) {
  const cashBalance = (Array.isArray(accounts) ? accounts : []).reduce((sum, account) => {
    const balance = Number(account?.balance);
    return sum + (Number.isFinite(balance) ? balance : 0);
  }, 0);
  const income = Math.max(0, Number(monthly?.income) || 0);
  const expense = Math.max(0, Number(monthly?.expense) || 0);
  const ownerContributions = Math.max(0, Number(monthly?.ownerContributions) || 0);
  const ownerWithdrawals = Math.max(0, Number(monthly?.ownerWithdrawals) || 0);
  return {
    cashBalance,
    income,
    expense,
    ownerContributions,
    ownerWithdrawals,
    result: income - expense,
  };
}

export function canViewBusiness({ premiumActive, membershipActive = true } = {}) {
  return membershipActive === true;
}

export function canManageBusiness({ premiumActive, membershipActive = true, role = 'viewer' } = {}) {
  return premiumActive === true && membershipActive === true && ['owner', 'admin', 'finance'].includes(role);
}

export function normalizeBusinessAmount(value) {
  const amount = Math.round(Number(value));
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000) return null;
  return amount;
}

export function classifyBusinessMovement(movement = {}) {
  if (movement.flowType === 'owner_contribution') return 'owner_contribution';
  if (movement.flowType === 'owner_withdrawal') return 'owner_withdrawal';
  if (movement.type === 'expense' || movement.direction === 'expense') return 'expense';
  return 'income';
}


export function calculateBusinessProfitability(input = {}) {
  const n = (v) => Math.max(0, Number(v) || 0);
  const revenue=n(input.income), directCosts=n(input.directCosts), operatingCosts=n(input.operatingCosts), salaries=n(input.salaries), obligations=n(input.obligations);
  const grossMargin=revenue-directCosts, netProfit=grossMargin-operatingCosts-salaries-obligations;
  const reservePercent=Math.min(100,n(input.reservePercent)), reserve=netProfit>0?Math.round(netProfit*reservePercent/100):0;
  const distributableProfit=Math.max(0,netProfit-reserve), people=(Array.isArray(input.people)?input.people:[]).filter(p=>p&&p.active!==false);
  const totalProfitPercent=people.reduce((s,p)=>s+n(p.profitPercent),0);
  return {revenue,directCosts,grossMargin,grossMarginRate:revenue?grossMargin/revenue*100:0,operatingCosts,salaries,obligations,netProfit,reservePercent,reserve,distributableProfit,overAllocated:totalProfitPercent>100,unallocatedProfit:distributableProfit*Math.max(0,100-Math.min(100,totalProfitPercent))/100,shares:people.map(p=>({personId:p.id,name:p.name,percentage:n(p.profitPercent),amount:Math.round(distributableProfit*n(p.profitPercent)/100)}))};
}
export function validateBusinessPeoplePercentages(people = []) {
  const rows=Array.isArray(people)?people.filter(p=>p&&p.active!==false):[];
  const capitalTotal=rows.reduce((s,p)=>s+Math.max(0,Number(p.capitalPercent)||0),0), profitTotal=rows.reduce((s,p)=>s+Math.max(0,Number(p.profitPercent)||0),0);
  return {capitalTotal,profitTotal,capitalValid:capitalTotal<=100.0001,profitValid:profitTotal<=100.0001};
}

// Aide à transformer les engagements en indicateurs de trésorerie sans
// confondre les salaires prévisionnels, les dettes exigibles et les dépenses payées.
export function calculateBusinessCommitments(obligations = [], people = []) {
  const rows = Array.isArray(obligations) ? obligations : [];
  const activePeople = (Array.isArray(people) ? people : []).filter(person => person && person.active !== false);
  const remainingOf = item => Math.max(0, Number(item?.remaining ?? (Number(item?.amount || 0) - Number(item?.amountPaid || 0))) || 0);
  const byType = rows.reduce((totals, item) => {
    if (['completed', 'cancelled'].includes(item?.status)) return totals;
    const amount = remainingOf(item);
    const type = String(item?.type || 'other');
    totals[type] = (totals[type] || 0) + amount;
    if (item?.affectsFinances !== false && type !== 'loan_granted') {
      totals.total = (totals.total || 0) + amount;
    }
    return totals;
  }, { total: 0 });
  const monthlyPayroll = activePeople.reduce((sum, person) => sum + Math.max(0, Number(person?.salary) || 0), 0);
  return {
    peopleCount: activePeople.length,
    monthlyPayroll,
    salaryDue: byType.salary || 0,
    rentDue: byType.rent || 0,
    supplierDue: byType.supplier || 0,
    utilitiesDue: byType.utility || 0,
    taxDue: byType.tax || 0,
    otherDue: Math.max(0, (byType.other || 0) + (byType.subscription || 0) + (byType.loan || 0)),
    loanPayableDue: byType.loan_received || byType.loan || 0,
    loanReceivableDue: byType.loan_granted || 0,
    payablesTracked: byType.total,
  };
}

export function calculateBusinessLiquidity({ cash = 0, payables = 0, receivables = 0 } = {}) {
  const availableCash = Math.max(0, Number(cash) || 0);
  const outstandingPayables = Math.max(0, Number(payables) || 0);
  const outstandingReceivables = Math.max(0, Number(receivables) || 0);
  return {
    cash: availableCash,
    payables: outstandingPayables,
    receivables: outstandingReceivables,
    cashAfterPayables: availableCash - outstandingPayables,
    projectedAfterReceivablesAndPayables: availableCash + outstandingReceivables - outstandingPayables,
    canCoverPayables: availableCash >= outstandingPayables,
    coverageRate: outstandingPayables > 0 ? Math.round(availableCash / outstandingPayables * 100) : null,
  };
}


// Répartit une entrée sans transformer les affectations en dépenses :
// elles restent des destinations de trésorerie jusqu'au décaissement réel.
export function allocateBusinessReceipt(amount, allocations = []) {
  const total = normalizeBusinessAmount(amount);
  if (!total) throw new Error('Montant encaissé invalide.');
  if (!Array.isArray(allocations) || allocations.length > 30) throw new Error('Répartition invalide.');
  const rows = allocations.map((row, index) => {
    const percent = Number(row?.percent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('Chaque pourcentage doit être compris entre 0 et 100.');
    return {
      id: String(row?.id || row?.categoryId || ('allocation_' + index)).slice(0, 100),
      label: String(row?.label || row?.name || row?.categoryLabel || 'Autre destination').trim().slice(0, 100),
      percent: Math.round(percent * 100) / 100,
    };
  }).filter(row => row.percent > 0);
  const percentTotal = rows.reduce((sum, row) => sum + row.percent, 0);
  if (percentTotal > 100.0001) throw new Error('La somme des affectations ne peut pas dépasser 100 %.');
  let assigned = 0;
  const result = rows.map((row, index) => {
    const value = index === rows.length - 1
      ? Math.round(total * percentTotal / 100) - assigned
      : Math.round(total * row.percent / 100);
    assigned += value;
    return { ...row, amount: value };
  });
  return {
    total,
    percentAssigned: Math.round(percentTotal * 100) / 100,
    assignedAmount: assigned,
    unassignedAmount: Math.max(0, total - assigned),
    allocations: result,
  };
}

export function calculateBusinessReservePosition({ cashBalance = 0, reserveBalance = 0, targetAmount = 0 } = {}) {
  const cash = Number(cashBalance) || 0;
  const reserve = Math.max(0, Number(reserveBalance) || 0);
  const target = Math.max(0, Number(targetAmount) || 0);
  return {
    cashBalance: cash,
    reserveBalance: reserve,
    targetAmount: target,
    targetGap: Math.max(0, target - reserve),
    targetReached: target > 0 && reserve >= target,
    availableOutsideReserve: cash - reserve,
    reserveShareOfCash: cash > 0 ? Math.round(reserve / cash * 10000) / 100 : null,
  };
}

export function calculateBusinessCashflowForecast({ startingCash = 0, movements = [] } = {}) {
  const opening = Number(startingCash) || 0;
  const byDate = new Map();
  for (const movement of Array.isArray(movements) ? movements : []) {
    if (!movement || movement.status === 'cancelled' || movement.status === 'paid' || movement.status === 'completed') continue;
    const date = String(movement.date || movement.dueDate || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const amount = Math.max(0, Number(movement.amount ?? movement.remaining) || 0);
    if (!amount) continue;
    const direction = ['inflow', 'income', 'receivable', 'expected_income'].includes(movement.direction || movement.type) ? 1 : -1;
    byDate.set(date, (byDate.get(date) || 0) + direction * amount);
  }
  let balance = opening, minimumBalance = opening, firstShortfallDate = null;
  const timeline = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, netMovement]) => {
    balance += netMovement;
    minimumBalance = Math.min(minimumBalance, balance);
    if (balance < 0 && !firstShortfallDate) firstShortfallDate = date;
    return { date, netMovement, projectedBalance: balance, shortfall: balance < 0 };
  });
  return {
    startingCash: opening,
    projectedEndingCash: balance,
    minimumProjectedCash: minimumBalance,
    firstShortfallDate,
    hasProjectedShortfall: minimumBalance < 0,
    timeline,
  };
}
