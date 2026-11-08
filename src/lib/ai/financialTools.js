import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';

const EXPENSE_CATEGORIES = [
  'food', 'transport', 'housing', 'internet', 'health', 'leisure',
  'investment', 'contribution', 'savings', 'other',
];
const INCOME_CATEGORIES = ['salary', 'business', 'gift', 'other_income'];
const FREQUENCIES = ['daily', 'weekly', 'monthly'];
const FREE_EXPENSE_LIMIT = 60;
const FREE_CREATE_LIMITS = { incomes: 2, budgets: 2, goals: 1, vitalForecasts: 1, durationForecasts: 1 };

function incrementFreeQuota(userData, type, count = 1) {
  if (isPremium(userData)) return null;
  const currentMonth = monthKey();
  const previous = userData.monthlyStats || {};
  const stats = previous.lastResetMonth === currentMonth
    ? { ...previous }
    : { expenses: 0, incomes: 0, budgets: 0, goals: 0, vitalForecasts: 0, durationForecasts: 0, lastResetMonth: currentMonth };
  const limit = FREE_CREATE_LIMITS[type];
  if (!limit) throw new Error('Type de création non reconnu.');
  const current = Number(stats[type]) || 0;
  if (current + count > limit) {
    const label = type === 'incomes' ? 'revenus' : type === 'budgets' ? 'budgets' : type === 'goals' ? 'objectifs' : 'prévisions';
    throw new Error(`Tu as atteint la limite gratuite de ${limit} ${label} par mois. Passe à Premium pour continuer.`);
  }
  stats[type] = current + count;
  stats.lastResetMonth = currentMonth;
  return stats;
}

const todayDouala = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const asPositiveMoney = (value, label = 'Montant') => {
  const amount = Math.round(Number(value));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
    throw new Error(`${label} invalide. Indique un montant positif en FCFA.`);
  }
  return amount;
};

const cleanText = (value, max = 180) => String(value ?? '').trim().slice(0, max);
function readOptionalTransactionMetadata(input = {}, previous = {}) {
  const rawTime = input.time === undefined ? previous.time : input.time;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(rawTime || '')) ? String(rawTime) : '';
  const rawLatitude = input.latitude === undefined ? previous.latitude : input.latitude;
  const rawLongitude = input.longitude === undefined ? previous.longitude : input.longitude;
  const latitude = rawLatitude === null || rawLatitude === '' ? null : Number(rawLatitude);
  const longitude = rawLongitude === null || rawLongitude === '' ? null : Number(rawLongitude);
  const validCoordinates = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
  const rawAccuracy = input.locationAccuracy === undefined ? previous.locationAccuracy : input.locationAccuracy;
  const accuracy = rawAccuracy === null || rawAccuracy === '' ? null : Number(rawAccuracy);
  const methods = ['cash', 'mtn_momo', 'orange_money', 'bank_transfer', 'card', 'other'];
  const rawMethod = input.paymentMethod === undefined ? previous.paymentMethod : input.paymentMethod;
  const paymentMethod = methods.includes(String(rawMethod || '')) ? String(rawMethod) : '';
  return {
    time,
    locationLabel: cleanText(input.locationLabel === undefined ? previous.locationLabel : input.locationLabel, 160),
    paymentMethod,
    details: cleanText(input.details === undefined ? previous.details : input.details, 160),
    latitude: validCoordinates ? latitude : null,
    longitude: validCoordinates ? longitude : null,
    locationAccuracy: Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 100000 ? Math.round(accuracy) : null,
  };
}

const userRefFor = (uid) => adminDb.collection('users').doc(uid);
const subcol = (uid, name) => userRefFor(uid).collection(name);

function toDate(value, fallback = null) {
  if (!value) return fallback;
  let date;
  if (value instanceof Date) date = value;
  else if (typeof value?.toDate === 'function') date = value.toDate();
  else date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function isPremium(data) {
  const expiry = toDate(data?.premiumUntil);
  return Boolean(expiry && expiry.getTime() > Date.now());
}

function monthKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit' }).format(date);
}

