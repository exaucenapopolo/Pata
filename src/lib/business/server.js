import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { isValidCloudinaryAvatarUrl } from '@/lib/profile/cloudinaryAvatar.mjs';

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

export async function getBusinessContext(uid, businessId, { allowSensitiveRead = true } = {}) {
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
      logoUrl: isValidCloudinaryAvatarUrl(business.logoUrl) ? business.logoUrl : '',
      role: cleanText(membership.data()?.role || 'viewer', 20),
      createdAt: serializeValue(business.createdAt || null),
      status: business.status || 'active',
      readOnly: !isPremium(profile) || business.status === 'archived' || !['owner', 'admin', 'finance'].includes(membership.data()?.role || 'viewer'),
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
  const logoUrl = cleanText(input.logoUrl, 2048);
  if (logoUrl && !isValidCloudinaryAvatarUrl(logoUrl)) throw new BusinessError('Le logo doit provenir de la bibliothèque photo Pata.');
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
      name, activity, legalForm, city, phone, logoUrl, currency,
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
  return { id: businessRef.id, name, activity, logoUrl, role: 'owner' };
}

export async function getBusinessOverview(uid, businessId) {
  const context = await getBusinessContext(uid, businessId);
  const month = monthDouala();
  const [accountsSnap, monthSnap, recentSnap, historySnap] = await Promise.all([
    context.businessRef.collection('accounts').where('active', '==', true).limit(30).get(),
    context.businessRef.collection('monthlySummaries').doc(month).get(),
    context.businessRef.collection('transactions').orderBy('createdAt', 'desc').limit(6).get(),
    context.businessRef.collection('monthlySummaries').orderBy('month', 'desc').limit(12).get(),
  ]);
  const accounts = accountsSnap.docs.map(serializeDocument);
  const accountBalance = accounts.reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
  const monthly = monthSnap.exists ? monthSnap.data() || {} : {};
  const recentTransactions = recentSnap.docs.map(serializeDocument);
  const monthlyHistory = historySnap.docs.map((document) => serializeDocument(document)).reverse();
  const result = {
    business: {
      id: context.business.id, name: context.business.name, activity: context.business.activity,
      city: context.business.city, currency: context.business.currency || 'XAF',
      phone: context.business.phone || '', legalForm: context.business.legalForm || '',
      logoUrl: isValidCloudinaryAvatarUrl(context.business.logoUrl) ? context.business.logoUrl : '',
      status: context.business.status || 'active',
    },
    premiumActive: context.premiumActive,
    readOnly: !context.premiumActive || context.business.status === 'archived' || !['owner', 'admin', 'finance'].includes(context.role),
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
    monthlyHistory,
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
  return { transactions: rows, readOnly: !context.premiumActive || context.business.status === 'archived' || !['owner', 'admin', 'finance'].includes(context.role), hasMore: snapshot.size === safeLimit };
}

export async function listBusinessAccounts(uid, businessId) {
  const context = await getBusinessContext(uid, businessId);
  const snapshot = await context.businessRef.collection('accounts').where('active', '==', true).limit(30).get();
  return { accounts: snapshot.docs.map((item) => serializeDocument(item)), readOnly: !context.premiumActive || context.business.status === 'archived' || !['owner', 'admin', 'finance'].includes(context.role) };
}

function normalizeTransaction(input = {}) {
  if (!['income', 'expense'].includes(input.type)) throw new BusinessError('Choisis une entrée ou une sortie professionnelle valide.');
  const type = input.type;
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
  const requestId = cleanText(input.requestId, 100).replace(/[^a-zA-Z0-9_-]/g, '_');
  if (requestId.length < 8) throw new BusinessError('Identifiant d’opération invalide. Réessaie depuis le formulaire Pata.');
  const businessRef = context.businessRef;
  const accountRef = businessRef.collection('accounts').doc(accountId);
  const transactionRef = businessRef.collection('transactions').doc('txn_' + requestId);
  const monthRef = businessRef.collection('monthlySummaries').doc(normalized.month);
  const budgetsQuery = normalized.type === 'expense'
    ? businessRef.collection('budgets').where('month', '==', normalized.month).limit(30)
    : null;
  let duplicate = false;
  await adminDb.runTransaction(async (transaction) => {
    const [profileSnap, memberSnap, accountSnap, businessSnap, existingTransactionSnap, budgetsSnap] = await Promise.all([
      transaction.get(context.userRef), transaction.get(context.memberRef),
      transaction.get(accountRef), transaction.get(businessRef), transaction.get(transactionRef),
      budgetsQuery ? transaction.get(budgetsQuery) : Promise.resolve(null),
    ]);
    if (!profileSnap.exists || !isPremium(profileSnap.data() || {})) premiumRequired();
    if (!memberSnap.exists || !['owner', 'admin', 'finance'].includes(memberSnap.data()?.role || '')) throw new BusinessError('Tu ne disposes pas des droits nécessaires pour modifier cette entreprise.', 403, 'READ_ONLY');
    if (!businessSnap.exists || businessSnap.data()?.status === 'archived') throw new BusinessError('Entreprise indisponible.', 404);
    if (existingTransactionSnap.exists) { duplicate = true; return; }
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
    if (normalized.type === 'expense' && budgetsSnap?.docs?.length) {
      for (const budgetDoc of budgetsSnap.docs) {
        const budget = budgetDoc.data() || {};
        if (String(budget.categoryId || '') !== normalized.categoryId) continue;
        const spent = Math.max(0, Number(budget.spent) || 0) + normalized.amount;
        const allocated = Math.max(0, Number(budget.amount) || 0);
        transaction.update(budgetDoc.ref, {
          spent,
          remaining: Math.max(0, allocated - spent),
          overBudget: spent > allocated,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
  });
  return { id: transactionRef.id, success: true, duplicate, transaction: { ...normalized, accountId, flowType: 'normal', direction: normalized.type } };
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
    const [profileSnap, incomeSnap, accountSnap, businessSnap, memberSnap, duplicateSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(incomeRef),
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
    const profile = profileSnap.data() || {};
    let spent = 0;
    if (profile.incomeSpentTotalsVersion === 1) {
      spent = Math.max(0, Number(profile.incomeSpentTotals?.[incomeId]) || 0);
    } else {
      const expensesSnap = await transaction.get(userRef.collection('expenses').where('incomeSourceId', '==', incomeId));
      spent = expensesSnap.docs.reduce((sum, item) => sum + (Number(item.data()?.amount) || 0), 0);
    }
    const remaining = Math.max(0, (Number(income.amount) || 0) - spent);
    if (amount > remaining) throw new BusinessError('Le montant dépasse le solde encore disponible de cette source : ' + remaining.toLocaleString('fr-FR') + ' FCFA.');
    const month = date.slice(0, 7);
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
    // Le transfert est un mouvement neutre : il réduit la source personnelle sans consommer les enveloppes personnelles.
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
      const openingTransactionRef = context.businessRef.collection('transactions').doc();
      transaction.create(openingTransactionRef, {
        type: 'inflow', direction: 'inflow', flowType: 'opening_balance',
        title: 'Solde initial · ' + name, categoryId: 'opening_balance',
        amount: openingBalance, date: todayDouala(), month: monthDouala(),
        accountId: ref.id, status: 'posted', createdBy: uid,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
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
      amountPaid: 0,
      remaining: input.amount ? parseAmount(input.amount, 'Montant de l’obligation') : 0,
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
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BusinessError('Mois de budget invalide.');
    return { title: title || 'Budget professionnel', categoryId: cleanText(input.categoryId, 80) || 'other', amount, month, spent: 0, remaining: amount, overBudget: false, ...common };
  }
  throw new BusinessError('Rubrique professionnelle non reconnue.', 404);
}

export async function listBusinessResource(uid, businessId, resource) {
  if (!RESOURCE_NAMES.has(resource)) throw new BusinessError('Rubrique professionnelle non reconnue.', 404);
  const context = await getBusinessContext(uid, businessId, { allowSensitiveRead: !SENSITIVE_RESOURCES.has(resource) });
  const snapshot = await context.businessRef.collection(resource).orderBy('updatedAt', 'desc').limit(100).get();
  return { items: snapshot.docs.map(serializeDocument), readOnly: !context.premiumActive || context.business.status === 'archived' || !['owner', 'admin', 'finance'].includes(context.role) };
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
    if (['invoices', 'obligations'].includes(resource)) throw new BusinessError('Cette pièce financière ne peut pas être modifiée après sa création. Supprime-la si aucun paiement n’a été enregistré, puis recrée-la avec les bonnes informations.', 409);
    await ref.set({ ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { success: true, id };
  }
  const ref = collection.doc();
  const stored = { ...data, createdAt: FieldValue.serverTimestamp(), createdBy: uid };
  if (['invoices', 'obligations'].includes(resource)) {
    await adminDb.runTransaction(async (transaction) => {
      const [profileSnap, memberSnap, businessSnap] = await Promise.all([
        transaction.get(context.userRef), transaction.get(context.memberRef), transaction.get(context.businessRef),
      ]);
      if (!profileSnap.exists || !isPremium(profileSnap.data() || {})) premiumRequired();
      if (!memberSnap.exists || !['owner', 'admin', 'finance'].includes(memberSnap.data()?.role || '')) throw new BusinessError('Accès en lecture seule.', 403);
      if (!businessSnap.exists || businessSnap.data()?.status === 'archived') throw new BusinessError('Entreprise indisponible.', 404);
      transaction.create(ref, stored);
      if (resource === 'invoices') {
        transaction.update(context.businessRef, { totalReceivables: FieldValue.increment(Number(data.totalAmount) || 0), updatedAt: FieldValue.serverTimestamp() });
      } else {
        transaction.update(context.businessRef, { totalPayables: FieldValue.increment(Number(data.remaining ?? data.amount) || 0), updatedAt: FieldValue.serverTimestamp() });
      }
    });
  } else {
    await ref.create(stored);
  }
  return { success: true, id: ref.id };
}

export async function deleteBusinessResource(uid, businessId, resource, itemId) {
  if (!RESOURCE_NAMES.has(resource)) throw new BusinessError('Rubrique professionnelle non reconnue.', 404);
  const context = await getBusinessContext(uid, businessId, { allowSensitiveRead: false });
  requireWritable(context);
  const ref = context.businessRef.collection(resource).doc(validId(itemId));
  await adminDb.runTransaction(async (transaction) => {
    const [profileSnap, memberSnap, businessSnap, snapshot] = await Promise.all([
      transaction.get(context.userRef), transaction.get(context.memberRef),
      transaction.get(context.businessRef), transaction.get(ref),
    ]);
    if (!profileSnap.exists || !isPremium(profileSnap.data() || {})) premiumRequired();
    if (!memberSnap.exists || !['owner', 'admin', 'finance'].includes(memberSnap.data()?.role || '')) throw new BusinessError('Accès en lecture seule.', 403);
    if (!businessSnap.exists || businessSnap.data()?.status === 'archived') throw new BusinessError('Entreprise indisponible.', 404);
    if (!snapshot.exists) throw new BusinessError('Élément introuvable.', 404);
    const data = snapshot.data() || {};
    if (['invoices', 'obligations'].includes(resource) && Number(data.amountPaid) > 0) {
      throw new BusinessError('Cette pièce a déjà reçu ou effectué un paiement. Elle ne peut pas être supprimée.', 409);
    }
    transaction.delete(ref);
    if (resource === 'invoices') {
      transaction.update(context.businessRef, { totalReceivables: FieldValue.increment(-Math.max(0, Number(data.remaining) || 0)), updatedAt: FieldValue.serverTimestamp() });
    }
    if (resource === 'obligations') {
      transaction.update(context.businessRef, { totalPayables: FieldValue.increment(-Math.max(0, Number(data.remaining ?? data.amount) || 0)), updatedAt: FieldValue.serverTimestamp() });
    }
  });
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
  const requestId = cleanText(input.requestId, 100).replace(/[^a-zA-Z0-9_-]/g, '_');
  if (requestId.length < 8) throw new BusinessError('Identifiant de paiement invalide. Réessaie depuis le formulaire Pata.');
  const transactionRef = context.businessRef.collection('transactions').doc('payment_' + requestId);
  const monthRef = context.businessRef.collection('monthlySummaries').doc(date.slice(0, 7));
  let duplicate = false;
  await adminDb.runTransaction(async (transaction) => {
    const [profileSnap, memberSnap, itemSnap, accountSnap, businessSnap, existingTransactionSnap] = await Promise.all([
      transaction.get(context.userRef), transaction.get(context.memberRef), transaction.get(ref),
      transaction.get(accountRef), transaction.get(context.businessRef), transaction.get(transactionRef),
    ]);
    if (!isPremium(profileSnap.data() || {})) premiumRequired();
    if (!memberSnap.exists || !['owner', 'admin', 'finance'].includes(memberSnap.data()?.role || '')) throw new BusinessError('Accès en lecture seule.', 403);
    if (!itemSnap.exists || !accountSnap.exists || !businessSnap.exists) throw new BusinessError('Élément ou compte financier introuvable.', 404);
    if (existingTransactionSnap.exists) { duplicate = true; return; }
    const item = itemSnap.data() || {};
    const remaining = resource === 'invoices'
      ? Math.max(0, Number(item.totalAmount) - Number(item.amountPaid || 0))
      : Math.max(0, Number(item.remaining ?? (Number(item.amount) - Number(item.amountPaid || 0))) || 0);
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
      const paid = (Number(item.amountPaid) || 0) + amount;
      const nextRemaining = Math.max(0, Number(item.amount) - paid);
      transaction.update(ref, { amountPaid: paid, remaining: nextRemaining, status: nextRemaining === 0 ? 'completed' : 'in_progress', updatedAt: FieldValue.serverTimestamp() });
    }
  });
  return { success: true, duplicate, transactionId: transactionRef.id };
}

export async function deleteBusiness(uid, businessId) {
  const context = await getBusinessContext(uid, businessId, { allowSensitiveRead: false });
  requireWritable(context);
  if (context.role !== 'owner') throw new BusinessError('Seul le propriétaire peut supprimer une entreprise.', 403);
  await adminDb.runTransaction(async (transaction) => {
    const [businessSnap, memberSnap] = await Promise.all([
      transaction.get(context.businessRef), transaction.get(context.memberRef),
    ]);
    if (!businessSnap.exists || !memberSnap.exists) throw new BusinessError('Entreprise introuvable.', 404);
    // Keep the membership active so the owner can still consult the historical records.
    transaction.update(context.businessRef, { status: 'archived', archivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.set(context.memberRef, { status: 'active', active: true }, { merge: true });
    transaction.set(userBusinessRefs(uid).doc(businessId), { active: true, status: 'archived' }, { merge: true });
  });
  return { success: true };
}


export async function updateBusinessProfile(uid, businessId, input = {}) {
  const context = await getBusinessContext(uid, businessId);
  requireWritable(context);
  if (context.role !== 'owner' && context.role !== 'admin') {
    throw new BusinessError('Seul le propriétaire ou un administrateur peut modifier les informations de cette entreprise.', 403, 'READ_ONLY');
  }
  const name = cleanText(input.name, 100);
  if (name.length < 2) throw new BusinessError('Le nom de l’entreprise doit comporter au moins deux caractères.');
  const activity = cleanText(input.activity, 120);
  const legalForm = cleanText(input.legalForm, 80);
  const city = cleanText(input.city, 80);
  const phone = cleanText(input.phone, 30);
  const logoUrl = cleanText(input.logoUrl, 2048);
  if (logoUrl && !isValidCloudinaryAvatarUrl(logoUrl)) {
    throw new BusinessError('Le logo doit provenir de la bibliothèque photo Pata.');
  }

  await adminDb.runTransaction(async (transaction) => {
    const [profileSnap, memberSnap, businessSnap] = await Promise.all([
      transaction.get(context.userRef), transaction.get(context.memberRef), transaction.get(context.businessRef),
    ]);
    if (!profileSnap.exists || !isPremium(profileSnap.data() || {})) premiumRequired();
    if (!memberSnap.exists || !['owner', 'admin'].includes(memberSnap.data()?.role || '')) {
      throw new BusinessError('Tu ne disposes pas des droits nécessaires pour modifier cette entreprise.', 403, 'READ_ONLY');
    }
    if (!businessSnap.exists || businessSnap.data()?.status === 'archived') {
      throw new BusinessError('Entreprise indisponible.', 404);
    }
    transaction.update(context.businessRef, {
      name, activity, legalForm, city, phone,
      logoUrl: logoUrl || FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { id: businessId, name, activity, legalForm, city, phone, logoUrl };
}

const businessPaymentLinksRef = () => adminDb.collection('businessPaymentLinks');
const validEmail = (value) => {
  const email = cleanText(value, 160);
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

function paymentLinkPublicUrl(link) {
  try {
    const url = new URL(String(link || ''));
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
}

async function fetchFapshiPaymentStatus(transId) {
  const apiUser = process.env.FAPSHI_API_USER;
  const secretKey = process.env.FAPSHI_SECRET_KEY;
  if (!apiUser || !secretKey) throw new BusinessError('La configuration de paiement Fapshi est incomplète.', 503, 'PAYMENT_PROVIDER_CONFIG');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let response;
  try {
    response = await fetch('https://live.fapshi.com/payment-status/' + encodeURIComponent(transId), {
      method: 'GET',
      headers: { apiuser: apiUser, apikey: secretKey },
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch {
    throw new BusinessError('Fapshi est momentanément indisponible. Réessaie la vérification.', 502, 'PAYMENT_PROVIDER_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new BusinessError(data.message || 'Impossible de vérifier le paiement auprès de Fapshi.', 502, 'PAYMENT_PROVIDER_STATUS');
  return data;
}

export async function listBusinessPaymentLinks(uid, businessId) {
  const context = await getBusinessContext(uid, businessId);
  const snapshot = await businessPaymentLinksRef().where('businessId', '==', context.businessId).limit(100).get();
  const links = snapshot.docs.map(serializeDocument);
  links.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return { paymentLinks: links, readOnly: !context.premiumActive || context.business.status === 'archived' };
}

export async function createBusinessPaymentLink(uid, businessId, input = {}) {
  const context = await getBusinessContext(uid, businessId);
  requireWritable(context);
  if (typeof input.amount === 'string' && !/^\d+$/.test(input.amount.trim())) throw new BusinessError('Le montant doit être un nombre entier en FCFA.');
  const amount = parseAmount(input.amount, 'Montant du lien');
  if (amount < 100) throw new BusinessError('Le montant minimum d’un lien Fapshi est de 100 FCFA.');
  const title = cleanText(input.title, 100);
  if (title.length < 2) throw new BusinessError('Donne un libellé à ce lien de paiement.');
  const customerName = cleanText(input.customerName, 100);
  const customerEmail = cleanText(input.customerEmail, 160).toLowerCase();
  if (!validEmail(customerEmail)) throw new BusinessError('Adresse e-mail du client invalide.');
  const accountId = validId(input.accountId || 'main');
  const requestId = cleanText(input.requestId, 100).replace(/[^a-zA-Z0-9_-]/g, '_');
  if (requestId.length < 8) throw new BusinessError('Identifiant de demande invalide. Réessaie depuis Pata.');
  const paymentLinkId = 'pl_' + requestId;
  const linkRef = businessPaymentLinksRef().doc(paymentLinkId);
  const accountRef = context.businessRef.collection('accounts').doc(accountId);
  let existingLink = null;

  await adminDb.runTransaction(async (transaction) => {
    const [profileSnap, memberSnap, businessSnap, accountSnap, existingSnap] = await Promise.all([
      transaction.get(context.userRef), transaction.get(context.memberRef),
      transaction.get(context.businessRef), transaction.get(accountRef), transaction.get(linkRef),
    ]);
    if (!profileSnap.exists || !isPremium(profileSnap.data() || {})) premiumRequired();
    if (!memberSnap.exists || !['owner', 'admin', 'finance'].includes(memberSnap.data()?.role || '')) {
      throw new BusinessError('Tu ne disposes pas des droits nécessaires pour créer un lien.', 403, 'READ_ONLY');
    }
    if (!businessSnap.exists || businessSnap.data()?.status === 'archived') throw new BusinessError('Entreprise indisponible.', 404);
    if (!accountSnap.exists || accountSnap.data()?.active === false) throw new BusinessError('Compte de destination introuvable ou désactivé.');
    if (existingSnap.exists) {
      existingLink = serializeDocument(existingSnap);
      return;
    }
    transaction.create(linkRef, {
      businessId: context.businessId,
      businessName: cleanText(context.business.name, 100),
      userId: uid,
      createdBy: uid,
      accountId,
      title,
      customerName,
      customerEmail,
      amount,
      currency: 'XAF',
      status: 'INITIATING',
      provider: 'fapshi',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  if (existingLink) {
    if (existingLink.checkoutUrl && existingLink.transId) return { paymentLink: existingLink, duplicate: true };
    throw new BusinessError('Ce lien est déjà en cours de création. Actualise la liste dans un instant.', 409, 'PAYMENT_LINK_IN_PROGRESS');
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.pata-yam.site';
  let origin = 'https://www.pata-yam.site';
  try { origin = new URL(baseUrl).origin; } catch { /* conserver le domaine public Pata */ }
  const redirectUrl = origin + '/business-payment/return?paymentLinkId=' + encodeURIComponent(paymentLinkId);
  const payload = {
    amount,
    ...(customerEmail ? { email: customerEmail } : {}),
    redirectUrl,
    userId: uid,
    externalId: paymentLinkId,
    message: title.slice(0, 80),
  };

  try {
    const apiUser = process.env.FAPSHI_API_USER;
    const secretKey = process.env.FAPSHI_SECRET_KEY;
    if (!apiUser || !secretKey) throw new BusinessError('La configuration de paiement Fapshi est incomplète.', 503, 'PAYMENT_PROVIDER_CONFIG');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch('https://live.fapshi.com/initiate-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apiuser: apiUser, apikey: secretKey },
        body: JSON.stringify(payload),
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch {
      throw new BusinessError('Impossible de joindre Fapshi pour créer le lien. Aucun encaissement n’a été enregistré.', 502, 'PAYMENT_PROVIDER_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
    }
    const providerData = await response.json().catch(() => ({}));
    if (!response.ok) throw new BusinessError(providerData.message || 'Fapshi a refusé la création du lien.', 502, 'PAYMENT_LINK_REJECTED');
    const checkoutUrl = paymentLinkPublicUrl(providerData.link || providerData.url || providerData.data?.url);
    const transId = cleanText(providerData.transId || providerData.data?.transId, 160);
    if (!checkoutUrl || !transId) throw new BusinessError('Fapshi n’a pas retourné un lien de paiement valide.', 502, 'PAYMENT_LINK_INVALID');
    await linkRef.set({
      checkoutUrl, transId, status: 'PENDING',
      providerMessage: cleanText(providerData.message, 200),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    const fresh = await linkRef.get();
    return { paymentLink: serializeDocument(fresh), duplicate: false };
  } catch (error) {
    await linkRef.set({
      status: 'FAILED',
      failureReason: cleanText(error?.message || 'Création impossible', 240),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }).catch(() => {});
    throw error;
  }
}

async function settleBusinessPaymentLink(linkRef, providerData) {
  const transId = cleanText(providerData?.transId || providerData?.trans_id, 160);
  if (!transId) throw new BusinessError('La réponse Fapshi ne contient pas d’identifiant de transaction.', 502, 'PAYMENT_VERIFICATION_INVALID');
  const linkSnap = await linkRef.get();
  if (!linkSnap.exists) return { handled: false, status: 'NOT_FOUND' };
  const link = linkSnap.data() || {};
  if (link.status === 'CONFIRMED') return { handled: true, status: 'CONFIRMED', paymentLink: serializeDocument(linkSnap) };
  if (String(link.transId || '') !== transId) throw new BusinessError('L’identifiant Fapshi ne correspond pas au lien créé.', 409, 'PAYMENT_ID_MISMATCH');
  const providerStatus = cleanText(providerData.status, 32).toUpperCase();
  if (providerStatus !== 'SUCCESSFUL') {
    if (['FAILED', 'EXPIRED'].includes(providerStatus)) {
      await linkRef.set({
        status: providerStatus,
        failureReason: cleanText(providerData.reason || providerStatus, 240),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    const fresh = await linkRef.get();
    return { handled: true, status: ['FAILED', 'EXPIRED'].includes(providerStatus) ? providerStatus : 'PENDING', paymentLink: serializeDocument(fresh) };
  }

  const grossAmount = Number(providerData.amount);
  const netAmount = Number(providerData.revenue);
  if (!Number.isSafeInteger(grossAmount) || grossAmount !== Number(link.amount)) {
    throw new BusinessError('Le montant confirmé par Fapshi ne correspond pas au lien demandé. Aucun fonds n’a été crédité.', 409, 'PAYMENT_AMOUNT_MISMATCH');
  }
  if (!Number.isSafeInteger(netAmount) || netAmount <= 0 || netAmount > grossAmount) {
    throw new BusinessError('Fapshi n’a pas fourni un montant net de règlement valide. Aucun fonds n’a été crédité.', 409, 'PAYMENT_REVENUE_INVALID');
  }
  if (String(providerData.externalId || '') !== String(linkRef.id)) {
    throw new BusinessError('La référence externe Fapshi ne correspond pas à ce lien. Aucun fonds n’a été crédité.', 409, 'PAYMENT_REFERENCE_MISMATCH');
  }
  if (String(providerData.userId || '') !== String(link.userId)) {
    throw new BusinessError('Le propriétaire associé au paiement ne correspond pas. Aucun fonds n’a été crédité.', 409, 'PAYMENT_OWNER_MISMATCH');
  }

  const feeAmount = grossAmount - netAmount;
  const businessId = validId(link.businessId);
  const accountId = validId(link.accountId || 'main');
  const businessRef = businessesRef().doc(businessId);
  const accountRef = businessRef.collection('accounts').doc(accountId);
  const incomeTransactionRef = businessRef.collection('transactions').doc('pay_' + linkRef.id + '_income');
  const feeTransactionRef = businessRef.collection('transactions').doc('pay_' + linkRef.id + '_fee');
  const confirmedDate = String(providerData.dateConfirmed || providerData.dateInitiated || todayDouala()).slice(0, 10);
  const date = parseDate(confirmedDate);
  const month = date.slice(0, 7);
  const monthRef = businessRef.collection('monthlySummaries').doc(month);
  const budgetsQuery = feeAmount > 0
    ? businessRef.collection('budgets').where('month', '==', month).limit(30)
    : null;
  await adminDb.runTransaction(async (transaction) => {
    const [freshLink, businessSnap, accountSnap, incomeTxnSnap, feeTxnSnap, budgetsSnap] = await Promise.all([
      transaction.get(linkRef), transaction.get(businessRef), transaction.get(accountRef),
      transaction.get(incomeTransactionRef), transaction.get(feeTransactionRef),
      budgetsQuery ? transaction.get(budgetsQuery) : Promise.resolve(null),
    ]);
    if (!freshLink.exists) throw new BusinessError('Lien de paiement introuvable.', 404);
    if (freshLink.data()?.status === 'CONFIRMED') return;
    if (!businessSnap.exists || !accountSnap.exists || accountSnap.data()?.active === false) {
      throw new BusinessError('Le compte professionnel de destination n’existe plus. Le paiement reste en attente de régularisation.', 409, 'BUSINESS_ACCOUNT_MISSING');
    }
    if (incomeTxnSnap.exists || (feeAmount > 0 && feeTxnSnap.exists)) {
      throw new BusinessError('Une écriture liée à ce paiement existe déjà. Vérification manuelle nécessaire.', 409, 'PAYMENT_LEDGER_CONFLICT');
    }
    transaction.create(incomeTransactionRef, {
      type: 'income', direction: 'income', flowType: 'normal',
      title: cleanText(link.title, 100), categoryId: 'sales',
      amount: grossAmount, grossAmount, receivedAmount: netAmount, providerFeeAmount: feeAmount,
      date, month, accountId, paymentMethod: 'fapshi',
      paymentLinkId: linkRef.id, transId,
      customerName: cleanText(providerData.payerName || link.customerName, 100),
      customerEmail: cleanText(providerData.email || link.customerEmail, 160),
      note: 'Encaissement confirmé par Fapshi · frais fournisseur déduits séparément',
      status: 'posted', createdBy: link.userId,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    if (feeAmount > 0) {
      transaction.create(feeTransactionRef, {
        type: 'expense', direction: 'expense', flowType: 'provider_fee',
        title: 'Frais Fapshi · ' + cleanText(link.title, 80), categoryId: 'payment_fees',
        amount: feeAmount, date, month, accountId, paymentMethod: 'fapshi',
        paymentLinkId: linkRef.id, transId,
        note: 'Frais prélevés par Fapshi sur cet encaissement',
        status: 'posted', createdBy: link.userId,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.update(accountRef, { balance: FieldValue.increment(netAmount), updatedAt: FieldValue.serverTimestamp() });
    transaction.update(businessRef, {
      cashBalance: FieldValue.increment(netAmount),
      totalIncome: FieldValue.increment(grossAmount),
      ...(feeAmount > 0 ? { totalExpense: FieldValue.increment(feeAmount) } : {}),
      updatedAt: FieldValue.serverTimestamp(), lastActivityAt: FieldValue.serverTimestamp(),
    });
    transaction.set(monthRef, {
      month,
      income: FieldValue.increment(grossAmount),
      ...(feeAmount > 0 ? { expense: FieldValue.increment(feeAmount) } : {}),
      transactionCount: FieldValue.increment(feeAmount > 0 ? 2 : 1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (feeAmount > 0 && budgetsSnap?.docs?.length) {
      for (const budgetDoc of budgetsSnap.docs) {
        const budget = budgetDoc.data() || {};
        if (String(budget.categoryId || '') !== 'payment_fees') continue;
        const spent = Math.max(0, Number(budget.spent) || 0) + feeAmount;
        const allocated = Math.max(0, Number(budget.amount) || 0);
        transaction.update(budgetDoc.ref, {
          spent, remaining: Math.max(0, allocated - spent),
          overBudget: spent > allocated, updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
    transaction.update(linkRef, {
      status: 'CONFIRMED', receivedAmount: netAmount, providerFeeAmount: feeAmount,
      payerName: cleanText(providerData.payerName || link.customerName, 100),
      payerEmail: cleanText(providerData.email || link.customerEmail, 160),
      financialTransId: cleanText(providerData.financialTransId, 160),
      confirmedAt: FieldValue.serverTimestamp(), confirmedDate: date,
      updatedAt: FieldValue.serverTimestamp(),
      financeIncomeTransactionId: incomeTransactionRef.id,
      financeFeeTransactionId: feeAmount > 0 ? feeTransactionRef.id : '',
    });
  });
  const fresh = await linkRef.get();
  return { handled: true, status: 'CONFIRMED', paymentLink: serializeDocument(fresh) };
}

export async function processFapshiBusinessPayment(transId) {
  const safeTransId = cleanText(transId, 160);
  if (!safeTransId || safeTransId.includes('/')) return { handled: false, status: 'NOT_FOUND' };
  const snapshot = await businessPaymentLinksRef().where('transId', '==', safeTransId).limit(1).get();
  if (snapshot.empty) return { handled: false, status: 'NOT_FOUND' };
  const linkRef = snapshot.docs[0].ref;
  const data = await fetchFapshiPaymentStatus(safeTransId);
  return settleBusinessPaymentLink(linkRef, data);
}

export async function verifyBusinessPaymentLink(uid, businessId, paymentLinkId) {
  const context = await getBusinessContext(uid, businessId);
  const id = validId(paymentLinkId);
  const linkRef = businessPaymentLinksRef().doc(id);
  const snapshot = await linkRef.get();
  if (!snapshot.exists || snapshot.data()?.businessId !== context.businessId || snapshot.data()?.userId !== uid) {
    throw new BusinessError('Lien de paiement introuvable pour cette entreprise.', 404, 'PAYMENT_LINK_NOT_FOUND');
  }
  const link = snapshot.data() || {};
  if (link.status === 'CONFIRMED') return { success: true, status: 'CONFIRMED', paymentLink: serializeDocument(snapshot) };
  if (!link.transId) return { success: true, status: link.status || 'INITIATING', paymentLink: serializeDocument(snapshot) };
  const result = await processFapshiBusinessPayment(link.transId);
  const fresh = await linkRef.get();
  return { success: true, status: result.status || fresh.data()?.status || 'PENDING', paymentLink: serializeDocument(fresh) };
}


const PERSON_TYPES = new Set(['founder','cofounder','employee','partner','associate','contractor']);
export async function listBusinessPeople(uid,businessId){const c=await getBusinessContext(uid,businessId);const s=await c.businessRef.collection('people').orderBy('createdAt','asc').limit(200).get();return {people:s.docs.map(serializeDocument),readOnly:!c.premiumActive||c.business.status==='archived'||!['owner','admin'].includes(c.role)};}
export async function saveBusinessPerson(uid,businessId,input={},personId=''){
 const c=await getBusinessContext(uid,businessId);requireWritable(c);if(!['owner','admin'].includes(c.role))throw new BusinessError('Seuls le propriétaire et les administrateurs peuvent gérer l’équipe.',403,'PERMISSION_DENIED');
 const name=cleanText(input.name,100),type=PERSON_TYPES.has(input.type)?input.type:'employee',role=['owner','admin','finance','manager','staff','viewer'].includes(input.role)?input.role:'staff';if(name.length<2)throw new BusinessError('Indique le nom complet de cette personne.');
 const pct=(v,label)=>{const n=v===''||v==null?0:Number(v);if(!Number.isFinite(n)||n<0||n>100)throw new BusinessError(label+' doit être compris entre 0 et 100 %.');return Math.round(n*100)/100;};
 const salary=input.salary===''||input.salary==null?0:Number(input.salary),commission=input.commissionRate===''||input.commissionRate==null?0:Number(input.commissionRate);if(!Number.isFinite(salary)||salary<0||salary>MAX_AMOUNT||!Number.isFinite(commission)||commission<0||commission>100)throw new BusinessError('Salaire ou commission invalide.');
 const person={name,type,role,title:cleanText(input.title,100),phone:cleanText(input.phone,30),email:cleanText(input.email,120),capitalPercent:pct(input.capitalPercent,'La part du capital'),profitPercent:pct(input.profitPercent,'La part des bénéfices'),salary:Math.round(salary),commissionRate:Math.round(commission*100)/100,note:cleanText(input.note,500),active:input.active!==false};
 const col=c.businessRef.collection('people'),doc=personId?col.doc(validId(personId)):col.doc();await adminDb.runTransaction(async tx=>{const [profile,member,business,existing,all]=await Promise.all([tx.get(c.userRef),tx.get(c.memberRef),tx.get(c.businessRef),tx.get(doc),tx.get(col.limit(200))]);if(!profile.exists||!isPremium(profile.data()||{}))premiumRequired();if(!member.exists||!['owner','admin'].includes(member.data()?.role||''))throw new BusinessError('Droits insuffisants.',403);if(!business.exists||business.data()?.status==='archived')throw new BusinessError('Entreprise indisponible.',403);if(personId&&!existing.exists)throw new BusinessError('Cette personne n’existe plus.');const capital=all.docs.reduce((s,d)=>s+(d.id===doc.id?0:Number(d.data()?.capitalPercent)||0),0)+person.capitalPercent;if(capital>100.0001)throw new BusinessError('La somme des parts de capital ne peut pas dépasser 100 %.');const profit=all.docs.reduce((s,d)=>s+(d.id===doc.id?0:Number(d.data()?.profitPercent)||0),0)+person.profitPercent;if(profit>100.0001)throw new BusinessError('La somme des parts de bénéfices ne peut pas dépasser 100 %.');const payload={...person,updatedAt:FieldValue.serverTimestamp(),...(personId?{}:{createdAt:FieldValue.serverTimestamp(),createdBy:uid})};if(personId)tx.set(doc,payload,{merge:true});else tx.create(doc,payload);});return {success:true,person:{id:doc.id,...person}};
}
export async function deleteBusinessPerson(uid,businessId,personId){const c=await getBusinessContext(uid,businessId);requireWritable(c);if(!['owner','admin'].includes(c.role))throw new BusinessError('Droits insuffisants.',403);const doc=c.businessRef.collection('people').doc(validId(personId));await adminDb.runTransaction(async tx=>{const [profile,member,person]=await Promise.all([tx.get(c.userRef),tx.get(c.memberRef),tx.get(doc)]);if(!profile.exists||!isPremium(profile.data()||{}))premiumRequired();if(!member.exists||!['owner','admin'].includes(member.data()?.role||''))throw new BusinessError('Droits insuffisants.',403);if(person.exists)tx.delete(doc);});return {success:true};}