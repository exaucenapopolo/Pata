export function buildDashboardMoneySummary({
  totalIncome = 0,
  totalExpense = 0,
  borrowedIncome = 0,
  debtRepaymentsReceived = 0,
  cashPocketIncome = 0,
  cashWithdrawals = 0,
  pendingOutflows = 0,
} = {}) {
  const safeAmount = (value) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
  };

  const accumulatedIncome = Math.max(
    0,
    safeAmount(totalIncome)
      - safeAmount(borrowedIncome)
      - safeAmount(debtRepaymentsReceived)
      - safeAmount(cashPocketIncome),
  );
  const totalOutflow = Math.max(
    0,
    safeAmount(totalExpense) - safeAmount(cashWithdrawals) - safeAmount(pendingOutflows),
  );

  return {
    accumulatedIncome,
    totalOutflow,
    remainingBalance: accumulatedIncome - totalOutflow,
  };
}