async function assertExpenseCategory(uid, value) {
  const categoryId = cleanText(value, 80);
  if (!categoryId) throw new Error('Catégorie de dépense manquante.');
  if (EXPENSE_CATEGORIES.includes(categoryId)) return categoryId;
  const categorySnapshot = await subcol(uid, 'categories').doc(categoryId).get();
  if (!categorySnapshot.exists || categorySnapshot.data()?.type !== 'expense') {
    throw new Error('Cette catégorie de dépense est introuvable. Choisis une catégorie existante dans Pata.');
  }
  return categoryId;
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function resolveSource(incomes, requestedId, requestedName) {
  const id = cleanText(requestedId, 150);
  const name = cleanText(requestedName, 150);
  if (id && id !== 'all') {
    const exact = incomes.find((item) => item.id === id);
    if (!exact) throw new Error('La source de revenu sélectionnée est introuvable. Je n’ai donc pas enregistré la dépense.');
    if (name) {
      const sameName = incomes.filter((item) => normalizeName(item.source) === normalizeName(name));
      // An explicit, valid ID disambiguates duplicated source names.
      if (sameName.length === 1 && sameName[0].id !== exact.id) throw new Error('Le nom de la source ne correspond pas à son identifiant. Je n’ai pas enregistré la dépense.');
    }
    return { id: exact.id, name: exact.source || 'Revenu sans nom' };
  }
  if (name && !['all', 'tous', 'tous les revenus', 'revenus'].includes(normalizeName(name))) {
    const normalized = normalizeName(name);
    const matches = incomes.filter((item) => normalizeName(item.source) === normalized);
    if (matches.length === 1) return { id: matches[0].id, name: matches[0].source };
    if (matches.length > 1) throw new Error(`Plusieurs revenus portent le nom « ${name} ». Précise lequel (date ou montant) avant l’enregistrement.`);
    throw new Error(`Je ne trouve pas de revenu nommé « ${name} ». Vérifie le nom exact de la source dans Pata.`);
  }
  return { id: 'all', name: 'Tous les revenus' };
}

function buildIncomeBalances(incomes, expenses) {
  return incomes.map((income) => {
    const spent = expenses
      .filter((expense) => expense.incomeSourceId === income.id)
      .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    return {
      ...income,
      remaining: Math.max(0, (Number(income.amount) || 0) - spent),
    };
  });
}

function getExpenseTypeForBudget(expense) {
  return ['consumption', 'project', 'savings', 'investment'].includes(expense?.expenseType)
    ? expense.expenseType : 'consumption';
}

export async function createExpenseForUser(uid, input, { countQuota = true, sourceOverride = null, idempotencyKey = null } = {}) {
  const amount = asPositiveMoney(input.amount, 'Dépense');
  const categoryId = await assertExpenseCategory(uid, input.categoryId || input.category || 'other');
  const expenseType = cleanText(input.expenseType || 'consumption', 30);
  if (!['consumption', 'project', 'savings', 'investment'].includes(expenseType)) throw new Error('Choisis une nature de sortie valide.');
  const projectId = cleanText(input.projectId, 150);
  if (expenseType === 'project' && !projectId) throw new Error('Sélectionne le projet concerné.');
  if (expenseType !== 'project' && projectId) throw new Error('Associe un projet uniquement à une sortie de type projet.');
  const note = cleanText(input.note, 250);
  const optionalMetadata = readOptionalTransactionMetadata(input);
  if (input.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(input.date))) {
    throw new Error('Date invalide. Utilise le format AAAA-MM-JJ.');
  }
  const date = input.date || todayDouala();
  const userRef = userRefFor(uid);
  const incomesQuery = subcol(uid, 'incomes');
  const expensesQuery = subcol(uid, 'expenses');
  const now = new Date();
  const currentMonth = monthKey(now);
  const expenseCollection = subcol(uid, 'expenses');
  const idempotencyRef = idempotencyKey
    ? subcol(uid, 'ai_actions').doc(String(idempotencyKey).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 140))
    : null;

  return adminDb.runTransaction(async (transaction) => {
    const budgetQuery = subcol(uid, 'budgets').where('month', '==', String(date).slice(0, 7));
    const readTasks = [transaction.get(userRef), transaction.get(incomesQuery), transaction.get(expensesQuery), transaction.get(budgetQuery)];
    if (idempotencyRef) readTasks.push(transaction.get(idempotencyRef));
    const [userSnap, incomesSnap, expensesSnap, budgetsSnap, idempotencySnap] = await Promise.all(readTasks);
    if (idempotencyRef && idempotencySnap?.exists) return idempotencySnap.data().result;
    if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');

    const userData = userSnap.data();
    let projectName = '';
    if (expenseType === 'project') {
      if (!isPremium(userData)) throw new Error('La gestion des projets est réservée à Pata Premium.');
      const projectSnap = await transaction.get(subcol(uid, 'projects').doc(projectId));
      if (!projectSnap.exists || projectSnap.data()?.status === 'archived') throw new Error('Ce projet est introuvable ou archivé.');
      projectName = cleanText(projectSnap.data()?.name, 100);
    }
    let nextStats = userData.monthlyStats || {};
    if (nextStats.lastResetMonth !== currentMonth) {
      nextStats = {
        ...nextStats, expenses: 0, incomes: 0, budgets: 0, goals: 0,
        lastResetMonth: currentMonth,
      };
    }
    if (countQuota && !isPremium(userData) && (Number(nextStats.expenses) || 0) >= FREE_EXPENSE_LIMIT) {
      throw new Error(`Limite gratuite atteinte (${FREE_EXPENSE_LIMIT} dépenses par mois). Passe Premium pour continuer.`);
    }

    const incomes = incomesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const expenses = expensesSnap.docs.map((doc) => doc.data());
    const balances = buildIncomeBalances(incomes, expenses);
    const selectedSource = sourceOverride || resolveSource(
      incomes, input.incomeSourceId, input.incomeSourceName,
    );

    const eligibleBalances = balances.filter((income) => !income.projectId || income.projectId === projectId);

    let allocations;
    if (selectedSource.id === 'all') {
      const available = eligibleBalances.reduce((sum, item) => sum + item.remaining, 0);
      if (amount > available) {
        throw new Error(`Fonds insuffisants : ${available.toLocaleString('fr-FR')} FCFA disponibles au total, contre ${amount.toLocaleString('fr-FR')} FCFA demandés.`);
      }
      let remaining = amount;
      allocations = [];
      // The smallest available balances are consumed first, as intended by Pata.
      for (const income of [...eligibleBalances].sort((a, b) => a.remaining - b.remaining)) {
        if (remaining <= 0) break;
        if (income.remaining <= 0) continue;
        const allocated = Math.min(income.remaining, remaining);
        allocations.push({ income, amount: allocated });
        remaining -= allocated;
      }
    } else {
      const income = balances.find((item) => item.id === selectedSource.id);
      if (!income) throw new Error('Cette source de revenu n’existe plus. Vérifie-la avant de réessayer.');
      if (income.projectId && income.projectId !== projectId) throw new Error('Ce revenu est réservé à un autre projet.');
      if (amount > income.remaining) {
        throw new Error(`Fonds insuffisants sur « ${income.source} » : ${income.remaining.toLocaleString('fr-FR')} FCFA disponibles.`);
      }
      allocations = [{ income, amount }];
    }

    // Vérifie les enveloppes budgétaires avant toute écriture. L'utilisateur garde le dernier mot.
    const plannedBySource = new Map();
    allocations.forEach(({ income, amount: allocated }) => {
      plannedBySource.set(income.id, (plannedBySource.get(income.id) || 0) + allocated);
    });
    const warnings = [];
    const budgetRows = budgetsSnap?.docs?.map((doc) => ({ id: doc.id, ...doc.data() })) || [];
    for (const budget of budgetRows) {
      if (expenseType !== 'consumption' || budget.categoryId !== categoryId) continue;
      const sourceId = budget.incomeSourceId || 'all';
      const planned = sourceId === 'all'
        ? amount
        : (plannedBySource.get(sourceId) || 0);
      if (planned <= 0) continue;
      const spentBefore = expenses
        .filter((expense) => getExpenseTypeForBudget(expense) === 'consumption'
          && String(expense.date || '').slice(0, 7) === String(date).slice(0, 7)
          && expense.categoryId === categoryId
          && (sourceId === 'all' || expense.incomeSourceId === sourceId))
        .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
      const limit = Number(budget.amount) || 0;
      if (limit > 0 && spentBefore + planned > limit) {
        warnings.push({
          budgetId: budget.id,
          incomeSourceId: sourceId,
          allocated: limit,
          alreadySpent: spentBefore,
          planned,
          after: spentBefore + planned,
          excess: spentBefore + planned - limit,
        });
      }
    }
    if (warnings.length && input.confirmBudgetOverrun !== true) {
      const warningText = warnings.map((item) => {
        const label = item.incomeSourceId === 'all' ? 'tous les revenus' : (incomes.find((income) => income.id === item.incomeSourceId)?.source || 'ce revenu');
        return `${label} : budget ${item.allocated.toLocaleString('fr-FR')} FCFA, déjà dépensé ${item.alreadySpent.toLocaleString('fr-FR')} FCFA, après cette opération ${item.after.toLocaleString('fr-FR')} FCFA (dépassement ${item.excess.toLocaleString('fr-FR')} FCFA)`;
      }).join(' ; ');
      return {
        success: false,
        confirmationRequired: true,
        message: `Attention : cette dépense dépassera le budget prévu. ${warningText}. Veux-tu quand même l'enregistrer ?`,
        warnings,
        amount,
        date,
        categoryId,
      };
    }

    const created = [];
    allocations.forEach(({ income, amount: allocated }, index) => {
      const expenseRef = expenseCollection.doc();
      transaction.create(expenseRef, {
        amount: allocated,
        categoryId,
        note: index === 0 ? note : `${note}${note ? ' ' : ''}(Partagé)`,
        date,
        incomeSourceId: income.id,
        incomeSourceName: income.source || 'Revenu sans nom',
        expenseType,
        projectId: expenseType === 'project' ? projectId : null,
        projectName: expenseType === 'project' ? projectName : null,
        ...optionalMetadata,
        createdAt: FieldValue.serverTimestamp(),
        ...(input.automationId ? { automationId: input.automationId } : {}),
      });
      created.push({ incomeSourceId: income.id, incomeSourceName: income.source || 'Revenu sans nom', amount: allocated });
    });

    if (countQuota && !isPremium(userData)) {
      nextStats = { ...nextStats, expenses: (Number(nextStats.expenses) || 0) + 1, lastResetMonth: currentMonth };
    }
    transaction.set(userRef, {
      lifetimeExpenseAmount: FieldValue.increment(amount),
      lifetimeExpenseCount: FieldValue.increment(1),
      ...(countQuota && !isPremium(userData) ? { monthlyStats: nextStats } : {}),
    }, { merge: true });

    const result = { success: true, amount, date, categoryId, expenseType, projectId: expenseType === 'project' ? projectId : null, projectName: projectName || null, allocations: created, recordsCreated: created.length };
    if (idempotencyRef) transaction.create(idempotencyRef, { result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
}

export async function updateExpenseForUser(uid, expenseId, input) {
  const id = cleanText(expenseId, 150);
  if (!id) throw new Error('Identifiant de dépense manquant.');
  const requestedAmount = input.amount === undefined ? null : asPositiveMoney(input.amount, 'Dépense');
  const requestedCategoryValue = input.categoryId ?? input.category;
  const validatedRequestedCategory = requestedCategoryValue === undefined
    ? undefined : await assertExpenseCategory(uid, requestedCategoryValue || 'other');
  if (input.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(input.date))) {
    throw new Error('Date invalide. Utilise le format AAAA-MM-JJ.');
  }
  const expenseRef = subcol(uid, 'expenses').doc(id);
  const incomesRef = subcol(uid, 'incomes');
  const expensesRef = subcol(uid, 'expenses');
  const userRef = userRefFor(uid);

  return adminDb.runTransaction(async (transaction) => {
    const [expenseSnap, incomesSnap, expensesSnap, userSnap] = await Promise.all([
      transaction.get(expenseRef),
      transaction.get(incomesRef),
      transaction.get(expensesRef),
      transaction.get(userRef),
    ]);
    if (!expenseSnap.exists) throw new Error('Dépense introuvable.');

    const previousData = expenseSnap.data();
    const amount = requestedAmount ?? asPositiveMoney(previousData.amount, 'Dépense');
    const categoryId = validatedRequestedCategory === undefined
      ? (cleanText(previousData.categoryId, 80) || 'other')
      : validatedRequestedCategory;
    const note = input.note === undefined ? cleanText(previousData.note, 250) : cleanText(input.note, 250);
    const date = input.date || previousData.date || todayDouala();
    const expenseType = cleanText(input.expenseType === undefined ? previousData.expenseType || 'consumption' : input.expenseType, 30);
    if (!['consumption', 'project', 'savings', 'investment'].includes(expenseType)) throw new Error('Choisis une nature de sortie valide.');
    const projectId = expenseType === 'project'
      ? cleanText(input.projectId === undefined ? previousData.projectId : input.projectId, 150)
      : '';
    if (expenseType === 'project' && !projectId) throw new Error('Sélectionne le projet concerné.');
    if (expenseType !== 'project' && projectId) throw new Error('Associe un projet uniquement à une sortie de type projet.');
    let projectName = '';
    if (expenseType === 'project') {
      if (!userSnap.exists || !isPremium(userSnap.data())) throw new Error('La gestion des projets est réservée à Pata Premium.');
      const projectSnap = await transaction.get(subcol(uid, 'projects').doc(projectId));
      if (!projectSnap.exists || projectSnap.data()?.status === 'archived') throw new Error('Ce projet est introuvable ou archivé.');
      projectName = cleanText(projectSnap.data()?.name, 100);
    }
    const optionalMetadata = readOptionalTransactionMetadata(input, previousData);
    const budgetSnap = await transaction.get(subcol(uid, 'budgets').where('month', '==', String(date).slice(0, 7)));
    const requestedSourceId = input.incomeSourceId === undefined
      ? (previousData.incomeSourceId || 'all') : input.incomeSourceId;
    const requestedSourceName = input.incomeSourceName === undefined
      ? (previousData.incomeSourceName || (requestedSourceId === 'all' ? 'Tous les revenus' : ''))
      : input.incomeSourceName;

    const incomes = incomesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const expenses = expensesSnap.docs
      .filter((doc) => doc.id !== id)
      .map((doc) => ({ id: doc.id, ...doc.data() }));
    const balances = buildIncomeBalances(incomes, expenses);
    const selectedSource = resolveSource(incomes, requestedSourceId, requestedSourceName);
    const eligibleBalances = balances.filter((income) => !income.projectId || income.projectId === projectId);
    let allocations = [];

    if (selectedSource.id === 'all') {
      const available = eligibleBalances.reduce((sum, item) => sum + item.remaining, 0);
      if (amount > available) {
        throw new Error(`Fonds insuffisants : ${available.toLocaleString('fr-FR')} FCFA disponibles au total, contre ${amount.toLocaleString('fr-FR')} FCFA demandés.`);
      }
      let remaining = amount;
      for (const income of [...eligibleBalances].sort((a, b) => a.remaining - b.remaining)) {
        if (remaining <= 0) break;
        if (income.remaining <= 0) continue;
        const allocated = Math.min(income.remaining, remaining);
        allocations.push({ income, amount: allocated });
        remaining -= allocated;
      }
    } else {
      const income = balances.find((item) => item.id === selectedSource.id);
      if (!income) throw new Error('Cette source de revenu n’existe plus. Vérifie-la avant de réessayer.');
      if (income.projectId && income.projectId !== projectId) throw new Error('Ce revenu est réservé à un autre projet.');
      if (amount > income.remaining) {
        throw new Error(`Fonds insuffisants sur « ${income.source} » : ${income.remaining.toLocaleString('fr-FR')} FCFA disponibles.`);
      }
      allocations = [{ income, amount }];
    }

    if (!allocations.length) throw new Error('Aucun revenu disponible pour cette dépense.');
    const plannedBySource = new Map();
    allocations.forEach(({ income, amount: allocated }) => plannedBySource.set(income.id, (plannedBySource.get(income.id) || 0) + allocated));
    const budgetWarnings = [];
    for (const doc of budgetSnap.docs) {
      const budget = doc.data();
      if (expenseType !== 'consumption' || budget.categoryId !== categoryId) continue;
      const budgetSourceId = budget.incomeSourceId || 'all';
      const planned = budgetSourceId === 'all' ? amount : (plannedBySource.get(budgetSourceId) || 0);
      if (planned <= 0) continue;
      const alreadySpent = expenses.filter((item) => getExpenseTypeForBudget(item) === 'consumption'
        && String(item.date || '').slice(0, 7) === String(date).slice(0, 7)
        && item.categoryId === categoryId
        && (budgetSourceId === 'all' || item.incomeSourceId === budgetSourceId))
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      const allocated = Number(budget.amount) || 0;
      if (allocated > 0 && alreadySpent + planned > allocated) budgetWarnings.push({
        source: budgetSourceId === 'all' ? 'tous les revenus' : (incomes.find((item) => item.id === budgetSourceId)?.source || 'ce revenu'),
        allocated, alreadySpent, after: alreadySpent + planned, excess: alreadySpent + planned - allocated,
      });
    }
    if (budgetWarnings.length && input.confirmBudgetOverrun !== true) {
      const details = budgetWarnings.map((item) => `${item.source} : budget ${item.allocated.toLocaleString('fr-FR')} FCFA, après modification ${item.after.toLocaleString('fr-FR')} FCFA (dépassement ${item.excess.toLocaleString('fr-FR')} FCFA`).join(' ; ');
      return { success: false, confirmationRequired: true, message: `Attention : cette modification ferait dépasser un budget. ${details}. Veux-tu quand même enregistrer la modification ?`, warnings: budgetWarnings, amount, date, categoryId };
    }
    const first = allocations[0];
    transaction.update(expenseRef, {
      amount: first.amount,
      categoryId,
      note,
      date,
      incomeSourceId: first.income.id,
      incomeSourceName: first.income.source || 'Revenu sans nom',
      expenseType,
      projectId: expenseType === 'project' ? projectId : null,
      projectName: expenseType === 'project' ? projectName : null,
      ...optionalMetadata,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const extraRecords = [];
    allocations.slice(1).forEach(({ income, amount: allocated }, index) => {
      const extraRef = expensesRef.doc();
      transaction.create(extraRef, {
        amount: allocated,
        categoryId,
        note: `${note}${note ? ' ' : ''}(Partagé ${index + 2})`,
        date,
        incomeSourceId: income.id,
        incomeSourceName: income.source || 'Revenu sans nom',
        expenseType,
        projectId: expenseType === 'project' ? projectId : null,
        projectName: expenseType === 'project' ? projectName : null,
        ...optionalMetadata,
        createdAt: previousData.createdAt || FieldValue.serverTimestamp(),
        splitFromExpenseId: id,
      });
      extraRecords.push({ id: extraRef.id, incomeSourceId: income.id, incomeSourceName: income.source, amount: allocated });
    });

    return {
      success: true,
      expenseId: id,
      amount,
      date,
      categoryId,
      expenseType,
      projectId: expenseType === 'project' ? projectId : null,
      projectName: projectName || null,
      allocations: [
        { incomeSourceId: first.income.id, incomeSourceName: first.income.source, amount: first.amount },
        ...extraRecords,
      ],
      recordsCreated: allocations.length,
    };
  });
}

export async function deleteExpenseForUser(uid, expenseId) {
  const id = cleanText(expenseId, 150);
  if (!id) throw new Error('Identifiant de dépense manquant.');
  const expenseRef = subcol(uid, 'expenses').doc(id);
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(expenseRef);
    if (!snapshot.exists) throw new Error('Dépense introuvable.');
    transaction.delete(expenseRef);
  });
  return { success: true, expenseId: id, message: 'Dépense supprimée.' };
}

function addFrequency(date, frequency, anchorDay = date.getUTCDate()) {
  const next = new Date(date.getTime());
  if (frequency === 'daily') next.setUTCDate(next.getUTCDate() + 1);
  else if (frequency === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
  else if (frequency === 'monthly') {
    const targetDay = Math.max(1, Math.min(31, Number(anchorDay) || next.getUTCDate()));
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(targetDay, lastDay));
  }
  return next;
}

function advancePastMissedRuns(dueDate, frequency, now, endDate, anchorDay = dueDate.getUTCDate()) {
  let next = new Date(dueDate.getTime());
  let count = 0;
  do {
    next = addFrequency(next, frequency, anchorDay);
    count += 1;
  } while (next <= now && count < 5000);
  if (count >= 5000) throw new Error('Fréquence d’automatisation invalide ou trop ancienne.');
  if (endDate && next > endDate) return { nextRun: null, completed: true };
  return { nextRun: next.toISOString(), completed: false };
}

export async function runAutomationForUser(uid, now = new Date()) {
  const automationSnapshot = await subcol(uid, 'automations').get();
  let executed = 0;
  let skipped = 0;
  let completed = 0;

  for (const automationDoc of automationSnapshot.docs) {
    const autoRef = automationDoc.ref;
    let result;
    try {
      result = await adminDb.runTransaction(async (transaction) => {
      const freshAuto = await transaction.get(autoRef);
      if (!freshAuto.exists) return 'ignored';
      const auto = freshAuto.data();
      if (auto.active === false) return 'ignored';

      const dueDate = toDate(auto.nextRun);
      if (!dueDate || dueDate > now) return 'ignored';
      const endDate = toDate(auto.endDate);
      if (endDate && dueDate > endDate) {
        transaction.update(autoRef, { active: false, nextRun: null, lastRunStatus: 'COMPLETED', lastRunMessage: 'Période terminée.', updatedAt: FieldValue.serverTimestamp() });
        return 'completed';
      }
      if (!FREQUENCIES.includes(auto.frequency) || !Number.isFinite(Number(auto.amount)) || Number(auto.amount) <= 0) {
        transaction.update(autoRef, { active: false, lastRunAt: now.toISOString(), lastRunStatus: 'ERROR', lastRunMessage: 'Paramètres invalides : automatisation mise en pause.', updatedAt: FieldValue.serverTimestamp() });
        return 'skipped';
      }
      const anchorDay = Number(auto.anchorDay) || dueDate.getUTCDate();
      const nextInfo = advancePastMissedRuns(dueDate, auto.frequency, now, endDate, anchorDay);
      const userRef = userRefFor(uid);
      const [userSnap, incomesSnap, expensesSnap] = await Promise.all([
        transaction.get(userRef),
        transaction.get(subcol(uid, 'incomes')),
        transaction.get(subcol(uid, 'expenses')),
      ]);
      if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
      const userData = userSnap.data();
      const currentMonth = monthKey(now);
      let monthlyStats = { ...(userData.monthlyStats || {}) };
      if (monthlyStats.lastResetMonth !== currentMonth) {
        monthlyStats = { ...monthlyStats, expenses: 0, incomes: 0, budgets: 0, goals: 0, vitalForecasts: 0, durationForecasts: 0, lastResetMonth: currentMonth };
      }
      const freeQuotaReached = !isPremium(userData) && (Number(monthlyStats.expenses) || 0) >= FREE_EXPENSE_LIMIT;
      const incomes = incomesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const expenses = expensesSnap.docs.map((doc) => doc.data());
      const balances = buildIncomeBalances(incomes, expenses);
      const amount = Math.round(Number(auto.amount));
      let allocations = [];
      const sourceId = auto.incomeSourceId || 'all';
      if (!freeQuotaReached && sourceId === 'all') {
        let remaining = amount;
        const available = balances.reduce((sum, item) => sum + item.remaining, 0);
        if (available >= amount) {
          for (const income of [...balances].sort((a, b) => a.remaining - b.remaining)) {
            if (remaining <= 0) break;
            if (income.remaining <= 0) continue;
            const allocated = Math.min(income.remaining, remaining);
            allocations.push({ income, amount: allocated });
            remaining -= allocated;
          }
        }
      } else if (!freeQuotaReached) {
        const income = balances.find((item) => item.id === sourceId);
        if (income && income.remaining >= amount) allocations = [{ income, amount }];
      }

      let status = 'SKIPPED';
      let message = freeQuotaReached
        ? `Dépense non enregistrée : la limite mensuelle de ${FREE_EXPENSE_LIMIT} dépenses du compte gratuit est atteinte. Passe à Premium pour continuer.`
        : `Fonds insuffisants sur la source « ${auto.incomeSourceName || (sourceId === 'all' ? 'Tous les revenus' : sourceId)} ».`;
      if (allocations.length) {
        const expenseDate = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(now);
        const budgetSnapshot = await transaction.get(subcol(uid, 'budgets').where('month', '==', expenseDate.slice(0, 7)));
        const plannedBySource = new Map();
        allocations.forEach(({ income, amount: allocated }) => plannedBySource.set(income.id, (plannedBySource.get(income.id) || 0) + allocated));
        const budgetWarnings = [];
        for (const budgetDoc of budgetSnapshot.docs) {
          const budget = budgetDoc.data();
          if (budget.categoryId !== auto.categoryId) continue;
          const budgetSource = budget.incomeSourceId || 'all';
          const planned = budgetSource === 'all' ? amount : (plannedBySource.get(budgetSource) || 0);
          if (planned <= 0) continue;
          const alreadySpent = expenses.filter((item) => String(item.date || '').slice(0, 7) === expenseDate.slice(0, 7)
            && item.categoryId === auto.categoryId
            && (budgetSource === 'all' || item.incomeSourceId === budgetSource))
            .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
          const allocated = Number(budget.amount) || 0;
          if (allocated > 0 && alreadySpent + planned > allocated) {
            const sourceLabel = budgetSource === 'all' ? 'tous les revenus' : (incomes.find((item) => item.id === budgetSource)?.source || 'ce revenu');
            budgetWarnings.push(`${sourceLabel} : budget ${allocated.toLocaleString('fr-FR')} FCFA, après cette opération ${ (alreadySpent + planned).toLocaleString('fr-FR')} FCFA`);
          }
        }
        if (budgetWarnings.length) {
          message = `Dépense non enregistrée : elle dépasserait le budget prévu. ${budgetWarnings.join(' ; ')}. Tu peux ajuster le budget ou enregistrer manuellement après confirmation.`;
        } else {
        const plannedExpenses = allocations.map(({ income, amount: allocated }, index) => {
          // Deterministic ID: retries of the same due occurrence cannot duplicate a charge.
          const runStamp = String(dueDate.getTime());
          const expenseId = `auto_${autoRef.id}_${runStamp}_${index}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 140);
          const expenseRef = subcol(uid, 'expenses').doc(expenseId);
          return {
            ref: expenseRef,
            data: {
              amount: allocated,
              categoryId: cleanText(auto.categoryId, 80) || 'other',
              note: cleanText(auto.note, 250) || 'Dépense automatique',
              date: expenseDate,
              incomeSourceId: income.id,
              incomeSourceName: income.source || 'Revenu sans nom',
              automationId: autoRef.id,
              automationDueAt: dueDate.toISOString(),
              createdAt: FieldValue.serverTimestamp(),
            },
          };
        });
        // Reads are completed before writes. A retry sees the original record instead of charging twice.
        const existingRuns = await Promise.all(plannedExpenses.map((item) => transaction.get(item.ref)));
        const existingCount = existingRuns.filter((snapshot) => snapshot.exists).length;
        if (existingCount > 0 && existingCount !== plannedExpenses.length) {
          throw new Error('Exécution partielle déjà détectée pour cette échéance. Vérification manuelle nécessaire.');
        }
        if (existingCount === plannedExpenses.length) {
          status = 'EXECUTED';
          message = 'Cette occurrence avait déjà été enregistrée; aucun doublon n’a été créé.';
        } else {
          plannedExpenses.forEach((item) => transaction.create(item.ref, item.data));
          status = 'EXECUTED';
          message = `Dépense automatique enregistrée : ${amount.toLocaleString('fr-FR')} FCFA.`;
          if (!isPremium(userData)) monthlyStats.expenses = (Number(monthlyStats.expenses) || 0) + 1;
          transaction.set(userRef, {
            lifetimeExpenseAmount: FieldValue.increment(amount),
            lifetimeExpenseCount: FieldValue.increment(1),
            ...(!isPremium(userData) ? { monthlyStats } : {}),
          }, { merge: true });
        }
        }
      }

      const update = {
        nextRun: nextInfo.nextRun,
        active: !nextInfo.completed,
        lastRunAt: now.toISOString(),
        lastDueAt: dueDate.toISOString(),
        lastRunStatus: nextInfo.completed && status === 'SKIPPED' ? 'COMPLETED' : status,
        lastRunMessage: nextInfo.completed && status === 'SKIPPED' ? 'Période terminée.' : message,
        runCount: (Number(auto.runCount) || 0) + (status === 'EXECUTED' ? 1 : 0),
        updatedAt: FieldValue.serverTimestamp(),
      };
      transaction.update(autoRef, update);
      if (status === 'EXECUTED') return 'executed';
      if (nextInfo.completed) return 'completed';
      return 'skipped';
      });
    } catch (automationError) {
      console.error(`[AUTOMATION] ${autoRef.id} (${uid}) :`, automationError.message);
      skipped += 1;
      continue;
    }

    if (result === 'executed') executed += 1;
    else if (result === 'skipped') skipped += 1;
    else if (result === 'completed') completed += 1;
  }

  return { executed, skipped, completed, checked: automationSnapshot.size };
}

const WEEKLY_CATEGORY_LABELS = {
  food: 'Alimentation', transport: 'Transport', housing: 'Logement', internet: 'Internet',
  health: 'Santé', leisure: 'Loisirs', investment: 'Investissement',
  contribution: 'Cotisations', savings: 'Épargne', other: 'Autres',
};

function shiftDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export async function generateWeeklyReportForUser(uid, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  const [year, month, day] = today.split('-').map(Number);
  const weekdayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysSinceMonday = (weekdayIndex + 6) % 7;
  const currentWeekStart = shiftDateKey(today, -daysSinceMonday);
  const weekStart = shiftDateKey(currentWeekStart, -7);
  const weekEnd = shiftDateKey(currentWeekStart, -1);
  const previousWeekStart = shiftDateKey(currentWeekStart, -14);
  const previousWeekEnd = shiftDateKey(currentWeekStart, -8);
  const userRef = userRefFor(uid);
  const reportRef = userRef.collection('weekly_reports').doc(weekStart);
  const existingReport = await reportRef.get();
  if (existingReport.exists) return { generated: false, weekStart, weekEnd };

  const [incomesSnapshot, expensesSnapshot, categoriesSnapshot] = await Promise.all([
    subcol(uid, 'incomes').where('date', '>=', previousWeekStart).where('date', '<=', weekEnd).get(),
    subcol(uid, 'expenses').where('date', '>=', previousWeekStart).where('date', '<=', weekEnd).get(),
    subcol(uid, 'categories').get(),
  ]);

  const customCategoryNames = new Map(categoriesSnapshot.docs
    .filter((doc) => doc.data().type === 'expense')
    .map((doc) => [doc.id, cleanText(doc.data().name, 80)]));
  const incomes = incomesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const expenses = expensesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const inRange = (date, start, end) => typeof date === 'string' && date >= start && date <= end;
  const currentIncome = incomes.filter((item) => inRange(item.date, weekStart, weekEnd));
  const currentExpense = expenses.filter((item) => inRange(item.date, weekStart, weekEnd));
  const previousIncome = incomes.filter((item) => inRange(item.date, previousWeekStart, previousWeekEnd));
  const previousExpense = expenses.filter((item) => inRange(item.date, previousWeekStart, previousWeekEnd));

  const sum = (items) => items.reduce((total, item) => total + (Number(item.amount) || 0), 0);
  const totalIncome = sum(currentIncome);
  const totalExpense = sum(currentExpense);
  const previousIncomeTotal = sum(previousIncome);
  const previousExpenseTotal = sum(previousExpense);
  const categories = {};
  currentExpense.forEach((item) => {
    const categoryId = cleanText(item.categoryId, 80) || 'other';
    categories[categoryId] = (categories[categoryId] || 0) + (Number(item.amount) || 0);
  });
  const categoryBreakdown = Object.entries(categories)
    .map(([categoryId, amount]) => ({
      categoryId,
      label: customCategoryNames.get(categoryId) || WEEKLY_CATEGORY_LABELS[categoryId] || categoryId,
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);
  const expenseChangePercent = previousExpenseTotal > 0
    ? Math.round(((totalExpense - previousExpenseTotal) / previousExpenseTotal) * 100)
    : null;
  const advice = [];
  if (totalIncome === 0 && totalExpense > 0) {
    advice.push('Des dépenses sont enregistrées sans revenu de la semaine : vérifie que tous tes revenus ont bien été saisis.');
  } else if (totalIncome > 0 && totalExpense > totalIncome) {
    advice.push('Tes dépenses dépassent les revenus enregistrés cette semaine. Réduis ou reporte les dépenses non essentielles.');
  } else if (totalIncome > 0) {
    advice.push(`Après les dépenses enregistrées, il reste ${Math.max(0, totalIncome - totalExpense).toLocaleString('fr-FR')} FCFA sur les revenus de cette semaine.`);
  }
  if (expenseChangePercent !== null && expenseChangePercent > 10) {
    advice.push(`Les dépenses ont augmenté de ${expenseChangePercent}% par rapport à la semaine précédente. Vérifie les catégories qui ont le plus progressé.`);
  } else if (expenseChangePercent !== null && expenseChangePercent < -10) {
    advice.push(`Les dépenses ont diminué de ${Math.abs(expenseChangePercent)}% par rapport à la semaine précédente. Identifie les habitudes qui ont aidé.`);
  }
  if (categoryBreakdown[0]) {
    advice.push(`La première catégorie de dépenses est ${categoryBreakdown[0].label} (${categoryBreakdown[0].amount.toLocaleString('fr-FR')} FCFA).`);
  }

  const report = {
    weekStart, weekEnd, previousWeekStart, previousWeekEnd,
    totalIncome, totalExpense, net: totalIncome - totalExpense,
    previousIncome: previousIncomeTotal, previousExpense: previousExpenseTotal,
    expenseChangePercent,
    categories: categoryBreakdown,
    advice,
    currency: 'XAF',
    generatedAt: FieldValue.serverTimestamp(),
  };
  const generated = await adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(reportRef);
    if (existing.exists) return false;
    transaction.create(reportRef, report);
    return true;
  });
  return { generated, weekStart, weekEnd };
}

export const AI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'add_expense',
      description: 'Enregistrer une dépense demandée explicitement par l’utilisateur. Utilise l’ID exact de la source de revenu lorsqu’elle est nommée. N’invente jamais une source.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'integer', description: 'Montant entier en FCFA.' },
          categoryId: { type: 'string', description: 'Identifiant de catégorie standard ou catégorie personnalisée connue dans le profil.' },
          note: { type: 'string' },
          expenseType: { type: 'string', enum: ['consumption', 'project', 'savings', 'investment'], description: 'Nature obligatoire à choisir selon le contexte : consumption pour nourriture, transport, loyer et besoins quotidiens ; project pour une réalisation identifiée comme construction, achat prévu d’un téléphone ou ordinateur ; savings pour de l’argent mis de côté ; investment pour une somme affectée à une activité ou un actif. Ne classe pas l’épargne ou les projets comme consommation.' },
          projectId: { type: 'string', description: 'ID exact du projet Premium si la sortie est liée à un projet.' },
          date: { type: 'string', description: 'Date YYYY-MM-DD uniquement si elle a été indiquée; sinon omettre.' },
          incomeSourceId: { type: 'string', description: 'ID exact de la source dans les données, ou all si toutes les sources.' },
          incomeSourceName: { type: 'string', description: 'Nom exact de la source, utilisé uniquement pour retrouver/confirmer son ID.' },
          confirmBudgetOverrun: { type: 'boolean', description: 'Mettre true uniquement si l’utilisateur a explicitement accepté après avoir vu l’avertissement de dépassement.' },
        },
        required: ['amount', 'categoryId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_expense',
      description: 'Modifier une dépense existante uniquement à la demande explicite de l’utilisateur. Utilise l’ID EXACT fourni dans les dépenses récentes. Vérifie à nouveau les soldes et les sources avant d’enregistrer.',
      parameters: {
        type: 'object',
        properties: {
          expenseId: { type: 'string' }, amount: { type: 'integer' },
          categoryId: { type: 'string', description: 'Identifiant de catégorie standard ou personnalisée.' },
          expenseType: { type: 'string', enum: ['consumption', 'project', 'savings', 'investment'], description: 'Conserve la nature réelle de la sortie lors de la modification : consommation quotidienne, projet, épargne ou investissement.' },
          projectId: { type: 'string', description: 'ID exact du projet Premium si la sortie est liée à un projet.' },
          note: { type: 'string' }, date: { type: 'string' },
          incomeSourceId: { type: 'string' }, incomeSourceName: { type: 'string' },
          confirmBudgetOverrun: { type: 'boolean', description: 'Mettre true uniquement après que l’utilisateur a explicitement accepté l’avertissement de dépassement.' },
        },
        required: ['expenseId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_expense',
      description: 'Supprimer une dépense existante uniquement si l’utilisateur le demande clairement. Utilise son ID EXACT depuis les données Pata.',
      parameters: {
        type: 'object',
        properties: { expenseId: { type: 'string' } },
        required: ['expenseId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_income',
      description: 'Enregistrer un nouveau revenu lorsque l’utilisateur demande de l’ajouter. Ne pas l’appeler pour une simple hypothèse ou un revenu utilisé uniquement pour calculer un budget.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'integer' }, source: { type: 'string' },
          categoryId: { type: 'string', enum: INCOME_CATEGORIES },
          note: { type: 'string' }, date: { type: 'string' },
          projectId: { type: 'string', description: 'ID exact du projet auquel ce revenu est réservé, si demandé.' },
        },
        required: ['amount', 'source', 'categoryId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_budget_plan',
      description: 'Créer ou mettre à jour les enveloppes budgétaires. Ne crée JAMAIS un revenu fictif pour un budget. Associe le budget à une source existante uniquement si elle est précisée.',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'string', description: 'Mois YYYY-MM; sinon mois courant.' },
          incomeSourceId: { type: 'string', description: 'ID exact d’un revenu existant ou all.' },
          plan: {
            type: 'array', minItems: 1, items: {
              type: 'object', properties: {
                categoryId: { type: 'string', description: 'Identifiant de catégorie standard ou personnalisée.' },
                amount: { type: 'integer' },
              }, required: ['categoryId', 'amount'],
            },
          },
        },
        required: ['plan'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_goal',
      description: 'Créer un objectif d’épargne demandé explicitement.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' }, targetAmount: { type: 'integer' },
          deadline: { type: 'string', description: 'Date YYYY-MM-DD si connue.' },
          categoryId: { type: 'string', enum: ['savings', 'transport', 'food', 'housing', 'health', 'other'] },
        },
        required: ['name', 'targetAmount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_automation',
      description: 'Créer une dépense récurrente automatique. Si le jour de démarrage ou la source manque et change le sens de la demande, demande une précision au lieu de l’inventer.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'integer' }, categoryId: { type: 'string', description: 'Identifiant de catégorie standard ou personnalisée.' },
          frequency: { type: 'string', enum: FREQUENCIES }, note: { type: 'string' },
          startDate: { type: 'string', description: 'Date YYYY-MM-DD du premier déclenchement si donnée.' },
          endDate: { type: 'string', description: 'Date limite YYYY-MM-DD si donnée.' },
          incomeSourceId: { type: 'string' }, incomeSourceName: { type: 'string' },
        },
        required: ['amount', 'categoryId', 'frequency'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pause_automation',
      description: 'Mettre en pause une automatisation existante précisément identifiée.',
      parameters: { type: 'object', properties: { automationId: { type: 'string' } }, required: ['automationId'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resume_automation',
      description: 'Réactiver une automatisation en pause; sa prochaine exécution sera programmée selon sa fréquence.',
      parameters: { type: 'object', properties: { automationId: { type: 'string' } }, required: ['automationId'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_goal',
      description: 'Modifier un objectif existant lorsque l’utilisateur le demande clairement.',
      parameters: {
        type: 'object',
        properties: {
          goalId: { type: 'string' }, name: { type: 'string' },
          targetAmount: { type: 'integer' }, deadline: { type: 'string' },
        }, required: ['goalId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_duration_forecast',
      description: 'Créer une prévision enregistrée de durée de vie du capital quand l’utilisateur le demande clairement. Il faut un capital et au moins une dépense quotidienne, hebdomadaire ou mensuelle. Les montants sont en FCFA.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' }, capital: { type: 'integer' }, dailyExpense: { type: 'integer' },
          weeklyExpense: { type: 'integer' }, monthlyExpense: { type: 'integer' },
        },
        required: ['capital'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_subscription_status',
      description: 'Consulter l’état réel de l’abonnement Premium de l’utilisateur, sa date de début connue, sa date d’expiration et le nombre de jours restants. À utiliser quand il demande son statut ou sa durée.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'activate_premium_from_balance',
      description: 'Acheter ou renouveler Premium avec le solde Pata uniquement si l’utilisateur le demande clairement. Prix fixe de 2 500 FCFA par mois. Vérifier le solde avant de valider. Si insuffisant, expliquer précisément le manque et proposer la recharge du portefeuille.',
      parameters: {
        type: 'object',
        properties: { months: { type: 'integer', minimum: 1, maximum: 12, description: 'Nombre de mois demandé.' } },
        required: ['months'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember_user_context',
      description: 'Mémoriser une préférence financière, un objectif, une contrainte ou une correction explicitement déclarée pour personnaliser les prochains échanges. Ne mémorise aucune supposition. sourceQuote doit être une citation textuelle exacte provenant d’un message utilisateur.',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['preference', 'financial_goal', 'constraint', 'correction', 'context'] },
          fact: { type: 'string' }, sourceQuote: { type: 'string' },
        }, required: ['kind', 'fact', 'sourceQuote'],
      },
    },
  },
];

async function addIncome(uid, args) {
  const amount = asPositiveMoney(args.amount, 'Revenu');
  const source = cleanText(args.source, 100);
  if (!source) throw new Error('Le nom de la source du revenu est obligatoire.');
  const categoryId = INCOME_CATEGORIES.includes(args.categoryId) ? args.categoryId : 'other_income';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(args.date || '')) ? args.date : todayDouala();
  const userRef = userRefFor(uid);
  const ref = subcol(uid, 'incomes').doc();
  const projectId = cleanText(args.projectId, 150);
  await adminDb.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
    let projectName = '';
    if (projectId) {
      if (!isPremium(userSnap.data())) throw new Error('L’association d’un revenu à un projet est réservée à Pata Premium.');
      const projectSnap = await transaction.get(subcol(uid, 'projects').doc(projectId));
      if (!projectSnap.exists || projectSnap.data()?.status === 'archived') throw new Error('Le projet choisi est introuvable ou archivé.');
      projectName = cleanText(projectSnap.data()?.name, 100);
    }
    const stats = incrementFreeQuota(userSnap.data(), 'incomes', 1);
    transaction.create(ref, {
      amount, source, categoryId, note: cleanText(args.note, 250), date,
      ...(projectId ? { projectId, projectName } : {}),
      month: date.slice(0, 7), createdAt: FieldValue.serverTimestamp(),
    });
    transaction.set(userRef, { lifetimeIncomeAmount: FieldValue.increment(amount), lifetimeIncomeCount: FieldValue.increment(1), ...(stats ? { monthlyStats: stats } : {}) }, { merge: true });
  });
  return { message: `Revenu « ${source} » enregistré.`, amount, source, incomeId: ref.id, date, ...(projectId ? { projectId } : {}) };
}

async function applyBudgetPlan(uid, args) {
  if (!Array.isArray(args.plan) || !args.plan.length || args.plan.length > 20) {
    throw new Error('Le plan doit contenir entre 1 et 20 catégories.');
  }
  const month = /^\d{4}-\d{2}$/.test(String(args.month || '')) ? args.month : monthKey();
  const sourceId = cleanText(args.incomeSourceId || 'all', 150) || 'all';
  const incomeCollection = subcol(uid, 'incomes');
  const normalizedPlan = await Promise.all(args.plan.map(async (item) => ({
    categoryId: await assertExpenseCategory(uid, item.categoryId || 'other'),
    amount: asPositiveMoney(item.amount, 'Budget'),
  })));
  if (new Set(normalizedPlan.map((item) => item.categoryId)).size !== normalizedPlan.length) {
    throw new Error('Le plan contient plusieurs fois la même catégorie. Regroupe les montants avant de réessayer.');
  }

  const budgets = subcol(uid, 'budgets');
  const userRef = userRefFor(uid);
  const result = await adminDb.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    if (!userSnapshot.exists) throw new Error('Profil utilisateur introuvable.');
    if (sourceId !== 'all') {
      const incomeSnapshot = await transaction.get(incomeCollection.doc(sourceId));
      if (!incomeSnapshot.exists) throw new Error('La source choisie pour ce budget est introuvable. Aucun budget n’a été modifié.');
    }
    const writes = [];
    for (const item of normalizedPlan) {
      const query = budgets
        .where('month', '==', month)
        .where('categoryId', '==', item.categoryId)
        .where('incomeSourceId', '==', sourceId);
      const existing = await transaction.get(query);
      if (!existing.empty) {
        writes.push({ ref: existing.docs[0].ref, data: { amount: item.amount, updatedAt: FieldValue.serverTimestamp() }, create: false });
      } else {
        writes.push({ ref: budgets.doc(), data: {
          ...item, month, incomeSourceId: sourceId,
          createdAt: FieldValue.serverTimestamp(),
        }, create: true });
      }
    }
    const newCount = writes.filter((write) => write.create).length;
    const nextStats = newCount ? incrementFreeQuota(userSnapshot.data(), 'budgets', newCount) : null;
    writes.forEach((write) => {
      if (write.create) transaction.create(write.ref, write.data);
      else transaction.update(write.ref, write.data);
    });
    if (nextStats) transaction.update(userRef, { monthlyStats: nextStats });
    return writes.length;
  });
  return { message: `${result} enveloppe(s) budgétaire(s) enregistrée(s) pour ${month}.`, count: result, month, incomeSourceId: sourceId };
}

async function addGoal(uid, args) {
  const name = cleanText(args.name, 100);
  if (!name) throw new Error('Le nom de l’objectif est obligatoire.');
  const targetAmount = asPositiveMoney(args.targetAmount, 'Objectif');
  const startDate = args.startDate || todayDouala();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate))) throw new Error('Date de début invalide. Utilise AAAA-MM-JJ.');
  if (args.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(String(args.deadline))) throw new Error('Date d’échéance invalide. Utilise AAAA-MM-JJ.');
  const deadline = args.deadline || null;
  if (deadline && deadline <= startDate) throw new Error('La date d’échéance doit être après le début.');
  const categoryId = ['savings', 'transport', 'food', 'housing', 'health', 'other'].includes(args.categoryId) ? args.categoryId : 'savings';
  const userRef = userRefFor(uid);
  const goalsRef = subcol(uid, 'goals');
  const reservationsRef = subcol(uid, 'goal_quota_reservations');
  const ref = goalsRef.doc();
  await adminDb.runTransaction(async (transaction) => {
    const [userSnap, goalsSnap, reservationsSnap] = await Promise.all([transaction.get(userRef), transaction.get(goalsRef), transaction.get(reservationsRef)]);
    if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
    const userData = userSnap.data();
    const premium = isPremium(userData);
    const stats = incrementFreeQuota(userData, 'goals', 1);
    let effectiveDeadline = deadline;
    if (!premium && !effectiveDeadline) {
      const defaultEnd = new Date(`${startDate}T12:00:00`);
      const day = defaultEnd.getDate();
      defaultEnd.setDate(1);
      defaultEnd.setMonth(defaultEnd.getMonth() + 2);
      defaultEnd.setDate(Math.min(day, new Date(defaultEnd.getFullYear(), defaultEnd.getMonth() + 1, 0).getDate()));
      effectiveDeadline = `${defaultEnd.getFullYear()}-${String(defaultEnd.getMonth() + 1).padStart(2, '0')}-${String(defaultEnd.getDate()).padStart(2, '0')}`;
    }
    if (!premium && effectiveDeadline) {
      const start = new Date(`${startDate}T12:00:00`);
      const maxDeadline = new Date(start);
      const day = maxDeadline.getDate();
      maxDeadline.setDate(1);
      maxDeadline.setMonth(maxDeadline.getMonth() + 2);
      maxDeadline.setDate(Math.min(day, new Date(maxDeadline.getFullYear(), maxDeadline.getMonth() + 1, 0).getDate()));
      if (new Date(`${effectiveDeadline}T12:00:00`) > maxDeadline) throw new Error('Avec le compte gratuit, un objectif peut durer jusqu’à deux mois. Passe à Premium pour une durée plus longue.');
      const monthKeys = (first, last) => {
        const cursor = new Date(`${first.slice(0, 7)}-01T12:00:00`);
        const end = new Date(`${last.slice(0, 7)}-01T12:00:00`);
        const keys = [];
        while (cursor <= end && keys.length < 36) { keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`); cursor.setMonth(cursor.getMonth() + 1); }
        return keys;
      };
      const occupied = new Set(monthKeys(startDate, effectiveDeadline));
      const reserved = reservationsSnap.docs.some((document) => occupied.has(document.id));
      const legacyOverlap = goalsSnap.docs.some((doc) => {
        const item = doc.data();
        if (item.type !== 'goal' || item.closed || item.withdrawnAt || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.startDate || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.deadline || ''))) return false;
        return monthKeys(item.startDate, item.deadline).some((month) => occupied.has(month));
      });
      if (reserved || legacyOverlap) throw new Error('Un autre objectif couvre déjà une partie de cette période. Termine-le ou passe à Premium pour planifier plusieurs objectifs.');
      for (const month of occupied) transaction.create(reservationsRef.doc(month), { goalId: ref.id, month, createdAt: FieldValue.serverTimestamp() });
    }
    transaction.create(ref, {
      name, type: 'goal', categoryId, targetAmount,
      startDate, deadline: effectiveDeadline, frequencyDays: 7, penaltyAmount: 700,
      debtBalance: 0, pinned: false, createdAt: FieldValue.serverTimestamp(),
    });
    if (stats) transaction.update(userRef, { monthlyStats: stats });
  });
  return { message: `Objectif « ${name} » créé.`, goalId: ref.id, targetAmount, deadline };
}

async function addAutomation(uid, args) {
  const amount = asPositiveMoney(args.amount, 'Automatisation');
  if (!FREQUENCIES.includes(args.frequency)) throw new Error('Fréquence invalide.');
  const categoryId = await assertExpenseCategory(uid, args.categoryId || 'other');
  const incomesSnapshot = await subcol(uid, 'incomes').get();
  const selectedSource = resolveSource(incomesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })), args.incomeSourceId, args.incomeSourceName);
  if (args.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(args.startDate)) throw new Error('Date de démarrage invalide. Utilise AAAA-MM-JJ.');
  if (args.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(args.endDate)) throw new Error('Date de fin invalide. Utilise AAAA-MM-JJ.');
  let firstRun;
  if (args.startDate && /^\d{4}-\d{2}-\d{2}$/.test(args.startDate)) {
    firstRun = new Date(`${args.startDate}T00:00:00.000Z`);
  } else {
    // Aligne la première échéance sur le contrôle quotidien Vercel à 00:00 UTC.
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    firstRun = addFrequency(todayStart, args.frequency, todayStart.getUTCDate());
  }
  const endDate = args.endDate && /^\d{4}-\d{2}-\d{2}$/.test(args.endDate)
    ? new Date(`${args.endDate}T23:59:59.999Z`) : null;
  if (endDate && endDate < firstRun) throw new Error('La date de fin doit être postérieure au premier déclenchement.');
  const ref = subcol(uid, 'automations').doc();
  await ref.set({
    amount, categoryId, note: cleanText(args.note, 250), frequency: args.frequency,
    nextRun: firstRun.toISOString(), endDate: endDate?.toISOString() || null,
    anchorDay: args.startDate ? new Date(`${args.startDate}T00:00:00.000Z`).getUTCDate() : new Date().getUTCDate(),
    incomeSourceId: selectedSource.id, incomeSourceName: selectedSource.name,
    active: true, runCount: 0, createdAt: FieldValue.serverTimestamp(),
  });
  return {
    message: `Automatisation créée : ${amount.toLocaleString('fr-FR')} FCFA, ${args.frequency}.`,
    automationId: ref.id, nextRun: firstRun.toISOString(), incomeSourceName: selectedSource.name,
  };
}

