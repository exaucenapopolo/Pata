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