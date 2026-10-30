export const MIN_PENALTY = 700;
export const LOAN_INTEREST_RATE = 0.05; // 5%

export function computeGoalPlan(goal, deposits = [], today = new Date()) {
  if (!goal) return null;

  const isPiggybank = goal.type === 'piggybank';
  const totalDeposited = deposits.reduce((s, d) => s + Number(d.amount || 0), 0);

  // 🟢 CAS SPÉCIAL : TIRELIRE (Pas de date, pas de pénalité, pas de dette)
  if (isPiggybank) {
    return {
      type: 'piggybank',
      totalDeposited,
      isReached: true, // Considéré comme "atteint" pour bypasser les blocages de retrait
      totalDebt: 0,
      penalty: 0,
      progress: 100,
      daysLeft: 0,
      isLate: false,
      notStarted: false,
      expectedAmount: totalDeposited,
      shortfall: 0,
      amountPerPayment: 0,
      totalPayments: 0,
      frequencyDays: 0,
      startDate: null,
      deadline: null,
    };
  }

  // 🟢 CAS CLASSIQUE : OBJECTIF
  const frequencyDays = Math.max(1, Number(goal.frequencyDays) || 7);
  const start = new Date(goal.startDate || new Date().toISOString().slice(0, 10));
  const deadline = new Date(goal.deadline || start.getTime() + 30 * 86400000);
  const targetAmount = Math.max(0, Number(goal.targetAmount) || 0);

  const durationDays = Math.max(frequencyDays, Math.ceil((deadline - start) / 86400000));
  const totalPayments = Math.max(1, Math.ceil(durationDays / frequencyDays));
  const amountPerPayment = Math.round(targetAmount / totalPayments);

  let daysElapsed = Math.floor((today - start) / 86400000);
  daysElapsed = Math.max(0, Math.min(durationDays, daysElapsed));
  
  let paymentsDue = 0;
  if (today >= start) {
    paymentsDue = Math.min(totalPayments, Math.floor(daysElapsed / frequencyDays) + 1);
  }

  const expectedAmount = paymentsDue * amountPerPayment;
  const shortfall = Math.max(0, expectedAmount - totalDeposited);
  const missedPayments = amountPerPayment > 0 ? Math.ceil(shortfall / amountPerPayment) : 0;
  
  const totalDebt = Number(goal.debtBalance) || 0;
  const unitPenalty = Math.max(MIN_PENALTY, Number(goal.penaltyAmount) || MIN_PENALTY);
  
  const penalty = missedPayments > 0 && totalDebt === 0 ? missedPayments * unitPenalty : 0;

  const totalDue = targetAmount + penalty;
  const progress = totalDue > 0 ? Math.min(100, (totalDeposited / totalDue) * 100) : 0;
  const remaining = Math.max(0, totalDue - totalDeposited);
  const daysLeft = Math.max(0, Math.ceil((deadline - today) / 86400000));
  const isReached = totalDeposited >= targetAmount;
  const notStarted = today < start;

  return {
    type: 'goal',
    frequencyDays,
    durationDays,
    totalPayments,
    amountPerPayment,
    startDate: start,
    deadline,
    daysElapsed,
    paymentsDue,
    totalDeposited,
    expectedAmount,
    shortfall,
    missedPayments,
    unitPenalty,
    penalty,
    totalDue,
    progress,
    remaining,
    daysLeft,
    isLate: penalty > 0,
    isReached,
    totalDebt,
    notStarted,
  };
}

export function resolveFrequencyDays(preset, customDays) {
  if (preset === 'custom') {
    const v = parseInt(customDays, 10);
    return Number.isFinite(v) && v > 0 ? v : 7;
  }
  const map = { '1': 1, '3': 3, '5': 5, '7': 7, '14': 14, '30': 30 };
  return map[preset] || 7;
}