async function updateGoal(uid, args) {
  const ref = subcol(uid, 'goals').doc(cleanText(args.goalId, 150));
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Objectif introuvable.');
  const patch = { updatedAt: FieldValue.serverTimestamp() };
  if (args.name !== undefined) {
    const name = cleanText(args.name, 100);
    if (!name) throw new Error('Le nom de l’objectif ne peut pas être vide.');
    patch.name = name;
  }
  if (args.targetAmount !== undefined) patch.targetAmount = asPositiveMoney(args.targetAmount, 'Objectif');
  if (args.deadline !== undefined) {
    if (args.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(args.deadline)) throw new Error('Date d’échéance invalide.');
    patch.deadline = args.deadline || null;
  }
  if (Object.keys(patch).length === 1) throw new Error('Aucune modification n’a été fournie.');
  await ref.update(patch);
  return { message: `Objectif « ${patch.name || snap.data().name} » mis à jour.`, goalId: ref.id };
}

async function setAutomationActive(uid, args, active) {
  const ref = subcol(uid, 'automations').doc(cleanText(args.automationId, 150));
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Automatisation introuvable.');
  const data = snap.data();
  const patch = { active, updatedAt: FieldValue.serverTimestamp() };
  if (active) {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const frequency = FREQUENCIES.includes(data.frequency) ? data.frequency : 'weekly';
    const next = addFrequency(todayStart, frequency, Number(data.anchorDay) || todayStart.getUTCDate());
    patch.nextRun = next.toISOString();
    if (frequency === 'monthly') patch.anchorDay = Number(data.anchorDay) || todayStart.getUTCDate();
  }
  await ref.update(patch);
  return { message: active ? 'Automatisation réactivée.' : 'Automatisation mise en pause.', automationId: ref.id, nextRun: patch.nextRun || data.nextRun };
}

