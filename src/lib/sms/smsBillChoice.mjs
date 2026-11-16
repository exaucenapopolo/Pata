const BILL_TYPES = new Set([
  'electricity', 'water', 'rent', 'television', 'internet',
  'telephone', 'taxes', 'insurance', 'school', 'subscription', 'other',
]);
const BILL_FREQUENCIES = new Set(['weekly', 'monthly', 'quarterly', 'yearly', 'once']);
const BILL_CATEGORIES = new Set([
  'food', 'transport', 'housing', 'internet', 'health',
  'leisure', 'gift_donation', 'contribution', 'other',
]);

export function inferSmsBillType(counterparty) {
  const value = String(counterparty || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/(eneo|electricite|electricity|sonel)/.test(value)) return 'electricity';
  if (/(camwater|water|eau)/.test(value)) return 'water';
  if (/(canal|television|tv subscription)/.test(value)) return 'television';
  if (/(internet|fibre|fiber|wifi|data|forfait internet|bundle internet)/.test(value)) return 'internet';
  if (/(loyer|rent)/.test(value)) return 'rent';
  return 'other';
}

export function smsBillCategory(billType) {
  if (['electricity', 'water', 'rent', 'taxes', 'insurance'].includes(billType)) return 'housing';
  if (['internet', 'telephone', 'television', 'subscription'].includes(billType)) return 'internet';
  return 'other';
}

/**
 * Resolves the values used by both the SMS bill editor and its confirmation
 * request. A transferred amount is a one-time paid bill unless the user
 * explicitly chooses a recurring frequency.
 */
export function resolveSmsBillChoice(item = {}, choice = {}) {
  const inferredType = inferSmsBillType(item.counterparty);
  const requestedType = String(choice.billType || inferredType);
  const billType = BILL_TYPES.has(requestedType) ? requestedType : 'other';
  const requestedCategory = String(choice.billExpenseCategoryId || choice.categoryId || '');
  const billExpenseCategoryId = BILL_CATEGORIES.has(requestedCategory)
    ? requestedCategory
    : smsBillCategory(billType);
  const requestedFrequency = String(choice.billFrequency || 'once');
  const billFrequency = BILL_FREQUENCIES.has(requestedFrequency) ? requestedFrequency : 'once';
  const defaultName = item.counterparty ? 'Facture ' + String(item.counterparty).trim() : '';
  const billName = String(choice.billName ?? defaultName).trim().slice(0, 100);

  return { billName, billType, billFrequency, billExpenseCategoryId };
}
