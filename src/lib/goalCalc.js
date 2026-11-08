export const MIN_PENALTY = 700;
export const LOAN_INTEREST_RATE = 0.05; // 5%

export function computeGoalPlan(goal, deposits = [], today = new Date()) {
  if (!goal) return null;

  const isPiggybank = goal.type === 'piggybank';
  const totalDeposited = deposits.reduce((s, d) => s + Number(d.amount || 0), 0);

  // 🟢 CAS SPÉCIAL : TIRELIRE
  if (isPiggybank) {
    const targetAmount = Math.max(0, Number(goal.targetAmount) || 0);
    const progress = targetAmount > 0 ? Math.min(100, (totalDeposited / targetAmount) * 100) : 0;
    return {
      type: 'piggybank',
      totalDeposited,
      targetAmount,
      hasTarget: targetAmount > 0,
      isReached: true,
      totalDebt: 0,
      penalty: 0,
      progress,
      remaining: targetAmount > 0 ? Math.max(0, targetAmount - totalDeposited) : 0,
      daysLeft: 0,
      isLate: false,
      notStarted: false,
      expectedAmount: targetAmount > 0 ? targetAmount : totalDeposited,
      shortfall: 0,
      amountPerPayment: 0,
      totalPayments: 0,
      frequencyDays: 0,
      startDate: null,
      deadline: null,
      nextPaymentDate: null,
      perDay: 0,
      perWeek: 0,
      perMonth: 0,
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

  const todayMs = today.getTime();
  const startMs = start.getTime();
  const msPerDay = 86400000;
  
  let daysElapsed = Math.floor((todayMs - startMs) / msPerDay);
  daysElapsed = Math.max(0, Math.min(durationDays, daysElapsed));
  
  // 🟢 CORRECTION MAJEURE : Le 1er paiement est dû APRÈS "frequencyDays" jours.
  // Ex: si fréquence = 30 jours, le 1er paiement est dû au jour 30, pas au jour 1.
  let paymentsDue = 0;
  if (todayMs >= startMs) {
    paymentsDue = Math.floor(daysElapsed / frequencyDays);
    
    // Si la date limite est complètement dépassée, tous les paiements sont exigibles
    if (todayMs >= deadline.getTime()) {
      paymentsDue = totalPayments;
    }
  }

  const expectedAmount = paymentsDue * amountPerPayment;
  const shortfall = Math.max(0, expectedAmount - totalDeposited);
  const missedPayments = amountPerPayment > 0 ? Math.ceil(shortfall / amountPerPayment) : 0;
  
  const totalDebt = Number(goal.debtBalance) || 0;
  // Les nouveaux objectifs peuvent être suivis sans pénalité. Les anciennes
  // épargnes n’ayant pas le champ penaltyEnabled conservent leur comportement
  // historique lorsque penaltyAmount était déjà défini.
  const penaltyEnabled = goal.penaltyEnabled === undefined
    ? Number(goal.penaltyAmount) > 0
    : goal.penaltyEnabled === true;
  const unitPenalty = penaltyEnabled
    ? Math.max(MIN_PENALTY, Number(goal.penaltyAmount) || MIN_PENALTY)
    : 0;

  // Une pénalité n'est calculée que si l'utilisateur l'a explicitement activée.
  const penalty = penaltyEnabled && missedPayments > 0 && totalDebt === 0 ? missedPayments * unitPenalty : 0;

  // Calcul de la prochaine date de paiement (pour l'afficher)
  let nextPaymentDate = null;
  let nextPaymentAmount = amountPerPayment;
  
  if (todayMs < deadline.getTime() && totalDeposited < targetAmount) {
    const nextDueIndex = paymentsDue + 1;
    if (nextDueIndex <= totalPayments) {
      nextPaymentDate = new Date(startMs + nextDueIndex * frequencyDays * msPerDay);
    }
  }

  // Calculs des options de paiement (par jour, semaine, mois) pour le détail
  const perDay = Math.round(targetAmount / durationDays);
  const perWeek = Math.round(targetAmount / (durationDays / 7));
  const perMonth = Math.round(targetAmount / (durationDays / 30));

  const totalDue = targetAmount + penalty;
  const progress = totalDue > 0 ? Math.min(100, (totalDeposited / totalDue) * 100) : 0;
  const remaining = Math.max(0, targetAmount - totalDeposited);
  const daysLeft = Math.max(0, Math.ceil((deadline - today) / msPerDay));
  const isReached = totalDeposited >= targetAmount;
  const notStarted = todayMs < startMs;

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
    penaltyEnabled,
    penalty,
    totalDue,
    progress,
    remaining,
    daysLeft,
    isLate: penalty > 0,
    isReached,
    totalDebt,
    notStarted,
    nextPaymentDate,
    nextPaymentAmount,
    perDay,
    perWeek,
    perMonth,
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
