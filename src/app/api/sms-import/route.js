import { NextResponse } from 'next/server';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { adminAuth, adminDb, adminMessaging } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { createExpenseForUser } from '@/lib/ai/financialTools';
import { sendPataEmail, renderPataEmail, escapeEmailHtml } from '@/lib/email/resend';
import { sendPataWebPush, isExpiredWebPushError } from '@/lib/notifications/webPush.mjs';

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
  if (/(eneo|camwater|electricite|electricity|water|eau|loyer|logement)/.test(value)) return 'housing';
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
  const requiresReview = transaction.requiresReview === true;
  const eventLabel = transaction.eventType === 'withdrawal' ? 'retrait'
    : transaction.eventType === 'payment' ? 'paiement' : 'transfert';
  const title = requiresReview
    ? (transaction.eventType === 'withdrawal' ? 'Retrait Mobile Money à vérifier' : 'Opération Mobile Money à classer')
    : transaction.direction === 'income' ? 'Nouveau revenu enregistré' : 'Nouvelle dépense enregistrée';
  const kind = transaction.direction === 'income' ? 'revenu' : 'dépense';
  const amount = Number(transaction.amount).toLocaleString('fr-FR') + ' FCFA';
  const body = requiresReview
    ? 'Un ' + eventLabel + ' de ' + amount + ' via ' + transaction.providerName
      + (transaction.counterparty ? ' · ' + transaction.counterparty : '')
      + ' a été détecté. Il n’est pas encore comptabilisé : ouvre Pata pour choisir sa catégorie et sa nature.'
    : 'Pata a enregistré automatiquement un ' + kind + ' de ' + amount + ' via ' + transaction.providerName + '.';
  const target = transaction.target;
  const notificationId = 'sms-' + transaction.transactionHash;
  const userRef = adminDb.collection('users').doc(uid);
  const notificationRef = userRef.collection('notifications').doc(notificationId);

  await notificationRef.set({
    title, body, target, source: 'sms_import', operationType: transaction.direction,
    operationId: transaction.operationId, provider: transaction.provider,
    amount: transaction.amount, read: false, readAt: null,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  let fcmSent = 0;
  let fcmFailed = 0;
  const tokens = profile.notificationsEnabled === true && Array.isArray(profile.pushTokens)
    ? [...new Set(profile.pushTokens.filter((token) => typeof token === 'string' && token.length > 20))]
    : [];
  const appUrl = 'https://www.pata-yam.site';
  for (const token of tokens) {
    try {
      await adminMessaging.send({
        token,
        notification: { title, body },
        data: { title, body, url: target, tag: notificationId, source: 'sms_import' },
        android: {
          priority: 'high',
          notification: { channelId: 'pata_general', icon: 'ic_stat_pata', color: '#0b5c46' },
        },
        webpush: {
          headers: { TTL: '86400', Urgency: 'high' },
          notification: {
            title, body,
            icon: appUrl + '/android-chrome-192x192.png',
            badge: appUrl + '/android-chrome-192x192.png',
            tag: notificationId,
            renotify: false,
          },
          fcmOptions: { link: new URL(target, appUrl).toString() },
        },
      });
      fcmSent += 1;
    } catch (error) {
      fcmFailed += 1;
      console.warn('[PATA SMS FCM PUSH]', uid, error.code || error.message);
      if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(error.code)) {
        await userRef.update({ pushTokens: FieldValue.arrayRemove(token) }).catch(() => {});
      }
    }
  }

  let webPushSent = 0;
  let webPushFailed = 0;
  const webPushSnapshot = profile.notificationsEnabled === true
    ? await userRef.collection('webPushSubscriptions').get().catch((error) => {
        console.warn('[PATA SMS WEB PUSH LOOKUP]', uid, error.message || error);
        return null;
      })
    : null;
  const webPushDocs = webPushSnapshot?.docs || [];
  for (const subscriptionDoc of webPushDocs) {
    const saved = subscriptionDoc.data() || {};
    try {
      await sendPataWebPush({
        endpoint: saved.endpoint,
        expirationTime: saved.expirationTime ?? null,
        keys: saved.keys,
      }, { title, body, url: target, tag: notificationId });
      webPushSent += 1;
    } catch (error) {
      webPushFailed += 1;
      console.warn('[PATA SMS WEB PUSH]', uid, error.statusCode || error.message);
      if (isExpiredWebPushError(error)) await subscriptionDoc.ref.delete().catch(() => {});
    }
  }
  if (webPushDocs.length) {
    const count = await userRef.collection('webPushSubscriptions').count().get().catch(() => null);
    await userRef.set({ webPushDeviceCount: Number(count?.data()?.count) || 0 }, { merge: true }).catch(() => {});
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
    const operationLabel = requiresReview ? 'Opération à classer'
      : transaction.direction === 'income' ? 'Revenu reçu' : 'Dépense détectée';
    const safeName = escapeEmailHtml(displayName || 'Bonjour');
    const safeAmount = escapeEmailHtml(amount);
    const safeProvider = escapeEmailHtml(transaction.providerName);
    const dateLabel = escapeEmailHtml(transaction.date || 'Date non précisée');
    const timeLabel = escapeEmailHtml(transaction.time || 'Heure non précisée');
    const categoryLabel = escapeEmailHtml(transaction.categoryLabel || (transaction.direction === 'income' ? 'Autres revenus' : 'Autres dépenses'));
    const counterpartyLabel = escapeEmailHtml(transaction.counterparty || 'Non communiqué par l’opérateur');
    const rows = [
      ['Montant', safeAmount],
      ['Type d’opération', operationLabel],
      ['Opérateur', safeProvider],
      ['Date', dateLabel],
      ['Heure', timeLabel],
      ['Catégorie proposée', categoryLabel],
      ['Correspondant / marchand', counterpartyLabel],
      ['Statut', requiresReview ? 'En attente de classification — non comptabilisé' : 'Enregistré automatiquement dans Pata'],
    ];
    const detailsTable = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:12px;">' +
      rows.map(([label, value]) =>
        '<tr><td style="padding:11px 12px;border-bottom:1px solid #edf2f7;color:#64748b;font-size:12px;">' +
        escapeEmailHtml(label) +
        '</td><td style="padding:11px 12px;border-bottom:1px solid #edf2f7;text-align:right;color:#0f172a;font-size:13px;font-weight:700;">' +
        value + '</td></tr>'
      ).join('') + '</table>';

    const html = renderPataEmail({
      eyebrow: 'SUIVI MOBILE MONEY',
      preheader: operationLabel + ' · ' + amount + ' · ' + transaction.providerName,
      headline: requiresReview ? 'Une opération attend ta classification' : operationLabel + ' enregistré(e) dans Pata',
      bodyHtml:
        '<p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.75;">Bonjour ' + safeName +
        (requiresReview
          ? ', une opération Mobile Money vient d’être reconnue sur ton téléphone. Elle n’a pas été comptabilisée : ouvre Pata pour choisir sa nature et sa catégorie avant de la confirmer.</p>'
          : ', une confirmation Mobile Money vient d’être reconnue sur ton téléphone et l’opération a été ajoutée automatiquement à ton compte Pata.</p>') +
        detailsTable +
        '<p style="margin:16px 0 0;color:#475569;font-size:13px;line-height:1.7;">' +
          (requiresReview
            ? 'Ouvre Pata pour choisir la nature réelle de cette sortie (dépense courante, projet, épargne ou investissement), vérifier la catégorie, puis confirmer ou refuser l’opération.'
            : 'Ouvre Pata pour vérifier les informations. Tu pourras modifier la catégorie ou le libellé, ou supprimer l’opération si elle ne correspond pas à ton suivi.') +
        '</p>',
      ctaLabel: requiresReview ? 'Classer cette opération' : 'Consulter cette opération dans Pata',
      ctaUrl: target,
      signoff: 'Merci d’utiliser Pata pour suivre tes finances.',
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
    fcmSent, fcmFailed, webPushSent, webPushFailed,
    pushSent: fcmSent + webPushSent,
    pushFailed: fcmFailed + webPushFailed,
    emailSent, emailStatus,
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
    if (parsed.direction !== 'income') {
      const existing = importSnap.exists ? importSnap.data() : {};
      transaction.set(importRef, {
        ...parsed,
        status: 'PENDING',
        source: 'automatic',
        requiresReview: true,
        suggestedCategoryId: inferExpenseCategory(parsed.counterparty, parsed.eventType),
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
    const categoryId = inferExpenseCategory(parsed.counterparty, parsed.eventType);
    const categoryLabels = {
      internet: 'Télécom / Internet',
      transport: 'Transport',
      food: 'Nourriture',
      health: 'Santé',
      housing: 'Logement et factures',
      contribution: 'Cotisation',
      other: 'Autres dépenses',
    };
    const notificationResult = await notifyAutomaticSmsTransaction(uid, claim.profile, {
      transactionHash: hash,
      direction: 'expense',
      requiresReview: true,
      eventType: parsed.eventType,
      amount: parsed.amount,
      provider: parsed.provider,
      providerName,
      date: parsed.date,
      time: parsed.time,
      counterparty: parsed.counterparty || '',
      categoryId,
      categoryLabel: categoryLabels[categoryId] || 'Autres dépenses',
      operationId: null,
      target: '/dashboard',
    });
    await importRef.set({
      notificationStatus: notificationResult,
      notificationUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return NextResponse.json({
      success: true,
      duplicate: false,
      requiresReview: true,
      target: '/dashboard',
      suggestedCategoryId: categoryId,
      notifications: { ...notificationResult, requiresReview: true },
    });
  }

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
        details: counterparty,
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

    const notificationCategoryId = parsed.direction === 'income' ? 'other_income' : inferExpenseCategory(counterparty, parsed.eventType);
    const notificationCategoryLabels = {
      other_income: 'Autres revenus',
      internet: 'Internet et téléphone',
      transport: 'Transport',
      food: 'Alimentation',
      health: 'Santé',
      housing: 'Logement et factures',
      contribution: 'Cotisation',
      other: 'Autres dépenses',
    };
    const notificationResult = await notifyAutomaticSmsTransaction(uid, claim.profile, {
      transactionHash: hash,
      direction: parsed.direction === 'income' ? 'income' : 'expense',
      amount: parsed.amount,
      provider: parsed.provider,
      providerName,
      date: parsed.date,
      time: parsed.time,
      counterparty,
      categoryId: notificationCategoryId,
      categoryLabel: notificationCategoryLabels[notificationCategoryId] || 'Autres dépenses',
      operationId,
      target,
      budgetWarnings,
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
      .map(({ id, provider, eventType, direction, amount, date, time, counterparty, suggestedCategoryId, source, createdAt }) => ({
        id, provider, eventType, direction, amount, date, time,
        counterparty: counterparty || null,
        suggestedCategoryId: suggestedCategoryId || null,
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
        transaction.create(ref, {
          ...parsed,
          suggestedCategoryId: parsed.direction === 'income' ? null : inferExpenseCategory(parsed.counterparty, parsed.eventType),
          status: 'PENDING',
          createdAt: FieldValue.serverTimestamp(),
          source: sourceMode,
        });
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
      const expenseType = String(body.expenseType || '').trim();
      const projectId = String(body.projectId || '').trim().slice(0, 150);
      const confirmBudgetOverrun = body.confirmBudgetOverrun === true;
      if (!['income', 'expense'].includes(operationType)) return responseError('Type d’opération invalide.', 400);
      if (!categoryId) return responseError('Choisis une catégorie avant de confirmer.', 400);
      if (operationType === 'expense' && !['consumption', 'project', 'savings', 'investment'].includes(expenseType)) {
        return responseError('Choisis la nature réelle de cette sortie : dépense courante, projet, épargne ou investissement.', 400);
      }
      if (operationType === 'expense' && expenseType === 'project' && !projectId) {
        return responseError('Choisis le projet concerné avant de confirmer.', 400);
      }
      if (projectId.includes('/')) return responseError('Projet invalide.', 400);

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
        if (item.direction !== 'income' && operationType !== 'expense') throw new Error('Cette transaction est une sortie : elle doit être enregistrée comme dépense.');
        transaction.update(ref, {
          status: 'PROCESSING',
          categoryId,
          operationType,
          ...(operationType === 'expense' ? { expenseType, projectId: expenseType === 'project' ? projectId : null } : {}),
          processingAt: FieldValue.serverTimestamp(),
        });
        return { duplicate: false, item, profile };
      });

      if (claim.duplicate) return NextResponse.json({ success: true, duplicate: true, operationId: claim.item.operationId || null });

      const item = claim.item;
      const smsImportId = 'sms_' + ref.id;
      const providerName = item.provider === 'mtn_momo' ? 'MTN Mobile Money' : 'Orange Money';
      const eventLabel = item.eventType === 'receive' ? 'Réception'
        : item.eventType === 'withdrawal' ? 'Retrait'
          : item.eventType === 'payment' ? 'Paiement' : 'Transfert';
      const note = eventLabel + ' ' + providerName + (item.counterparty ? ' · ' + item.counterparty : '');
      const isExpense = operationType === 'expense';
      const isCashWithdrawal = item.eventType === 'withdrawal';
      const categoryLabels = {
        salary: 'Salaire', business: 'Business / Freelance', gift: 'Don / Cadeau', other_income: 'Autres revenus',
        food: 'Nourriture', transport: 'Transport', housing: 'Logement et factures',
        internet: 'Télécom / Internet', health: 'Santé', leisure: 'Loisirs',
        investment: 'Investissement', contribution: 'Cotisation', savings: 'Épargne', other: 'Autres dépenses',
      };
      const payload = isExpense
        ? {
            amount: item.amount,
            categoryId,
            expenseType,
            projectId: expenseType === 'project' ? projectId : '',
            date: item.date,
            time: item.time,
            note: isCashWithdrawal ? note + ' (retrait d’espèces)' : note,
            paymentMethod: item.provider,
            incomeSourceId: 'external',
            incomeSourceName: 'Solde Mobile Money',
            details: item.counterparty || '',
            smsImportId,
            confirmBudgetOverrun,
          }
        : {
            amount: item.amount,
            categoryId,
            date: item.date,
            month: item.date.slice(0, 7),
            time: item.time,
            source: providerName,
            note,
            details: item.counterparty || '',
            paymentMethod: item.provider,
            smsImportId,
          };

      let operationResponse;
      let operationResult;
      try {
        if (isExpense) {
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
          operationResponse = await fetch(new URL('/api/incomes/add', request.url), {
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
      if (!operationId) {
        await ref.update({ status: 'PENDING', processingAt: FieldValue.delete(), lastError: 'MISSING_OPERATION_ID' });
        return responseError('Pata n’a pas retourné l’identifiant de l’opération. Actualise et réessaie.', 500);
      }
      const target = (isExpense ? '/expenses?highlight=' : '/income?highlight=') + encodeURIComponent(operationId);
      await ref.update({
        status: 'CONFIRMED', operationType, categoryId, operationId, target,
        ...(isExpense ? { expenseType, projectId: expenseType === 'project' ? projectId : null } : {}),
        confirmedAt: FieldValue.serverTimestamp(), lastError: FieldValue.delete(),
      });

      const notificationResult = await notifyAutomaticSmsTransaction(uid, claim.profile, {
        transactionHash: ref.id,
        direction: isExpense ? 'expense' : 'income',
        eventType: item.eventType,
        amount: item.amount,
        provider: item.provider,
        providerName,
        date: item.date,
        time: item.time,
        counterparty: item.counterparty || '',
        categoryId,
        categoryLabel: categoryLabels[categoryId] || (isExpense ? 'Autres dépenses' : 'Autres revenus'),
        operationId,
        target,
      }).catch((error) => {
        console.warn('[PATA SMS CONFIRM NOTIFICATION]', uid, error.message || error);
        return { inAppSent: false, notificationError: String(error.message || 'NOTIFICATION_FAILED').slice(0, 120) };
      });
      await ref.set({ notificationStatus: notificationResult, notificationUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return NextResponse.json({ success: true, operationId, target, notifications: notificationResult });
    }

    return responseError('Action d’import SMS inconnue.'    return responseError('Action d’import SMS inconnue.', 400);
  } catch (error) {
    const message = error.message || 'Import SMS impossible.';
    const status = /Premium|abonnement/i.test(message) ? 403
      : /introuvable/i.test(message) ? 404
        : /Session|token/i.test(message) ? 401 : 400;
    return responseError(message, status);
  }
}