async function rememberUserContext(uid, args, userMessages) {
  const fact = cleanText(args.fact, 300);
  const quote = cleanText(args.sourceQuote, 500);
  const kind = ['preference', 'financial_goal', 'constraint', 'correction', 'context'].includes(args.kind) ? args.kind : 'context';
  const quoteFound = userMessages.some((message) => String(message || '').includes(quote));
  if (!fact || quote.length < 5 || !quoteFound) {
    throw new Error('Je ne mémorise pas cette information : je n’ai pas retrouvé sa formulation exacte dans tes messages.');
  }
  const ref = subcol(uid, 'ai_memory').doc('profile');
  const snapshot = await ref.get();
  const currentFacts = Array.isArray(snapshot.data()?.facts) ? snapshot.data().facts : [];
  const normalized = normalizeName(fact);
  const updatedFacts = currentFacts.filter((item) => !(item.kind === kind && normalizeName(item.fact) === normalized));
  updatedFacts.push({ kind, fact, sourceQuote: quote, updatedAt: new Date().toISOString() });
  await ref.set({ facts: updatedFacts.slice(-25), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { message: 'Préférence ou information personnelle enregistrée pour les prochains échanges.', kind };
}

async function createDurationForecast(uid, args) {
  const capital = asPositiveMoney(args.capital, 'Capital à prévoir');
  const dailyExpense = Math.max(0, Math.round(Number(args.dailyExpense) || 0));
  const weeklyExpense = Math.max(0, Math.round(Number(args.weeklyExpense) || 0));
  const monthlyExpense = Math.max(0, Math.round(Number(args.monthlyExpense) || 0));
  const averageDaily = dailyExpense + weeklyExpense / 7 + monthlyExpense / 30.4375;
  if (averageDaily <= 0) throw new Error('Indique au moins une dépense quotidienne, hebdomadaire ou mensuelle.');
  const days = Math.floor(capital / averageDaily);
  const userRef = userRefFor(uid);
  const now = new Date();
  const name = cleanText(args.name, 100) || 'Prévision sans titre';
  const result = {
    id: `forecast_${now.getTime()}`, name, capital, dailyExpense, weeklyExpense, monthlyExpense,
    averageDaily: Math.round(averageDaily), estimatedDays: days,
    estimatedEndDate: new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10),
    createdAt: now.toISOString(),
  };
  await adminDb.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
    const data = userSnap.data();
    const stats = incrementFreeQuota(data, 'durationForecasts', 1);
    const forecasts = Array.isArray(data.durationForecasts) ? data.durationForecasts : [];
    transaction.update(userRef, { durationForecasts: [...forecasts, result].slice(-50), ...(stats ? { monthlyStats: stats } : {}) });
  });
  return { ...result, message: `Prévision « ${name} » enregistrée. Avec ${capital.toLocaleString('fr-FR')} FCFA et ce rythme de dépenses, ton argent devrait durer environ ${days} jour(s).` };
}

