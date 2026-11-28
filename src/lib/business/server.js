import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import { sendBusinessEmail, escapeEmailHtml } from '@/lib/email/resend';
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
function normalizeBusinessCategory(input = {}) {
  const rawId = cleanText(input.categoryId || '', 80);
  const rawLabel = cleanText(input.categoryCustom || input.categoryLabel || input.category || '', 80);
  const label = rawId === 'custom' ? rawLabel : (rawLabel || rawId);
  const source = rawId && rawId !== 'custom' ? rawId : label;
  const categoryId = source.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'other';
  return { categoryId, categoryLabel: label || 'Autres dépenses' };
}
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
    if (!business.nameSearch && business.name) {
      await businessSnap.ref.update({ nameSearch: normalizeBusinessSearch(business.name) }).catch(() => {});
    }
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
      name, nameSearch: normalizeBusinessSearch(name), activity, slogan, legalForm, city, phone, logoUrl, currency, publicProfileEnabled: false, publicOffersEnabled: true,
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
  const [accountsSnap, monthSnap, recentSnap, historySnap, budgetsSnap] = await Promise.all([
    context.businessRef.collection('accounts').where('active', '==', true).limit(30).get(),
    context.businessRef.collection('monthlySummaries').doc(month).get(),
    context.businessRef.collection('transactions').orderBy('createdAt', 'desc').limit(6).get(),
    context.businessRef.collection('monthlySummaries').orderBy('month', 'desc').limit(12).get(),
    context.businessRef.collection('budgets').where('month', '==', month).limit(100).get(),
  ]);
  const accounts = accountsSnap.docs.map(serializeDocument);
  const accountBalance = accounts.reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
  const monthly = monthSnap.exists ? monthSnap.data() || {} : {};
  const recentTransactions = recentSnap.docs.map(serializeDocument);
  const monthlyHistory = historySnap.docs.map((document) => serializeDocument(document)).reverse();
  const monthlyBudgets = budgetsSnap.docs.map(doc=>doc.data()||{});
  const budgetAllocated = monthlyBudgets.reduce((sum,row)=>sum+Math.max(0,Number(row.amount)||0),0);
  const budgetSpent = monthlyBudgets.reduce((sum,row)=>sum+Math.max(0,Number(row.spent)||0),0);
  const result = {
    business: {
      id: context.business.id, name: context.business.name, activity: context.business.activity,
      city: context.business.city, currency: context.business.currency || 'XAF',
      slogan: cleanText(context.business.slogan, 180),
      phone: context.business.phone || '', legalForm: context.business.legalForm || '',
      logoUrl: isValidCloudinaryAvatarUrl(context.business.logoUrl) ? context.business.logoUrl : '',
      status: context.business.status || 'active',
      publicProfileEnabled: context.business.publicProfileEnabled === true,
      publicOffersEnabled: context.business.publicOffersEnabled !== false,
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
      budgetAllocated,budgetSpent,budgetRemaining:Math.max(0,budgetAllocated-budgetSpent),budgetCount:monthlyBudgets.length,
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
  const title = cleanText(input.title || input.source || input.categoryLabel || input.categoryId || (type === 'income' ? 'Revenu professionnel' : 'Dépense professionnelle'), 120);
  const category = type === 'expense'
    ? normalizeBusinessCategory(input)
    : { categoryId: cleanText(input.categoryId || 'other_income', 80), categoryLabel: cleanText(input.categoryLabel || input.categoryId || 'Autres revenus', 80) };
  const paymentMethod = cleanText(input.paymentMethod, 40);
  const note = cleanText(input.note, 500);
  const allowedMethods = ['cash', 'mtn_momo', 'orange_money', 'bank_transfer', 'card', 'other'];
  if (paymentMethod && !allowedMethods.includes(paymentMethod)) throw new BusinessError('Moyen de paiement invalide.');
  return { type, amount, date, month: date.slice(0, 7), title, categoryId: category.categoryId, categoryLabel: category.categoryLabel, paymentMethod, note };
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


export async function transferBusinessFundsToPersonal(uid,businessId,input={}){
  const context=await getBusinessContext(uid,businessId);requireWritable(context);
  const accountId=validId(input.accountId||'main'),amount=parseAmount(input.amount,'Montant du transfert'),date=parseDate(input.date);
  const requestId=cleanText(input.requestId,100).replace(/[^a-zA-Z0-9_-]/g,'_');
  if(requestId.length<8)throw new BusinessError('Identifiant de transfert invalide.');
  const businessRef=context.businessRef,userRef=context.userRef,accountRef=businessRef.collection('accounts').doc(accountId);
  const transferRef=businessRef.collection('transfers').doc('to_personal_'+requestId);
  const businessTransactionRef=businessRef.collection('transactions').doc('withdrawal_'+requestId);
  const incomeId=('business_'+businessId+'_'+requestId).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,140);
  const incomeRef=userRef.collection('incomes').doc(incomeId),month=date.slice(0,7),monthRef=businessRef.collection('monthlySummaries').doc(month);
  let duplicate=false;
  await adminDb.runTransaction(async transaction=>{
    const [profileSnap,accountSnap,businessSnap,memberSnap,transferSnap,incomeSnap]=await Promise.all([
      transaction.get(userRef),transaction.get(accountRef),transaction.get(businessRef),transaction.get(context.memberRef),transaction.get(transferRef),transaction.get(incomeRef),
    ]);
    if(transferSnap.exists){duplicate=true;return;}
    if(!profileSnap.exists||!isPremium(profileSnap.data()||{}))premiumRequired();
    if(!accountSnap.exists||accountSnap.data()?.active===false)throw new BusinessError('Compte financier de l’entreprise introuvable ou désactivé.');
    if(!businessSnap.exists||businessSnap.data()?.status==='archived')throw new BusinessError('Entreprise indisponible.');
    if(!memberSnap.exists||!['owner','admin','finance'].includes(memberSnap.data()?.role||''))throw new BusinessError('Tu ne disposes pas des droits nécessaires pour transférer des fonds vers tes finances personnelles.',403,'READ_ONLY');
    if(incomeSnap.exists)throw new BusinessError('Un revenu portant déjà cet identifiant existe. Recharge les données avant de réessayer.',409);
    const account=accountSnap.data()||{},balance=Math.max(0,Number(account.balance)||0);
    if(amount>balance)throw new BusinessError('Le montant dépasse le solde disponible de ce compte professionnel : '+balance.toLocaleString('fr-FR')+' FCFA.');
    const business=businessSnap.data()||{},businessName=cleanText(business.name||'Entreprise',100);
    const transactionNote=cleanText(input.note,250)||'Fonds transférés vers les finances personnelles';
    transaction.create(businessTransactionRef,{
      type:'outflow',direction:'outflow',flowType:'owner_withdrawal',title:'Retrait du propriétaire',
      categoryId:'owner_withdrawal',amount,date,month,accountId,status:'posted',
      note:transactionNote+' · '+businessName,personalIncomeId:incomeId,businessTransferId:transferRef.id,
      createdBy:uid,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
    });
    transaction.create(incomeRef,{
      amount,source:'Retrait de fonds · '+businessName,categoryId:'business',date,month,
      note:'Fonds transférés depuis le compte professionnel '+businessName,
      details:transactionNote,paymentMethod:'internal_transfer',flowType:'business_transfer_received',
      businessId,businessName,businessTransactionId:businessTransactionRef.id,businessTransferId:transferRef.id,
      createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
    });
    transaction.create(transferRef,{
      direction:'to_personal',amount,date,accountId,businessTransactionId:businessTransactionRef.id,
      personalIncomeId:incomeId,createdBy:uid,createdAt:FieldValue.serverTimestamp(),
    });
    transaction.update(accountRef,{balance:FieldValue.increment(-amount),updatedAt:FieldValue.serverTimestamp()});
    transaction.update(businessRef,{
      cashBalance:FieldValue.increment(-amount),ownerWithdrawals:FieldValue.increment(amount),
      updatedAt:FieldValue.serverTimestamp(),lastActivityAt:FieldValue.serverTimestamp(),
    });
    transaction.set(monthRef,{month,ownerWithdrawals:FieldValue.increment(amount),transactionCount:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    const profile=profileSnap.data()||{},monthNow=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Douala',year:'numeric',month:'2-digit'}).format(new Date());
    const currentStats=profile.monthlyStats||{};
    const stats=currentStats.lastResetMonth===monthNow?{...currentStats}:{...currentStats,expenses:0,incomes:0,budgets:0,goals:0,lastResetMonth:monthNow};
    stats.incomes=(Number(stats.incomes)||0)+1;stats.lastResetMonth=monthNow;
    transaction.set(userRef,{monthlyStats:stats,lifetimeIncomeAmount:FieldValue.increment(amount),lifetimeIncomeCount:FieldValue.increment(1)},{merge:true});
  });
  return {success:true,duplicate,message:duplicate?'Ce transfert a déjà été enregistré.':'Fonds transférés vers tes finances personnelles et enregistrés comme revenu disponible.'};
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
      counterpartyType: ['clients','suppliers','partners'].includes(input.counterpartyType) ? input.counterpartyType : '',
      counterpartyId: cleanText(input.counterpartyId, 150),
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
      ...normalizeBusinessCategory(input),
      category: cleanText(input.categoryCustom || input.categoryLabel || input.category, 80),
      supplierId: cleanText(input.supplierId, 150),
      affectsFinances: input.affectsFinances !== false,
      status: ['pending', 'in_progress', 'completed', 'cancelled'].includes(input.status) ? input.status : 'pending',
      note: cleanText(input.note, 500), ...common,
    };
  }
  if (resource === 'invoices') {
    const title = cleanText(input.title, 140);
    const customerName = cleanText(input.customerName, 120);
    const customerId = cleanText(input.customerId, 150);
    if (!title || (!customerName && !customerId)) throw new BusinessError('Indique le titre et le client de la facture.');
    const total = parseAmount(input.totalAmount, 'Montant de la facture');
    return {
      title, customerName, customerId,
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

async function saveBusinessBudgetPlan(uid, context, input = {}) {
  const title = cleanText(input.title, 120);
  if (title.length < 2) throw new BusinessError('Donne un nom clair à ce budget.');
  const month = cleanText(input.month || monthDouala(), 7);
  if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BusinessError('Mois de budget invalide.');
  const note = cleanText(input.note, 500), rows = Array.isArray(input.allocations) ? input.allocations : [];
  if (!rows.length || rows.length > 25) throw new BusinessError('Ajoute au moins une enveloppe (25 maximum).');
  const allocations = rows.map(row => ({ ...normalizeBusinessCategory(row || {}), amount: parseAmount(row?.amount, 'Montant prévu') }));
  const ids = new Set();
  for (const row of allocations) { if (ids.has(row.categoryId)) throw new BusinessError('Une même catégorie ne peut apparaître deux fois dans le même budget.'); ids.add(row.categoryId); }
  const collection = context.businessRef.collection('budgets'), refs = allocations.map(() => collection.doc());
  const budgetGroupId = 'budget_' + randomBytes(12).toString('hex'), totalAmount = allocations.reduce((sum,row)=>sum+row.amount,0);
  await adminDb.runTransaction(async transaction => {
    const [profile,member,business,existing] = await Promise.all([
      transaction.get(context.userRef), transaction.get(context.memberRef), transaction.get(context.businessRef),
      transaction.get(collection.where('month','==',month).limit(100)),
    ]);
    if (!profile.exists || !isPremium(profile.data() || {})) premiumRequired();
    if (!member.exists || !['owner','admin','finance','manager'].includes(member.data()?.role || '')) throw new BusinessError('Droits insuffisants pour gérer les budgets.',403);
    if (!business.exists || business.data()?.status === 'archived') throw new BusinessError('Entreprise indisponible.',404);
    const existingCategories = new Set(existing.docs.map(doc=>cleanText(doc.data()?.categoryId,80)).filter(Boolean));
    const conflicts = allocations.filter(row=>existingCategories.has(row.categoryId)).map(row=>row.categoryLabel);
    if (conflicts.length) throw new BusinessError('Une enveloppe existe déjà pour '+conflicts.join(', ')+' ce mois-ci. Réorganise le budget existant avant de continuer.');
    allocations.forEach((row,index)=>transaction.create(refs[index],{
      budgetGroupId,title,note,month,categoryId:row.categoryId,categoryLabel:row.categoryLabel,
      amount:row.amount,spent:0,remaining:row.amount,overBudget:false,
      createdBy:uid,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
    }));
  });
  return {success:true,id:budgetGroupId,totalAmount,categories:allocations.length};
}

export async function saveBusinessResource(uid, businessId, resource, input = {}, itemId = '') {
  if (!RESOURCE_NAMES.has(resource)) throw new BusinessError('Rubrique professionnelle non reconnue.',404);
  const context=await getBusinessContext(uid,businessId,{allowSensitiveRead:false});
  requireWritable(context);
  if(resource==='budgets'&&!itemId)return saveBusinessBudgetPlan(uid,context,input);
  const data=normalizeResource(resource,input),collection=context.businessRef.collection(resource);
  if(itemId){
    const id=validId(itemId),ref=collection.doc(id),previous=await ref.get();
    if(!previous.exists)throw new BusinessError('Élément introuvable.',404);
    if(['invoices','obligations','budgets'].includes(resource))throw new BusinessError('Cette pièce financière ne peut pas être modifiée après sa création. Supprime-la si aucun paiement n’a été enregistré, puis recrée-la.',409);
    await ref.set({...data,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return {success:true,id};
  }
  const ref=collection.doc();let stored={...data,createdAt:FieldValue.serverTimestamp(),createdBy:uid};
  if(['invoices','obligations','contracts'].includes(resource)){
    let relatedRef=null;
    if(resource==='invoices'&&data.customerId)relatedRef=context.businessRef.collection('clients').doc(validId(data.customerId));
    if(resource==='obligations'&&data.supplierId)relatedRef=context.businessRef.collection('suppliers').doc(validId(data.supplierId));
    if(resource==='contracts'&&data.counterpartyId){
      const type=['clients','suppliers','partners'].includes(data.counterpartyType)?data.counterpartyType:'';
      if(!type)throw new BusinessError('Choisis le type de tiers lié au contrat.');
      relatedRef=context.businessRef.collection(type).doc(validId(data.counterpartyId));
    }
    await adminDb.runTransaction(async transaction=>{
      const [profile,member,business,related]=await Promise.all([
        transaction.get(context.userRef),transaction.get(context.memberRef),transaction.get(context.businessRef),
        relatedRef?transaction.get(relatedRef):Promise.resolve(null),
      ]);
      if(!profile.exists||!isPremium(profile.data()||{}))premiumRequired();
      if(!member.exists||!['owner','admin','finance'].includes(member.data()?.role||''))throw new BusinessError('Accès en lecture seule.',403);
      if(!business.exists||business.data()?.status==='archived')throw new BusinessError('Entreprise indisponible.',404);
      if(relatedRef&&!related?.exists)throw new BusinessError('La fiche du tiers associé est introuvable.',404);
      if(resource==='invoices'&&related?.exists)stored.customerName=cleanText(related.data()?.name,120);
      if(resource==='obligations'&&related?.exists)stored.supplierName=cleanText(related.data()?.name,120);
      if(resource==='contracts'&&related?.exists)stored.counterparty=cleanText(related.data()?.name,120);
      transaction.create(ref,stored);
      if(resource==='invoices'){
        transaction.update(context.businessRef,{totalReceivables:FieldValue.increment(data.totalAmount),updatedAt:FieldValue.serverTimestamp()});
        if(related?.exists)transaction.update(relatedRef,{totalInvoiced:FieldValue.increment(data.totalAmount),outstandingAmount:FieldValue.increment(data.totalAmount),updatedAt:FieldValue.serverTimestamp()});
      }else if(resource==='obligations'){
        if(data.affectsFinances!==false)transaction.update(context.businessRef,{totalPayables:FieldValue.increment(data.remaining),updatedAt:FieldValue.serverTimestamp()});
        if(related?.exists)transaction.update(relatedRef,{totalCommitted:FieldValue.increment(data.amount),outstandingAmount:FieldValue.increment(data.remaining),updatedAt:FieldValue.serverTimestamp()});
      }
    });
  }else await ref.create(stored);
  return {success:true,id:ref.id};
}

export async function deleteBusinessResource(uid,businessId,resource,itemId){
  if(!RESOURCE_NAMES.has(resource))throw new BusinessError('Rubrique professionnelle non reconnue.',404);
  const context=await getBusinessContext(uid,businessId,{allowSensitiveRead:false});requireWritable(context);
  const collection=context.businessRef.collection(resource),ref=collection.doc(validId(itemId)),initial=await ref.get();
  if(!initial.exists)throw new BusinessError('Élément introuvable.',404);
  let targetRefs=[ref];
  if(resource==='budgets'&&initial.data()?.budgetGroupId){
    const group=await collection.where('budgetGroupId','==',initial.data().budgetGroupId).limit(25).get();
    targetRefs=group.docs.map(doc=>doc.ref);
  }
  await adminDb.runTransaction(async transaction=>{
    const linkedFinancialQuery=resource==='clients'
      ?context.businessRef.collection('invoices').where('customerId','==',ref.id).limit(100)
      :resource==='suppliers'
        ?context.businessRef.collection('obligations').where('supplierId','==',ref.id).limit(100)
        :null;
    const [profile,member,business,snapshots,linkedFinancial]=await Promise.all([
      transaction.get(context.userRef),transaction.get(context.memberRef),transaction.get(context.businessRef),
      Promise.all(targetRefs.map(target=>transaction.get(target))),
      linkedFinancialQuery?transaction.get(linkedFinancialQuery):Promise.resolve(null),
    ]);
    if(!profile.exists||!isPremium(profile.data()||{}))premiumRequired();
    if(!member.exists||!['owner','admin','finance'].includes(member.data()?.role||''))throw new BusinessError('Accès en lecture seule.',403);
    if(!business.exists||business.data()?.status==='archived')throw new BusinessError('Entreprise indisponible.',404);
    if(snapshots.some(snapshot=>!snapshot.exists))throw new BusinessError('Le contenu a changé. Recharge et réessaie.',409);
    if(resource==='clients'&&linkedFinancial?.docs?.some(doc=>Math.max(0,Number(doc.data()?.remaining??(Number(doc.data()?.totalAmount||0)-Number(doc.data()?.amountPaid||0)))||0)>0))throw new BusinessError('Ce client possède encore une facture impayée. Règle ou annule ses créances avant de supprimer sa fiche.',409,'CLIENT_HAS_RECEIVABLES');
    if(resource==='suppliers'&&linkedFinancial?.docs?.some(doc=>Math.max(0,Number(doc.data()?.remaining??(Number(doc.data()?.amount||0)-Number(doc.data()?.amountPaid||0)))||0)>0))throw new BusinessError('Ce fournisseur possède encore un engagement à payer. Règle ou annule les montants restants avant de supprimer sa fiche.',409,'SUPPLIER_HAS_PAYABLES');
    const records=snapshots.map(snapshot=>snapshot.data()||{});
    if(['invoices','obligations'].includes(resource)&&records.some(data=>Number(data.amountPaid)>0||Boolean(data.paymentLinkId)))throw new BusinessError('Cette pièce a déjà reçu ou effectué un paiement, ou possède un lien de paiement actif. Elle ne peut pas être supprimée.',409);
    const related=[];
    for(const data of records){
      if(resource==='invoices'&&data.customerId)related.push({ref:context.businessRef.collection('clients').doc(validId(data.customerId)),resource,data});
      if(resource==='obligations'&&data.supplierId)related.push({ref:context.businessRef.collection('suppliers').doc(validId(data.supplierId)),resource,data});
    }
    const relatedSnaps=await Promise.all(related.map(item=>transaction.get(item.ref)));
    targetRefs.forEach(target=>transaction.delete(target));
    records.forEach(data=>{
      if(resource==='invoices')transaction.update(context.businessRef,{totalReceivables:FieldValue.increment(-Math.max(0,Number(data.remaining??data.totalAmount)||0)),updatedAt:FieldValue.serverTimestamp()});
      if(resource==='obligations'&&data.affectsFinances!==false)transaction.update(context.businessRef,{totalPayables:FieldValue.increment(-Math.max(0,Number(data.remaining??data.amount)||0)),updatedAt:FieldValue.serverTimestamp()});
    });
    related.forEach((item,index)=>{
      const snapshot=relatedSnaps[index];if(!snapshot?.exists)return;const party=snapshot.data()||{};
      if(item.resource==='invoices')transaction.update(item.ref,{
        totalInvoiced:Math.max(0,(Number(party.totalInvoiced)||0)-(Number(item.data.totalAmount)||0)),
        outstandingAmount:Math.max(0,(Number(party.outstandingAmount)||0)-Math.max(0,Number(item.data.remaining??item.data.totalAmount)||0)),
        updatedAt:FieldValue.serverTimestamp(),
      });
      else transaction.update(item.ref,{
        totalCommitted:Math.max(0,(Number(party.totalCommitted)||0)-(Number(item.data.amount)||0)),
        outstandingAmount:Math.max(0,(Number(party.outstandingAmount)||0)-Math.max(0,Number(item.data.remaining??item.data.amount)||0)),
        updatedAt:FieldValue.serverTimestamp(),
      });
    });
  });
  return {success:true,deletedCount:targetRefs.length};
}

export async function recordBusinessDocumentPayment(uid,businessId,resource,itemId,input={}){
  if(!['invoices','obligations'].includes(resource))throw new BusinessError('Ce type de paiement n’est pas reconnu.');
  const context=await getBusinessContext(uid,businessId,{allowSensitiveRead:false});requireWritable(context);
  const id=validId(itemId),ref=context.businessRef.collection(resource).doc(id);
  const accountId=validId(input.accountId||'main'),accountRef=context.businessRef.collection('accounts').doc(accountId);
  const amount=parseAmount(input.amount,'Montant du paiement'),date=parseDate(input.date),month=date.slice(0,7);
  const requestId=cleanText(input.requestId,100).replace(/[^a-zA-Z0-9_-]/g,'_');
  if(requestId.length<8)throw new BusinessError('Identifiant de paiement invalide. Réessaie depuis le formulaire Pata.');
  const transactionRef=context.businessRef.collection('transactions').doc('payment_'+requestId),monthRef=context.businessRef.collection('monthlySummaries').doc(month);
  const isInvoice=resource==='invoices',budgetsQuery=!isInvoice?context.businessRef.collection('budgets').where('month','==',month).limit(100):null;
  let duplicate=false;
  await adminDb.runTransaction(async transaction=>{
    const [profile,member,itemSnap,account,business,existing,budgets]=await Promise.all([
      transaction.get(context.userRef),transaction.get(context.memberRef),transaction.get(ref),transaction.get(accountRef),transaction.get(context.businessRef),transaction.get(transactionRef),
      budgetsQuery?transaction.get(budgetsQuery):Promise.resolve(null),
    ]);
    if(!profile.exists||!isPremium(profile.data()||{}))premiumRequired();
    if(!member.exists||!['owner','admin','finance'].includes(member.data()?.role||''))throw new BusinessError('Accès en lecture seule.',403);
    if(!itemSnap.exists||!account.exists||!business.exists)throw new BusinessError('Élément ou compte financier introuvable.',404);
    if(existing.exists){duplicate=true;return;}
    const item=itemSnap.data()||{},remaining=isInvoice?Math.max(0,Number(item.totalAmount)-Number(item.amountPaid||0)):Math.max(0,Number(item.remaining??(Number(item.amount)-Number(item.amountPaid||0)))||0);
    if(amount>remaining)throw new BusinessError('Le paiement dépasse le montant restant.');
    const partyId=cleanText(isInvoice?item.customerId:item.supplierId,150),partyType=isInvoice?'clients':'suppliers';
    const partyRef=partyId?context.businessRef.collection(partyType).doc(validId(partyId)):null;
    const partySnap=partyRef?await transaction.get(partyRef):null;
    if(partyRef&&!partySnap?.exists)throw new BusinessError('La fiche liée n’existe plus. Corrige le rattachement avant de payer.',409);
    const partyName=cleanText(partySnap?.data()?.name||(isInvoice?item.customerName:item.supplierName),120);
    const category=isInvoice?{categoryId:'sales',categoryLabel:'Ventes'}:normalizeBusinessCategory({categoryId:item.categoryId,categoryLabel:item.categoryLabel||item.category});
    transaction.create(transactionRef,{
      type:isInvoice?'income':'expense',direction:isInvoice?'income':'expense',flowType:'normal',
      title:(isInvoice?'Paiement facture ':'Paiement obligation ')+cleanText(item.title,100),
      ...category,amount,date,month,accountId,invoiceId:isInvoice?id:null,obligationId:isInvoice?null:id,
      customerId:isInvoice?partyId:'',supplierId:isInvoice?'':partyId,counterpartyName:partyName,
      note:cleanText(input.note,300),status:'posted',createdBy:uid,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
    });
    const signedAmount=isInvoice?amount:-amount;
    transaction.update(accountRef,{balance:FieldValue.increment(signedAmount),updatedAt:FieldValue.serverTimestamp()});
    transaction.update(context.businessRef,{
      cashBalance:FieldValue.increment(signedAmount),
      ...(isInvoice?{totalIncome:FieldValue.increment(amount),totalReceivables:FieldValue.increment(-amount)}:{totalExpense:FieldValue.increment(amount),...(item.affectsFinances!==false?{totalPayables:FieldValue.increment(-amount)}:{})}),
      updatedAt:FieldValue.serverTimestamp(),
    });
    transaction.set(monthRef,{month,...(isInvoice?{income:FieldValue.increment(amount)}:{expense:FieldValue.increment(amount)}),transactionCount:FieldValue.increment(1),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    if(partyRef&&partySnap?.exists){
      const party=partySnap.data()||{};
      transaction.update(partyRef,isInvoice?{totalCollected:FieldValue.increment(amount),outstandingAmount:Math.max(0,(Number(party.outstandingAmount)||0)-amount),updatedAt:FieldValue.serverTimestamp()}:{totalPaid:FieldValue.increment(amount),outstandingAmount:Math.max(0,(Number(party.outstandingAmount)||0)-amount),updatedAt:FieldValue.serverTimestamp()});
    }
    if(!isInvoice&&budgets?.docs?.length){
      const budget=budgets.docs.find(doc=>cleanText(doc.data()?.categoryId,80)===category.categoryId);
      if(budget){const data=budget.data()||{},spent=Math.max(0,Number(data.spent)||0)+amount,allocated=Math.max(0,Number(data.amount)||0);transaction.update(budget.ref,{spent,remaining:Math.max(0,allocated-spent),overBudget:spent>allocated,updatedAt:FieldValue.serverTimestamp()});}
    }
    const paid=(Number(item.amountPaid)||0)+amount;
    if(isInvoice)transaction.update(ref,{amountPaid:paid,remaining:Math.max(0,Number(item.totalAmount)-paid),status:paid>=Number(item.totalAmount)?'paid':'partial',updatedAt:FieldValue.serverTimestamp()});
    else{const nextRemaining=Math.max(0,Number(item.amount)-paid);transaction.update(ref,{amountPaid:paid,remaining:nextRemaining,status:nextRemaining===0?'completed':'in_progress',updatedAt:FieldValue.serverTimestamp()});}
  });
  return {success:true,duplicate,transactionId:transactionRef.id};
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
      name, nameSearch: normalizeBusinessSearch(name), activity, slogan, legalForm, city, phone,
      publicProfileEnabled: input.publicProfileEnabled === true,
      publicOffersEnabled: input.publicOffersEnabled !== false,
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
function nameFromEmail(value){const local=cleanText(value,160).toLowerCase().split('@')[0]||'';return cleanText(local.replace(/[._+-]+/g,' ').replace(/\s+/g,' '),100);}



function cleanPublicMediaList(value,maxItems,validator,label){
 const list=Array.isArray(value)?value:[],cleaned=[];
 for(const raw of list){const item=cleanText(raw,2048);if(!item)continue;if(!validator(item))throw new BusinessError(label+' contient un lien invalide.');if(!cleaned.includes(item))cleaned.push(item);if(cleaned.length>=maxItems)break;}
 return cleaned;
}
function isValidBusinessVideoUrl(value){
 try{
  const url=new URL(String(value||''));if(url.protocol!=='https:'||url.username||url.password)return false;
  const host=url.hostname.toLowerCase(),supported=['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtu.be','vimeo.com','www.vimeo.com','player.vimeo.com','res.cloudinary.com'];
  if(!supported.includes(host))return false;
  if(host==='res.cloudinary.com'&&!/\.(mp4|webm)(?:$|\?)/i.test(url.pathname+url.search))return false;
  if(host.includes('youtube')||host==='youtu.be'){const id=host==='youtu.be'?url.pathname.split('/').filter(Boolean)[0]:(url.searchParams.get('v')||url.pathname.split('/').filter(Boolean).pop());return Boolean(id&&/^[a-zA-Z0-9_-]{6,20}$/.test(id));}
  if(host.includes('vimeo.com'))return /\d{5,15}/.test(url.pathname);
  return true;
 }catch{return false;}
}
function normalizeBusinessPaymentMedia(input={}){
 return {
  galleryImageUrls:cleanPublicMediaList(input.galleryImageUrls,6,isValidCloudinaryAvatarUrl,'La galerie photo'),
  proofImageUrls:cleanPublicMediaList(input.proofImageUrls,6,isValidCloudinaryAvatarUrl,'Les preuves visuelles'),
  videoUrls:cleanPublicMediaList(input.videoUrls,4,isValidBusinessVideoUrl,'Les vidéos'),
  sellingPoints:[...new Set((Array.isArray(input.sellingPoints)?input.sellingPoints:[]).map(v=>cleanText(v,180)).filter(Boolean))].slice(0,8),
 };
}
function businessEmailHtml({business,headline,intro,details=[],ctaUrl,ctaLabel}){
 const name=escapeEmailHtml(business?.name||'Votre entreprise');
 const logo=isValidCloudinaryAvatarUrl(business?.logoUrl)?'<img src="'+escapeEmailHtml(business.logoUrl)+'" alt="" width="56" height="56" style="width:56px;height:56px;object-fit:contain;border-radius:12px;border:1px solid #e5e7eb;background:#fff;">':'';
 const rows=details.filter(row=>row&&row[1]!==undefined&&row[1]!=='').map(row=>'<tr><td style="padding:9px 0;color:#64748b;font-size:12px;border-bottom:1px solid #edf1ee;">'+escapeEmailHtml(row[0])+'</td><td align="right" style="padding:9px 0;color:#172b22;font-size:13px;font-weight:700;border-bottom:1px solid #edf1ee;">'+escapeEmailHtml(row[1])+'</td></tr>').join('');
 const button=ctaUrl?'<p style="margin:24px 0 0;"><a href="'+escapeEmailHtml(ctaUrl)+'" style="display:inline-block;padding:13px 19px;border-radius:9px;background:#075b43;color:#fff;text-decoration:none;font-size:14px;font-weight:700;">'+escapeEmailHtml(ctaLabel||'Consulter')+'</a></p>':'';
 return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;background:#f3f6f4;font-family:Arial,Helvetica,sans-serif;color:#17231f;padding:24px 10px;"><div style="max-width:580px;margin:0 auto;background:#fff;border:1px solid #e1e9e3;border-radius:18px;overflow:hidden;"><div style="padding:24px 26px;border-bottom:1px solid #edf1ee;">'+logo+'<p style="margin:10px 0 0;color:#075b43;font-size:13px;font-weight:700;">'+name+'</p></div><div style="padding:27px 26px;"><h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;color:#15251c;">'+escapeEmailHtml(headline)+'</h1><p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.75;">'+escapeEmailHtml(intro)+'</p>'+(rows?'<table role="presentation" width="100%" cellspacing="0" cellpadding="0">'+rows+'</table>':'')+button+'<p style="margin:25px 0 0;color:#334155;font-size:13px;line-height:1.7;">'+name+'</p></div></div></body></html>';
}
async function sendBusinessNotice({business,to,subject,headline,intro,details,ctaUrl,ctaLabel,idempotencyKey}){
 if(!to||!String(to).includes('@'))return false;
 try{await sendBusinessEmail({to,subject,html:businessEmailHtml({business,headline,intro,details,ctaUrl,ctaLabel}),businessName:business?.name||'Entreprise',idempotencyKey});return true;}
 catch(error){console.warn('[PATA BUSINESS EMAIL]',JSON.stringify({subject:String(subject||'').slice(0,100),error:String(error?.message||error).slice(0,250)}));return false;}
}
async function getBusinessOwnerEmail(business){
 const ownerId=cleanText(business?.ownerId||business?.createdBy,128);if(!ownerId)return '';
 try{const profile=await usersRef().doc(ownerId).get();const email=cleanText(profile.data()?.email,160).toLowerCase();if(email&&validEmail(email))return email;}catch{}
 try{const authUser=await adminAuth.getUser(ownerId);const email=cleanText(authUser.email,160).toLowerCase();return email&&validEmail(email)?email:'';}catch{return '';}
}

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
 const links=snap.docs.map(serializeDocument).filter(x=>!x.parentLinkId&&x.status!=='DELETED').sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 return {paymentLinks:links,readOnly:!c.premiumActive||c.business.status==='archived'};
}
export async function getPublicBusinessProfile(businessId) {
 const id=validId(businessId),businessSnap=await businessesRef().doc(id).get();
 if(!businessSnap.exists)throw new BusinessError('Cette entreprise est introuvable.',404,'BUSINESS_NOT_FOUND');
 const b=businessSnap.data()||{};
 if(b.status==='archived'||b.publicProfileEnabled!==true)throw new BusinessError('Le profil public de cette entreprise n’est pas disponible.',404,'PUBLIC_PROFILE_DISABLED');
 const offers=[];
 if(b.publicOffersEnabled!==false){
  const snap=await businessPaymentLinksRef().where('businessId','==',id).limit(100).get();
  for(const doc of snap.docs){
   const p=doc.data()||{};
   if(p.status!=='ACTIVE'||p.publicOnStorefront===false||p.parentLinkId)continue;
   const max=Math.max(0,Number(p.maxPayments)||0);
   if(max>0&&Number(p.successfulPayments||0)+Number(p.activePaymentCount||0)>=max)continue;
   offers.push({id:doc.id,title:cleanText(p.title,100),description:cleanText(p.description,1200),imageUrl:isValidCloudinaryAvatarUrl(p.imageUrl)?p.imageUrl:'',galleryImageUrls:cleanPublicMediaList(p.galleryImageUrls,6,isValidCloudinaryAvatarUrl,'Galerie'),amount:Number(p.amount)||0,originalAmount:Number(p.originalAmount)||Number(p.amount)||0,ratingCount:Number(p.ratingCount)||0,averageProductRating:Number(p.ratingCount)>0?Math.round((Number(p.productRatingTotal)||0)/Number(p.ratingCount)*10)/10:0,publicUrl:cleanText(p.publicUrl,2048)});
  }
 }
 return {business:{id,name:cleanText(b.name,100),slogan:cleanText(b.slogan,180),activity:cleanText(b.activity,120),city:cleanText(b.city,80),phone:cleanText(b.phone,30),logoUrl:isValidCloudinaryAvatarUrl(b.logoUrl)?b.logoUrl:'',ratingCount:Number(b.publicRatingCount)||0,averageRating:Number(b.publicRatingCount)>0?Math.round((Number(b.publicRatingTotal)||0)/Number(b.publicRatingCount)*10)/10:0},offers};
}


export async function getPublicBusinessPaymentLink(paymentLinkId,visitorId=''){
 const id=validId(paymentLinkId),ref=businessPaymentLinksRef().doc(id),snap=await ref.get();
 if(!snap.exists)throw new BusinessError('Cette offre de paiement est introuvable.',404,'PAYMENT_LINK_NOT_FOUND');
 let link=snap.data()||{};
 if(['PENDING','CONFIRMED','FAILED','EXPIRED'].includes(link.status)){
  const legacyAttempt=ref.collection('payments').doc(id);
  await adminDb.runTransaction(async tx=>{
   const [fresh,attempt]=await Promise.all([tx.get(ref),tx.get(legacyAttempt)]);if(!fresh.exists)return;
   const old=fresh.data()||{},legacyPending=old.status==='PENDING'&&old.transId&&old.checkoutUrl&&!attempt.exists;
   if(legacyPending)tx.create(legacyAttempt,{paymentLinkId:id,businessId:old.businessId,userId:old.userId||old.createdBy||'',providerUserId:old.providerUserId||old.userId||'',accountId:old.accountId||'main',amount:Number(old.amount)||0,title:cleanText(old.title,100),customerName:cleanText(old.customerName,100),customerEmail:cleanText(old.customerEmail,160),checkoutUrl:old.checkoutUrl,transId:old.transId,status:'PENDING',createdAt:old.createdAt||FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
   const priorPaid=Math.max(0,Number(old.successfulPayments)||0),paid=old.status==='CONFIRMED'?Math.max(1,priorPaid):priorPaid;
   const gross=Math.max(0,Number(old.grossRevenue)||0,old.status==='CONFIRMED'?(Number(old.amount)||0):0);
   const net=Math.max(0,Number(old.netRevenue)||0,old.status==='CONFIRMED'?(Number(old.receivedAmount)||Number(old.amount)||0):0);
   const fees=Math.max(0,Number(old.feeRevenue)||0,old.status==='CONFIRMED'?(Number(old.providerFeeAmount)||Math.max(0,gross-net)):0);
   tx.update(ref,{status:'ACTIVE',legacyPaymentStatus:old.status,activePaymentCount:Math.max(0,Number(old.activePaymentCount)||0)+(legacyPending?1:0),successfulPayments:paid,grossRevenue:gross,netRevenue:net,feeRevenue:fees,pageViews:Number(old.pageViews)||0,uniqueViews:Number(old.uniqueViews)||0,clickCount:Number(old.clickCount)||0,uniqueClickers:Number(old.uniqueClickers)||0,updatedAt:FieldValue.serverTimestamp()});
  });
  link=(await ref.get()).data()||link;
 }
 const visitor=cleanText(visitorId,100).replace(/[^a-zA-Z0-9_-]/g,'');
 if(link.status==='ACTIVE'){
  const vr=visitor.length>=12?ref.collection('viewers').doc(visitor):null;
  await adminDb.runTransaction(async tx=>{const reads=[tx.get(ref)];if(vr)reads.push(tx.get(vr));const rows=await Promise.all(reads),fresh=rows[0],seen=vr?rows[1]:null;if(!fresh.exists||fresh.data()?.status!=='ACTIVE')return;tx.update(ref,{pageViews:FieldValue.increment(1),...(vr&&!seen.exists?{uniqueViews:FieldValue.increment(1)}:{}),updatedAt:FieldValue.serverTimestamp()});if(vr&&!seen.exists)tx.create(vr,{firstSeenAt:FieldValue.serverTimestamp()});});
 }
 const bs=await businessesRef().doc(validId(link.businessId)).get(),b=bs.exists?bs.data()||{}:{};
 const max=Math.max(0,Number(link.maxPayments)||0),sold=link.status==='SOLD_OUT'||(max>0&&Number(link.successfulPayments||0)+Number(link.activePaymentCount||0)>=max);
 const reviewSnap=Number(link.ratingCount)>0?await ref.collection('reviews').orderBy('createdAt','desc').limit(8).get().catch(()=>({docs:[]})):{docs:[]};
 const reviews=reviewSnap.docs.map(doc=>{const r=doc.data()||{};return {id:doc.id,name:cleanText(r.customerName||'Client',80),businessRating:Number(r.businessRating)||0,productRating:Number(r.productRating)||0,comment:cleanText(r.comment,1000),verifiedPurchase:r.verifiedPurchase===true,date:r.createdAt?.toDate?r.createdAt.toDate().toISOString():''};});
 const gallery=cleanPublicMediaList(link.galleryImageUrls,6,isValidCloudinaryAvatarUrl,'Galerie'),proofs=cleanPublicMediaList(link.proofImageUrls,6,isValidCloudinaryAvatarUrl,'Preuves'),videos=cleanPublicMediaList(link.videoUrls,4,isValidBusinessVideoUrl,'Vidéos');
 return {payment:{id,status:sold?'SOLD_OUT':link.status||'UNAVAILABLE',title:cleanText(link.title,100),description:cleanText(link.description,1200),imageUrl:isValidCloudinaryAvatarUrl(link.imageUrl)?link.imageUrl:(gallery[0]||''),galleryImageUrls:gallery,proofImageUrls:proofs,videoUrls:videos,sellingPoints:Array.isArray(link.sellingPoints)?link.sellingPoints.map(x=>cleanText(x,180)).filter(Boolean).slice(0,8):[],amount:Number(link.amount)||0,originalAmount:Number(link.originalAmount)||Number(link.amount)||0,discountAmount:Math.max(0,Number(link.discountAmount)||0),businessName:cleanText(b.name||link.businessName,100),businessSlogan:cleanText(b.slogan,180),businessLogoUrl:isValidCloudinaryAvatarUrl(b.logoUrl)?b.logoUrl:'',businessId:validId(link.businessId),businessProfilePublic:b.publicProfileEnabled===true,ratingCount:Math.max(0,Number(link.ratingCount)||0),averageProductRating:Number(link.ratingCount)>0?Math.round((Number(link.productRatingTotal)||0)/Number(link.ratingCount)*10)/10:0,averageBusinessRating:Number(link.ratingCount)>0?Math.round((Number(link.businessRatingTotal)||0)/Number(link.ratingCount)*10)/10:0,reviews}};
}


export async function createPublicBusinessPaymentCheckout(paymentLinkId,visitorId='',buyerInput={}){
 const id=validId(paymentLinkId),ref=businessPaymentLinksRef().doc(id),attempt=ref.collection('payments').doc();
 const visitor=cleanText(visitorId,100).replace(/[^a-zA-Z0-9_-]/g,''),clicker=visitor.length>=12?ref.collection('clickers').doc(visitor):null;
 const buyerName=cleanText(buyerInput.customerName,100),buyerEmail=cleanText(buyerInput.customerEmail,160).toLowerCase();
 if(buyerEmail&&!validEmail(buyerEmail))throw new BusinessError('L’adresse e-mail fournie n’est pas valide.');
 const reviewToken=randomBytes(32).toString('hex');let link;
 await adminDb.runTransaction(async tx=>{
  const reads=[tx.get(ref)];if(clicker)reads.push(tx.get(clicker));const rows=await Promise.all(reads),snap=rows[0],seen=clicker?rows[1]:null;
  if(!snap.exists)throw new BusinessError('Cette offre est introuvable.',404,'PAYMENT_LINK_NOT_FOUND');
  link=snap.data()||{};const max=Math.max(0,Number(link.maxPayments)||0),paid=Math.max(0,Number(link.successfulPayments)||0),active=Math.max(0,Number(link.activePaymentCount)||0);
  if(link.status!=='ACTIVE'||(max>0&&paid+active>=max))throw new BusinessError('Cette offre n’accepte plus de paiement pour le moment.',410,'OFFER_UNAVAILABLE');
  if(link.invoiceId){
   const invoiceRef=businessesRef().doc(validId(link.businessId)).collection('invoices').doc(validId(link.invoiceId));
   const invoiceSnap=await tx.get(invoiceRef);
   if(!invoiceSnap.exists||invoiceSnap.data()?.paymentLinkId!==id)throw new BusinessError('Le rattachement de cette facture a changé. Contacte l’entreprise avant de payer.',409,'INVOICE_LINK_CHANGED');
   const invoice=invoiceSnap.data()||{},remaining=Math.max(0,Number(invoice.remaining??(Number(invoice.totalAmount||0)-Number(invoice.amountPaid||0)))||0);
   if(remaining<Number(link.amount)||remaining<=0)throw new BusinessError('Le reste à payer de cette facture ne couvre plus ce lien.',409,'INVOICE_BALANCE_CHANGED');
  }
  tx.update(ref,{clickCount:FieldValue.increment(1),activePaymentCount:FieldValue.increment(1),...(clicker&&!seen.exists?{uniqueClickers:FieldValue.increment(1)}:{}),updatedAt:FieldValue.serverTimestamp()});
  if(clicker&&!seen.exists)tx.create(clicker,{firstClickedAt:FieldValue.serverTimestamp()});
  tx.create(attempt,{paymentLinkId:id,businessId:link.businessId,userId:link.userId||link.createdBy||'',accountId:link.accountId||'main',amount:Number(link.amount)||0,title:cleanText(link.title,100),customerName:buyerName||cleanText(link.customerName,100),customerEmail:buyerEmail||cleanText(link.customerEmail,160),...(link.invoiceId?{invoiceId:link.invoiceId,customerId:link.customerId||''}:{}),reviewToken,status:'INITIATING',createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
 });
 try{
  const apiUser=process.env.FAPSHI_API_USER,secret=process.env.FAPSHI_SECRET_KEY;
  if(!apiUser||!secret)throw new BusinessError('Le paiement est momentanément indisponible. Réessaie dans un instant.',503,'PAYMENT_PROVIDER_CONFIG');
  let origin='https://www.pata-yam.site';try{origin=new URL(process.env.NEXT_PUBLIC_APP_URL||process.env.NEXT_PUBLIC_SITE_URL||origin).origin;}catch{}
  const rawUid=cleanText(link.userId||link.createdBy,100),providerUserId=rawUid.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100);
  const payload={amount:Number(link.amount),...(buyerEmail||link.customerEmail?{email:buyerEmail||cleanText(link.customerEmail,160)}:{}),redirectUrl:origin+'/avis-paiement/'+encodeURIComponent(id)+'?token='+encodeURIComponent(reviewToken),...(providerUserId?{userId:providerUserId}:{}),externalId:attempt.id,message:cleanText(link.title,80)};
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);let response;
  try{response=await fetch('https://live.fapshi.com/initiate-pay',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json',apiuser:apiUser,apikey:secret},body:JSON.stringify(payload),signal:controller.signal,cache:'no-store'});}
  catch(error){console.error('[PATA BUSINESS FAPSHI INITIATE NETWORK]',JSON.stringify({paymentLinkId:id,amount:Number(link.amount),errorName:String(error?.name||'Error').slice(0,80),errorMessage:String(error?.message||error).slice(0,240),aborted:Boolean(controller.signal.aborted)}));throw new BusinessError('Le service de paiement ne répond pas pour le moment. Réessaie dans un instant.',502,'PAYMENT_PROVIDER_UNAVAILABLE');}
  finally{clearTimeout(timeout);}
  const rawBody=await response.text();let data={};try{data=rawBody?JSON.parse(rawBody):{};}catch{}
  if(!response.ok){console.error('[PATA BUSINESS FAPSHI INITIATE RESPONSE]',JSON.stringify({paymentLinkId:id,httpStatus:response.status,providerMessage:String(data?.message||data?.error||rawBody||'Réponse vide').slice(0,300)}));throw new BusinessError('Impossible de préparer le paiement pour le moment. Réessaie dans un instant.',502,'PAYMENT_LINK_REJECTED');}
  const checkoutUrl=paymentLinkPublicUrl(data.link||data.url||data.paymentLink||data.paymentUrl||data.payment_url||data.data?.link||data.data?.url),transId=cleanText(data.transId||data.trans_id||data.data?.transId||data.data?.trans_id,160);
  if(!checkoutUrl||!transId){console.error('[PATA BUSINESS FAPSHI INVALID RESPONSE]',JSON.stringify({paymentLinkId:id,keys:Object.keys(data||{}).slice(0,20)}));throw new BusinessError('Le lien de paiement n’a pas pu être préparé. Réessaie dans un instant.',502,'PAYMENT_LINK_INVALID');}
  await attempt.set({checkoutUrl,transId,providerUserId,status:'PENDING',updatedAt:FieldValue.serverTimestamp()},{merge:true});return {checkoutUrl,reviewToken};
 }catch(error){
  await adminDb.runTransaction(async tx=>{const [l,a]=await Promise.all([tx.get(ref),tx.get(attempt)]);if(a.exists&&!['FAILED','CONFIRMED','EXPIRED'].includes(a.data()?.status)){tx.update(attempt,{status:'FAILED',failureReason:cleanText(error?.message||'Échec',200),updatedAt:FieldValue.serverTimestamp()});if(l.exists)tx.update(ref,{activePaymentCount:FieldValue.increment(-1),updatedAt:FieldValue.serverTimestamp()});}}).catch(()=>{});
  throw error;
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
 const media=normalizeBusinessPaymentMedia(input);
 const invoiceId=cleanText(input.invoiceId,150);
 const customerName=cleanText(input.customerName,100),customerEmail=cleanText(input.customerEmail,160).toLowerCase();if(!validEmail(customerEmail))throw new BusinessError('Adresse e-mail du client invalide.');
 const accountId=validId(input.accountId||'main'),maxPayments=input.maxPayments===''||input.maxPayments==null?0:Number(input.maxPayments);
 if(!Number.isSafeInteger(maxPayments)||maxPayments<0||maxPayments>1000000)throw new BusinessError('Limite de paiements invalide.');
 const requestId=cleanText(input.requestId,100).replace(/[^a-zA-Z0-9_-]/g,'_');if(requestId.length<8)throw new BusinessError('Identifiant de demande invalide.');
 const id='pl_'+requestId,ref=businessPaymentLinksRef().doc(id),account=c.businessRef.collection('accounts').doc(accountId);
 const invoiceRef=invoiceId?c.businessRef.collection('invoices').doc(validId(invoiceId)):null;let duplicate=null;
 await adminDb.runTransaction(async tx=>{
  const [profile,member,business,acc,existing,invoiceSnap]=await Promise.all([tx.get(c.userRef),tx.get(c.memberRef),tx.get(c.businessRef),tx.get(account),tx.get(ref),invoiceRef?tx.get(invoiceRef):Promise.resolve(null)]);
  if(!profile.exists||!isPremium(profile.data()||{}))premiumRequired();if(!member.exists||!['owner','admin','finance','manager'].includes(member.data()?.role||''))throw new BusinessError('Droits insuffisants pour créer ce lien.',403,'READ_ONLY');
  if(!business.exists||business.data()?.status==='archived')throw new BusinessError('Entreprise indisponible.',404);if(!acc.exists||acc.data()?.active===false)throw new BusinessError('Compte de destination introuvable.');
  if(existing.exists){duplicate=serializeDocument(existing);return;}
  let linkedInvoice=null,linkedCustomer=null,linkedCustomerRef=null;
  if(invoiceRef){
   if(!invoiceSnap||!invoiceSnap.exists)throw new BusinessError('Facture introuvable dans cette entreprise.',404,'INVOICE_NOT_FOUND');
   linkedInvoice=invoiceSnap.data()||{};
   const remaining=Math.max(0,Number(linkedInvoice.remaining??(Number(linkedInvoice.totalAmount||0)-Number(linkedInvoice.amountPaid||0)))||0);
   if(['paid','completed','cancelled'].includes(String(linkedInvoice.status||''))||remaining<=0)throw new BusinessError('Cette facture est déjà réglée ou ne peut plus recevoir de paiement.',409,'INVOICE_NOT_PAYABLE');
   if(amount>remaining)throw new BusinessError('Le montant du lien dépasse le reste à payer de la facture ('+remaining+' FCFA).');
   if(linkedInvoice.paymentLinkId&&linkedInvoice.paymentLinkId!==id){
    const previousLink=await tx.get(businessPaymentLinksRef().doc(validId(linkedInvoice.paymentLinkId)));
    if(previousLink.exists&&previousLink.data()?.status!=='DELETED')throw new BusinessError('Un lien de paiement actif existe déjà pour cette facture. Utilise-le ou désactive-le avant d’en créer un autre.',409,'INVOICE_PAYMENT_LINK_EXISTS');
   }
   const customerId=cleanText(linkedInvoice.customerId,150);
   if(customerId){linkedCustomerRef=c.businessRef.collection('clients').doc(validId(customerId));const customerSnap=await tx.get(linkedCustomerRef);if(customerSnap.exists)linkedCustomer=customerSnap.data()||{};}
  }
  const finalCustomerName=cleanText(customerName||linkedInvoice?.customerName||linkedCustomer?.name,100);
  const finalCustomerEmail=cleanText(customerEmail||linkedCustomer?.email,160).toLowerCase();
  tx.create(ref,{businessId:c.businessId,businessName:cleanText(c.business.name,100),userId:uid,createdBy:uid,accountId,title,description,imageUrl,...media,customerName:finalCustomerName,customerEmail:finalCustomerEmail,amount,originalAmount,discountAmount:Math.max(0,originalAmount-amount),maxPayments:invoiceRef?1:maxPayments,...(invoiceRef?{invoiceId,customerId:cleanText(linkedInvoice?.customerId,150),invoiceNumber:cleanText(linkedInvoice?.invoiceNumber,50)}:{}),publicOnStorefront:input.publicOnStorefront!==false,currency:'XAF',status:'ACTIVE',pageViews:0,uniqueViews:0,clickCount:0,uniqueClickers:0,successfulPayments:0,grossRevenue:0,netRevenue:0,feeRevenue:0,activePaymentCount:0,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  if(invoiceRef)tx.update(invoiceRef,{paymentLinkId:id,updatedAt:FieldValue.serverTimestamp()});
 });
 if(duplicate)return {paymentLink:duplicate,duplicate:true};
 let origin='https://pata-yam.site';try{origin=new URL(process.env.NEXT_PUBLIC_APP_URL||process.env.NEXT_PUBLIC_SITE_URL||origin).origin;}catch{}
 await ref.update({publicUrl:origin+'/paiement/'+encodeURIComponent(id)});return {paymentLink:serializeDocument(await ref.get()),duplicate:false};
}
export async function updateBusinessPaymentLink(uid,businessId,paymentLinkId,input={}) {
 const c=await getBusinessContext(uid,businessId);requireWritable(c);
 const id=validId(paymentLinkId),ref=businessPaymentLinksRef().doc(id),snap=await ref.get();
 if(!snap.exists||snap.data()?.businessId!==c.businessId||snap.data()?.status==='DELETED')throw new BusinessError('Lien de paiement introuvable.',404,'PAYMENT_LINK_NOT_FOUND');
 if(snap.data()?.invoiceId&&Number(input.amount)!==Number(snap.data()?.amount))throw new BusinessError('Le montant d’un lien rattaché à une facture ne peut pas être modifié. Crée un nouveau lien après actualisation du reste à payer.');
 const amount=parseAmount(input.amount,'Montant à payer');
 if(amount<100)throw new BusinessError('Le montant minimum à demander est de 100 FCFA.');
 const originalAmount=input.originalAmount?parseAmount(input.originalAmount,'Prix normal'):amount;
 if(originalAmount<amount)throw new BusinessError('Le prix normal ne peut pas être inférieur au montant à payer.');
 const title=cleanText(input.title,100);if(title.length<2)throw new BusinessError('Donne un nom au produit ou service.');
 const description=cleanText(input.description,1200);if(description.length<5)throw new BusinessError('Ajoute une courte description du produit ou service.');
 const imageUrl=cleanText(input.imageUrl,2048);if(imageUrl&&!isValidCloudinaryAvatarUrl(imageUrl))throw new BusinessError('La photo du produit doit provenir de la bibliothèque photo Pata.');
 const media=normalizeBusinessPaymentMedia(input);
 await ref.update({title,description,imageUrl,...media,amount,originalAmount,discountAmount:Math.max(0,originalAmount-amount),publicOnStorefront:input.publicOnStorefront!==false,updatedAt:FieldValue.serverTimestamp()});
 return {paymentLink:serializeDocument(await ref.get())};
}

export async function deleteBusinessPaymentLink(uid,businessId,paymentLinkId,input={}) {
 const c=await getBusinessContext(uid,businessId);requireWritable(c);
 const id=validId(paymentLinkId),ref=businessPaymentLinksRef().doc(id),snap=await ref.get();
 if(!snap.exists||snap.data()?.businessId!==c.businessId)throw new BusinessError('Lien de paiement introuvable.',404,'PAYMENT_LINK_NOT_FOUND');
 const link=snap.data()||{};
 if(input.confirmation!=='SUPPRIMER'||input.confirmLinkId!==id)throw new BusinessError('Confirmation insuffisante. Saisis SUPPRIMER et confirme le bon lien.',400,'DELETE_CONFIRMATION_REQUIRED');
 if(link.status==='DELETED')return {success:true};
 await adminDb.runTransaction(async tx=>{
  const invoiceRef=link.invoiceId?c.businessRef.collection('invoices').doc(validId(link.invoiceId)):null;
  const [fresh,invoice]=await Promise.all([tx.get(ref),invoiceRef?tx.get(invoiceRef):Promise.resolve(null)]);
  if(!fresh.exists||fresh.data()?.status==='DELETED')return;
  if(Number(fresh.data()?.activePaymentCount||0)>0)throw new BusinessError('Un paiement est encore en cours. Vérifie son statut avant de supprimer ce lien.',409,'PAYMENT_IN_PROGRESS');
  tx.update(ref,{status:'DELETED',deletedAt:FieldValue.serverTimestamp(),deletedBy:uid,updatedAt:FieldValue.serverTimestamp()});
  if(invoiceRef&&invoice?.exists&&invoice.data()?.paymentLinkId===id)tx.update(invoiceRef,{paymentLinkId:'',updatedAt:FieldValue.serverTimestamp()});
 });
 return {success:true};
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


async function sendConfirmedBusinessPaymentEmails(attemptRef){
 try{
  const attemptSnap=await attemptRef.get();if(!attemptSnap.exists||attemptSnap.data()?.status!=='CONFIRMED')return;
  const attempt=attemptSnap.data()||{},linkRef=attemptRef.parent.parent;if(!linkRef)return;
  const [linkSnap,businessSnap]=await Promise.all([linkRef.get(),businessesRef().doc(validId(attempt.businessId)).get()]);
  if(!linkSnap.exists||!businessSnap.exists)return;
  const business=businessSnap.data()||{},link=linkSnap.data()||{},appUrl=(process.env.NEXT_PUBLIC_APP_URL||'https://www.pata-yam.site').replace(/\/$/,'');
  const amount=(Number(attempt.amount)||0).toLocaleString('fr-FR')+' FCFA',received=(Number(attempt.receivedAmount)||0).toLocaleString('fr-FR')+' FCFA';
  const rows=[['Produit ou service',cleanText(attempt.title||link.title,100)],['Montant réglé',amount],['Montant net reçu',received],['Référence',cleanText(attempt.transId,160)]];
  const ownerEmail=await getBusinessOwnerEmail(business);
  if(ownerEmail&&!attempt.ownerEmailSentAt){
   const sent=await sendBusinessNotice({business,to:ownerEmail,subject:'Paiement confirmé · '+cleanText(attempt.title||link.title,80),headline:'Un paiement vient d’être confirmé',intro:'Un client vient de régler une commande auprès de votre entreprise. Le montant a été rapproché dans votre espace professionnel.',details:[...rows,['Client',cleanText(attempt.payerName||attempt.customerName||'Non renseigné',100)],['E-mail client',cleanText(attempt.payerEmail||attempt.customerEmail,160)]],ctaUrl:appUrl+'/businesses/'+encodeURIComponent(attempt.businessId),ctaLabel:'Consulter mon espace professionnel',idempotencyKey:'business-payment-'+attemptRef.id+'-owner'});
   if(sent)await attemptRef.update({ownerEmailSentAt:FieldValue.serverTimestamp()});
  }
  const customerEmail=cleanText(attempt.payerEmail||attempt.customerEmail,160).toLowerCase();
  if(customerEmail&&!attempt.customerEmailSentAt){
   const reviewUrl=attempt.reviewToken?appUrl+'/avis-paiement/'+encodeURIComponent(linkRef.id)+'?token='+encodeURIComponent(attempt.reviewToken):appUrl+'/paiement/'+encodeURIComponent(linkRef.id);
   const html=businessEmailHtml({business,headline:'Merci pour votre confiance !',intro:'Votre paiement auprès de '+cleanText(business.name||'notre entreprise',100)+' a été confirmé. Nous vous remercions pour votre achat et restons à votre disposition.',details:[['Article',cleanText(attempt.title||link.title,100)],['Montant payé',amount],['Référence de paiement',cleanText(attempt.transId,160)]],ctaUrl:reviewUrl,ctaLabel:attempt.reviewToken?'Donner mon avis':'Voir mon reçu'});
   try{await sendBusinessEmail({to:customerEmail,subject:'Confirmation de votre paiement · '+cleanText(business.name,80),html,businessName:business.name||'Entreprise',idempotencyKey:'business-payment-'+attemptRef.id+'-customer'});await attemptRef.update({customerEmailSentAt:FieldValue.serverTimestamp()});}
   catch(error){console.warn('[PATA BUSINESS CUSTOMER RECEIPT]',JSON.stringify({paymentAttemptId:attemptRef.id,error:String(error?.message||error).slice(0,220)}));}
  }
 }catch(error){console.warn('[PATA BUSINESS PAYMENT EMAILS]',JSON.stringify({paymentAttemptId:attemptRef.id,error:String(error?.message||error).slice(0,240)}));}
}

async function settleBusinessPaymentAttempt(attemptRef, providerData) {
 const attemptSnap=await attemptRef.get();if(!attemptSnap.exists)return {handled:false,status:'NOT_FOUND'};
 const attempt=attemptSnap.data()||{},linkRef=attemptRef.parent.parent;
 if(!linkRef)throw new BusinessError('Offre de paiement introuvable.',404);
 if(attempt.status==='CONFIRMED'){await sendConfirmedBusinessPaymentEmails(attemptRef);return {handled:true,status:'CONFIRMED'};}
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
 if(String(providerData.externalId||'')!==attemptRef.id)throw new BusinessError('La référence de paiement est invalide.',409,'PAYMENT_REFERENCE_MISMATCH');
 if(providerData.userId&&attempt.providerUserId&&String(providerData.userId)!==String(attempt.providerUserId))throw new BusinessError('Le propriétaire associé au paiement ne correspond pas.',409,'PAYMENT_OWNER_MISMATCH');
 const businessRef=businessesRef().doc(validId(attempt.businessId)),accountRef=businessRef.collection('accounts').doc(validId(attempt.accountId||'main'));
 const date=parseDate(String(providerData.dateConfirmed||providerData.dateInitiated||todayDouala()).slice(0,10)),month=date.slice(0,7),fee=gross-net;
 const incomeRef=businessRef.collection('transactions').doc('pay_'+attemptRef.id+'_income'),feeRef=businessRef.collection('transactions').doc('pay_'+attemptRef.id+'_fee'),monthRef=businessRef.collection('monthlySummaries').doc(month);
 const productReviewRef=linkRef.collection('reviews').doc(attemptRef.id),businessReviewRef=businessRef.collection('reviews').doc(attemptRef.id);
 const invoiceId=cleanText(attempt.invoiceId,150),customerId=cleanText(attempt.customerId,150);
 const invoiceRef=invoiceId?businessRef.collection('invoices').doc(validId(invoiceId)):null,customerRef=customerId?businessRef.collection('clients').doc(validId(customerId)):null;
 const budgetsQuery=fee>0?businessRef.collection('budgets').where('month','==',month).limit(30):null;
 await adminDb.runTransaction(async tx=>{
  const reads=[tx.get(attemptRef),tx.get(linkRef),tx.get(businessRef),tx.get(accountRef),tx.get(incomeRef),tx.get(feeRef),tx.get(productReviewRef),tx.get(businessReviewRef)];
  if(invoiceRef)reads.push(tx.get(invoiceRef));if(customerRef)reads.push(tx.get(customerRef));if(budgetsQuery)reads.push(tx.get(budgetsQuery));
  const rows=await Promise.all(reads),[a,l,b,acc,income,feeTxn,productReview,businessReview]=rows;
  const invoiceSnap=invoiceRef?rows[8]:null,customerSnap=customerRef?rows[9]:null;
  const budgets=budgetsQuery?rows[8+(invoiceRef?1:0)+(customerRef?1:0)]:null;
  if(!a.exists)throw new BusinessError('Tentative de paiement introuvable.',404);if(a.data()?.status==='CONFIRMED')return;
  if(!l.exists||!b.exists||!acc.exists||acc.data()?.active===false)throw new BusinessError('Compte professionnel de destination introuvable. Paiement à régulariser.',409,'BUSINESS_ACCOUNT_MISSING');
  if(income.exists||(fee>0&&feeTxn.exists))throw new BusinessError('Écriture de paiement déjà existante. Vérification requise.',409,'PAYMENT_LEDGER_CONFLICT');
  const offer=l.data()||{};
  let invoiceData=null;
  if(invoiceRef){
   if(!invoiceSnap?.exists||invoiceSnap.data()?.paymentLinkId!==linkRef.id)throw new BusinessError('La facture liée n’est plus disponible. Paiement à régulariser manuellement.',409,'INVOICE_LINK_CHANGED');
   invoiceData=invoiceSnap.data()||{};
   const remaining=Math.max(0,Number(invoiceData.remaining??(Number(invoiceData.totalAmount||0)-Number(invoiceData.amountPaid||0)))||0);
   if(gross>remaining)throw new BusinessError('Le paiement dépasse le reste à payer de la facture. Régularisation manuelle nécessaire.',409,'INVOICE_BALANCE_CHANGED');
  }
  tx.create(incomeRef,{type:'income',direction:'income',flowType:'normal',title:cleanText(offer.title,100),categoryId:'sales',amount:gross,grossAmount:gross,receivedAmount:net,providerFeeAmount:fee,date,month,accountId:attempt.accountId,paymentMethod:'fapshi',paymentLinkId:linkRef.id,paymentAttemptId:attemptRef.id,invoiceId:invoiceId||'',customerId:customerId||'',transId,customerName:cleanText(providerData.payerName||nameFromEmail(providerData.email)||attempt.customerName,100),customerEmail:cleanText(providerData.email||attempt.customerEmail,160),note:'Paiement confirmé pour '+cleanText(offer.title,100),status:'posted',createdBy:attempt.userId,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  if(fee>0)tx.create(feeRef,{type:'expense',direction:'expense',flowType:'provider_fee',title:'Frais de traitement · '+cleanText(offer.title,80),categoryId:'payment_fees',amount:fee,date,month,accountId:attempt.accountId,paymentMethod:'fapshi',paymentLinkId:linkRef.id,paymentAttemptId:attemptRef.id,transId,note:'Frais de traitement liés à cet encaissement',status:'posted',createdBy:attempt.userId,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  tx.update(accountRef,{balance:FieldValue.increment(net),updatedAt:FieldValue.serverTimestamp()});
  tx.update(businessRef,{cashBalance:FieldValue.increment(net),totalIncome:FieldValue.increment(gross),...(invoiceRef?{totalReceivables:FieldValue.increment(-gross)}:{}),...(fee>0?{totalExpense:FieldValue.increment(fee)}:{}),updatedAt:FieldValue.serverTimestamp(),lastActivityAt:FieldValue.serverTimestamp()});
  if(invoiceRef){
   const paid=Math.max(0,Number(invoiceData.amountPaid)||0)+gross,remaining=Math.max(0,Number(invoiceData.totalAmount||0)-paid);
   tx.update(invoiceRef,{amountPaid:paid,remaining,status:remaining===0?'paid':'partial',paymentLinkId:'',updatedAt:FieldValue.serverTimestamp()});
   if(customerRef&&customerSnap?.exists){const customer=customerSnap.data()||{};tx.update(customerRef,{totalCollected:FieldValue.increment(gross),outstandingAmount:Math.max(0,(Number(customer.outstandingAmount)||0)-gross),updatedAt:FieldValue.serverTimestamp()});}
  }
  tx.set(monthRef,{month,income:FieldValue.increment(gross),...(fee>0?{expense:FieldValue.increment(fee)}:{}),transactionCount:FieldValue.increment(fee>0?2:1),updatedAt:FieldValue.serverTimestamp()},{merge:true});
  if(fee>0&&budgets?.docs?.length){for(const budgetDoc of budgets.docs){const budget=budgetDoc.data()||{};if(String(budget.categoryId||'')!=='payment_fees')continue;const spent=Math.max(0,Number(budget.spent)||0)+fee,allocated=Math.max(0,Number(budget.amount)||0);tx.update(budgetDoc.ref,{spent,remaining:Math.max(0,allocated-spent),overBudget:spent>allocated,updatedAt:FieldValue.serverTimestamp()});}}
  const link=offer,max=Math.max(0,Number(link.maxPayments)||0),next=Math.max(0,Number(link.successfulPayments)||0)+1;
  tx.update(linkRef,{successfulPayments:FieldValue.increment(1),grossRevenue:FieldValue.increment(gross),netRevenue:FieldValue.increment(net),feeRevenue:FieldValue.increment(fee),activePaymentCount:FieldValue.increment(-1),status:max>0&&next>=max?'SOLD_OUT':'ACTIVE',updatedAt:FieldValue.serverTimestamp(),lastPaymentAt:FieldValue.serverTimestamp()});
  if(productReview.exists)tx.update(productReviewRef,{verifiedPurchase:true,paymentStatusAtReview:'CONFIRMED',updatedAt:FieldValue.serverTimestamp()});
  if(businessReview.exists)tx.update(businessReviewRef,{verifiedPurchase:true,paymentStatusAtReview:'CONFIRMED',updatedAt:FieldValue.serverTimestamp()});
  tx.update(attemptRef,{status:'CONFIRMED',receivedAmount:net,providerFeeAmount:fee,payerName:cleanText(providerData.payerName||nameFromEmail(providerData.email)||attempt.customerName,100),payerEmail:cleanText(providerData.email||attempt.customerEmail,160),confirmedAt:FieldValue.serverTimestamp(),confirmedDate:date,financeIncomeTransactionId:incomeRef.id,financeFeeTransactionId:fee>0?feeRef.id:'',updatedAt:FieldValue.serverTimestamp()});
 });
 await sendConfirmedBusinessPaymentEmails(attemptRef);
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
 const [payments,reviews]=await Promise.all([
  ref.collection('payments').orderBy('createdAt','desc').limit(100).get(),
  ref.collection('reviews').orderBy('createdAt','desc').limit(100).get(),
 ]);
 return {paymentLink:serializeDocument(snap),payments:payments.docs.map(serializeDocument),reviews:reviews.docs.map(serializeDocument)};
}
export async function verifyBusinessPaymentLink(uid,businessId,paymentLinkId){
 const c=await getBusinessContext(uid,businessId),id=validId(paymentLinkId),ref=businessPaymentLinksRef().doc(id),snap=await ref.get();
 if(!snap.exists||snap.data()?.businessId!==c.businessId)throw new BusinessError('Lien de paiement introuvable pour cette entreprise.',404,'PAYMENT_LINK_NOT_FOUND');
 const pending=await ref.collection('payments').where('status','in',['PENDING','INITIATING']).limit(20).get();
 const results=await Promise.all(pending.docs.map(d=>d.data()?.transId?processFapshiBusinessPayment(d.data().transId):null));
 const current=(await ref.get()).data()||{};
 if(!pending.size&&current.status==='PENDING'&&current.transId)results.push(await processFapshiBusinessPayment(current.transId));
 return {success:true,status:(await ref.get()).data()?.status||'ACTIVE',checked:results.filter(Boolean).length};
}



export async function submitPublicBusinessPaymentReview(paymentLinkId,input={}){
 const id=validId(paymentLinkId),token=cleanText(input.token,128),customerName=cleanText(input.customerName,80);
 if(!/^[a-f0-9]{64}$/i.test(token))throw new BusinessError('Le lien d’avis est invalide ou incomplet.',403,'REVIEW_TOKEN_INVALID');
 if(customerName.length<2)throw new BusinessError('Indique ton nom pour publier ton avis.');
 const linkRef=businessPaymentLinksRef().doc(id),attempts=await linkRef.collection('payments').where('reviewToken','==',token).limit(1).get();
 if(attempts.empty)throw new BusinessError('Aucune tentative de paiement ne correspond à ce lien d’avis.',404,'REVIEW_PAYMENT_NOT_FOUND');
 const attemptRef=attempts.docs[0].ref,businessId=validId(attempts.docs[0].data()?.businessId),businessRef=businessesRef().doc(businessId);
 const businessRating=Number(input.businessRating),productRating=Number(input.productRating),comment=cleanText(input.comment,1000);
 if(!Number.isInteger(businessRating)||businessRating<1||businessRating>5||!Number.isInteger(productRating)||productRating<1||productRating>5)throw new BusinessError('Choisis une note de 1 à 5 étoiles pour l’entreprise et le produit.');
 const reviewRef=linkRef.collection('reviews').doc(attemptRef.id),businessReviewRef=businessRef.collection('reviews').doc(attemptRef.id);
 await adminDb.runTransaction(async tx=>{
  const [attempt,link,business,existing]=await Promise.all([tx.get(attemptRef),tx.get(linkRef),tx.get(businessRef),tx.get(reviewRef)]);
  if(!attempt.exists||!['PENDING','CONFIRMED','FAILED','EXPIRED'].includes(String(attempt.data()?.status||''))||!attempt.data()?.transId)throw new BusinessError('Aucune tentative de paiement utilisable ne correspond à cet avis.',403,'REVIEW_PAYMENT_NOT_AVAILABLE');
  if(attempt.data()?.reviewSubmittedAt||existing.exists)throw new BusinessError('Un avis a déjà été envoyé pour cette tentative de paiement.',409,'REVIEW_ALREADY_SUBMITTED');
  if(!link.exists||!business.exists)throw new BusinessError('Cette offre ou entreprise n’est plus disponible.',404);
  const a=attempt.data()||{},verifiedPurchase=a.status==='CONFIRMED';
  const review={paymentLinkId:id,businessId,customerName,businessRating,productRating,comment,verifiedPurchase,paymentStatusAtReview:a.status,createdAt:FieldValue.serverTimestamp()};
  tx.create(reviewRef,review);tx.create(businessReviewRef,review);
  tx.update(linkRef,{ratingCount:FieldValue.increment(1),businessRatingTotal:FieldValue.increment(businessRating),productRatingTotal:FieldValue.increment(productRating),updatedAt:FieldValue.serverTimestamp()});
  tx.update(businessRef,{publicRatingCount:FieldValue.increment(1),publicRatingTotal:FieldValue.increment(businessRating),updatedAt:FieldValue.serverTimestamp()});
  tx.update(attemptRef,{reviewSubmittedAt:FieldValue.serverTimestamp(),reviewCustomerName:customerName,updatedAt:FieldValue.serverTimestamp()});
 });
 const [businessSnap,linkSnap,attemptSnap]=await Promise.all([businessRef.get(),linkRef.get(),attemptRef.get()]);
 if(businessSnap.exists){
  const business=businessSnap.data()||{},offer=linkSnap.exists?linkSnap.data()||{}:{},ownerEmail=await getBusinessOwnerEmail(business);
  const appUrl=(process.env.NEXT_PUBLIC_APP_URL||process.env.NEXT_PUBLIC_SITE_URL||'https://www.pata-yam.site').replace(/\/$/,'');
  const detailsUrl=appUrl+'/businesses/'+encodeURIComponent(businessId)+'?tab=payment-links&paymentLinkId='+encodeURIComponent(id);
  const verified=attemptSnap.data()?.status==='CONFIRMED';
  await sendBusinessNotice({
   business,to:ownerEmail,subject:'Nouvel avis client · '+cleanText(offer.title||'Votre produit',80),
   headline:'Un client vient de publier un avis',
   intro:'Un nouvel avis est disponible pour votre entreprise. Consultez les notes et le commentaire depuis les statistiques de votre produit.',
   details:[['Produit',cleanText(offer.title||'Produit',100)],['Client',customerName],['Note du produit',productRating+' / 5'],['Note de l’entreprise',businessRating+' / 5'],['Achat',verified?'Confirmé':'Tentative de paiement'],['Commentaire',comment||'Aucun commentaire écrit.']],
   ctaUrl:detailsUrl,ctaLabel:'Consulter les avis du produit',idempotencyKey:'business-review-'+attemptRef.id,
  });
 }
 return {success:true};
}

const BUSINESS_JOIN_TYPES = new Set(['founder','cofounder','employee','partner','associate','contractor']);
const BUSINESS_ACCESS_ROLES = new Set(['admin','finance','manager','staff','viewer']);
const businessInvitationsRef = () => adminDb.collection('businessInvitations');

const normalizeBusinessSearch = (value) => cleanText(value, 100).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim();

export async function searchBusinessesForJoin(uid, query) {
  const term = normalizeBusinessSearch(query);
  if (term.length < 3) return { businesses: [] };
  const [snapshot, memberships] = await Promise.all([
    businessesRef().orderBy('nameSearch').startAt(term).endAt(term + String.fromCharCode(0xF8FF)).limit(20).get(),
    userBusinessRefs(uid).limit(50).get(),
  ]);
  const joined = new Set(memberships.docs.filter(d => d.data()?.active !== false && d.data()?.status !== 'revoked').map(d => d.id));
  const found = new Map(snapshot.docs.map(d => [d.id, d]));
  // Include the user's own companies as searchable results instead of hiding them.
  for (const membership of memberships.docs) {
    if (found.has(membership.id)) continue;
    const businessSnap = await businessesRef().doc(membership.id).get();
    if (businessSnap.exists && normalizeBusinessSearch(businessSnap.data()?.name).startsWith(term)) found.set(businessSnap.id, businessSnap);
  }
  return { businesses: [...found.entries()].filter(([, d]) => d.data()?.status !== 'archived' && normalizeBusinessSearch(d.data()?.name).startsWith(term)).slice(0, 20).map(([id, d]) => {
    const b=d.data()||{};return {id,name:cleanText(b.name,100),slogan:cleanText(b.slogan,180),city:cleanText(b.city,80),logoUrl:isValidCloudinaryAvatarUrl(b.logoUrl)?b.logoUrl:'',alreadyMember:joined.has(id)};
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
  const requestData={uid,personType:type,message:cleanText(input.message,300),name:cleanText(profile.displayName||profile.name||profile.fullName||'Utilisateur Pata',100),imageUrl:isValidCloudinaryAvatarUrl(profile.photoURL||profile.avatarUrl)?(profile.photoURL||profile.avatarUrl):'',email:cleanText(profile.email,160),status:'pending',createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()};
  await requestRef.set(requestData);
  const business=businessSnap.data()||{},ownerEmail=await getBusinessOwnerEmail(business),appUrl=(process.env.NEXT_PUBLIC_APP_URL||'https://www.pata-yam.site').replace(/\/$/,'');
  await sendBusinessNotice({business,to:ownerEmail,subject:'Nouvelle demande pour rejoindre '+cleanText(business.name,80),headline:'Une personne souhaite rejoindre votre équipe',intro:cleanText(requestData.name,100)+' a envoyé une demande pour rejoindre votre entreprise. Connectez-vous pour examiner sa demande et définir ses droits.',details:[['Nom',requestData.name],['E-mail',requestData.email],['Position demandée',type],['Message',requestData.message]],ctaUrl:appUrl+'/businesses/'+encodeURIComponent(id)+'/team',ctaLabel:'Examiner la demande',idempotencyKey:'business-join-'+id+'-'+uid+'-'+Date.now()});
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
  let reviewedRequest={};
  await adminDb.runTransaction(async tx=>{
    const [request,member,business]=await Promise.all([tx.get(requestRef),tx.get(memberRef),tx.get(c.businessRef)]);
    if(!request.exists||request.data()?.status!=='pending')throw new BusinessError('Cette demande n’est plus en attente.',409,'REQUEST_NOT_PENDING');
    if(!business.exists||business.data()?.ownerId!==uid)throw new BusinessError('Droits fondateur requis.',403);
    if(approved){
      if(member.exists&&member.data()?.active!==false)throw new BusinessError('Cette personne est déjà membre.',409);
      const req=request.data()||{}; reviewedRequest=req;
      tx.set(memberRef,{uid:target,role,personType:BUSINESS_JOIN_TYPES.has(req.personType)?req.personType:'employee',active:true,status:'active',permissions:input.permissions&&typeof input.permissions==='object'?input.permissions:{},invitedBy:uid,joinedAt:FieldValue.serverTimestamp()});
      tx.set(reverse,{businessId:c.businessId,role,active:true,createdAt:FieldValue.serverTimestamp()});
      tx.set(personRef,{name:cleanText(req.name,100),imageUrl:cleanText(req.imageUrl,2048),type:BUSINESS_JOIN_TYPES.has(req.personType)?req.personType:'employee',role,phone:'',email:cleanText(req.email,160),active:true,capitalPercent:0,profitPercent:0,salary:0,commissionRate:0,createdAt:FieldValue.serverTimestamp(),createdBy:uid},{merge:true});
    } else { reviewedRequest=request.data()||{}; }
    tx.update(requestRef,{status:approved?'approved':'rejected',reviewedBy:uid,assignedRole:approved?role:'',reviewedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  });
  await sendBusinessNotice({business:c.business,to:cleanText(reviewedRequest.email,160),subject:approved?'Votre demande a été acceptée · '+cleanText(c.business.name,80):'Réponse à votre demande · '+cleanText(c.business.name,80),headline:approved?'Votre demande a été acceptée':'Votre demande n’a pas été retenue',intro:approved?'Votre demande pour rejoindre '+cleanText(c.business.name,100)+' a été acceptée. Vous pouvez maintenant accéder à l’espace professionnel avec les droits attribués.':'Le fondateur de '+cleanText(c.business.name,100)+' a examiné votre demande. Celle-ci n’a pas été acceptée pour le moment.',details:approved?[['Rôle attribué',role]]:[],ctaUrl:(process.env.NEXT_PUBLIC_APP_URL||'https://www.pata-yam.site')+'/businesses/'+encodeURIComponent(c.businessId),ctaLabel:approved?'Accéder à l’entreprise':'Ouvrir mon espace',idempotencyKey:'business-join-result-'+c.businessId+'-'+target});
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
  await ref.create({businessId:c.businessId,businessName:cleanText(c.business.name,100),businessLogoUrl:isValidCloudinaryAvatarUrl(c.business.logoUrl)?c.business.logoUrl:'',businessSlogan:cleanText(c.business.slogan,180),invitedEmail:email,invitedEmailLower:email,targetUid,role,personType,status:'pending',createdBy:uid,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  const html=businessEmailHtml({business:c.business,headline:'Vous êtes invité(e) à rejoindre notre entreprise',intro:'Nous souhaitons vous accueillir dans l’équipe de '+cleanText(c.business.name,100)+'. Consultez les informations et acceptez l’invitation avec le compte associé à cette adresse e-mail.',details:[['Position proposée',personType],['Accès prévu',role]],ctaUrl:invitationUrl,ctaLabel:'Consulter mon invitation'});
  let emailSent=false;
  try{await sendBusinessEmail({to:email,subject:'Invitation à rejoindre '+cleanText(c.business.name,80),html,businessName:c.business.name||'Entreprise',idempotencyKey:'business-invitation-'+ref.id});emailSent=true;}
  catch(error){console.warn('[PATA BUSINESS INVITATION EMAIL]',String(error?.message||error).slice(0,220));}
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