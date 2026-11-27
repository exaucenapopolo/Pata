import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
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
  if (!['owner', 'admin', 'finance', 'manager'].includes(context.role)) {
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
      slogan: cleanText(business.slogan, 180),
      logoUrl: isValidCloudinaryAvatarUrl(business.logoUrl) ? business.logoUrl : '',
      role: cleanText(membership.data()?.role || 'viewer', 20),
      createdAt: serializeValue(business.createdAt || null),
      status: business.status || 'active',
      readOnly: !isPremium(profile) || business.status === 'archived' || !['owner', 'admin', 'finance', 'manager'].includes(membership.data()?.role || 'viewer'),
      premiumActive: isPremium(profile),
    };
  }));
  return { businesses: businesses.filter(Boolean), premiumActive: isPremium(profile) };
}

export async function createBusiness(uid, input = {}) {
  const name = cleanText(input.name, 100);
  if (name.length < 2) throw new BusinessError('Indique un nom d’entreprise comportant au moins deux caractères.');
  const activity = cleanText(input.activityCustom || input.activity, 120);
  const slogan = cleanText(input.slogan, 180);
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
      name, nameSearch: name.toLocaleLowerCase('fr'), activity, slogan, legalForm, city, phone, logoUrl, currency,
      country: 'CM', ownerId: uid, status: 'active',
      totalIncome: 0, totalExpense: 0, ownerContributions: 0, ownerWithdrawals: 0,
      cashBalance: 0, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    const creatorType = input.creatorType === 'cofounder' ? 'cofounder' : 'founder';
    transaction.create(membershipRef, { uid, role: 'owner', personType: creatorType, active: true, status: 'active', joinedAt: FieldValue.serverTimestamp() });
    transaction.create(businessRef.collection('people').doc(uid), { name: cleanText(profileSnap.data()?.displayName || profileSnap.data()?.name || 'Fondateur', 100), imageUrl: cleanText(profileSnap.data()?.photoURL || profileSnap.data()?.avatarUrl || '', 2048), type: creatorType, role: 'owner', active: true, capitalPercent: 0, profitPercent: 0, salary: 0, commissionRate: 0, createdAt: FieldValue.serverTimestamp(), createdBy: uid });
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
      slogan: cleanText(context.business.slogan, 180),
      phone: context.business.phone || '', legalForm: context.business.legalForm || '',
      logoUrl: isValidCloudinaryAvatarUrl(context.business.logoUrl) ? context.business.logoUrl : '',
      status: context.business.status || 'active',
    },
    premiumActive: context.premiumActive,
    readOnly: !context.premiumActive || context.business.status === 'archived' || !['owner', 'admin', 'finance', 'manager'].includes(context.role),
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
    if (!memberSnap.exists || !['owner', 'admin', 'finance', 'manager'].includes(memberSnap.data()?.role || '')) throw new BusinessError('Tu ne disposes pas des droits nécessaires pour modifier cette entreprise.', 403, 'READ_ONLY');
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
    const imageUrl = cleanText(input.imageUrl, 2048);
    if (imageUrl && !isValidCloudinaryAvatarUrl(imageUrl)) throw new BusinessError('La photo ou le logo doit provenir de la bibliothèque photo Pata.');
    return {
      name, category: cleanText(input.categoryCustom || input.category, 80),
      phone: cleanText(input.phone, 40), email: cleanText(input.email, 120),
      address: cleanText(input.address, 180), role: cleanText(input.roleCustom || input.role, 100),
      imageUrl, note: cleanText(input.note, 500), ...common,
    };
  }
  if (resource === 'contracts') {
    const title = cleanText(input.title, 140);
    if (!title) throw new BusinessError('Indique le titre du contrat.');
    const contractType = cleanText(input.contractTypeCustom || input.contractType, 80) || 'other';
    return {
      title, contractType, counterparty: cleanText(input.counterparty, 120),
      startDate: input.startDate ? parseDate(input.startDate) : '',
      endDate: input.endDate ? parseDate(input.endDate) : '',
      amount: input.amount ? parseAmount(input.amount, 'Montant du contrat') : 0,
      affectsFinances: input.affectsFinances !== false,
      status: ['draft', 'active', 'completed', 'cancelled'].includes(input.status) ? input.status : 'draft',
      description: cleanText(input.description, 1000), ...common,
    };
  }
  if (resource === 'obligations') {
    const title = cleanText(input.title, 140);
    if (!title) throw new BusinessError('Indique l’obligation à suivre.');
    const amount = input.amount ? parseAmount(input.amount, 'Montant de l’obligation') : 0;
    return {
      title, type: cleanText(input.typeCustom || input.type, 80) || 'other',
      amount, amountPaid: 0, remaining: amount,
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
  const activity = cleanText(input.activityCustom || input.activity, 120);
  const slogan = cleanText(input.slogan, 180);
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
      name, nameSearch: name.toLocaleLowerCase('fr'), activity, slogan, legalForm, city, phone,
      logoUrl: logoUrl || FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { id: businessId, name, activity, slogan, legalForm, city, phone, logoUrl };
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
  if (!apiUser || !secretKey) throw new BusinessError('La configuration du service de paiement est incomplète.', 503, 'PAYMENT_PROVIDER_CONFIG');
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
    throw new BusinessError('Le service de paiement est momentanément indisponible. Réessaie la vérification.', 502, 'PAYMENT_PROVIDER_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new BusinessError(data.message || 'Impossible de vérifier le paiement pour le moment.', 502, 'PAYMENT_PROVIDER_STATUS');
  return data;
}

export async function listBusinessPaymentLinks(uid,businessId){
 const c=await getBusinessContext(uid,businessId);
 const snap=await businessPaymentLinksRef().where('businessId','==',c.businessId).limit(100).get();
 const links=snap.docs.map(serializeDocument).filter(x=>!x.parentLinkId).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 return {paymentLinks:links,readOnly:!c.premiumActive||c.business.status==='archived'};
}
export async function getPublicBusinessPaymentLink(paymentLinkId,visitorId=''){
 const id=validId(paymentLinkId),ref=businessPaymentLinksRef().doc(id),snap=await ref.get();
 if(!snap.exists)throw new BusinessError('Cette offre de paiement est introuvable.',404,'PAYMENT_LINK_NOT_FOUND');
 let link=snap.data()||{};
 if(['PENDING','CONFIRMED','FAILED','EXPIRED'].includes(link.status)&&!Object.prototype.hasOwnProperty.call(link,'successfulPayments')){
  const legacyAttempt=ref.collection('payments').doc(id);
  await adminDb.runTransaction(async tx=>{
   const [fresh,attempt]=await Promise.all([tx.get(ref),tx.get(legacyAttempt)]);if(!fresh.exists)return;const old=fresh.data()||{};
   if(old.status==='PENDING'&&old.transId&&old.checkoutUrl&&!attempt.exists)tx.create(legacyAttempt,{paymentLinkId:id,businessId:old.businessId,userId:old.userId,accountId:old.accountId||'main',amount:Number(old.amount)||0,title:cleanText(old.title,100),customerName:cleanText(old.customerName,100),customerEmail:cleanText(old.customerEmail,160),checkoutUrl:old.checkoutUrl,transId:old.transId,status:'PENDING',createdAt:old.createdAt||FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
   const paid=old.status==='CONFIRMED'?1:0,gross=paid?(Number(old.amount)||0):0,net=paid?(Number(old.receivedAmount)||Number(old.amount)||0):0,fees=paid?(Number(old.providerFeeAmount)||Math.max(0,gross-net)):0;
   tx.update(ref,{status:'ACTIVE',activePaymentCount:FieldValue.increment(old.status==='PENDING'&&old.transId&&old.checkoutUrl&&!attempt.exists?1:0),pageViews:Number(old.pageViews)||0,uniqueViews:Number(old.uniqueViews)||0,clickCount:Number(old.clickCount)||0,uniqueClickers:Number(old.uniqueClickers)||0,successfulPayments:paid,grossRevenue:gross,netRevenue:net,feeRevenue:fees,updatedAt:FieldValue.serverTimestamp()});
  });
  link=(await ref.get()).data()||link;
 }
 const visitor=cleanText(visitorId,100).replace(/[^a-zA-Z0-9_-]/g,'');
 if(link.status==='ACTIVE'){
  const vr=visitor.length>=12?ref.collection('viewers').doc(visitor):null;
  await adminDb.runTransaction(async tx=>{const reads=[tx.get(ref)];if(vr)reads.push(tx.get(vr));const rows=await Promise.all(reads),fresh=rows[0],seen=vr?rows[1]:null;if(!fresh.exists||fresh.data()?.status!=='ACTIVE')return;tx.update(ref,{pageViews:FieldValue.increment(1),...(vr&&!seen.exists?{uniqueViews:FieldValue.increment(1)}:{}),updatedAt:FieldValue.serverTimestamp()});if(vr&&!seen.exists)tx.create(vr,{firstSeenAt:FieldValue.serverTimestamp()});});
 }
 const bs=await businessesRef().doc(validId(link.businessId)).get(),b=bs.exists?bs.data()||{}:{};
 const max=Math.max(0,Number(link.maxPayments)||0),sold=link.status==='SOLD_OUT'||(max>0&&Number(link.successfulPayments||0)>=max);
 return {payment:{id,status:sold?'SOLD_OUT':link.status||'UNAVAILABLE',title:cleanText(link.title,100),description:cleanText(link.description,1200),imageUrl:isValidCloudinaryAvatarUrl(link.imageUrl)?link.imageUrl:'',amount:Number(link.amount)||0,originalAmount:Number(link.originalAmount)||Number(link.amount)||0,discountAmount:Math.max(0,Number(link.discountAmount)||0),businessName:cleanText(b.name||link.businessName,100),businessSlogan:cleanText(b.slogan,180)}};
}
export async function createPublicBusinessPaymentCheckout(paymentLinkId,visitorId=''){
 const id=validId(paymentLinkId),ref=businessPaymentLinksRef().doc(id),attempt=ref.collection('payments').doc(),visitor=cleanText(visitorId,100).replace(/[^a-zA-Z0-9_-]/g,''),clicker=visitor.length>=12?ref.collection('clickers').doc(visitor):null;
 let link;
 await adminDb.runTransaction(async tx=>{
  const reads=[tx.get(ref)];if(clicker)reads.push(tx.get(clicker));const rows=await Promise.all(reads),snap=rows[0],seen=clicker?rows[1]:null;
  if(!snap.exists)throw new BusinessError('Cette offre est introuvable.',404,'PAYMENT_LINK_NOT_FOUND');
  link=snap.data()||{};const max=Math.max(0,Number(link.maxPayments)||0),paid=Math.max(0,Number(link.successfulPayments)||0),active=Math.max(0,Number(link.activePaymentCount)||0);
  if(link.status!=='ACTIVE'||(max>0&&paid+active>=max))throw new BusinessError('Cette offre n’accepte plus de paiement pour le moment.',410,'OFFER_UNAVAILABLE');
  tx.update(ref,{clickCount:FieldValue.increment(1),activePaymentCount:FieldValue.increment(1),...(clicker&&!seen.exists?{uniqueClickers:FieldValue.increment(1)}:{}),updatedAt:FieldValue.serverTimestamp()});
  if(clicker&&!seen.exists)tx.create(clicker,{firstClickedAt:FieldValue.serverTimestamp()});
  tx.create(attempt,{paymentLinkId:id,businessId:link.businessId,userId:link.userId,accountId:link.accountId,amount:Number(link.amount)||0,title:cleanText(link.title,100),customerName:cleanText(link.customerName,100),customerEmail:cleanText(link.customerEmail,160),status:'INITIATING',createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
 });
 try{
  const apiUser=process.env.FAPSHI_API_USER,secret=process.env.FAPSHI_SECRET_KEY;
  if(!apiUser||!secret)throw new BusinessError('La configuration du service de paiement est incomplète.',503,'PAYMENT_PROVIDER_CONFIG');
  let origin='https://pata-yam.site';try{origin=new URL(process.env.NEXT_PUBLIC_APP_URL||process.env.NEXT_PUBLIC_SITE_URL||origin).origin;}catch{}
  const payload={amount:Number(link.amount),...(link.customerEmail?{email:link.customerEmail}:{}),redirectUrl:origin+'/business-payment/return?paymentLinkId='+encodeURIComponent(id),userId:link.userId,externalId:attempt.id,message:cleanText(link.title,80)};
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);let response;
  try{response=await fetch('https://live.fapshi.com/initiate-pay',{method:'POST',headers:{'Content-Type':'application/json',apiuser,apikey:secret},body:JSON.stringify(payload),signal:controller.signal,cache:'no-store'});}catch{throw new BusinessError('Impossible de préparer le paiement. Réessaie.',502,'PAYMENT_PROVIDER_UNAVAILABLE');}finally{clearTimeout(timeout);}
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new BusinessError(data.message||'Le paiement ne peut pas être préparé.',502,'PAYMENT_LINK_REJECTED');
  const checkoutUrl=paymentLinkPublicUrl(data.link||data.url||data.data?.url),transId=cleanText(data.transId||data.data?.transId,160);
  if(!checkoutUrl||!transId)throw new BusinessError('Adresse de paiement invalide.',502,'PAYMENT_LINK_INVALID');
  await attempt.set({checkoutUrl,transId,status:'PENDING',updatedAt:FieldValue.serverTimestamp()},{merge:true});return {checkoutUrl};
 }catch(error){
  await adminDb.runTransaction(async tx=>{const [l,a]=await Promise.all([tx.get(ref),tx.get(attempt)]);if(a.exists&&!['FAILED','CONFIRMED','EXPIRED'].includes(a.data()?.status)){tx.update(attempt,{status:'FAILED',failureReason:cleanText(error?.message||'Échec',200),updatedAt:FieldValue.serverTimestamp()});if(l.exists)tx.update(ref,{activePaymentCount:FieldValue.increment(-1),updatedAt:FieldValue.serverTimestamp()});}}).catch(()=>{});throw error;
 }
}
export async function createBusinessPaymentLink(uid,businessId,input={}){
 const c=await getBusinessContext(uid,businessId);requireWritable(c);
 if(typeof input.amount==='string'&&!/^\d+$/.test(input.amount.trim()))throw new BusinessError('Le montant doit être un nombre entier en FCFA.');
 const amount=parseAmount(input.amount,'Montant à payer');if(amount<100)throw new BusinessError('Le montant minimum à demander est de 100 FCFA.');
 const originalAmount=input.originalAmount?parseAmount(input.originalAmount,'Prix normal'):amount;if(originalAmount<amount)throw new BusinessError('Le prix normal ne peut pas être inférieur au montant à payer.');
 const title=cleanText(input.title,100);if(title.length<2)throw new BusinessError('Donne un nom au produit ou service.');
 const description=cleanText(input.description,1200);if(description.length<5)throw new BusinessError('Ajoute une courte description du produit ou service.');
 const imageUrl=cleanText(input.imageUrl,2048);if(imageUrl&&!isValidCloudinaryAvatarUrl(imageUrl))throw new BusinessError('La photo du produit doit provenir de la bibliothèque photo Pata.');
 const customerName=cleanText(input.customerName,100),customerEmail=cleanText(input.customerEmail,160).toLowerCase();if(!validEmail(customerEmail))throw new BusinessError('Adresse e-mail du client invalide.');
 const accountId=validId(input.accountId||'main'),maxPayments=input.maxPayments===''||input.maxPayments==null?0:Number(input.maxPayments);
 if(!Number.isSafeInteger(maxPayments)||maxPayments<0||maxPayments>1000000)throw new BusinessError('Limite de paiements invalide.');
 const requestId=cleanText(input.requestId,100).replace(/[^a-zA-Z0-9_-]/g,'_');if(requestId.length<8)throw new BusinessError('Identifiant de demande invalide.');
 const id='pl_'+requestId,ref=businessPaymentLinksRef().doc(id),account=c.businessRef.collection('accounts').doc(accountId);let duplicate=null;
 await adminDb.runTransaction(async tx=>{const [profile,member,business,acc,existing]=await Promise.all([tx.get(c.userRef),tx.get(c.memberRef),tx.get(c.businessRef),tx.get(account),tx.get(ref)]);
  if(!profile.exists||!isPremium(profile.data()||{}))premiumRequired();if(!member.exists||!['owner','admin','finance','manager'].includes(member.data()?.role||''))throw new BusinessError('Droits insuffisants pour créer ce lien.',403,'READ_ONLY');
  if(!business.exists||business.data()?.status==='archived')throw new BusinessError('Entreprise indisponible.',404);if(!acc.exists||acc.data()?.active===false)throw new BusinessError('Compte de destination introuvable.');
  if(existing.exists){duplicate=serializeDocument(existing);return;}
  tx.create(ref,{businessId:c.businessId,businessName:cleanText(c.business.name,100),userId:uid,createdBy:uid,accountId,title,description,imageUrl,customerName,customerEmail,amount,originalAmount,discountAmount:Math.max(0,originalAmount-amount),maxPayments,currency:'XAF',status:'ACTIVE',pageViews:0,uniqueViews:0,clickCount:0,uniqueClickers:0,successfulPayments:0,grossRevenue:0,netRevenue:0,feeRevenue:0,activePaymentCount:0,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
 });
 if(duplicate)return {paymentLink:duplicate,duplicate:true};
 let origin='https://pata-yam.site';try{origin=new URL(process.env.NEXT_PUBLIC_APP_URL||process.env.NEXT_PUBLIC_SITE_URL||origin).origin;}catch{}
 await ref.update({publicUrl:origin+'/paiement/'+encodeURIComponent(id)});return {paymentLink:serializeDocument(await ref.get()),duplicate:false};
}
async function settleBusinessPaymentLink(linkRef, providerData) {
  const transId = cleanText(providerData?.transId || providerData?.trans_id, 160);
  if (!transId) throw new BusinessError('La réponse du service de paiement ne contient pas d’identifiant de transaction.', 502, 'PAYMENT_VERIFICATION_INVALID');
  const linkSnap = await linkRef.get();
  if (!linkSnap.exists) return { handled: false, status: 'NOT_FOUND' };
  const link = linkSnap.data() || {};
  if (link.status === 'CONFIRMED') return { handled: true, status: 'CONFIRMED', paymentLink: serializeDocument(linkSnap) };
  if (String(link.transId || '') !== transId) throw new BusinessError('L’identifiant de transaction ne correspond pas à l’offre créée.', 409, 'PAYMENT_ID_MISMATCH');
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
    throw new BusinessError('Le montant confirmé ne correspond pas à l’offre demandée. Aucun fonds n’a été crédité.', 409, 'PAYMENT_AMOUNT_MISMATCH');
  }
  if (!Number.isSafeInteger(netAmount) || netAmount <= 0 || netAmount > grossAmount) {
    throw new BusinessError('Le service de paiement n’a pas fourni un montant net de règlement valide. Aucun fonds n’a été crédité.', 409, 'PAYMENT_REVENUE_INVALID');
  }
  if (String(providerData.externalId || '') !== String(linkRef.id)) {
    throw new BusinessError('La référence de paiement ne correspond pas à cette offre. Aucun fonds n’a été crédité.', 409, 'PAYMENT_REFERENCE_MISMATCH');
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
      note: 'Encaissement confirmé · frais de traitement déduits séparément',
      status: 'posted', createdBy: link.userId,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    if (feeAmount > 0) {
      transaction.create(feeTransactionRef, {
        type: 'expense', direction: 'expense', flowType: 'provider_fee',
        title: 'Frais de traitement · ' + cleanText(link.title, 80), categoryId: 'payment_fees',
        amount: feeAmount, date, month, accountId, paymentMethod: 'fapshi',
        paymentLinkId: linkRef.id, transId,
        note: 'Frais de traitement prélevés sur cet encaissement',
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

async function settleBusinessPaymentAttempt(attemptRef, providerData) {
 const attemptSnap=await attemptRef.get();if(!attemptSnap.exists)return {handled:false,status:'NOT_FOUND'};
 const attempt=attemptSnap.data()||{},linkRef=attemptRef.parent.parent;
 if(!linkRef)throw new BusinessError('Offre de paiement introuvable.',404);
 if(attempt.status==='CONFIRMED')return {handled:true,status:'CONFIRMED'};
 const transId=cleanText(providerData?.transId||providerData?.trans_id,160);
 if(String(attempt.transId||'')!==transId)throw new BusinessError('Identifiant de transaction incorrect.',409,'PAYMENT_ID_MISMATCH');
 const providerStatus=cleanText(providerData.status,32).toUpperCase();
 if(providerStatus!=='SUCCESSFUL'){
  if(['FAILED','EXPIRED'].includes(providerStatus))await adminDb.runTransaction(async tx=>{const [a,l]=await Promise.all([tx.get(attemptRef),tx.get(linkRef)]);if(!a.exists||['CONFIRMED','FAILED','EXPIRED'].includes(a.data()?.status))return;tx.update(attemptRef,{status:providerStatus,failureReason:cleanText(providerData.reason||providerStatus,200),updatedAt:FieldValue.serverTimestamp()});if(l.exists)tx.update(linkRef,{activePaymentCount:FieldValue.increment(-1),updatedAt:FieldValue.serverTimestamp()});});
  return {handled:true,status:['FAILED','EXPIRED'].includes(providerStatus)?providerStatus:'PENDING'};
 }
 const gross=Number(providerData.amount),net=Number(providerData.revenue);
 if(!Number.isSafeInteger(gross)||gross!==Number(attempt.amount))throw new BusinessError('Le montant confirmé ne correspond pas à cette offre.',409,'PAYMENT_AMOUNT_MISMATCH');
 if(!Number.isSafeInteger(net)||net<=0||net>gross)throw new BusinessError('Montant net de règlement invalide.',409,'PAYMENT_REVENUE_INVALID');
 if(String(providerData.externalId||'')!==attemptRef.id||String(providerData.userId||'')!==String(attempt.userId))throw new BusinessError('La référence de paiement est invalide.',409,'PAYMENT_REFERENCE_MISMATCH');
 const businessRef=businessesRef().doc(validId(attempt.businessId)),accountRef=businessRef.collection('accounts').doc(validId(attempt.accountId||'main'));
 const date=parseDate(String(providerData.dateConfirmed||providerData.dateInitiated||todayDouala()).slice(0,10)),month=date.slice(0,7),fee=gross-net;
 const incomeRef=businessRef.collection('transactions').doc('pay_'+attemptRef.id+'_income'),feeRef=businessRef.collection('transactions').doc('pay_'+attemptRef.id+'_fee'),monthRef=businessRef.collection('monthlySummaries').doc(month);
 const budgetsQuery=fee>0?businessRef.collection('budgets').where('month','==',month).limit(30):null;
 await adminDb.runTransaction(async tx=>{
  const reads=[tx.get(attemptRef),tx.get(linkRef),tx.get(businessRef),tx.get(accountRef),tx.get(incomeRef),tx.get(feeRef)];if(budgetsQuery)reads.push(tx.get(budgetsQuery));const rows=await Promise.all(reads),[a,l,b,acc,income,feeTxn]=rows,budgets=budgetsQuery?rows[6]:null;
  if(!a.exists)throw new BusinessError('Tentative de paiement introuvable.',404);if(a.data()?.status==='CONFIRMED')return;
  if(!l.exists||!b.exists||!acc.exists||acc.data()?.active===false)throw new BusinessError('Compte professionnel de destination introuvable. Paiement à régulariser.',409,'BUSINESS_ACCOUNT_MISSING');
  if(income.exists||(fee>0&&feeTxn.exists))throw new BusinessError('Écriture de paiement déjà existante. Vérification requise.',409,'PAYMENT_LEDGER_CONFLICT');
  const offer=l.data()||{};
  tx.create(incomeRef,{type:'income',direction:'income',flowType:'normal',title:cleanText(offer.title,100),categoryId:'sales',amount:gross,grossAmount:gross,receivedAmount:net,providerFeeAmount:fee,date,month,accountId:attempt.accountId,paymentMethod:'fapshi',paymentLinkId:linkRef.id,paymentAttemptId:attemptRef.id,transId,customerName:cleanText(providerData.payerName||attempt.customerName,100),customerEmail:cleanText(providerData.email||attempt.customerEmail,160),note:'Paiement confirmé pour '+cleanText(offer.title,100),status:'posted',createdBy:attempt.userId,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  if(fee>0)tx.create(feeRef,{type:'expense',direction:'expense',flowType:'provider_fee',title:'Frais de traitement · '+cleanText(offer.title,80),categoryId:'payment_fees',amount:fee,date,month,accountId:attempt.accountId,paymentMethod:'fapshi',paymentLinkId:linkRef.id,paymentAttemptId:attemptRef.id,transId,note:'Frais de traitement liés à cet encaissement',status:'posted',createdBy:attempt.userId,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  tx.update(accountRef,{balance:FieldValue.increment(net),updatedAt:FieldValue.serverTimestamp()});
  tx.update(businessRef,{cashBalance:FieldValue.increment(net),totalIncome:FieldValue.increment(gross),...(fee>0?{totalExpense:FieldValue.increment(fee)}:{}),updatedAt:FieldValue.serverTimestamp(),lastActivityAt:FieldValue.serverTimestamp()});
  tx.set(monthRef,{month,income:FieldValue.increment(gross),...(fee>0?{expense:FieldValue.increment(fee)}:{}),transactionCount:FieldValue.increment(fee>0?2:1),updatedAt:FieldValue.serverTimestamp()},{merge:true});
  if(fee>0&&budgets?.docs?.length){for(const budgetDoc of budgets.docs){const budget=budgetDoc.data()||{};if(String(budget.categoryId||'')!=='payment_fees')continue;const spent=Math.max(0,Number(budget.spent)||0)+fee,allocated=Math.max(0,Number(budget.amount)||0);tx.update(budgetDoc.ref,{spent,remaining:Math.max(0,allocated-spent),overBudget:spent>allocated,updatedAt:FieldValue.serverTimestamp()});}}
  const link=offer,max=Math.max(0,Number(link.maxPayments)||0),next=Math.max(0,Number(link.successfulPayments)||0)+1;
  tx.update(linkRef,{successfulPayments:FieldValue.increment(1),grossRevenue:FieldValue.increment(gross),netRevenue:FieldValue.increment(net),feeRevenue:FieldValue.increment(fee),activePaymentCount:FieldValue.increment(-1),status:max>0&&next>=max?'SOLD_OUT':'ACTIVE',updatedAt:FieldValue.serverTimestamp(),lastPaymentAt:FieldValue.serverTimestamp()});
  tx.update(attemptRef,{status:'CONFIRMED',receivedAmount:net,providerFeeAmount:fee,payerName:cleanText(providerData.payerName||attempt.customerName,100),payerEmail:cleanText(providerData.email||attempt.customerEmail,160),confirmedAt:FieldValue.serverTimestamp(),confirmedDate:date,financeIncomeTransactionId:incomeRef.id,financeFeeTransactionId:fee>0?feeRef.id:'',updatedAt:FieldValue.serverTimestamp()});
 });
 return {handled:true,status:'CONFIRMED'};
}

export async function processFapshiBusinessPayment(transId) {
  const safeTransId = cleanText(transId, 160);
  if (!safeTransId || safeTransId.includes('/')) return { handled: false, status: 'NOT_FOUND' };
  const data = await fetchFapshiPaymentStatus(safeTransId);
  const attempts = await adminDb.collectionGroup('payments').where('transId', '==', safeTransId).limit(1).get();
  if (!attempts.empty) return settleBusinessPaymentAttempt(attempts.docs[0].ref, data);
  const snapshot = await businessPaymentLinksRef().where('transId', '==', safeTransId).limit(1).get();
  if (snapshot.empty) return { handled: false, status: 'NOT_FOUND' };
  return settleBusinessPaymentLink(snapshot.docs[0].ref, data);
}

export async function getBusinessPaymentLinkDetails(uid,businessId,paymentLinkId){
 const c=await getBusinessContext(uid,businessId),id=validId(paymentLinkId),ref=businessPaymentLinksRef().doc(id),snap=await ref.get();
 if(!snap.exists||snap.data()?.businessId!==c.businessId)throw new BusinessError('Lien de paiement introuvable.',404,'PAYMENT_LINK_NOT_FOUND');
 const payments=await ref.collection('payments').orderBy('createdAt','desc').limit(100).get();
 return {paymentLink:serializeDocument(snap),payments:payments.docs.map(serializeDocument)};
}
export async function verifyBusinessPaymentLink(uid,businessId,paymentLinkId){
 const c=await getBusinessContext(uid,businessId),id=validId(paymentLinkId),ref=businessPaymentLinksRef().doc(id),snap=await ref.get();
 if(!snap.exists||snap.data()?.businessId!==c.businessId)throw new BusinessError('Lien de paiement introuvable pour cette entreprise.',404,'PAYMENT_LINK_NOT_FOUND');
 const pending=await ref.collection('payments').where('status','in',['PENDING','INITIATING']).limit(20).get();
 const results=await Promise.all(pending.docs.map(d=>d.data()?.transId?processFapshiBusinessPayment(d.data().transId):null));
 return {success:true,status:(await ref.get()).data()?.status||'ACTIVE',checked:results.filter(Boolean).length};
}


const BUSINESS_JOIN_TYPES = new Set(['founder','cofounder','employee','partner','associate','contractor']);
const BUSINESS_ACCESS_ROLES = new Set(['admin','finance','manager','staff','viewer']);
const businessInvitationsRef = () => adminDb.collection('businessInvitations');

export async function searchBusinessesForJoin(uid, query) {
  const term = cleanText(query, 80).toLocaleLowerCase('fr');
  if (term.length < 3) return { businesses: [] };
  const snapshot = await businessesRef().orderBy('nameSearch').startAt(term).endAt(term + '\uf8ff').limit(10).get();
  const memberships = await userBusinessRefs(uid).limit(50).get();
  const joined = new Set(memberships.docs.filter(d => d.data()?.active !== false && d.data()?.status !== 'revoked').map(d => d.id));
  return { businesses: snapshot.docs.filter(d => d.data()?.status !== 'archived' && !joined.has(d.id)).map(d => {
    const b=d.data()||{};return {id:d.id,name:cleanText(b.name,100),slogan:cleanText(b.slogan,180),city:cleanText(b.city,80),logoUrl:isValidCloudinaryAvatarUrl(b.logoUrl)?b.logoUrl:''};
  }) };
}

export async function requestBusinessJoin(uid, businessId, input = {}) {
  const id=validId(businessId),type=BUSINESS_JOIN_TYPES.has(input.personType)?input.personType:'employee';
  const userRef=usersRef().doc(uid),businessRef=businessesRef().doc(id),memberRef=businessRef.collection('members').doc(uid),requestRef=businessRef.collection('joinRequests').doc(uid);
  const [profileSnap,businessSnap,memberSnap,requestSnap]=await Promise.all([userRef.get(),businessRef.get(),memberRef.get(),requestRef.get()]);
  if(!profileSnap.exists)throw new BusinessError('Profil utilisateur introuvable.',401);
  if(!businessSnap.exists||businessSnap.data()?.status==='archived')throw new BusinessError('Entreprise introuvable.',404);
  if(memberSnap.exists&&memberSnap.data()?.active!==false)throw new BusinessError('Tu fais déjà partie de cette entreprise.',409,'ALREADY_MEMBER');
  if(requestSnap.exists&&requestSnap.data()?.status==='pending')throw new BusinessError('Une demande est déjà en attente pour cette entreprise.',409,'REQUEST_PENDING');
  const profile=profileSnap.data()||{};
  await requestRef.set({uid,personType:type,message:cleanText(input.message,300),name:cleanText(profile.displayName||profile.name||profile.fullName||'Utilisateur Pata',100),imageUrl:isValidCloudinaryAvatarUrl(profile.photoURL||profile.avatarUrl)?(profile.photoURL||profile.avatarUrl):'',email:cleanText(profile.email,160),status:'pending',createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  return {success:true};
}

export async function listBusinessJoinRequests(uid,businessId) {
  const c=await getBusinessContext(uid,businessId);
  if(c.business.ownerId!==uid&&c.role!=='admin')throw new BusinessError('Seul le fondateur ou un administrateur peut consulter les demandes.',403,'PERMISSION_DENIED');
  const snap=await c.businessRef.collection('joinRequests').where('status','==','pending').limit(50).get();
  return {requests:snap.docs.map(serializeDocument)};
}

export async function reviewBusinessJoinRequest(uid,businessId,requestUid,input={}) {
  const c=await getBusinessContext(uid,businessId);
  if(c.business.ownerId!==uid)throw new BusinessError('Seul le fondateur peut valider les demandes d’adhésion.',403,'PERMISSION_DENIED');
  const target=validId(requestUid),requestRef=c.businessRef.collection('joinRequests').doc(target),memberRef=c.businessRef.collection('members').doc(target),reverse=userBusinessRefs(target).doc(c.businessId),personRef=c.businessRef.collection('people').doc(target);
  const approved=input.approved===true,role=BUSINESS_ACCESS_ROLES.has(input.role)?input.role:'staff';
  await adminDb.runTransaction(async tx=>{
    const [request,member,business]=await Promise.all([tx.get(requestRef),tx.get(memberRef),tx.get(c.businessRef)]);
    if(!request.exists||request.data()?.status!=='pending')throw new BusinessError('Cette demande n’est plus en attente.',409,'REQUEST_NOT_PENDING');
    if(!business.exists||business.data()?.ownerId!==uid)throw new BusinessError('Droits fondateur requis.',403);
    if(approved){
      if(member.exists&&member.data()?.active!==false)throw new BusinessError('Cette personne est déjà membre.',409);
      const req=request.data()||{};
      tx.set(memberRef,{uid:target,role,personType:BUSINESS_JOIN_TYPES.has(req.personType)?req.personType:'employee',active:true,status:'active',permissions:input.permissions&&typeof input.permissions==='object'?input.permissions:{},invitedBy:uid,joinedAt:FieldValue.serverTimestamp()});
      tx.set(reverse,{businessId:c.businessId,role,active:true,createdAt:FieldValue.serverTimestamp()});
      tx.set(personRef,{name:cleanText(req.name,100),imageUrl:cleanText(req.imageUrl,2048),type:BUSINESS_JOIN_TYPES.has(req.personType)?req.personType:'employee',role,phone:'',email:cleanText(req.email,160),active:true,capitalPercent:0,profitPercent:0,salary:0,commissionRate:0,createdAt:FieldValue.serverTimestamp(),createdBy:uid},{merge:true});
    }
    tx.update(requestRef,{status:approved?'approved':'rejected',reviewedBy:uid,assignedRole:approved?role:'',reviewedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  });
  return {success:true,approved};
}

export async function createBusinessInvitation(uid,businessId,input={}) {
  const c=await getBusinessContext(uid,businessId);
  if(!['owner','admin'].includes(c.role))throw new BusinessError('Droits insuffisants pour inviter un membre.',403,'PERMISSION_DENIED');
  const email=cleanText(input.email,160).toLowerCase();
  if(!validEmail(email)||!email)throw new BusinessError('Indique une adresse e-mail valide.');
  const role=BUSINESS_ACCESS_ROLES.has(input.role)?input.role:'staff';
  if(c.role==='admin'&&role==='admin')throw new BusinessError('Seul le fondateur peut inviter un autre administrateur.',403);
  const personType=BUSINESS_JOIN_TYPES.has(input.personType)?input.personType:'employee';
  let targetUid='';
  try{const user=await adminAuth.getUserByEmail(email);targetUid=user.uid;}catch(error){if(error?.code!=='auth/user-not-found')throw error;}
  const ref=businessInvitationsRef().doc();
  const origin=process.env.NEXT_PUBLIC_APP_URL||process.env.NEXT_PUBLIC_SITE_URL||'https://www.pata-yam.site';
  const invitationUrl=origin+'/businesses/invitation/'+ref.id;
  const safeBusinessName=cleanText(c.business.name,100).replace(/[&<>\"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[char]));
  await ref.create({businessId:c.businessId,businessName:cleanText(c.business.name,100),businessLogoUrl:isValidCloudinaryAvatarUrl(c.business.logoUrl)?c.business.logoUrl:'',businessSlogan:cleanText(c.business.slogan,180),invitedEmail:email,invitedEmailLower:email,targetUid,role,personType,status:'pending',createdBy:uid,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  let emailSent=false;
  if(process.env.RESEND_API_KEY){
    try{
      const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL||'notifications@pata-yam.site',to:[email],subject:'Invitation à rejoindre '+safeBusinessName+' sur Pata',html:'<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17211c"><h2>Tu es invité(e) à rejoindre '+safeBusinessName+'</h2><p>Le fondateur de cette entreprise t’invite à rejoindre son espace professionnel sur Pata.</p><p>Position proposée : <b>'+personType+'</b><br/>Accès prévu : <b>'+role+'</b></p><p><a href="'+invitationUrl+'" style="display:inline-block;padding:12px 18px;background:#075b43;color:#fff;text-decoration:none;border-radius:8px">Consulter et accepter l’invitation</a></p><p>Si tu n’as pas encore de compte Pata, crée ton compte avec cette adresse e-mail puis ouvre ce lien.</p></div>'})});
      emailSent=response.ok;
    }catch(error){console.warn('Business invitation email failed:',error?.message||error);}
  }
  return {invitation:{id:ref.id,email,role,personType,existingAccount:Boolean(targetUid),emailSent,url:invitationUrl}};
}

export async function listMyBusinessInvitations(uid) {
  const profile=await usersRef().doc(uid).get();
  let email=cleanText(profile.data()?.email,160).toLowerCase();
  if(!email){try{email=cleanText((await adminAuth.getUser(uid)).email,160).toLowerCase();}catch{}}
  const [byUid,byEmail]=await Promise.all([
    businessInvitationsRef().where('targetUid','==',uid).limit(20).get(),
    email?businessInvitationsRef().where('invitedEmailLower','==',email).limit(20).get():Promise.resolve({docs:[]}),
  ]);
  const map=new Map();
  for(const d of [...byUid.docs,...byEmail.docs])if(d.data()?.status==='pending')map.set(d.id,serializeDocument(d));
  return {invitations:[...map.values()]};
}

export async function acceptBusinessInvitation(uid,invitationId) {
  const id=validId(invitationId),ref=businessInvitationsRef().doc(id),userRef=usersRef().doc(uid);
  const authUser=await adminAuth.getUser(uid).catch(()=>null);
  const profileBefore=await userRef.get();
  const accountEmail=cleanText(profileBefore.data()?.email||authUser?.email,160).toLowerCase();
  await adminDb.runTransaction(async tx=>{
    const [invite,profile]=await Promise.all([tx.get(ref),tx.get(userRef)]);
    if(!invite.exists||invite.data()?.status!=='pending')throw new BusinessError('Cette invitation n’est plus disponible.',404,'INVITATION_UNAVAILABLE');
    if(!profile.exists)throw new BusinessError('Profil utilisateur introuvable.',401);
    const data=invite.data()||{},email=accountEmail;
    if(data.targetUid&&data.targetUid!==uid)throw new BusinessError('Cette invitation est destinée à un autre compte.',403);
    if(!email||email!==data.invitedEmailLower)throw new BusinessError('Connecte-toi avec l’adresse e-mail qui a reçu cette invitation.',403);
    const businessRef=businessesRef().doc(validId(data.businessId)),memberRef=businessRef.collection('members').doc(uid),reverse=userBusinessRefs(uid).doc(data.businessId),personRef=businessRef.collection('people').doc(uid);
    const [business,member]=await Promise.all([tx.get(businessRef),tx.get(memberRef)]);
    if(!business.exists||business.data()?.status==='archived')throw new BusinessError('Cette entreprise n’est plus disponible.',404);
    if(member.exists&&member.data()?.active!==false)throw new BusinessError('Tu fais déjà partie de cette entreprise.',409);
    const role=BUSINESS_ACCESS_ROLES.has(data.role)?data.role:'staff',type=BUSINESS_JOIN_TYPES.has(data.personType)?data.personType:'employee';
    tx.set(memberRef,{uid,role,personType:type,active:true,status:'active',invitationId:id,joinedAt:FieldValue.serverTimestamp()});
    tx.set(reverse,{businessId:data.businessId,role,active:true,createdAt:FieldValue.serverTimestamp()});
    tx.set(personRef,{name:cleanText(profile.data()?.displayName||profile.data()?.name||'Membre',100),imageUrl:cleanText(profile.data()?.photoURL||profile.data()?.avatarUrl,2048),type,role,email,active:true,capitalPercent:0,profitPercent:0,salary:0,commissionRate:0,createdAt:FieldValue.serverTimestamp(),createdBy:data.createdBy},{merge:true});
    tx.update(ref,{status:'accepted',acceptedBy:uid,acceptedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  });
  return {success:true,businessId:(await ref.get()).data()?.businessId||''};
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