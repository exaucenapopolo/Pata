const BILL_TYPES = new Set(['electricity', 'water', 'rent', 'television', 'internet', 'telephone', 'taxes', 'insurance', 'school', 'subscription', 'other']);
const BILL_FREQUENCIES = new Set(['weekly', 'monthly', 'quarterly', 'yearly', 'once']);
const BILL_CATEGORIES = new Set(['food', 'transport', 'housing', 'internet', 'health', 'leisure', 'gift_donation', 'contribution', 'other']);

function isValidDate(value) {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(String(value) + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normalizeSmsBillPayment(input = {}, paidDate) {
  if (!isValidDate(paidDate)) throw new Error('La date du paiement de facture est invalide.');
  const name = String(input.name || '').trim().replace(/\\s+/g, ' ').slice(0, 100);
  const billType = String(input.billType || 'other').trim();
  const frequency = String(input.frequency || 'once').trim();
  const expenseCategoryId = String(input.expenseCategoryId || 'other').trim();
  const requestedNextDueDate = String(input.nextDueDate || '').trim();

  if (!name) throw new Error('Indique le nom de la facture à suivre.');
  if (!BILL_TYPES.has(billType)) throw new Error('Le type de facture sélectionné est invalide.');
  if (!BILL_FREQUENCIES.has(frequency)) throw new Error('La fréquence de cette facture est invalide.');
  if (!BILL_CATEGORIES.has(expenseCategoryId)) throw new Error('La catégorie de cette facture est invalide.');

  const recurring = frequency !== 'once';
  if (recurring && !isValidDate(requestedNextDueDate)) {
    throw new Error('Indique la prochaine échéance pour recevoir un rappel.');
  }
  if (recurring && requestedNextDueDate <= paidDate) {
    throw new Error('La prochaine échéance doit être postérieure au paiement détecté.');
  }

  const nextDueDate = recurring ? requestedNextDueDate : paidDate;
  return {
    name,
    billType,
    amount: null,
    isVariable: false,
    frequency,
    nextDueDate,
    dueDay: Number(nextDueDate.slice(8, 10)),
    pendingDetails: false,
    frequencyPending: false,
    reminderDaysBefore: 3,
    expenseCategoryId,
    active: recurring,
    paidDate,
  };
}
