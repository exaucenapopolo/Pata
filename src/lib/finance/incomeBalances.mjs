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

/**
 * Argent réellement encaissé et utilisable comme source de financement.
 * Un emprunt en argent est inclus, mais une dette en nature et un transfert
 * interne (poche espèces) restent exclus.
 */
export function isIncomeCountedAsSource(item = {}) {
  if (item.cashPocket === true || item.flowType === 'cash_withdrawal') return false;
  if (item.flowType === 'debt_borrowed' || item.categoryId === 'debt_borrowed') {
    return item.availableAsFunding === true;
  }
  return item.neutralFlow !== true;
}

/**
 * Même règle que le disponible affiché dans la page Revenus :
 * seules les sources de financement encaissées et vérifiées sont additionnées.
 * Les remboursements reçus et les mouvements internes restent exclus.
 *
 * Retourne null tant que les soldes ne sont pas tous vérifiés, afin de ne
 * jamais présenter un montant provisoire comme un solde fiable.
 */
export function sumAvailableIncomeBalances(incomes = [], balancesReady = true) {
  const earningSources = (Array.isArray(incomes) ? incomes : []).filter((income) =>
    isIncomeCountedAsSource(income)
    && !income.cashPocket
    && income.flowType !== 'repayment_received'
    && income.categoryId !== 'debt_repayment_received'
  );

  if (balancesReady !== true || earningSources.some((income) => income.balanceAvailable !== true)) {
    return null;
  }

  return earningSources.reduce((sum, income) => {
    if (income.isExhausted === true) return sum;
    const remaining = Number(income.remaining);
    return sum + (Number.isFinite(remaining) && remaining > 0 ? remaining : 0);
  }, 0);
}
