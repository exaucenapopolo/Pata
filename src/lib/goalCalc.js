/**
 * Calcule le plan de cotisation d'un objectif.
 * Retourne le montant attendu par jour / semaine / mois et
 * les pénalités cumulées pour les dépôts manqués (par semaine).
 */
export function computeGoalPlan(goal, deposits = [], today = new Date()) {
  if (!goal) return null;
  const start = new Date(goal.startDate);
  const deadline = new Date(goal.deadline);
  const totalDays = Math.max(1, Math.ceil((deadline - start) / 86400000));
  const totalWeeks = Math.max(1, Math.ceil(totalDays / 7));
  const totalMonths = Math.max(1, Math.ceil(totalDays / 30));

  const perDay = goal.targetAmount / totalDays;
  const perWeek = goal.targetAmount / totalWeeks;
  const perMonth = goal.targetAmount / totalMonths;

  const totalDeposited = deposits.reduce((s, d) => s + Number(d.amount || 0), 0);
  const weeksElapsed = Math.max(
    0,
    Math.min(totalWeeks, Math.floor((today - start) / (7 * 86400000)))
  );
  const expectedSoFar = perWeek * weeksElapsed;
  const penalty = Math.max(0, (expectedSoFar - totalDeposited)) > 0
    ? Math.ceil((expectedSoFar - totalDeposited) / perWeek) * (goal.penaltyAmount || 0)
    : 0;

  const totalDue = goal.targetAmount + penalty;
  const progress = Math.min(100, (totalDeposited / totalDue) * 100);
  const remaining = Math.max(0, totalDue - totalDeposited);
  const daysLeft = Math.max(0, Math.ceil((deadline - today) / 86400000));

  return {
    perDay: Math.round(perDay),
    perWeek: Math.round(perWeek),
    perMonth: Math.round(perMonth),
    totalDeposited,
    expectedSoFar: Math.round(expectedSoFar),
    penalty,
    totalDue: Math.round(totalDue),
    progress,
    remaining: Math.round(remaining),
    daysLeft,
    isLate: penalty > 0,
  };
    }
