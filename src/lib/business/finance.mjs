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