async function getSubscriptionStatus(uid) {
  const userSnap = await userRefFor(uid).get();
  if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
  const data = userSnap.data();
  const expiry = toDate(data.premiumUntil);
  const active = Boolean(expiry && expiry > new Date());
  const lastPayment = toDate(data.lastPaymentDate);
  const daysLeft = active ? Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / 86400000)) : 0;
  return {
    active,
    daysLeft,
    expiresAt: expiry?.toISOString() || null,
    startedAt: lastPayment?.toISOString() || null,
    balance: Number(data.balance) || 0,
    message: active
      ? `Ton abonnement Premium est actif. Il te reste ${daysLeft} jour(s), jusqu’au ${expiry.toLocaleDateString('fr-FR')}.`
      : 'Ton abonnement Premium n’est pas actif actuellement.',
  };
}

async function activatePremiumFromBalance(uid, args, idempotencyKey = null) {
  const months = Math.floor(Number(args.months));
  if (!Number.isInteger(months) || months < 1 || months > 12) throw new Error('Choisis une durée comprise entre 1 et 12 mois.');
  const amount = 2500 * months;
  const userRef = userRefFor(uid);
  const paymentRef = adminDb.collection('subscriptionPayments').doc();
  const actionRef = idempotencyKey ? subcol(uid, 'ai_actions').doc(String(idempotencyKey).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 140)) : null;

  return adminDb.runTransaction(async (transaction) => {
    const reads = [transaction.get(userRef)];
    if (actionRef) reads.push(transaction.get(actionRef));
    const [userSnap, actionSnap] = await Promise.all(reads);
    if (actionRef && actionSnap?.exists) return actionSnap.data().result;
    if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
    const userData = userSnap.data();
    const balance = Number(userData.balance) || 0;
    if (balance < amount) {
      const missing = amount - balance;
      throw new Error(`Ton solde Pata est de ${balance.toLocaleString('fr-FR')} FCFA. Il manque ${missing.toLocaleString('fr-FR')} FCFA pour payer ${months} mois de Premium. Tu peux recharger ton portefeuille depuis la page « Portefeuille ».`);
    }
    const now = new Date();
    const currentExpiry = toDate(userData.premiumUntil);
    const baseDate = currentExpiry && currentExpiry > now ? currentExpiry : now;
    const expiresAt = new Date(baseDate.getTime() + months * 30 * 86400000);
    const result = {
      success: true, months, amount, balanceAfter: balance - amount,
      expiresAt: expiresAt.toISOString(),
      message: `C’est confirmé : Premium est activé pour ${months} mois. Ton accès est valable jusqu’au ${expiresAt.toLocaleDateString('fr-FR')}.`,
    };
    transaction.update(userRef, {
      balance: balance - amount,
      premiumUntil: expiresAt.toISOString(),
      lastPaymentDate: now.toISOString(),
      lastPaymentAmount: amount,
      lastPaymentMethod: 'balance',
      premiumLastStartDate: now.toISOString(),
    });
    transaction.create(paymentRef, {
      transId: paymentRef.id, userId: uid, amount, months,
      status: 'CONFIRMED', method: 'balance',
      createdAt: FieldValue.serverTimestamp(), confirmedAt: FieldValue.serverTimestamp(),
    });
    if (actionRef) transaction.create(actionRef, { result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
}

export async function executeAITool(uid, toolName, rawArgs, userMessages = [], options = {}) {
  let args = rawArgs;
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { throw new Error('Arguments de l’action invalides.'); }
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Arguments de l’action invalides.');

  switch (toolName) {
    case 'add_expense': {
      const result = await createExpenseForUser(uid, args, { idempotencyKey: options.idempotencyKey || null });
      if (result.confirmationRequired) return result;
      const allocationText = (result.allocations || []).map((item) => `${item.amount.toLocaleString('fr-FR')} FCFA depuis « ${item.incomeSourceName} »`).join(' + ');
      return { ...result, message: `Dépense enregistrée : ${result.amount.toLocaleString('fr-FR')} FCFA. Répartition : ${allocationText}.` };
    }
    case 'update_expense': return updateExpenseForUser(uid, args.expenseId, args);
    case 'delete_expense': return deleteExpenseForUser(uid, args.expenseId);
    case 'add_income': return addIncome(uid, args);
    case 'apply_budget_plan': return applyBudgetPlan(uid, args);
    case 'create_goal': return addGoal(uid, args);
    case 'add_automation': return addAutomation(uid, args);
    case 'pause_automation': return setAutomationActive(uid, args, false);
    case 'resume_automation': return setAutomationActive(uid, args, true);
    case 'update_goal': return updateGoal(uid, args);
    case 'create_duration_forecast': return createDurationForecast(uid, args);
    case 'get_subscription_status': return getSubscriptionStatus(uid);
    case 'activate_premium_from_balance': return activatePremiumFromBalance(uid, args, options.idempotencyKey || null);
    case 'remember_user_context': return rememberUserContext(uid, args, userMessages);
    default: throw new Error(`Action non prise en charge : ${toolName}`);
  }
}
