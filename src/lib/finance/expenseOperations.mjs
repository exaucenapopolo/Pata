/**
 * Identifies a financial operation independently from its source allocations.
 * A shared expense is stored as multiple funding rows, but remains one operation.
 */

function cleanId(value) {
  return String(value || '').trim();
}

function timestampMillis(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value && typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedExpenseType(expense) {
  return String(expense?.expenseType || 'consumption');
}

function isLegacySharedPart(expense) {
  return /\s*\(Partagé(?:\s+\d+)?\)\s*$/i.test(String(expense?.note || ''));
}

function legacyParentMatches(parent, part) {
  if (!parent || !part || parent === part || isLegacySharedPart(parent)) return false;
  const childNote = String(part.note || '').replace(/\s*\(Partagé(?:\s+\d+)?\)\s*$/i, '').trim();
  if (String(parent.note || '').trim() !== childNote) return false;
  if (String(parent.date || '') !== String(part.date || '')) return false;
  if (String(parent.categoryId || '') !== String(part.categoryId || '')) return false;
  if (normalizedExpenseType(parent) !== normalizedExpenseType(part)) return false;
  for (const field of ['time', 'locationLabel', 'paymentMethod', 'details', 'projectId']) {
    if (String(parent[field] || '') !== String(part[field] || '')) return false;
  }
  const parentCreatedAt = timestampMillis(parent.createdAt);
  const partCreatedAt = timestampMillis(part.createdAt);
  // Legacy split rows were created in one Firestore transaction and therefore
  // have the same server timestamp. Without that evidence, do not merge rows.
  return parentCreatedAt !== null && partCreatedAt !== null && parentCreatedAt === partCreatedAt;
}

function getDirectOperationKey(expense, index) {
  const explicit = cleanId(expense?.sharedExpenseId) || cleanId(expense?.splitFromExpenseId);
  if (explicit) return explicit;
  return cleanId(expense?.id) || 'expense-row-' + index;
}

export function getExpenseOperationKeys(expenses = []) {
  const rows = Array.isArray(expenses) ? expenses : [];
  const keys = rows.map((expense, index) => getDirectOperationKey(expense, index));

  // Older shared expenses created before sharedExpenseId existed used the
  // "(Partagé)" note suffix. Recover a link only when exactly one parent row
  // has matching date, category, metadata and transaction timestamp.
  rows.forEach((part, partIndex) => {
    if (!isLegacySharedPart(part) || cleanId(part?.sharedExpenseId) || cleanId(part?.splitFromExpenseId)) return;
    const candidates = [];
    rows.forEach((parent, parentIndex) => {
      if (parentIndex !== partIndex && !cleanId(parent?.sharedExpenseId)
        && !cleanId(parent?.splitFromExpenseId) && legacyParentMatches(parent, part)) {
        candidates.push(parentIndex);
      }
    });
    if (candidates.length === 1) keys[partIndex] = keys[candidates[0]];
  });

  return keys;
}

export function countExpenseOperations(expenses = []) {
  const rows = (Array.isArray(expenses) ? expenses : []).filter((expense) => expense?.neutralFlow !== true);
  return new Set(getExpenseOperationKeys(rows)).size;
}

/**
 * During a bulk reassignment, release allocations already attached to the
 * destination source first. This prevents a valid aggregate balance from
 * appearing temporarily insufficient while the remaining rows are moved.
 */
export function sortExpenseOperationsForSourceReassignment(operations = [], destinationIncomeId) {
  const rows = Array.isArray(operations) ? operations : [];
  const targetId = String(destinationIncomeId || '').trim();
  const amountAlreadyOnTarget = (operation) => (operation?.rows || [])
    .filter((row) => String(row?.incomeSourceId || '') === targetId)
    .reduce((sum, row) => sum + Math.max(0, Number(row?.amount) || 0), 0);
  return rows.map((operation, index) => ({ operation, index, allocated: amountAlreadyOnTarget(operation) }))
    .sort((a, b) => b.allocated - a.allocated || a.index - b.index)
    .map((entry) => entry.operation);
}
