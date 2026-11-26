export function createExpenseBatchDraftRow(id, date = new Date().toISOString().slice(0, 10)) {
  return {
    id: String(id || ''),
    amount: '',
    categoryId: 'food',
    note: '',
    date: String(date || '').slice(0, 10),
    incomeSourceId: 'all',
    paymentMethod: '',
  };
}

export function getExpenseBatchTotal(rows = []) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + Math.max(0, Number(row?.amount) || 0), 0);
}

export function getExpenseBatchSourceTotals(rows = []) {
  const totals = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const sourceId = String(row?.incomeSourceId || 'all');
    if (!sourceId || sourceId === 'all') continue;
    totals[sourceId] = (totals[sourceId] || 0) + Math.max(0, Number(row?.amount) || 0);
  }
  return totals;
}

export function validateExpenseBatchRows(rows = [], options = {}) {
  const entries = Array.isArray(rows) ? rows : [];
  const sourceBalances = Array.isArray(options.sourceBalances) ? options.sourceBalances : [];
  if (!options.balancesReady) return { valid: false, error: 'Pata doit terminer la vérification des soldes avant la saisie multiple.' };
  if (!entries.length) return { valid: false, error: 'Ajoute au moins une dépense.' };
  if (entries.length > 30) return { valid: false, error: 'Une saisie multiple peut contenir au maximum 30 dépenses à la fois.' };
  for (let index = 0; index < entries.length; index += 1) {
    const row = entries[index] || {};
    const amount = Number(row.amount);
    if (!Number.isSafeInteger(amount) || amount <= 0) return { valid: false, error: 'Dépense ' + (index + 1) + ' : indique un montant entier supérieur à zéro.' };
    if (!String(row.categoryId || '').trim()) return { valid: false, error: 'Dépense ' + (index + 1) + ' : choisis une catégorie.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date || ''))) return { valid: false, error: 'Dépense ' + (index + 1) + ' : date invalide.' };
  }
  if (Number.isFinite(options.freeRemaining) && entries.length > options.freeRemaining) {
    return { valid: false, error: 'Il te reste ' + options.freeRemaining + ' enregistrement(s) sur ton compte gratuit ce mois-ci. Réduis le nombre de lignes ou passe à Premium.' };
  }

  const balanceById = new Map(sourceBalances.map((source) => [String(source.id), Math.max(0, Number(source.remaining) || 0)]));
  const sourceTotals = getExpenseBatchSourceTotals(entries);
  for (const [sourceId, amount] of Object.entries(sourceTotals)) {
    if (!balanceById.has(sourceId)) return { valid: false, error: 'Une source choisie n’est plus disponible. Actualise les soldes puis vérifie les lignes.' };
    if (amount > balanceById.get(sourceId)) {
      const source = sourceBalances.find((item) => String(item.id) === sourceId);
      return { valid: false, error: 'Les dépenses rattachées à « ' + (source?.source || 'ce revenu') + ' » totalisent ' + amount.toLocaleString('fr-FR') + ' FCFA, mais il ne reste que ' + balanceById.get(sourceId).toLocaleString('fr-FR') + ' FCFA.' };
    }
  }
  const total = getExpenseBatchTotal(entries);
  const availableTotal = sourceBalances.reduce((sum, source) => sum + Math.max(0, Number(source.remaining) || 0), 0);
  if (total > availableTotal) {
    return { valid: false, error: 'Le total de ' + total.toLocaleString('fr-FR') + ' FCFA dépasse les revenus disponibles (' + availableTotal.toLocaleString('fr-FR') + ' FCFA).' };
  }
  return { valid: true, error: '', total, sourceTotals };
}

/**
 * A stable retry key for one row. Repeated requests with identical row data
 * reuse the same Firestore idempotency record; editing an unsaved row changes
 * its fingerprint so it cannot replay the result of its previous contents.
 */
/**
 * A retry key belongs to the draft row, not its editable contents. If the
 * server committed a row but the response was lost, changing the amount while
 * retrying must not create a second expense under a new key.
 */
export function getExpenseBatchIdempotencyKey(row = {}) {
  const stableRowId = String(row.id || '').trim().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100);
  if (!stableRowId) throw new Error('Identifiant de ligne manquant pour la saisie multiple.');
  return 'batch_' + stableRowId;
}
