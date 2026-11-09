import { NextResponse } from 'next/server';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { adminAuth, adminDb, adminMessaging } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { createExpenseForUser } from '@/lib/ai/financialTools';
import { sendPataEmail, renderPataEmail, escapeEmailHtml } from '@/lib/email/resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PREMIUM_PRICE = 2500;
const PROVIDERS = new Set(['mtn_momo', 'orange_money']);
const EVENT_TYPES = new Set(['receive', 'send', 'payment', 'withdrawal']);

function responseError(message, status = 400, extra = {}) {
  return NextResponse.json({ success: false, error: message, ...extra }, { status });
}

async function authenticate(request) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) throw new Error('Session expirée. Reconnecte-toi.');
  return adminAuth.verifyIdToken(header.slice(7));
}

function premiumExpiry(profile = {}) {
  const value = profile.premiumUntil;
  const expiry = value?.toDate ? value.toDate() : new Date(value || 0);
  return Number.isFinite(expiry.getTime()) ? expiry : null;
}

function isPremium(profile) {
  const expiry = premiumExpiry(profile);
  return Boolean(expiry && expiry.getTime() > Date.now());
}

function transactionRef(uid, transactionHash) {
  if (!/^[a-f0-9]{64}$/.test(String(transactionHash || ''))) {
    throw new Error('Identifiant de transaction invalide.');
  }
  return adminDb.collection('users').doc(uid).collection('smsImports').doc(transactionHash);
}

