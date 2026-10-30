export const MIN_PENALTY = 700;

export function computeGoalPlan(goal, deposits = [], today = new Date()) {
  if (!goal) return null;

  const frequencyDays = Math.max(1, Number(goal.frequencyDays) || 7);
  const durationDays = Math.max(frequencyDays, Number(goal.durationDays) || 30);
  const targetAmount = Math.max(0, Number(goal.targetAmount) || 0);

  const start = new Date(goal.startDate || new Date().toISOString().slice(0, 10));
  const deadline = new Date(start.getTime() + durationDays * 86400000);

  const totalPayments = Math.max(1, Math.ceil(durationDays / frequencyDays));
  const amountPerPayment = Math.round(targetAmount / totalPayments);

  const daysElapsed = Math.min(
    durationDays,
    Math.max(0, Math.floor((today - start) / 86400000))
  );
  const paymentsDue = Math.min(
    totalPayments,
    Math.floor(daysElapsed / frequencyDays) + 1
  );

  const totalDeposited = deposits.reduce((s, d) => s + Number(d.amount || 0), 0);
  const expectedAmount = paymentsDue * amountPerPayment;
  const shortfall = Math.max(0, expectedAmount - totalDeposited);
  const missedPayments = amountPerPayment > 0 ? Math.ceil(shortfall / amountPerPayment) : 0;

  // Amende minimum 700 FCFA — forcée même sur les anciens objectifs
  const unitPenalty = Math.max(MIN_PENALTY, Number(goal.penaltyAmount) || MIN_PENALTY);
  const penalty = missedPayments * unitPenalty;

  const totalDue = targetAmount + penalty;
  const progress = totalDue > 0 ? Math.min(100, (totalDeposited / totalDue) * 100) : 0;
  const remaining = Math.max(0, totalDue - totalDeposited);
  const daysLeft = Math.max(0, Math.ceil((deadline - today) / 86400000));
  const isReached = totalDeposited >= targetAmount;

  return {
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
  };
}

export function resolveDurationDays(preset, customDays) {
  if (preset === 'custom') {
    const v = parseInt(customDays, 10);
    return Number.isFinite(v) && v > 0 ? v : 30;
  }
  const map = { '7': 7, '14': 14, '30': 30, '60': 60, '90': 90, '180': 180, '270': 270, '365': 365, '730': 730 };
  return map[preset] || 30;
}

export function resolveFrequencyDays(preset, customDays) {
  if (preset === 'custom') {
    const v = parseInt(customDays, 10);
    return Number.isFinite(v) && v > 0 ? v : 7;
  }
  const map = { '1': 1, '3': 3, '5': 5, '7': 7, '14': 14, '30': 30 };
  return map[preset] || 7;
}
