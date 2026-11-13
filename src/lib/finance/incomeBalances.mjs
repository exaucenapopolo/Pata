/**
 * Calcule les dépenses affectées à chaque source de revenu.
 * Les revenus sans dépense restent présents avec un total de zéro.
 */
export function sumIncomeSpendTotals(incomeIds = [], expenses = []) {
  const totals = new Map();
  for (const value of incomeIds) {
    const id = String(value || '').trim();
    if (id && !id.includes('/') && !totals.has(id)) totals.set(id, 0);
  }

  for (const expense of expenses) {
    const incomeId = String(expense?.incomeSourceId || '');
    if (!totals.has(incomeId)) continue;
    const amount = Number(expense?.amount);
    if (Number.isFinite(amount) && amount > 0) {
      totals.set(incomeId, totals.get(incomeId) + amount);
    }
  }

  return [...totals.entries()].map(([incomeId, spent]) => ({ incomeId, spent }));
}