function validateParsedPayload(body = {}) {
  const provider = String(body.provider || '');
  const eventType = String(body.eventType || '');
  const direction = String(body.direction || '');
  const amount = Number(body.amount);
  const date = String(body.date || '');
  const time = String(body.time || '');
  const rawCounterparty = String(body.counterparty || '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 60);
  const counterparty = /^\p{L}[\p{L}'’ .-]{0,59}$/u.test(rawCounterparty) ? rawCounterparty : null;
  if (!PROVIDERS.has(provider)) throw new Error('Opérateur Mobile Money non reconnu.');
  if (!EVENT_TYPES.has(eventType)) throw new Error('Type de transaction non reconnu.');
  const expectedDirection = eventType === 'receive' ? 'income' : eventType === 'withdrawal' ? 'withdrawal' : 'expense';
  if (direction !== expectedDirection) throw new Error('Sens de transaction incohérent.');
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000) throw new Error('Montant SMS invalide.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error('Date ou heure de transaction invalide.');
  }
  return { provider, eventType, direction, amount, date, time, counterparty };
}

async function getUserAndPremium(uid) {
  const userRef = adminDb.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
  const profile = userSnap.data() || {};
  return { userRef, profile, premium: isPremium(profile), expiry: premiumExpiry(profile) };
}

function deviceTokenMatches(deviceToken, storedHash) {
  if (typeof deviceToken !== 'string' || deviceToken.length < 40 || deviceToken.length > 300) return false;
  if (typeof storedHash !== 'string' || !/^[a-f0-9]{64}$/.test(storedHash)) return false;
  const supplied = createHash('sha256').update(deviceToken).digest();
  const expected = Buffer.from(storedHash, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function inferExpenseCategory(counterparty, eventType) {
  const value = String(counterparty || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/(internet|data|forfait|airtime|credit|telephone|orange|mtn)/.test(value)) return 'internet';
  if (/(taxi|yango|uber|transport|bus|voyage|carburant|station)/.test(value)) return 'transport';
  if (/(restaurant|snack|supermarche|marche|boutique alimentaire|epicerie)/.test(value)) return 'food';
  if (/(pharmacie|hopital|clinique|sante|medical)/.test(value)) return 'health';
  if (/(eneo|camwater|loyer|logement)/.test(value)) return 'housing';
  if (/(cotisation|tontine|association)/.test(value)) return 'contribution';
  return 'other';
}

async function createSmsIncome(uid, transactionHash, item, providerName) {
  const userRef = adminDb.collection('users').doc(uid);
  const incomeId = 'sms_' + transactionHash;
  const incomeRef = userRef.collection('incomes').doc(incomeId);
  const result = await adminDb.runTransaction(async (transaction) => {
    const [userSnap, incomeSnap] = await Promise.all([transaction.get(userRef), transaction.get(incomeRef)]);
    if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
    if (incomeSnap.exists) return { id: incomeId, duplicate: true };
    const userData = userSnap.data() || {};
    const monthNow = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit',
    }).format(new Date());
    const currentStats = userData.monthlyStats || {};
    const stats = currentStats.lastResetMonth === monthNow
      ? { ...currentStats }
      : { ...currentStats, expenses: 0, incomes: 0, budgets: 0, goals: 0, lastResetMonth: monthNow };
    stats.incomes = (Number(stats.incomes) || 0) + 1;
    stats.lastResetMonth = monthNow;
    const note = item.eventType === 'receive' ? 'Réception Mobile Money' : 'Revenu Mobile Money';
    transaction.create(incomeRef, {
      amount: item.amount,
      source: providerName,
      categoryId: 'other_income',
      month: item.date.slice(0, 7),
      date: item.date,
      time: item.time,
      note: item.counterparty ? note + ' · ' + item.counterparty : note,
      paymentMethod: item.provider,
      details: item.counterparty || '',
      smsImportId: 'sms_' + transactionHash,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.update(userRef, {
      monthlyStats: stats,
      lifetimeIncomeAmount: FieldValue.increment(item.amount),
      lifetimeIncomeCount: FieldValue.increment(1),
    });
    return { id: incomeId, duplicate: false };
  });
  return result;
}

async function notifyAutomaticSmsTransaction(uid, profile, transaction) {
  const title = transaction.direction === 'income' ? 'Nouveau revenu enregistré' : 'Nouvelle dépense enregistrée';
  const type = transaction.direction === 'income' ? 'revenu' : 'dépense';
  const amount = Number(transaction.amount).toLocaleString('fr-FR') + ' FCFA';
  const body = 'Pata a enregistré automatiquement un ' + type + ' de ' + amount + ' via ' + transaction.providerName + '.';
  const target = transaction.target;
  const notificationId = 'sms-' + transaction.transactionHash;
  const notificationRef = adminDb.collection('users').doc(uid).collection('notifications').doc(notificationId);
  await notificationRef.set({
    title, body, target, source: 'sms_import', operationType: transaction.direction,
    operationId: transaction.operationId, provider: transaction.provider,
    amount: transaction.amount, read: false, readAt: null,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  let pushSent = 0;
  let pushFailed = 0;
  const tokens = profile.notificationsEnabled === true && Array.isArray(profile.pushTokens)
    ? [...new Set(profile.pushTokens.filter((token) => typeof token === 'string' && token.length > 20))]
    : [];
  for (const token of tokens) {
    try {
      await adminMessaging.send({
        token,
        data: { title, body, url: target, tag: notificationId },
        android: { priority: 'high' },
        webpush: { headers: { TTL: '86400' } },
      });
      pushSent += 1;
    } catch (error) {
      pushFailed += 1;
      console.warn('[PATA SMS PUSH]', uid, error.code || error.message);
      if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(error.code)) {
        await adminDb.collection('users').doc(uid).update({
          pushTokens: FieldValue.arrayRemove(token),
        }).catch(() => {});
      }
    }
  }

  let email = typeof profile.email === 'string' ? profile.email : '';
  let displayName = String(profile.displayName || '');
  if (!email) {
    try {
      const authUser = await adminAuth.getUser(uid);
      email = authUser.email || '';
      if (!displayName) displayName = authUser.displayName || '';
    } catch (error) {
      console.warn('[PATA SMS EMAIL USER]', uid, error.message || error);
    }
  }

  let emailSent = false;
  let emailStatus = 'no_email';
  if (email.includes('@')) {
    const operationLabel = transaction.direction === 'income' ? 'Revenu reçu' : 'Dépense détectée';
    const safeAmount = escapeEmailHtml(amount);
    const safeProvider = escapeEmailHtml(transaction.providerName);
    const safeName = escapeEmailHtml(displayName || 'Bonjour');
    const html = renderPataEmail({
      eyebrow: 'SUIVI MOBILE MONEY',
      preheader: operationLabel + ' · ' + amount,
      headline: operationLabel + ' enregistré(e) dans Pata',
      bodyHtml: '<p style="margin:0 0 14px;color:#334155;font-size:14px;line-height:1.75;">Bonjour ' + safeName + ', Pata vient d’enregistrer automatiquement cette opération à partir d’un SMS de confirmation reconnu.</p>' +
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:12px;"><tr><td style="padding:12px;color:#64748b;font-size:12px;">Montant</td><td style="padding:12px;text-align:right;color:#0f172a;font-weight:700;">' + safeAmount + '</td></tr><tr><td style="padding:12px;color:#64748b;font-size:12px;">Opérateur</td><td style="padding:12px;text-align:right;color:#0f172a;font-weight:700;">' + safeProvider + '</td></tr></table>' +
        '<p style="margin:14px 0 0;color:#475569;font-size:13px;line-height:1.7;">Tu peux ouvrir l’opération, vérifier sa catégorie, la modifier ou la supprimer directement dans Pata.</p>',
      ctaLabel: 'Voir et modifier cette opération',
      ctaUrl: target,
    });
    try {
      await sendPataEmail({
        to: email,
        subject: operationLabel + ' · ' + amount,
        html,
        idempotencyKey: 'pata-sms-' + uid + '-' + transaction.transactionHash,
      });
      emailSent = true;
      emailStatus = 'sent';
    } catch (error) {
      emailStatus = 'failed';
      console.warn('[PATA SMS EMAIL]', uid, error.message || error);
    }
  }

  return {
    inAppSent: true,
    pushSent,
    pushFailed,
    emailSent,
    emailStatus,
  };
}

async function handleAutomaticDeviceImport(body) {
  const uid = String(body.uid || '').trim().slice(0, 150);
  const deviceToken = String(body.deviceToken || '');
  if (!uid || !deviceToken) return responseError('Appareil non authentifié.', 401);
  const parsed = validateParsedPayload(body);
  const hash = String(body.transactionHash || '');
  const importRef = transactionRef(uid, hash);
  const userRef = adminDb.collection('users').doc(uid);

  const claim = await adminDb.runTransaction(async (transaction) => {
    const [userSnap, importSnap] = await Promise.all([transaction.get(userRef), transaction.get(importRef)]);
    if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
    const profile = userSnap.data() || {};
    if (!isPremium(profile) || profile.smsImportEnabled !== true) throw new Error('L’import automatique nécessite un abonnement Premium actif et l’option activée.');
    if (!deviceTokenMatches(deviceToken, profile.smsDeviceTokenHash)) throw new Error('Cet appareil n’est plus autorisé. Ouvre les paramètres de Pata pour le reconnecter.');
    if (importSnap.exists && importSnap.data()?.status === 'CONFIRMED') {
      const saved = importSnap.data() || {};
      return { duplicate: true, profile, operationId: saved.operationId || null, direction: saved.direction, target: saved.target || '/dashboard' };
    }
    if (importSnap.exists && importSnap.data()?.status === 'REJECTED') {
      return { duplicate: true, refused: true, profile };
    }
    if (parsed.direction === 'withdrawal') {
      const existing = importSnap.exists ? importSnap.data() : {};
      transaction.set(importRef, {
        ...parsed,
        status: 'PENDING',
        source: 'automatic',
        requiresReview: true,
        counterparty: parsed.counterparty || null,
        createdAt: existing.createdAt || FieldValue.serverTimestamp(),
        deviceReceivedAt: FieldValue.serverTimestamp(),
        lastError: FieldValue.delete(),
        processingAt: FieldValue.delete(),
      }, { merge: true });
      return { requiresReview: true, duplicate: existing.status === 'PENDING', profile };
    }
    if (importSnap.exists && importSnap.data()?.status === 'PROCESSING') {
      const started = importSnap.data()?.processingAt?.toDate ? importSnap.data().processingAt.toDate().getTime() : 0;
      if (started && Date.now() - started < 120000) throw new Error('IMPORT_ALREADY_PROCESSING');
    }
    const existing = importSnap.exists ? importSnap.data() : {};
    transaction.set(importRef, {
      ...parsed,
      status: 'PROCESSING',
      source: 'automatic',
      counterparty: parsed.counterparty || null,
      createdAt: existing.createdAt || FieldValue.serverTimestamp(),
      processingAt: FieldValue.serverTimestamp(),
      deviceReceivedAt: FieldValue.serverTimestamp(),
      lastError: FieldValue.delete(),
    }, { merge: true });
    return { duplicate: false, profile };
  });

  if (claim.duplicate) {
    return NextResponse.json({
      success: true,
      duplicate: true,
      refused: claim.refused === true,
      requiresReview: claim.requiresReview === true,
      operationId: claim.operationId || null,
      target: claim.target || null,
    });
  }
  if (claim.requiresReview) {
    const providerName = parsed.provider === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money';
    const notificationId = 'sms-review-' + hash;
    await adminDb.collection('users').doc(uid).collection('notifications').doc(notificationId).set({
      title: 'Retrait Mobile Money à vérifier',
      body: 'Un retrait de ' + Number(parsed.amount).toLocaleString('fr-FR') + ' FCFA via ' + providerName
        + ' a été détecté. Il attend ta classification et n’a pas été compté comme une dépense.',
      target: '/dashboard',
      source: 'sms_import',
      operationType: 'withdrawal',
      operationId: null,
      provider: parsed.provider,
      amount: parsed.amount,
      read: false,
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return NextResponse.json({
      success: true,
      duplicate: false,
      requiresReview: true,
      target: '/dashboard',
      notifications: { inAppSent: true, requiresReview: true },
    });
  }

  const providerName = parsed.provider === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money';
  const smsImportId = 'sms_' + hash;
  const counterparty = parsed.counterparty || '';
  const noteBase = parsed.eventType === 'withdrawal' ? 'Retrait Mobile Money'
    : parsed.eventType === 'payment' ? 'Paiement Mobile Money'
      : parsed.direction === 'income' ? 'Réception Mobile Money' : 'Transfert Mobile Money';
  const note = counterparty ? noteBase + ' · ' + counterparty : noteBase;

  try {
    let operationId;
    let budgetWarnings = [];
    if (parsed.direction === 'income') {
      const result = await createSmsIncome(uid, hash, parsed, providerName);
      operationId = result.id;
    } else {
      const categoryId = inferExpenseCategory(counterparty, parsed.eventType);
      const result = await createExpenseForUser(uid, {
        amount: parsed.amount,
        categoryId,
        expenseType: 'consumption',
        date: parsed.date,
        time: parsed.time,
        note: parsed.direction === 'withdrawal' ? note + ' (retrait d’espèces)' : note,
        paymentMethod: parsed.provider,
        incomeSourceId: 'external',
        incomeSourceName: 'Solde Mobile Money',
        smsImportId,
      }, {
        idempotencyKey: smsImportId,
        externalFunding: true,
        skipBudgetConfirmation: true,
      });
      if (!result?.success) throw new Error(result?.error || 'La dépense Mobile Money n’a pas pu être enregistrée.');
      operationId = result.expenseId || (Array.isArray(result.expenseIds) ? result.expenseIds[0] : null);
      budgetWarnings = result.budgetWarnings || [];
    }
    if (!operationId) throw new Error('Pata n’a pas retourné l’identifiant de la transaction enregistrée.');

    const target = (parsed.direction === 'income' ? '/income?highlight=' : '/expenses?highlight=') + encodeURIComponent(operationId);
    await importRef.set({
      status: 'CONFIRMED',
      operationType: parsed.direction === 'income' ? 'income' : 'expense',
      operationId, target, confirmedAt: FieldValue.serverTimestamp(),
      budgetWarnings, lastError: FieldValue.delete(),
    }, { merge: true });

    const notificationResult = await notifyAutomaticSmsTransaction(uid, claim.profile, {
      transactionHash: hash, direction: parsed.direction === 'income' ? 'income' : 'expense',
      amount: parsed.amount, provider: parsed.provider, providerName, operationId, target, budgetWarnings,
    });
    await importRef.set({
      notificationStatus: notificationResult,
      notificationUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return NextResponse.json({
      success: true, duplicate: false, operationId, target, budgetWarnings,
      notifications: notificationResult,
    });
  } catch (error) {
    await importRef.set({
      status: 'FAILED',
      lastError: String(error.message || 'AUTO_IMPORT_FAILED').slice(0, 180),
      failedAt: FieldValue.serverTimestamp(),
      processingAt: FieldValue.delete(),
    }, { merge: true }).catch(() => {});
    console.error('[PATA SMS AUTO IMPORT]', uid, error.message || error);
    return responseError(error.message || 'Impossible d’enregistrer automatiquement cette transaction.', 500);
  }
}

export async function GET(request) {
  try {
    const { uid } = await authenticate(request);
    const { profile, premium, expiry } = await getUserAndPremium(uid);
    const snapshot = await adminDb.collection('users').doc(uid).collection('smsImports')
      .orderBy('createdAt', 'desc').limit(100).get();
    const pending = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((item) => item.status === 'PENDING')
      .sort((a, b) => {
        const left = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const right = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return right - left;
      })
      .slice(0, 20)
      .map(({ id, provider, eventType, direction, amount, date, time, counterparty, source, createdAt }) => ({
        id, provider, eventType, direction, amount, date, time,
        counterparty: counterparty || null,
        source: source || 'sharesheet',
        createdAt: createdAt?.toDate ? createdAt.toDate().toISOString() : null,
      }));
    return NextResponse.json({
      success: true, isPremium: premium,
      enabled: premium && profile.smsImportEnabled === true,
      premiumUntil: expiry ? expiry.toISOString() : null,
      premiumPrice: PREMIUM_PRICE, pending,
    });
  } catch (error) {
    return responseError(error.message || 'Impossible de charger les imports SMS.', 401);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = String(body.action || '');

    // Le worker Android ne possède pas de session Firebase interactive :
    // il est authentifié par le jeton d'appareil à usage privé lié au compte.
    if (action === 'device') {
      try {
        return await handleAutomaticDeviceImport(body);
      } catch (error) {
        if (error.message === 'IMPORT_ALREADY_PROCESSING') return responseError('Cette opération est déjà en cours de traitement.', 409);
        const status = /Premium|abonnement|autorisé|autorisee/i.test(error.message || '') ? 403
          : /introuvable/i.test(error.message || '') ? 404
            : /authentifi|appareil non/i.test(error.message || '') ? 401 : 400;
        return responseError(error.message || 'Import automatique impossible.', status);
      }
    }

    const { uid } = await authenticate(request);

    if (action === 'device-token') {
      const { userRef, profile, premium, expiry } = await getUserAndPremium(uid);
      if (!premium || profile.smsImportEnabled !== true) return responseError('Active d’abord l’import SMS avec un abonnement Premium.', 403);
      const deviceToken = randomBytes(32).toString('base64url');
      await userRef.set({
        smsDeviceTokenHash: createHash('sha256').update(deviceToken).digest('hex'),
        smsDeviceTokenUpdatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return NextResponse.json({ success: true, deviceToken, premiumUntil: expiry ? expiry.toISOString() : null });
    }

    if (action === 'configure') {
      const enabled = body.enabled === true;
      const { userRef, premium, expiry } = await getUserAndPremium(uid);
      if (enabled && !premium) {
        return responseError('L’import SMS est réservé à Pata Premium (2 500 FCFA/mois).', 403, { code: 'PREMIUM_REQUIRED' });
      }
      let deviceToken = null;
      if (enabled) {
        deviceToken = randomBytes(32).toString('base64url');
        await userRef.set({
          smsImportEnabled: true,
          smsImportUpdatedAt: FieldValue.serverTimestamp(),
          smsDeviceTokenHash: createHash('sha256').update(deviceToken).digest('hex'),
          smsDeviceTokenUpdatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      } else {
        await userRef.set({
          smsImportEnabled: false,
          smsImportUpdatedAt: FieldValue.serverTimestamp(),
          smsDeviceTokenHash: FieldValue.delete(),
          smsDeviceTokenUpdatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      return NextResponse.json({ success: true, enabled, deviceToken, premiumUntil: expiry ? expiry.toISOString() : null });
    }

    if (action === 'stage') {
      const parsed = validateParsedPayload(body);
      const sourceMode = body.source === 'sharesheet' ? 'sharesheet' : 'automatic';
      const ref = transactionRef(uid, body.transactionHash);
      const { userRef } = await getUserAndPremium(uid);
      const result = await adminDb.runTransaction(async (transaction) => {
        const [userSnap, existingSnap] = await Promise.all([transaction.get(userRef), transaction.get(ref)]);
        if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
        const profile = userSnap.data() || {};
        if (!isPremium(profile)) throw new Error('L’import SMS est réservé à Pata Premium.');
        if (sourceMode === 'automatic' && profile.smsImportEnabled !== true) throw new Error('Active d’abord l’import SMS dans les paramètres de Pata.');
        if (existingSnap.exists) return { duplicate: true, status: existingSnap.data()?.status || 'PENDING' };
        transaction.create(ref, { ...parsed, status: 'PENDING', createdAt: FieldValue.serverTimestamp(), source: sourceMode });
        return { duplicate: false, status: 'PENDING' };
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'refuse') {
      const ref = transactionRef(uid, body.id);
      const snap = await ref.get();
      if (!snap.exists) return responseError('Import introuvable.', 404);
      if (snap.data()?.status === 'PENDING') {
        await ref.update({ status: 'REJECTED', rejectedAt: FieldValue.serverTimestamp() });
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'confirm') {
      const ref = transactionRef(uid, body.id);
      const operationType = String(body.operationType || '');
      const categoryId = String(body.categoryId || '').trim().slice(0, 80);
      const incomeSourceId = String(body.incomeSourceId || 'all').trim().slice(0, 150);
      const confirmBudgetOverrun = body.confirmBudgetOverrun === true;
      if (!['income', 'expense'].includes(operationType)) return responseError('Type d’opération invalide.', 400);
      if (!categoryId) return responseError('Choisis une catégorie avant de confirmer.', 400);

      const { userRef } = await getUserAndPremium(uid);
      const claim = await adminDb.runTransaction(async (transaction) => {
        const [userSnap, importSnap] = await Promise.all([transaction.get(userRef), transaction.get(ref)]);
        if (!userSnap.exists || !importSnap.exists) throw new Error('Import SMS introuvable.');
        const profile = userSnap.data() || {};
        if (!isPremium(profile)) throw new Error('Un abonnement Pata Premium actif est nécessaire pour confirmer cet import SMS.');
        const item = importSnap.data() || {};
        if (item.status === 'CONFIRMED') return { duplicate: true, item };
        if (item.status === 'REJECTED') throw new Error('Cette opération a été refusée.');
        if (item.status === 'PROCESSING') {
          const processingAt = item.processingAt?.toDate ? item.processingAt.toDate().getTime() : new Date(item.processingAt || 0).getTime();
          if (Number.isFinite(processingAt) && Date.now() - processingAt < 120000) {
            throw new Error('Cette opération est déjà en cours de confirmation. Réactualise la liste dans quelques instants.');
          }
        } else if (item.status !== 'PENDING') {
          throw new Error('Cette opération ne peut plus être confirmée.');
        }
        if (item.direction === 'income' && operationType !== 'income') throw new Error('Cette transaction est une réception : elle doit être enregistrée comme revenu.');
        if (item.direction === 'expense' && operationType !== 'expense') throw new Error('Cette transaction est une sortie : elle doit être enregistrée comme dépense.');
        if (item.direction === 'withdrawal' && operationType !== 'expense') throw new Error('Un retrait doit être explicitement classé comme dépense ou refusé.');
        transaction.update(ref, { status: 'PROCESSING', categoryId, operationType, processingAt: FieldValue.serverTimestamp() });
        return { duplicate: false, item };
      });

      if (claim.duplicate) return NextResponse.json({ success: true, duplicate: true, operationId: claim.item.operationId || null });

      const item = claim.item;
      const smsImportId = 'sms_' + ref.id;
      const providerName = item.provider === 'mtn_momo' ? 'MTN Mobile Money' : 'Orange Money';
      const note = (item.eventType === 'receive' ? 'Réception ' : item.eventType === 'withdrawal' ? 'Retrait ' : item.eventType === 'payment' ? 'Paiement ' : 'Envoi ') + providerName;
      const endpoint = operationType === 'expense' ? '/api/expenses/add' : '/api/incomes/add';
      const isCashWithdrawal = item.eventType === 'withdrawal';
      const payload = operationType === 'expense'
        ? {
            amount: item.amount, categoryId, date: item.date, time: item.time,
            note: isCashWithdrawal ? note + ' (retrait d’espèces)' : note,
            paymentMethod: item.provider, expenseType: 'consumption',
            incomeSourceId: isCashWithdrawal ? 'external' : incomeSourceId,
            incomeSourceName: isCashWithdrawal ? 'Solde Mobile Money' : incomeSourceId === 'all' ? 'Tous les revenus' : '',
            confirmBudgetOverrun, smsImportId,
          }
        : {
            amount: item.amount, categoryId, date: item.date, month: item.date.slice(0, 7),
            time: item.time, source: providerName, note, paymentMethod: item.provider, smsImportId,
          };

      let operationResponse;
      let operationResult;
      try {
        if (isCashWithdrawal) {
          // Un retrait est déjà sorti du portefeuille Mobile Money :
          // lorsqu'il est explicitement classé comme dépense, il est financé
          // par ce portefeuille externe, sans exiger un revenu fictif dans Pata.
          operationResult = await createExpenseForUser(uid, payload, {
            idempotencyKey: smsImportId,
            externalFunding: true,
          });
          if (operationResult.confirmationRequired) {
            await ref.update({ status: 'PENDING', processingAt: FieldValue.delete() });
            return NextResponse.json({
              success: false,
              confirmationRequired: true,
              message: operationResult.message || 'Cette dépense dépasse un budget. Confirme une seconde fois pour continuer.',
              warnings: operationResult.warnings || [],
            });
          }
          operationResponse = {
            ok: operationResult.success === true,
            status: operationResult.success === true ? 200 : 400,
          };
          operationResult = {
            ...operationResult,
            id: operationResult.expenseId || operationResult.expenseIds?.[0] || null,
          };
        } else {
          operationResponse = await fetch(new URL(endpoint, request.url), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: request.headers.get('authorization') || '' },
            body: JSON.stringify(payload), cache: 'no-store',
          });
          operationResult = await operationResponse.json().catch(() => ({}));
        }
      } catch (error) {
        await ref.update({
          status: 'PENDING',
          lastError: String(error.message || 'NETWORK').slice(0, 180),
          processingAt: FieldValue.delete(),
        });
        return responseError(error.message || 'Connexion interrompue. Réessaie : la clé anti-doublon protège cette opération.', 503);
      }

      if (operationResult.confirmationRequired) {
        await ref.update({ status: 'PENDING', processingAt: FieldValue.delete() });
        return NextResponse.json({
          success: false, confirmationRequired: true,
          message: operationResult.message || 'Cette dépense dépasse un budget. Confirme une seconde fois pour continuer.',
          warnings: operationResult.warnings || [],
        });
      }

      if (!operationResponse.ok || operationResult.success === false) {
        await ref.update({ status: 'PENDING', processingAt: FieldValue.delete(), lastError: String(operationResult.error || 'WRITE_FAILED').slice(0, 180) });
        return responseError(operationResult.error || 'Impossible d’enregistrer cette opération.', operationResponse.status || 500);
      }

      const operationId = operationResult.id || null;
      await ref.update({
        status: 'CONFIRMED', operationType, categoryId, operationId,
        confirmedAt: FieldValue.serverTimestamp(), lastError: FieldValue.delete(),
      });
      return NextResponse.json({ success: true, operationId });
    }

    return responseError('Action d’import SMS inconnue.', 400);
  } catch (error) {
    const message = error.message || 'Import SMS impossible.';
    const status = /Premium|abonnement/i.test(message) ? 403
      : /introuvable/i.test(message) ? 404
        : /Session|token/i.test(message) ? 401 : 400;
    return responseError(message, status);
  }
}
