import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';

const MAX_AMOUNT = 1_000_000_000;
const RESOURCE_NAMES = new Set(['clients', 'suppliers', 'partners', 'contracts', 'obligations', 'invoices', 'budgets']);
const SENSITIVE_RESOURCES = new Set(['clients', 'suppliers', 'partners', 'contracts', 'obligations', 'invoices']);

export class BusinessError extends Error {
  constructor(message, status = 400, code = 'BUSINESS_ERROR') {
    super(message);
    this.name = 'BusinessError';
    this.status = status;
    this.code = code;
  }
}

const cleanText = (value, max = 160) => String(value ?? '').trim().slice(0, max);
const validId = (value) => {
  const id = cleanText(value, 150);
  if (!id || id.includes('/') || id.includes('.')) throw new BusinessError('Identifiant professionnel invalide.');
  return id;
};
const parseAmount = (value, label = 'Montant') => {
  const amount = Math.round(Number(value));
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw new BusinessError(label + ' invalide. Indique un montant positif en FCFA.');
  }
  return amount;
};
const parseDate = (value, fallback = todayDouala()) => {
  const date = cleanText(value || fallback, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BusinessError('Date invalide. Utilise le format AAAA-MM-JJ.');
  const parsed = new Date(date + 'T12:00:00.000Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new BusinessError('Date invalide.');
  return date;
};
const todayDouala = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const monthDouala = () => todayDouala().slice(0, 7);
const toDate = (value) => value?.toDate ? value.toDate() : value ? new Date(value) : null;
const isPremium = (profile = {}) => {
  const expiry = toDate(profile.premiumUntil);
  return Boolean(expiry && Number.isFinite(expiry.getTime()) && expiry > new Date());
};
const usersRef = () => adminDb.collection('users');
const businessesRef = () => adminDb.collection('businesses');
const userBusinessRefs = (uid) => usersRef().doc(uid).collection('businessMemberships');

function premiumRequired() {
  throw new BusinessError('La gestion d’entreprise est réservée à Pata Premium. Active Premium pour créer ou gérer ton entreprise.', 403, 'PREMIUM_REQUIRED');
}

function requireWritable(context) {
  if (!context.premiumActive) premiumRequired();
  if (context.business.status === 'archived') throw new BusinessError('Cette entreprise est archivée.', 403, 'BUSINESS_ARCHIVED');
  if (!['owner', 'admin', 'finance'].includes(context.role)) {
    throw new BusinessError('Tu disposes uniquement d’un accès en consultation.', 403, 'READ_ONLY');
  }
}

function serializeValue(value) {
  if (value?.toDate) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = serializeValue(item);
    return result;
  }
  return value;
}

function serializeDocument(snapshot) {
  return { id: snapshot.id, ...serializeValue(snapshot.data() || {}) };
}

async function getBusinessContext(uid, businessId, { allowSensitiveRead = true } = {}) {
  if (!uid) throw new BusinessError('Session expirée. Reconnecte-toi puis réessaie.', 401, 'AUTH_REQUIRED');
  const id = validId(businessId);
  const userRef = usersRef().doc(uid);
  const businessRef = businessesRef().doc(id);
  const memberRef = businessRef.collection('members').doc(uid);
  const [profileSnap, businessSnap, memberSnap] = await Promise.all([
    userRef.get(), businessRef.get(), memberRef.get(),
  ]);
  if (!profileSnap.exists) throw new BusinessError('Profil utilisateur introuvable.', 401, 'PROFILE_NOT_FOUND');
  if (!businessSnap.exists || !memberSnap.exists) throw new BusinessError('Entreprise introuvable ou accès non autorisé.', 404, 'BUSINESS_NOT_FOUND');
  const profile = profileSnap.data() || {};
  const business = businessSnap.data() || {};
  const member = memberSnap.data() || {};
  if (member.status === 'revoked' || member.active === false) throw new BusinessError('Ton accès à cette entreprise a été désactivé.', 403, 'MEMBERSHIP_REVOKED');
  const premiumActive = isPremium(profile);
  const role = member.role || (business.ownerId === uid ? 'owner' : 'viewer');
  if (!premiumActive && allowSensitiveRead === false) {
    throw new BusinessError('Ces informations sont réservées aux abonnés Pata Premium. Tu peux consulter le résumé et l’historique de ton entreprise.', 403, 'PREMIUM_LOCKED');
  }
  return { uid, businessId: id, userRef, businessRef, memberRef, profile, business: { id, ...business }, member, role, premiumActive };
}

export async function listUserBusinesses(uid) {
  const profileSnap = await usersRef().doc(uid).get();
  const profile = profileSnap.exists ? profileSnap.data() || {} : {};
  const memberships = await userBusinessRefs(uid).limit(50).get();
  const businesses = await Promise.all(memberships.docs.map(async (membership) => {
    const businessSnap = await businessesRef().doc(membership.id).get();
    if (!businessSnap.exists || membership.data()?.active === false || membership.data()?.status === 'revoked') return null;
    const business = businessSnap.data() || {};
    return {
      id: businessSnap.id,
      name: cleanText(business.name, 100),
      activity: cleanText(business.activity, 100),
      role: cleanText(membership.data()?.role || 'viewer', 20),
      createdAt: serializeValue(business.createdAt || null),
      status: business.status || 'active',
      readOnly: !isPremium(profile) || !['owner', 'admin', 'finance'].includes(membership.data()?.role || 'viewer'),
      premiumActive: isPremium(profile),
    };
  }));
  return { businesses: businesses.filter(Boolean), premiumActive: isPremium(profile) };
}

export async function createBusiness(uid, input = {}) {
  const name = cleanText(input.name, 100);
  if (name.length < 2) throw new BusinessError('Indique un nom d’entreprise comportant au moins deux caractères.');
  const activity = cleanText(input.activity, 120);
  const legalForm = cleanText(input.legalForm, 80);
  const city = cleanText(input.city, 80);
  const phone = cleanText(input.phone, 30);
  const currency = input.currency === 'XAF' ? 'XAF' : 'XAF';
  const businessRef = businessesRef().doc();
  const userRef = usersRef().doc(uid);
  const membershipRef = businessRef.collection('members').doc(uid);
  const reverseMembershipRef = userBusinessRefs(uid).doc(businessRef.id);
  const accountRef = businessRef.collection('accounts').doc('main');
  await adminDb.runTransaction(async (transaction) => {
    const profileSnap = await transaction.get(userRef);
    if (!profileSnap.exists) throw new BusinessError('Profil utilisateur introuvable.', 401, 'PROFILE_NOT_FOUND');
    if (!isPremium(profileSnap.data() || {})) premiumRequired();
    transaction.create(businessRef, {
      name, activity, legalForm, city, phone, currency,
      country: 'CM', ownerId: uid, status: 'active',
      totalIncome: 0, totalExpense: 0, ownerContributions: 0, ownerWithdrawals: 0,
      cashBalance: 0, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(membershipRef, { uid, role: 'owner', active: true, status: 'active', joinedAt: FieldValue.serverTimestamp() });
    transaction.set(reverseMembershipRef, { businessId: businessRef.id, role: 'owner', active: true, createdAt: FieldValue.serverTimestamp() });
    transaction.create(accountRef, {
      name: 'Caisse principale', type: 'cash', currency,
      openingBalance: 0, balance: 0, active: true,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { id: businessRef.id, name, activity, role: 'owner' };
}

export async function getBusinessOverview(uid, businessId) {
  const context = await getBusinessContext(uid, businessId);
  const month = monthDouala();
  const [accountsSnap, monthSnap, recentSnap] = await Promise.all([
    context.businessRef.collection('accounts').where('active', '==', true).limit(30).get(),
    context.businessRef.collection('monthlySummaries').doc(month).get(),
    context.businessRef.collection('transactions').orderBy('createdAt', 'desc').limit(6).get(),
  ]);
  const accounts = accountsSnap.docs.map(serializeDocument);
  const accountBalance = accounts.reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
  const monthly = monthSnap.exists ? monthSnap.data() || {} : {};
  const recentTransactions = recentSnap.docs.map(serializeDocument);
  const result = {
    business: {
      id: context.business.id, name: context.business.name, activity: context.business.activity,
      city: context.business.city, currency: context.business.currency || 'XAF',
      status: context.business.status || 'active',
    },
    premiumActive: context.premiumActive,
    readOnly: !context.premiumActive || !['owner', 'admin', 'finance'].includes(context.role),
    role: context.role,
    month,
    accounts: accounts.map((account) => ({
      id: account.id, name: account.name, type: account.type, balance: Number(account.balance) || 0,
    })),
    totals: {
      cashBalance: accountBalance,
      income: Math.max(0, Number(monthly.income) || 0),
      expense: Math.max(0, Number(monthly.expense) || 0),
      ownerContributions: Math.max(0, Number(monthly.ownerContributions) || 0),
      ownerWithdrawals: Math.max(0, Number(monthly.ownerWithdrawals) || 0),
      receivables: Math.max(0, Number(context.business.totalReceivables) || 0),
      payables: Math.max(0, Number(context.business.totalPayables) || 0),
      result: (Number(monthly.income) || 0) - (Number(monthly.expense) || 0),
    },
    recentTransactions,
    lockedModules: [...SENSITIVE_RESOURCES],
  };
  return result;
}

export async function listBusinessTransactions(uid, businessId, { limit: requestedLimit = 100, type = '' } = {}) {
  const context = await getBusinessContext(uid, businessId);
  const safeLimit = Math.max(1, Math.min(200, Number(requestedLimit) || 100));
  let query = context.businessRef.collection('transactions').orderBy('createdAt', 'desc').limit(safeLimit);
  const snapshot = await query.get();
  let rows = snapshot.docs.map(serializeDocument);
  if (type) rows = rows.filter((item) => item.type === type);
  return { transactions: rows, readOnly: !context.premiumActive || !['owner', 'admin', 'finance'].includes(context.role), hasMore: snapshot.size === safeLimit };
}

export async function listBusinessAccounts(uid, businessId) {
  const context = await getBusinessContext(uid, businessId);
  const snapshot = await context.businessRef.collection('accounts').where('active', '==', true).limit(30).get();
  return { accounts: snapshot.docs.map((item) => serializeDocument(item)), readOnly: !context.premiumActive || !['owner', 'admin', 'finance'].includes(context.role) };
}

function normalizeTransaction(input = {}) {
  const type = input.type === 'expense' ? 'expense' : 'income';
  const amount = parseAmount(input.amount, type === 'income' ? 'Revenu' : 'Dépense');
  const date = parseDate(input.date);
  const title = cleanText(input.title || input.source || input.categoryId || (type === 'income' ? 'Revenu professionnel' : 'Dépense professionnelle'), 120);
  const categoryId = cleanText(input.categoryId || (type === 'income' ? 'other_income' : 'other'), 80);
  const paymentMethod = cleanText(input.paymentMethod, 40);
  const note = cleanText(input.note, 500);
  const allowedMethods = ['cash', 'mtn_momo', 'orange_money', 'bank_transfer', 'card', 'other'];
  if (paymentMethod && !allowedMethods.includes(paymentMethod)) throw new BusinessError('Moyen de paiement invalide.');
  return { type, amount, date, month: date.slice(0, 7), title, categoryId, paymentMethod, note };
}

export async function createBusinessTransaction(uid, businessId, input = {}) {
  const context = await getBusinessContext(uid, businessId);
  requireWritable(context);
  const normalized = normalizeTransaction(input);
  const accountId = validId(input.accountId || 'main');
  const flowType = ['owner_contribution', 'owner_withdrawal'].includes(input.flowType) ? input.flowType : 'normal';
  if (flowType === 'owner_contribution' || flowType === 'owner_withdrawal') {
    throw new BusinessError('Les apports et retraits du propriétaire doivent utiliser le parcours de transfert dédié.');
  }
  const businessRef = context.businessRef;
  const accountRef = businessRef.collection('accounts').doc(accountId);
  const transactionRef = businessRef.collection('transactions').doc();
  const monthRef = businessRef.collection('monthlySummaries').doc(normalized.month);
  await adminDb.runTransaction(async (transaction) => {
    const [profileSnap, memberSnap, accountSnap, businessSnap] = await Promise.all([
      transaction.get(context.userRef), transaction.get(context.memberRef),
      transaction.get(accountRef), transaction.get(businessRef),
    ]);
    if (!profileSnap.exists || !isPremium(profileSnap.data() || {})) premiumRequired();
    if (!memberSnap.exists || !['owner', 'admin', 'finance'].includes(memberSnap.data()?.role || '')) throw new BusinessError('Tu ne disposes pas des droits nécessaires pour modifier cette entreprise.', 403, 'READ_ONLY');
    if (!businessSnap.exists || businessSnap.data()?.status === 'archived') throw new BusinessError('Entreprise indisponible.', 404);
    if (!accountSnap.exists || accountSnap.data()?.active === false) throw new BusinessError('Compte financier introuvable ou désactivé.');
    const signedAmount = normalized.type === 'income' ? normalized.amount : -normalized.amount;
    transaction.create(transactionRef, {
      ...normalized, accountId, flowType: 'normal', direction: normalized.type,
      status: 'posted', createdBy: uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(accountRef, { balance: FieldValue.increment(signedAmount), updatedAt: FieldValue.serverTimestamp() });
    transaction.update(businessRef, {
      cashBalance: FieldValue.increment(signedAmount),
      ...(normalized.type === 'income' ? { totalIncome: FieldValue.increment(normalized.amount) } : { totalExpense: FieldValue.increment(normalized.amount) }),
      updatedAt: FieldValue.serverTimestamp(), lastActivityAt: FieldValue.serverTimestamp(),
    });
    transaction.set(monthRef, {
      month: normalized.month,
      ...(normalized.type === 'income' ? { income: FieldValue.increment(normalized.amount) } : { expense: FieldValue.increment(normalized.amount) }),
      transactionCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { id: transactionRef.id, success: true, transaction: { ...normalized, accountId, flowType: 'normal', direction: normalized.type } };
}

export async function transferPersonalIncomeToBusiness(uid, businessId, input = {}) {
  const context = await getBusinessContext(uid, businessId);
  requireWritable(context);
  const incomeId = validId(input.incomeId);
  const accountId = validId(input.accountId || 'main');
  const amount = parseAmount(input.amount, 'Montant du transfert');
  const date = parseDate(input.date);
  const requestId = cleanText(input.requestId, 100).replace(/[^a-zA-Z0-9_-]/g, '_');
  if (requestId.length < 8) throw new BusinessError('Identifiant de transfert invalide.');
  const businessRef = context.businessRef;
  const userRef = context.userRef;
  const incomeRef = userRef.collection('incomes').doc(incomeId);
  const personalExpenseRef = userRef.collection('expenses').doc();
  const businessAccountRef = businessRef.collection('accounts').doc(accountId);
  const businessTransactionRef = businessRef.collection('transactions').doc();
  const transferRef = businessRef.collection('transfers').doc(requestId);
  const monthRef = businessRef.collection('monthlySummaries').doc(date.slice(0, 7));
  let resultId = businessTransactionRef.id;

  await adminDb.runTransaction(async (transaction) => {
    const [profileSnap, incomeSnap, expensesSnap, accountSnap, businessSnap, memberSnap, duplicateSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(incomeRef),
      transaction.get(userRef.collection('expenses').where('incomeSourceId', '==', incomeId)),
      transaction.get(businessAccountRef),
      transaction.get(businessRef),
      transaction.get(context.memberRef),
      transaction.get(transferRef),
    ]);
    if (duplicateSnap.exists) { resultId = duplicateSnap.data()?.businessTransactionId || resultId; return; }
    if (!profileSnap.exists || !isPremium(profileSnap.data() || {})) premiumRequired();
    if (!incomeSnap.exists) throw new BusinessError('La source de revenu personnelle n’existe plus.');
    if (!accountSnap.exists || accountSnap.data()?.active === false) throw new BusinessError('Compte financier de l’entreprise introuvable.');
    if (!businessSnap.exists || businessSnap.data()?.status === 'archived') throw new BusinessError('Entreprise indisponible.');
    if (!memberSnap.exists || !['owner', 'admin', 'finance'].includes(memberSnap.data()?.role || '')) throw new BusinessError('Tu ne disposes pas des droits nécessaires pour modifier cette entreprise.', 403, 'READ_ONLY');
    const income = incomeSnap.data() || {};
    if (income.neutralFlow === true || income.cashPocket === true || income.flowType === 'repayment_received'
      || income.categoryId === 'debt_repayment_received' || income.flowType === 'debt_borrowed' && income.availableAsFunding !== true) {
      throw new BusinessError('Cette source de revenu ne peut pas financer un transfert vers l’entreprise.');
    }
    const spent = expensesSnap.docs.reduce((sum, item) => sum + (Number(item.data()?.amount) || 0), 0);
    const remaining = Math.max(0, (Number(income.amount) || 0) - spent);
    if (amount > remaining) throw new BusinessError('Le montant dépasse le solde encore disponible de cette source : ' + remaining.toLocaleString('fr-FR') + ' FCFA.');
    const profile = profileSnap.data() || {};
    const month = date.slice(0, 7);
    const personalBudgetSummaryRef = userRef.collection('budgetSpendSummaries').doc(month);
    const personalBudgetSummarySnap = await transaction.get(personalBudgetSummaryRef);
    const transferExpense = {
      amount, categoryId: 'business_transfer', date, month,
      note: 'Transfert vers l’entreprise ' + cleanText(businessSnap.data()?.name, 100),
      incomeSourceId: incomeId, incomeSourceName: cleanText(income.source || 'Revenu personnel', 150),
      neutralFlow: true, flowType: 'business_transfer',
      businessId, businessName: cleanText(businessSnap.data()?.name, 100),
      paymentMethod: 'other', expenseType: 'consumption',
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    };
    const companyName = cleanText(businessSnap.data()?.name, 100);
    transaction.create(personalExpenseRef, transferExpense);
    transaction.create(businessTransactionRef, {
      type: 'inflow', direction: 'inflow', flowType: 'owner_contribution',
      title: 'Apport du propriétaire', categoryId: 'owner_contribution',
      amount, date, month, accountId, status: 'posted',
      note: 'Fonds transférés depuis l’espace personnel (' + cleanText(income.source || 'revenu', 100) + ')',
      personalIncomeId: incomeId, personalExpenseId: personalExpenseRef.id,
      createdBy: uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(transferRef, {
      amount, date, businessTransactionId: businessTransactionRef.id,
      personalExpenseId: personalExpenseRef.id, personalIncomeId: incomeId,
      createdBy: uid, createdAt: FieldValue.serverTimestamp(),
    });
    transaction.update(businessAccountRef, { balance: FieldValue.increment(amount), updatedAt: FieldValue.serverTimestamp() });
    transaction.update(businessRef, {
      cashBalance: FieldValue.increment(amount),
      ownerContributions: FieldValue.increment(amount),
      updatedAt: FieldValue.serverTimestamp(), lastActivityAt: FieldValue.serverTimestamp(),
    });
    transaction.set(monthRef, {
      month, ownerContributions: FieldValue.increment(amount),
      transactionCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (profile.incomeSpentTotalsVersion === 1) {
      const totals = { ...(profile.incomeSpentTotals || {}) };
      totals[incomeId] = Math.max(0, (Number(totals[incomeId]) || 0) + amount);
      transaction.set(userRef, { incomeSpentTotals: totals, incomeSpentTotalsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    if (personalBudgetSummarySnap.exists) {
      const summary = personalBudgetSummarySnap.data() || {};
      if (summary.version === 1 && summary.byCategory && typeof summary.byCategory === 'object') {
        // Les transferts vers une entreprise sont des mouvements neutres et ne consomment pas les enveloppes personnelles.
      }
    }
    resultId = businessTransactionRef.id;
  });
  return { success: true, id: resultId, message: 'Transfert enregistré sans le compter comme un revenu professionnel.' };
}

export async function createBusinessAccount(uid, businessId, input = {}) {
  const context = await getBusinessContext(uid, businessId);
  requireWritable(context);
  const name = cleanText(input.name, 80);
  const type = ['cash', 'mtn_momo', 'orange_money', 'bank', 'other'].includes(input.type) ? input.type : 'other';
  if (name.length < 2) throw new BusinessError('Indique un nom de compte.');
  const openingBalance = input.openingBalance === undefined || input.openingBalance === '' ? 0 : Math.round(Number(input.openingBalance));
  if (!Number.isSafeInteger(openingBalance) || openingBalance < 0 || openingBalance > MAX_AMOUNT) throw new BusinessError('Solde initial invalide.');
  const ref = context.businessRef.collection('accounts').doc();
  await adminDb.runTransaction(async (transaction) => {
    const [profileSnap, memberSnap, businessSnap] = await Promise.all([
      transaction.get(context.userRef), transaction.get(context.memberRef), transaction.get(context.businessRef),
    ]);
    if (!isPremium(profileSnap.data() || {})) premiumRequired();
    if (!memberSnap.exists || !['owner', 'admin', 'finance'].includes(memberSnap.data()?.role || '')) throw new BusinessError('Accès en lecture seule.', 403);
    if (!businessSnap.exists) throw new BusinessError('Entreprise introuvable.', 404);
    transaction.create(ref, {
      name, type, currency: 'XAF', openingBalance, balance: openingBalance, active: true,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    if (openingBalance > 0) {
      transaction.update(context.businessRef, { cashBalance: FieldValue.increment(openingBalance), updatedAt: FieldValue.serverTimestamp() });
    }
  });
  return { success: true, id: ref.id };
}

function normalizeResource(resource, input = {}) {
  const common = { updatedAt: FieldValue.serverTimestamp() };
  if (resource === 'clients' || resource === 'suppliers' || resource === 'partners') {
    const name = cleanText(input.name, 120);
    if (!name) throw new BusinessError('Indique un nom.');
    return {
      name, phone: cleanText(input.phone, 40), email: cleanText(input.email, 120),
      address: cleanText(input.address, 180), role: cleanText(input.role, 100),
      note: cleanText(input.note, 500), ...common,
    };
  }
  if (resource === 'contracts') {
    const title = cleanText(input.title, 140);
    if (!title) throw new BusinessError('Indique le titre du contrat.');
    return {
      title, counterparty: cleanText(input.counterparty, 120),
      startDate: input.startDate ? parseDate(input.startDate) : '',
      endDate: input.endDate ? parseDate(input.endDate) : '',
      amount: input.amount ? parseAmount(input.amount, 'Montant du contrat') : 0,
      status: ['draft', 'active', 'completed', 'cancelled'].includes(input.status) ? input.status : 'draft',
      description: cleanText(input.description, 1000), ...common,
    };
  }
  if (resource === 'obligations') {
    const title = cleanText(input.title, 140);
    if (!title) throw new BusinessError('Indique l’obligation à suivre.');
    return {
      title, amount: input.amount ? parseAmount(input.amount, 'Montant de l’obligation') : 0,
      dueDate: input.dueDate ? parseDate(input.dueDate) : '',
      category: cleanText(input.category, 80),
      status: ['pending', 'in_progress', 'completed', 'cancelled'].includes(input.status) ? input.status : 'pending',
      note: cleanText(input.note, 500), ...common,
    };
  }
  if (resource === 'invoices') {
    const title = cleanText(input.title, 140);
    const customerName = cleanText(input.customerName, 120);
    if (!title || !customerName) throw new BusinessError('Indique le titre et le client de la facture.');
    const total = parseAmount(input.totalAmount, 'Montant de la facture');
    return {
      title, customerName, customerId: cleanText(input.customerId, 150),
      invoiceNumber: cleanText(input.invoiceNumber, 50),
      issueDate: parseDate(input.issueDate), dueDate: input.dueDate ? parseDate(input.dueDate) : '',
      totalAmount: total, amountPaid: 0, remaining: total, status: 'unpaid',
      note: cleanText(input.note, 500), ...common,
    };
  }
  if (resource === 'budgets') {
    const title = cleanText(input.title, 120);
    const amount = parseAmount(input.amount, 'Montant du budget');
    const month = cleanText(input.month || monthDouala(), 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BusinessError('Mois de budget invalide.');
    return { title: title || 'Budget professionnel', categoryId: cleanText(input.categoryId, 80) || 'other', amount, month, ...common };
  }
  throw new BusinessError('Rubrique professionnelle non reconnue.', 404);
}

export async function listBusinessResource(uid, businessId, resource) {
  if (!RESOURCE_NAMES.has(resource)) throw new BusinessError('Rubrique professionnelle non reconnue.', 404);
  const context = await getBusinessContext(uid, businessId, { allowSensitiveRead: !SENSITIVE_RESOURCES.has(resource) });
  const snapshot = await context.businessRef.collection(resource).orderBy('updatedAt', 'desc').limit(100).get();
  return { items: snapshot.docs.map(serializeDocument), readOnly: !context.premiumActive || !['owner', 'admin', 'finance'].includes(context.role) };
}

export async function saveBusinessResource(uid, businessId, resource, input = {}, itemId = '') {
  if (!RESOURCE_NAMES.has(resource)) throw new BusinessError('Rubrique professionnelle non reconnue.', 404);
  const context = await getBusinessContext(uid, businessId, { allowSensitiveRead: false });
  requireWritable(context);
  const data = normalizeResource(resource, input);
  const collection = context.businessRef.collection(resource);
  if (itemId) {
    const id = validId(itemId);
    const ref = collection.doc(id);
    const previous = await ref.get();
    if (!previous.exists) throw new BusinessError('Élément introuvable.', 404);
    if (resource === 'invoices') throw new BusinessError('Les factures émises ne peuvent pas être modifiées après leur création. Crée un avoir ou corrige la facture avant émission.', 409);
    await ref.set({ ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { success: true, id };
  }
  const ref = collection.doc();
  await ref.create({ ...data, createdAt: FieldValue.serverTimestamp(), createdBy: uid });
  if (resource === 'invoices') {
    await context.businessRef.set({ totalReceivables: FieldValue.increment(Number(data.totalAmount) || 0), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  if (resource === 'obligations') {
    await context.businessRef.set({ totalPayables: FieldValue.increment(Number(data.amount) || 0), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  return { success: true, id: ref.id };
}

export async function deleteBusinessResource(uid, businessId, resource, itemId) {
  if (!RESOURCE_NAMES.has(resource)) throw new BusinessError('Rubrique professionnelle non reconnue.', 404);
  const context = await getBusinessContext(uid, businessId, { allowSensitiveRead: false });
  requireWritable(context);
  const ref = context.businessRef.collection(resource).doc(validId(itemId));
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new BusinessError('Élément introuvable.', 404);
  const data = snapshot.data() || {};
  if (resource === 'invoices' && Number(data.amountPaid) > 0) throw new BusinessError('Cette facture a déjà reçu un paiement. Elle ne peut pas être supprimée.', 409);
  await ref.delete();
  if (resource === 'invoices') await context.businessRef.set({ totalReceivables: FieldValue.increment(-Math.max(0, Number(data.remaining) || 0)), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (resource === 'obligations') await context.businessRef.set({ totalPayables: FieldValue.increment(-Math.max(0, Number(data.amount) || 0)), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { success: true };
}

export async function recordBusinessDocumentPayment(uid, businessId, resource, itemId, input = {}) {
  if (!['invoices', 'obligations'].includes(resource)) throw new BusinessError('Ce type de paiement n’est pas reconnu.');
  const context = await getBusinessContext(uid, businessId, { allowSensitiveRead: false });
  requireWritable(context);
  const id = validId(itemId);
  const ref = context.businessRef.collection(resource).doc(id);
  const accountId = validId(input.accountId || 'main');
  const accountRef = context.businessRef.collection('accounts').doc(accountId);
  const amount = parseAmount(input.amount, 'Montant du paiement');
  const date = parseDate(input.date);
  const transactionRef = context.businessRef.collection('transactions').doc();
  const monthRef = context.businessRef.collection('monthlySummaries').doc(date.slice(0, 7));
  await adminDb.runTransaction(async (transaction) => {
    const [profileSnap, memberSnap, itemSnap, accountSnap, businessSnap] = await Promise.all([
      transaction.get(context.userRef), transaction.get(context.memberRef), transaction.get(ref),
      transaction.get(accountRef), transaction.get(context.businessRef),
    ]);
    if (!isPremium(profileSnap.data() || {})) premiumRequired();
    if (!memberSnap.exists || !['owner', 'admin', 'finance'].includes(memberSnap.data()?.role || '')) throw new BusinessError('Accès en lecture seule.', 403);
    if (!itemSnap.exists || !accountSnap.exists || !businessSnap.exists) throw new BusinessError('Élément ou compte financier introuvable.', 404);
    const item = itemSnap.data() || {};
    const remaining = resource === 'invoices'
      ? Math.max(0, Number(item.totalAmount) - Number(item.amountPaid || 0))
      : Math.max(0, Number(item.amount) || 0);
    if (amount > remaining) throw new BusinessError('Le paiement dépasse le montant restant.');
    const income = resource === 'invoices';
    transaction.create(transactionRef, {
      type: income ? 'income' : 'expense', direction: income ? 'income' : 'expense',
      flowType: 'normal', title: (income ? 'Paiement facture ' : 'Paiement obligation ') + cleanText(item.title, 100),
      categoryId: income ? 'sales' : (cleanText(item.category, 80) || 'other'),
      amount, date, month: date.slice(0, 7), accountId,
      invoiceId: income ? id : null, obligationId: income ? null : id,
      note: cleanText(input.note, 300), status: 'posted', createdBy: uid,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    const signedAmount = income ? amount : -amount;
    transaction.update(accountRef, { balance: FieldValue.increment(signedAmount), updatedAt: FieldValue.serverTimestamp() });
    transaction.update(context.businessRef, {
      cashBalance: FieldValue.increment(signedAmount),
      ...(income ? { totalIncome: FieldValue.increment(amount), totalReceivables: FieldValue.increment(-amount) }
        : { totalExpense: FieldValue.increment(amount), totalPayables: FieldValue.increment(-amount) }),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(monthRef, {
      month: date.slice(0, 7),
      ...(income ? { income: FieldValue.increment(amount) } : { expense: FieldValue.increment(amount) }),
      transactionCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (income) {
      const paid = (Number(item.amountPaid) || 0) + amount;
      transaction.update(ref, { amountPaid: paid, remaining: Math.max(0, Number(item.totalAmount) - paid), status: paid >= Number(item.totalAmount) ? 'paid' : 'partial', updatedAt: FieldValue.serverTimestamp() });
    } else {
      transaction.update(ref, { status: amount >= remaining ? 'completed' : 'in_progress', updatedAt: FieldValue.serverTimestamp() });
    }
  });
  return { success: true, transactionId: transactionRef.id };
}

export async function deleteBusiness(uid, businessId) {
  const context = await getBusinessContext(uid, businessId, { allowSensitiveRead: false });
  requireWritable(context);
  if (context.role !== 'owner') throw new BusinessError('Seul le propriétaire peut supprimer une entreprise.', 403);
  const [transactions, accounts, resources] = await Promise.all([
    context.businessRef.collection('transactions').limit(1).get(),
    context.businessRef.collection('accounts').limit(1).get(),
    context.businessRef.collection('invoices').limit(1).get(),
  ]);
  if (!transactions.empty || !accounts.empty || !resources.empty) {
    throw new BusinessError('Cette entreprise contient déjà des données financières. Archive-la depuis ses paramètres au lieu de la supprimer.', 409);
  }
  await adminDb.runTransaction(async (transaction) => {
    transaction.update(context.businessRef, { status: 'archived', archivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.update(context.memberRef, { status: 'archived', active: false });
    transaction.set(userBusinessRefs(uid).doc(businessId), { active: false, status: 'archived' }, { merge: true });
  });
  return { success: true };
}
