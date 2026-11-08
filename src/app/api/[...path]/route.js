import { NextResponse } from 'next/server';
import { createHash, createHmac, timingSafeEqual, randomBytes, randomInt, scryptSync } from 'node:crypto';
import { adminAuth, adminDb, adminMessaging } from '@/lib/firebase/admin';
import { FieldValue, FieldPath, AggregateField } from 'firebase-admin/firestore';
import { completeWithGroq } from '@/lib/ai/groqClient';
import { AI_TOOLS, createExpenseForUser, updateExpenseForUser, deleteExpenseForUser, executeAITool, runAutomationForUser, generateWeeklyReportForUser } from '@/lib/ai/financialTools';
import { generateAudioWithGemini } from '@/lib/ai/geminiTTS';
import { chatWithGroqVision } from '@/lib/ai/groqVision';
import { generateImageWithPollinations } from '@/lib/ai/pollinationsImage';
import { buildUserContext } from '@/lib/ai/buildUserContext';
import { computeGoalPlan, GOAL_LATE_PENALTY_RATE, GOAL_PENALTY_EFFECTIVE_DATE } from '@/lib/goalCalc';
import { sendPataEmail, welcomeEmail, savingsCreatedEmail, customAdminEmail, pinResetEmail } from '@/lib/email/resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* ═══════════════════ HELPERS ═══════════════════ */

async function authenticate(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Token manquant.');
  return adminAuth.verifyIdToken(authHeader.slice(7));
}

function errorResponse(message, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function getBaseUrl(request) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  return process.env.FAPSHI_WEBHOOK_URL?.replace(/\/$/, '') || `${proto}://${host}`;
}

/* ═══════════════════ GESTION DES QUOTAS & SÉCURITÉ ═══════════════════ */

const PLAN_LIMITS = {
  FREE: {
    expenses: 60,
    incomes: 2,
    budgets: 2,
    goals: 1,
    vitalForecasts: 1,
    durationForecasts: 1,
    dailyAI: 3,
  },
};

/* ═══════════════════ ROUTES FAPSHI (DÉPÔTS) ═══════════════════ */

async function handleFapshiCheckout(request) {
  try {
    const decoded = await authenticate(request);
    const uid = decoded.uid;
    const body = await request.json();
    const amount = Math.round(Number(body.amount));
    if (!amount || amount < 100) return errorResponse('Montant minimum : 100 FCFA.', 400);

    const API_USER = process.env.FAPSHI_API_USER;
    const SECRET_KEY = process.env.FAPSHI_SECRET_KEY;
    if (!API_USER || !SECRET_KEY) return errorResponse('Configuration incomplète.', 500);

    const userDoc = await adminDb.collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const phone = String(body.phone || userData.phone || '').replace(/\D/g, '');
    
    if (phone && phone !== userData.phone) await adminDb.collection('users').doc(uid).update({ phone, updatedAt: FieldValue.serverTimestamp() });

    const baseUrl = getBaseUrl(request);
    const payload = {
      amount, currency: 'XAF', description: 'Recharge Pata',
      redirect_url: `${request.headers.get('origin') || baseUrl}/wallet`,
      webhook_url: `${baseUrl}/api/fapshi/webhook`,
      phone, email: userData.email || decoded.email || '', name: userData.displayName || 'Client',
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const fapshiRes = await fetch('https://live.fapshi.com/initiate-pay', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apiuser: API_USER, apikey: SECRET_KEY },
      body: JSON.stringify(payload), signal: controller.signal,
    }).catch(() => { clearTimeout(timer); throw new Error('Service indisponible.'); });
    clearTimeout(timer);

    const data = await fapshiRes.json();
    if (!fapshiRes.ok) return errorResponse(data.message || 'Paiement refusé.', 400);

    const checkoutUrl = data.data?.url || data.link || data.url;
    const transId = data.transId || data.data?.transId;
    if (!checkoutUrl || !transId) return errorResponse('Lien indisponible.', 502);

    await adminDb.collection('deposits').doc(transId).set({
      transId, userId: uid, amount, currency: 'XAF', description: payload.description,
      phone, status: 'PENDING', checkoutUrl, createdAt: FieldValue.serverTimestamp(), confirmedAt: null, failedAt: null,
    });

    return NextResponse.json({ success: true, checkoutUrl, transId });
  } catch (error) { return errorResponse(error.message, 500); }
}

async function handleFapshiWebhook(request) {
  try {
    const body = await request.json();
    if (!body.transId) return NextResponse.json({ received: true });
    const depositRef = adminDb.collection('deposits').doc(body.transId);
    const depDoc = await depositRef.get();
    if (!depDoc.exists || depDoc.data().status === 'CONFIRMED') return NextResponse.json({ received: true });

    const API_USER = process.env.FAPSHI_API_USER;
    const SECRET_KEY = process.env.FAPSHI_SECRET_KEY;
    const verifyRes = await fetch(`https://live.fapshi.com/payment-status/${body.transId}`, {
      headers: { apiuser: API_USER, apikey: SECRET_KEY },
    });
    const verifyData = await verifyRes.json();

    if ((verifyData.status || '').toUpperCase() === 'SUCCESSFUL') {
      await adminDb.runTransaction(async (t) => {
        const fresh = await t.get(depositRef);
        if (fresh.data().status === 'CONFIRMED') return;
        const userRef = adminDb.collection('users').doc(fresh.data().userId);
        const userDoc = await t.get(userRef);
        t.update(userRef, { balance: (userDoc.data().balance || 0) + fresh.data().amount });
        t.update(depositRef, { status: 'CONFIRMED', confirmedAt: FieldValue.serverTimestamp() });
      });
    }
    return NextResponse.json({ received: true });
  } catch (error) { return NextResponse.json({ received: true }); }
}

async function handleFapshiStatus(request) {
  try {
    const decoded = await authenticate(request);
    const body = await request.json();
    const depositRef = adminDb.collection('deposits').doc(body.transId);
    const depDoc = await depositRef.get();
    if (!depDoc.exists || depDoc.data().userId !== decoded.uid) return errorResponse('Introuvable.', 404);
    if (depDoc.data().status === 'CONFIRMED') return NextResponse.json({ success: true, status: 'CONFIRMED' });

    const API_USER = process.env.FAPSHI_API_USER;
    const SECRET_KEY = process.env.FAPSHI_SECRET_KEY;
    const res = await fetch(`https://live.fapshi.com/payment-status/${body.transId}`, { headers: { apiuser: API_USER, apikey: SECRET_KEY } });
    const data = await res.json();

    if ((data.status || '').toUpperCase() === 'SUCCESSFUL') {
      await adminDb.runTransaction(async (t) => {
        const fresh = await t.get(depositRef);
        const userRef = adminDb.collection('users').doc(decoded.uid);
        const userDoc = await t.get(userRef);
        t.update(userRef, { balance: (userDoc.data().balance || 0) + fresh.data().amount });
        t.update(depositRef, { status: 'CONFIRMED', confirmedAt: FieldValue.serverTimestamp() });
      });
      return NextResponse.json({ success: true, status: 'CONFIRMED' });
    }
    return NextResponse.json({ success: true, status: 'PENDING' });
  } catch (error) { return errorResponse(error.message, 500); }
}

/* ═══════════════════ ROUTES ABONNEMENT ═══════════════════ */

async function handleSubscriptionCheckout(request) {
  try {
    const decoded = await authenticate(request);
    const uid = decoded.uid;
    const body = await request.json();
    const months = Math.max(1, parseInt(body.months) || 1);
    const amount = 2500 * months;

    const API_USER = process.env.FAPSHI_API_USER;
    const SECRET_KEY = process.env.FAPSHI_SECRET_KEY;
    if (!API_USER || !SECRET_KEY) return errorResponse('Configuration incomplète.', 500);

    const userDoc = await adminDb.collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    const baseUrl = getBaseUrl(request);
    const origin = request.headers.get('origin') || baseUrl;

    const payload = {
      amount,
      currency: 'XAF',
      description: `Abonnement Pata Premium (${months} mois)`,
      redirect_url: `${origin}/premium`,
      webhook_url: `${baseUrl}/api/subscription/webhook`,
      phone: userData.phone || '',
      email: userData.email || decoded.email || '',
      name: userData.displayName || 'Client',
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch('https://live.fapshi.com/initiate-pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apiuser: API_USER, apikey: SECRET_KEY },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).catch(() => { clearTimeout(timer); throw new Error('Service indisponible.'); });
    clearTimeout(timer);

    const data = await res.json();
    if (!res.ok) return errorResponse(data.message || 'Paiement refusé.', 400);

    const checkoutUrl = data.data?.url || data.link || data.url;
    const transId = data.transId || data.data?.transId;
    if (!checkoutUrl || !transId) return errorResponse('Lien indisponible.', 502);

    await adminDb.collection('subscriptionPayments').doc(transId).set({
      transId, userId: uid, amount, months, status: 'PENDING', checkoutUrl, createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, checkoutUrl, transId });
  } catch (error) { return errorResponse(error.message, 500); }
}

async function handleSubscriptionPayWithBalance(request) {
  try {
    const decoded = await authenticate(request);
    const uid = decoded.uid;
    const body = await request.json();
    const requestedMonths = Number(body.months);
    const months = Math.floor(requestedMonths);
    if (!Number.isInteger(months) || months < 1 || months > 12) return errorResponse('Choisis une durée comprise entre 1 et 12 mois.', 400);
    const amount = 2500 * months;
    const userRef = adminDb.collection('users').doc(uid);
    const paymentRef = adminDb.collection('subscriptionPayments').doc();
    const result = await adminDb.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw new Error('Utilisateur introuvable.');
      const userData = userDoc.data();
      const balance = Number(userData.balance) || 0;
      if (balance < amount) throw new Error(`Solde insuffisant. Ton solde est de ${balance.toLocaleString('fr-FR')} FCFA; il manque ${(amount - balance).toLocaleString('fr-FR')} FCFA.`);
      const now = new Date();
      const currentValue = userData.premiumUntil;
      const currentExpiry = currentValue?.toDate ? currentValue.toDate() : new Date(currentValue || 0);
      const baseDate = currentExpiry > now ? currentExpiry : now;
      const newExpiration = new Date(baseDate.getTime() + months * 30 * 86400000);
      transaction.update(userRef, {
        balance: balance - amount, premiumUntil: newExpiration.toISOString(),
        lastPaymentDate: now.toISOString(), lastPaymentAmount: amount,
        lastPaymentMethod: 'balance', premiumLastStartDate: now.toISOString(),
      });
      transaction.create(paymentRef, {
        transId: paymentRef.id, userId: uid, amount, months, status: 'CONFIRMED',
        method: 'balance', createdAt: FieldValue.serverTimestamp(), confirmedAt: FieldValue.serverTimestamp(),
      });
      return newExpiration.toISOString();
    });
    return NextResponse.json({ success: true, newExpiration: result });
  } catch (error) { return errorResponse(error.message, 500); }
}

async function handleSubscriptionWebhook(request) {
  try {
    const body = await request.json();
    const transId = body.transId;
    if (!transId) return NextResponse.json({ received: true });

    const paymentRef = adminDb.collection('subscriptionPayments').doc(transId);
    const paymentDoc = await paymentRef.get();
    if (!paymentDoc.exists || paymentDoc.data().status === 'CONFIRMED') return NextResponse.json({ received: true });

    const API_USER = process.env.FAPSHI_API_USER;
    const SECRET_KEY = process.env.FAPSHI_SECRET_KEY;
    const verifyRes = await fetch(`https://live.fapshi.com/payment-status/${transId}`, { headers: { apiuser: API_USER, apikey: SECRET_KEY } });
    const verifyData = await verifyRes.json();
    const realStatus = (verifyData.status || '').toUpperCase();

    if (realStatus !== 'SUCCESSFUL') {
      if (['FAILED', 'EXPIRED', 'CANCELED', 'REVERSED'].includes(realStatus)) {
        await paymentRef.update({ status: 'FAILED' });
      }
      return NextResponse.json({ received: true });
    }

    const payment = paymentDoc.data();
    const userRef = adminDb.collection('users').doc(payment.userId);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};

    const now = new Date();
    const currentPremiumUntil = userData.premiumUntil ? new Date(userData.premiumUntil) : null;
    const baseDate = currentPremiumUntil && currentPremiumUntil > now ? currentPremiumUntil : now;
    const newExpiration = new Date(baseDate.getTime() + payment.months * 30 * 24 * 60 * 60 * 1000);

    await userRef.update({
      premiumUntil: newExpiration.toISOString(),
      lastPaymentDate: now.toISOString(),
      lastPaymentAmount: payment.amount,
      lastPaymentMethod: 'fapshi',
    });

    await paymentRef.update({ status: 'CONFIRMED', confirmedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ received: true });
  } catch (error) { return NextResponse.json({ received: true }); }
}


async function handleNotificationsInbox(request) {
  try {
    const { uid } = await authenticate(request);
    const url = new URL(request.url);
    const limit = Math.max(10, Math.min(100, Number(url.searchParams.get('limit')) || 50));
    const cursor = String(url.searchParams.get('cursor') || '').trim().slice(0, 150);
    const notificationsRef = adminDb.collection('users').doc(uid).collection('notifications');
    let query = notificationsRef.orderBy('createdAt', 'desc');
    if (cursor) {
      if (cursor.includes('/')) return errorResponse('Repère de notification invalide.', 400);
      const cursorDoc = await notificationsRef.doc(cursor).get();
      if (!cursorDoc.exists) return errorResponse('L’historique a changé. Actualise les notifications.', 409);
      query = query.startAfter(cursorDoc);
    }
    const snapshot = await query.limit(limit + 1).get();
    const hasMore = snapshot.docs.length > limit;
    const docs = snapshot.docs.slice(0, limit);
    const notifications = docs.map((document) => {
      const data = serializeAdminValue(document.data()) || {};
      const isRead = data.read === true || Boolean(data.readAt);
      return { id: document.id, ...data, read: isRead, isRead };
    });
    const unreadCount = notifications.filter((item) => !item.isRead).length;
    const readCount = notifications.length - unreadCount;
    return NextResponse.json({
      success: true, notifications, unreadCount, readCount, hasMore,
      nextCursor: hasMore && docs.length ? docs[docs.length - 1].id : null,
    });
  } catch (error) {
    return errorResponse(error.message || 'Impossible de charger les notifications.', 401);
  }
}

async function handleNotificationRead(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const notificationId = String(body.notificationId || '').trim().slice(0, 150);
    if (!notificationId || notificationId.includes('/')) return errorResponse('Notification invalide.', 400);
    const notificationRef = adminDb.collection('users').doc(uid).collection('notifications').doc(notificationId);
    const notificationSnap = await notificationRef.get();
    if (!notificationSnap.exists) return errorResponse('Cette notification n’existe plus.', 404);
    await notificationRef.set({ read: true, readAt: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error.message || 'Impossible de marquer cette notification comme lue.', 400);
  }
}

async function handleNotificationSubscription(request, remove = false) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const token = String(body.token || '').trim();
    if (token.length < 40 || token.length > 4096) return errorResponse('Jeton de notification invalide.', 400);
    const userRef = adminDb.collection('users').doc(uid);
    if (remove) {
      await userRef.set({ pushTokens: FieldValue.arrayRemove(token), notificationsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
      const fresh = await userRef.get();
      const remaining = Array.isArray(fresh.data()?.pushTokens) ? fresh.data().pushTokens : [];
      await userRef.set({ notificationsEnabled: remaining.length > 0 }, { merge: true });
    } else {
      await userRef.set({ pushTokens: FieldValue.arrayUnion(token), notificationsEnabled: true, notificationsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error.message || 'Impossible d’enregistrer les notifications.', 400);
  }
}



/* ═══════════════════ CODE PIN UTILISATEUR ═══════════════════ */
function makePinHash(pin) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pin, salt, 64).toString('hex');
  return { salt, hash };
}

function checkPinHash(pin, saved) {
  if (!saved?.salt || !saved?.hash) return false;
  const candidate = scryptSync(pin, saved.salt, 64);
  const expected = Buffer.from(saved.hash, 'hex');
  return expected.length === candidate.length && timingSafeEqual(candidate, expected);
}

function pinOtpHash(uid, code) {
  const secret = process.env.RESEND_API_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_KEY || 'pata-pin-verification';
  return createHmac('sha256', secret).update(uid + ':' + code).digest('hex');
}

async function handlePinStatus(request) {
  try {
    const { uid } = await authenticate(request);
    const snap = await adminDb.collection('users').doc(uid).collection('private_security').doc('pin').get();
    const data = snap.exists ? snap.data() : {};
    const lockedUntil = Number(data.lockedUntil || 0);
    return NextResponse.json({ success: true, enabled: Boolean(data.hash && data.salt), locked: lockedUntil > Date.now(), lockedUntil: lockedUntil > Date.now() ? lockedUntil : null });
  } catch (error) {
    return errorResponse(error.message || 'Impossible de vérifier le code secret.', 401);
  }
}

async function handlePinSet(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const pin = String(body.pin || '');
    const currentPin = String(body.currentPin || '');
    if (!/^\d{4}$/.test(pin)) return errorResponse('Le code secret doit contenir exactement 4 chiffres.', 400);
    const ref = adminDb.collection('users').doc(uid).collection('private_security').doc('pin');
    const snap = await ref.get();
    const current = snap.exists ? snap.data() : {};
    if (current.hash) {
      const now = Date.now();
      if (Number(current.lockedUntil || 0) > now) return errorResponse('Trop de tentatives. Réessaie dans quelques minutes ou réinitialise ton code par e-mail.', 429);
      if (!checkPinHash(currentPin, current)) {
        const attempts = (Number(current.failedAttempts) || 0) + 1;
        const lockedUntil = attempts >= 5 ? now + 5 * 60 * 1000 : null;
        await ref.set({ failedAttempts: attempts >= 5 ? 0 : attempts, lockedUntil, lastFailedAt: FieldValue.serverTimestamp() }, { merge: true });
        return errorResponse(lockedUntil ? 'Trop de tentatives. Le code est bloqué pendant 5 minutes.' : 'Le code actuel est incorrect. Utilise la réinitialisation par e-mail si tu l’as oublié.', 401);
      }
    }
    const credential = makePinHash(pin);
    await ref.set({ ...credential, failedAttempts: 0, lockedUntil: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await adminDb.collection('users').doc(uid).set({ pinEnabled: true }, { merge: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error.message || 'Impossible d’enregistrer ce code secret.', 500);
  }
}

async function handlePinVerify(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const pin = String(body.pin || '');
    if (!/^\d{4}$/.test(pin)) return errorResponse('Saisis les 4 chiffres de ton code secret.', 400);
    const ref = adminDb.collection('users').doc(uid).collection('private_security').doc('pin');
    const snap = await ref.get();
    if (!snap.exists || !snap.data()?.hash) return NextResponse.json({ success: true, enabled: false });
    const data = snap.data();
    const now = Date.now();
    if (Number(data.lockedUntil || 0) > now) return errorResponse('Trop de tentatives. Réessaie dans quelques minutes ou réinitialise ton code par e-mail.', 429);
    if (checkPinHash(pin, data)) {
      await ref.set({ failedAttempts: 0, lockedUntil: null, lastVerifiedAt: FieldValue.serverTimestamp() }, { merge: true });
      return NextResponse.json({ success: true });
    }
    const attempts = (Number(data.failedAttempts) || 0) + 1;
    const lockedUntil = attempts >= 5 ? now + 5 * 60 * 1000 : null;
    await ref.set({ failedAttempts: attempts >= 5 ? 0 : attempts, lockedUntil, lastFailedAt: FieldValue.serverTimestamp() }, { merge: true });
    return errorResponse(lockedUntil ? 'Trop de tentatives. Le code est bloqué pendant 5 minutes.' : 'Code secret incorrect.', 401);
  } catch (error) {
    return errorResponse(error.message || 'Vérification du code impossible.', 401);
  }
}

async function handlePinResetRequest(request) {
  try {
    const decoded = await authenticate(request);
    const uid = decoded.uid;
    const userRef = adminDb.collection('users').doc(uid);
    const [profileSnap, pinSnap] = await Promise.all([
      userRef.get(),
      userRef.collection('private_security').doc('pin').get(),
    ]);
    const profile = profileSnap.exists ? profileSnap.data() : {};
    const email = String(profile.email || decoded.email || '').trim();
    if (!email) return errorResponse('Aucune adresse e-mail ne permet de vérifier ce compte.', 400);
    const ref = userRef.collection('private_security').doc('pin');
    const pinData = pinSnap.exists ? pinSnap.data() : {};
    const lastRequested = pinData.resetRequestedAt?.toDate ? pinData.resetRequestedAt.toDate().getTime() : Number(pinData.resetRequestedAt || 0);
    if (lastRequested && Date.now() - lastRequested < 60 * 1000) return errorResponse('Attends une minute avant de demander un nouveau code.', 429);
    const code = String(randomInt(100000, 1000000));
    const expiry = Date.now() + 15 * 60 * 1000;
    await ref.set({
      resetCodeHash: pinOtpHash(uid, code),
      resetExpiresAt: expiry,
      resetAttempts: 0,
      resetRequestedAt: Date.now(),
    }, { merge: true });
    const name = String(profile.displayName || email.split('@')[0] || 'Utilisateur');
    await sendPataEmail({
      to: email,
      subject: 'Ton code de réinitialisation Pata',
      html: pinResetEmail({ code, name }),
      idempotencyKey: `pata-pin-reset-${uid}-${expiry}`,
    });
    return NextResponse.json({ success: true, expiresInMinutes: 15, maskedEmail: email.replace(/^(.{1,2}).+(@.+)$/, '$1•••$2') });
  } catch (error) {
    console.error('[PATA PIN RESET REQUEST]', error.message || error);
    return errorResponse(error.message || 'Impossible d’envoyer le code de vérification.', 502);
  }
}

async function handlePinResetConfirm(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const code = String(body.code || '');
    const pin = String(body.pin || '');
    if (!/^\d{6}$/.test(code)) return errorResponse('Le code reçu par e-mail doit contenir 6 chiffres.', 400);
    if (!/^\d{4}$/.test(pin)) return errorResponse('Le nouveau code secret doit contenir exactement 4 chiffres.', 400);
    const ref = adminDb.collection('users').doc(uid).collection('private_security').doc('pin');
    const snap = await ref.get();
    if (!snap.exists) return errorResponse('Aucune demande de réinitialisation n’a été trouvée.', 400);
    const data = snap.data();
    if (Number(data.resetExpiresAt || 0) < Date.now()) return errorResponse('Ce code a expiré. Demande-en un nouveau.', 400);
    if ((Number(data.resetAttempts) || 0) >= 5) return errorResponse('Trop de codes incorrects. Demande un nouveau code.', 429);
    const provided = Buffer.from(pinOtpHash(uid, code), 'hex');
    const expected = Buffer.from(String(data.resetCodeHash || ''), 'hex');
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      await ref.set({ resetAttempts: (Number(data.resetAttempts) || 0) + 1 }, { merge: true });
      return errorResponse('Le code de vérification est incorrect.', 401);
    }
    const credential = makePinHash(pin);
    await ref.set({
      ...credential,
      failedAttempts: 0,
      lockedUntil: null,
      resetCodeHash: FieldValue.delete(),
      resetExpiresAt: FieldValue.delete(),
      resetAttempts: FieldValue.delete(),
      resetRequestedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await adminDb.collection('users').doc(uid).set({ pinEnabled: true }, { merge: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error.message || 'Impossible de réinitialiser le code secret.', 500);
  }
}

async function handleWelcomeEmail(request) {
  try {
    const decoded = await authenticate(request);
    const uid = decoded.uid;
    const userRef = adminDb.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return errorResponse('Profil utilisateur introuvable.', 404);
    const profile = userSnap.data() || {};
    const recipient = String(profile.email || decoded.email || '').trim();
    if (!recipient) return errorResponse('Aucune adresse e-mail associée à ce compte.', 400);
    if (profile.welcomeEmailSentAt) return NextResponse.json({ success: true, alreadySent: true });
    const name = String(profile.displayName || recipient.split('@')[0] || 'Utilisateur').replaceAll(String.fromCharCode(10), ' ').replaceAll(String.fromCharCode(13), ' ').slice(0, 80);
    const sent = await sendPataEmail({
      to: recipient,
      subject: `Bienvenue sur Pata, ${name} !`,
      html: welcomeEmail({ name }),
      idempotencyKey: `pata-welcome-${uid}`,
    });
    await userRef.set({
      welcomeEmailSentAt: FieldValue.serverTimestamp(),
      welcomeEmailId: sent.id || null,
      welcomeEmailStatus: 'sent',
    }, { merge: true });
    return NextResponse.json({ success: true, emailId: sent.id || null });
  } catch (error) {
    console.error('[PATA WELCOME EMAIL]', error.message || error);
    return errorResponse(error.message || 'Le message de bienvenue n’a pas pu être envoyé.', 502);
  }
}

async function handleNotificationTest(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const token = String(body.token || '').trim();
    if (token.length < 40 || token.length > 4096) return errorResponse('Appareil non reconnu.', 400);
    const userRef = adminDb.collection('users').doc(uid);
    const userSnap = await userRef.get();
    const savedTokens = Array.isArray(userSnap.data()?.pushTokens) ? userSnap.data().pushTokens : [];
    if (!savedTokens.includes(token)) {
      await userRef.set({ pushTokens: FieldValue.arrayUnion(token), notificationsEnabled: true, notificationsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    const tag = `pata-test-${Date.now()}`;
    const appUrl = 'https://www.pata-yam.site';
    const messageId = await adminMessaging.send({
      token,
      data: {
        title: 'Pata — test réussi',
        body: 'Les notifications sont bien reliées à cet appareil.',
        url: '/settings',
        tag,
      },
      webpush: {
        headers: { TTL: '300', Urgency: 'high' },
        fcmOptions: { link: new URL('/settings', appUrl).toString() },
      },
    });
    console.info('[PATA PUSH TEST ACCEPTED]', { uid, messageId, tokenSuffix: token.slice(-8) });
    return NextResponse.json({ success: true, messageId });
  } catch (error) {
    const message = error.code === 'messaging/registration-token-not-registered'
      ? 'Cet appareil doit être reconnecté aux rappels. Désactive puis réactive les notifications.'
      : 'Le test de notification a échoué. Vérifie les paramètres de notification de cet appareil.';
    console.error('[PUSH TEST]:', error.code || error.message);
    return errorResponse(message, 502);
  }
}

async function handleNotificationScheduler(request) {
  try {
    const expectedSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization') || '';
    const suppliedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : request.headers.get('x-cron-secret');
    if (!expectedSecret || suppliedSecret !== expectedSecret) return errorResponse('Accès au planificateur refusé.', 401);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const month = today.slice(0, 7);
    const usersSnapshot = await adminDb.collection('users').where('notificationsEnabled', '==', true).get();
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const tokens = Array.isArray(userData.pushTokens) ? [...new Set(userData.pushTokens.filter(Boolean))] : [];
      if (!tokens.length || userData.notificationsDailyDate === today) { skipped += 1; continue; }
      try {
        const monthStart = `${month}-01`;
        const [todayExpensesSnap, monthExpensesSnap, budgetsSnap, automationsSnap] = await Promise.all([
          userDoc.ref.collection('expenses').where('date', '==', today).get(),
          userDoc.ref.collection('expenses').where('date', '>=', monthStart).where('date', '<=', today).get(),
          userDoc.ref.collection('budgets').where('month', '==', month).get(),
          userDoc.ref.collection('automations').get(),
        ]);
        const todayExpenses = todayExpensesSnap.docs.map((doc) => doc.data());
        const monthExpenses = monthExpensesSnap.docs.map((doc) => doc.data());
        const totalToday = todayExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        const categoryTotals = {};
        monthExpenses.forEach((item) => { categoryTotals[item.categoryId || 'other'] = (categoryTotals[item.categoryId || 'other'] || 0) + (Number(item.amount) || 0); });
        const budgets = budgetsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const overBudget = budgets.map((budget) => {
          const spent = monthExpenses.filter((expense) => expense.categoryId === budget.categoryId && (budget.incomeSourceId === 'all' || !budget.incomeSourceId || expense.incomeSourceId === budget.incomeSourceId)).reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
          return { categoryId: budget.categoryId, allocated: Number(budget.amount) || 0, spent, over: spent - (Number(budget.amount) || 0) };
        }).filter((item) => item.allocated > 0 && item.over > 0).sort((a, b) => b.over - a.over)[0];
        const runsToday = automationsSnap.docs.map((doc) => doc.data()).filter((item) => {
          const lastRunDate = item.lastRunAt?.toDate ? item.lastRunAt.toDate() : item.lastRunAt instanceof Date ? item.lastRunAt : item.lastRunAt ? new Date(item.lastRunAt) : null;
          const lastRunDay = lastRunDate && !Number.isNaN(lastRunDate.getTime())
            ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(lastRunDate)
            : '';
          return lastRunDay === today;
        });
        const automationIssues = runsToday.filter((item) => ['SKIPPED', 'ERROR'].includes(String(item.lastRunStatus || '').toUpperCase()));
        const automationRuns = runsToday.filter((item) => item.lastRunStatus === 'EXECUTED');
        let title = 'Ton point financier du jour';
        let body;
        let target = '/dashboard';
        if (overBudget) {
          const overspend = overBudget.over;
          title = 'Un budget mérite ton attention';
          const categoryLabels = { food: 'Alimentation', transport: 'Transport', housing: 'Logement', internet: 'Internet', health: 'Santé', leisure: 'Loisirs', investment: 'Investissement', contribution: 'Cotisations', savings: 'Épargne', other: 'Autres' };
          const categoryName = categoryLabels[overBudget.categoryId] || 'une catégorie de dépenses';
          body = `Tes dépenses en ${categoryName.toLowerCase()} dépassent l’enveloppe prévue de ${overspend.toLocaleString('fr-FR')} FCFA. Ouvre Pata pour voir les opérations et ajuster ton budget.`;
          target = '/budgets';
        } else if (automationIssues.length) {
          const issue = automationIssues[0];
          const taskName = String(issue.note || 'Une dépense programmée').slice(0, 70);
          title = 'Une opération programmée a besoin de toi';
          body = `${taskName} n’a pas été enregistrée. ${String(issue.lastRunMessage || 'Vérifie les fonds disponibles et les paramètres de cette opération.').slice(0, 150)}`;
          target = '/expenses';
        } else if (automationRuns.length) {
          title = 'Tes opérations programmées';
          body = `${automationRuns.length} opération(s) programmée(s) ont été exécutée(s) aujourd’hui. Consulte les dépenses enregistrées dans Pata.`;
          target = '/expenses';
        } else if (todayExpenses.length) {
          body = `Tu as noté ${todayExpenses.length} dépense(s) aujourd’hui, pour ${totalToday.toLocaleString('fr-FR')} FCFA. Ton suivi est à jour. Continue à garder le cap.`;
          target = '/expenses';
        } else {
          const reminders = [
            'As-tu pensé à noter tes dépenses d’aujourd’hui ? Quelques secondes suffisent pour garder un suivi fiable.',
            'Petit rappel amical : ajoute tes dépenses du jour dans Pata pour ne pas perdre le fil de ton budget.',
            'Ton suivi financier t’attend. Note les dépenses d’aujourd’hui, même les petites, pour garder une vue juste.',
          ];
          body = reminders[(Number(today.slice(-2)) || 1) % reminders.length];
          target = '/expenses';
        }
        let delivered = 0;
        const invalidTokens = [];
        for (const token of tokens) {
          try {
            await adminMessaging.send({
              token,
              data: { title, body, url: target, tag: `pata-${today}` },
              webpush: { headers: { TTL: '86400' } },
            });
            delivered += 1;
          } catch (sendError) {
            if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(sendError.code)) invalidTokens.push(token);
            console.error(`[PUSH] ${userDoc.id}:`, sendError.code || sendError.message);
          }
        }
        if (invalidTokens.length) await userDoc.ref.update({ pushTokens: FieldValue.arrayRemove(...invalidTokens) });
        await userDoc.ref.update({ notificationsDailyDate: today, lastNotificationAt: FieldValue.serverTimestamp() });
        await userDoc.ref.collection('notifications').doc(today).set({
          title, body, target, date: today, delivered,
          source: 'daily_reminder', read: false, readAt: null,
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        if (delivered > 0) sent += 1;
        else failed += 1;
      } catch (userError) {
        failed += 1;
        console.error(`[PUSH] Échec utilisateur ${userDoc.id}:`, userError.message);
      }
    }
    return NextResponse.json({ success: true, date: today, checked: usersSnapshot.size, sent, skipped, failed });
  } catch (error) {
    console.error('[CRON] Notifications:', error.message);
    return errorResponse('Le rappel quotidien n’a pas pu être exécuté.', 500);
  }
}

async function handleCurrencyRates(request) {
  try {
    await authenticate(request);
    const fallback = { XAF: 1, EUR: 1 / 655.957, USD: 1 / 600 };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/XAF', { signal: controller.signal, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || data.result !== 'success' || !data.rates) throw new Error('Taux indisponibles.');
      return NextResponse.json({ success: true, base: 'XAF', rates: { XAF: 1, EUR: Number(data.rates.EUR) || fallback.EUR, USD: Number(data.rates.USD) || fallback.USD }, updatedAt: data.time_last_update_utc || new Date().toISOString(), source: 'open.er-api.com' });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    if (error.message === 'Taux indisponibles.') return NextResponse.json({ success: true, base: 'XAF', rates: fallback, updatedAt: new Date().toISOString(), source: 'fallback' });
    return errorResponse(error.message || 'Impossible de récupérer le taux de conversion.', 500);
  }
}


function getDoualaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Douala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getDoualaMonthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit' }).formatToParts(date);
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}

function normalizeMonthlyStatsForMonth(stats = {}, month) {
  return stats.lastResetMonth === month
    ? { ...stats }
    : { ...stats, expenses: 0, incomes: 0, budgets: 0, goals: 0, vitalForecasts: 0, durationForecasts: 0, lastResetMonth: month };
}

function addMonthsSafe(dateText, count) {
  const date = new Date(`${dateText}T12:00:00`);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + count);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date;
}

function monthKeysBetween(startDate, endDate) {
  const start = new Date(`${startDate.slice(0, 7)}-01T12:00:00`);
  const end = new Date(`${endDate.slice(0, 7)}-01T12:00:00`);
  const keys = [];
  while (start <= end && keys.length < 36) {
    keys.push(`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`);
    start.setMonth(start.getMonth() + 1);
  }
  return keys;
}

function readOptionalIncomeMetadata(body = {}, previous = {}) {
  const rawTime = body.time === undefined ? previous.time : body.time;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(rawTime || '')) ? String(rawTime) : '';
  const rawLatitude = body.latitude === undefined ? previous.latitude : body.latitude;
  const rawLongitude = body.longitude === undefined ? previous.longitude : body.longitude;
  const latitude = rawLatitude === null || rawLatitude === '' ? null : Number(rawLatitude);
  const longitude = rawLongitude === null || rawLongitude === '' ? null : Number(rawLongitude);
  const validCoordinates = Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
  const rawAccuracy = body.locationAccuracy === undefined ? previous.locationAccuracy : body.locationAccuracy;
  const accuracy = rawAccuracy === null || rawAccuracy === '' ? null : Number(rawAccuracy);
  const paymentMethods = ['cash', 'mtn_momo', 'orange_money', 'bank_transfer', 'card', 'other'];
  const rawMethod = body.paymentMethod === undefined ? previous.paymentMethod : body.paymentMethod;
  return {
    time,
    locationLabel: String(body.locationLabel === undefined ? previous.locationLabel || '' : body.locationLabel || '').trim().slice(0, 160),
    paymentMethod: paymentMethods.includes(String(rawMethod || '')) ? String(rawMethod) : '',
    details: String(body.details === undefined ? previous.details || '' : body.details || '').trim().slice(0, 160),
    latitude: validCoordinates ? latitude : null,
    longitude: validCoordinates ? longitude : null,
    locationAccuracy: Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 100000 ? Math.round(accuracy) : null,
  };
}

async function handleCreateIncome(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const amount = Math.round(Number(body.amount));
    const source = String(body.source || 'Revenu').trim().slice(0, 100);
    const categoryId = String(body.categoryId || 'salary').trim().slice(0, 80);
    const date = String(body.date || new Date().toISOString().slice(0, 10));
    const month = String(body.month || date.slice(0, 7));
    const note = String(body.note || '').trim().slice(0, 250);
    const optionalMetadata = readOptionalIncomeMetadata(body);
    if (!Number.isSafeInteger(amount) || amount <= 0) return errorResponse('Indique un montant de revenu valide.', 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}$/.test(month) || month !== date.slice(0, 7)) return errorResponse('La date du revenu est invalide.', 400);
    const userRef = adminDb.collection('users').doc(uid);
    const incomeRef = userRef.collection('incomes').doc();
    const result = await adminDb.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
      const userData = userSnap.data();
      const currentMonth = getDoualaMonthKey();
      const stats = normalizeMonthlyStatsForMonth(userData.monthlyStats || {}, currentMonth);
      const current = Number(stats.incomes) || 0;
      if (!isPremiumAccount(userData) && current >= PLAN_LIMITS.FREE.incomes) {
        throw new Error(`Tu as atteint les ${PLAN_LIMITS.FREE.incomes} revenus autorisés ce mois-ci avec le compte gratuit. Passe à Premium pour en ajouter davantage.`);
      }
      stats.incomes = current + 1;
      stats.lastResetMonth = currentMonth;
      transaction.create(incomeRef, {
        amount, source: source || 'Revenu', categoryId, month, date, note,
        ...optionalMetadata,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(userRef, {
        monthlyStats: stats,
        lifetimeIncomeAmount: FieldValue.increment(amount),
        lifetimeIncomeCount: FieldValue.increment(1),
      });
      return { id: incomeRef.id, current: stats.incomes, limit: PLAN_LIMITS.FREE.incomes };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const status = /atteint|introuvable|invalide/i.test(error.message || '') ? 403 : 500;
    return errorResponse(error.message || 'Impossible d’enregistrer ce revenu.', status);
  }
}


async function handleUpsertBudget(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const categoryId = String(body.categoryId || '').trim().slice(0, 100);
    const amount = Math.round(Number(body.amount));
    const month = String(body.month || '');
    const incomeSourceId = String(body.incomeSourceId || 'all').trim().slice(0, 150);
    if (!categoryId || !/^\d{4}-\d{2}$/.test(month) || !Number.isSafeInteger(amount) || amount <= 0) return errorResponse('Vérifie la catégorie, la période et le montant du budget.', 400);
    const userRef = adminDb.collection('users').doc(uid);
    const budgetQuery = userRef.collection('budgets').where('month', '==', month).where('categoryId', '==', categoryId).where('incomeSourceId', '==', incomeSourceId);
    const result = await adminDb.runTransaction(async (transaction) => {
      const [userSnap, existingSnap] = await Promise.all([transaction.get(userRef), transaction.get(budgetQuery)]);
      if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
      if (!existingSnap.empty) {
        const existing = existingSnap.docs[0];
        transaction.update(existing.ref, { amount, updatedAt: FieldValue.serverTimestamp() });
        return { id: existing.id, updated: true };
      }
      const userData = userSnap.data();
      const currentMonth = getDoualaMonthKey();
      const stats = normalizeMonthlyStatsForMonth(userData.monthlyStats || {}, currentMonth);
      const current = Number(stats.budgets) || 0;
      if (!isPremiumAccount(userData) && current >= PLAN_LIMITS.FREE.budgets) {
        throw new Error(`Tu as atteint les ${PLAN_LIMITS.FREE.budgets} budgets autorisés ce mois-ci avec le compte gratuit. Passe à Premium pour continuer.`);
      }
      stats.budgets = current + 1;
      stats.lastResetMonth = currentMonth;
      const budgetRef = userRef.collection('budgets').doc();
      transaction.create(budgetRef, { categoryId, amount, month, incomeSourceId, createdAt: FieldValue.serverTimestamp() });
      transaction.update(userRef, { monthlyStats: stats });
      return { id: budgetRef.id, created: true, current: stats.budgets, limit: PLAN_LIMITS.FREE.budgets };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error.message || 'Impossible d’enregistrer ce budget.', /atteint|introuvable|invalide/i.test(error.message || '') ? 403 : 500);
  }
}

async function handleBudgetTemplates(request) {
  try {
    const { uid } = await authenticate(request);
    const userRef = adminDb.collection('users').doc(uid);
    const templatesRef = userRef.collection('budget_templates');

    if (request.method === 'GET') {
      const snapshot = await templatesRef.orderBy('createdAt', 'desc').limit(100).get();
      return NextResponse.json({
        success: true,
        templates: snapshot.docs.map((document) => ({ id: document.id, ...serializeAdminValue(document.data()) })),
      });
    }

    const body = await request.json();

    if (request.method === 'DELETE') {
      const templateId = String(body.templateId || '').trim().slice(0, 150);
      if (!templateId || templateId.includes('/')) return errorResponse('Modèle introuvable.', 400);
      const templateRef = templatesRef.doc(templateId);
      await adminDb.runTransaction(async (transaction) => {
        const templateSnapshot = await transaction.get(templateRef);
        if (!templateSnapshot.exists) throw new Error('Ce modèle n’existe plus.');
        transaction.delete(templateRef);
      });
      // La suppression ne recrédite pas le quota : supprimer puis recréer ne doit
      // pas permettre de dépasser la limite gratuite.
      return NextResponse.json({ success: true });
    }

    if (body.action === 'apply') {
      const templateId = String(body.templateId || '').trim().slice(0, 150);
      const month = String(body.month || '');
      const incomeSourceId = String(body.incomeSourceId || 'all').trim().slice(0, 150);
      if (!templateId || templateId.includes('/') || !/^\d{4}-\d{2}$/.test(month)) {
        return errorResponse('Modèle ou période invalide.', 400);
      }
      const templateRef = templatesRef.doc(templateId);
      const budgetsRef = userRef.collection('budgets');

      const result = await adminDb.runTransaction(async (transaction) => {
        const [userSnapshot, templateSnapshot, budgetsSnapshot] = await Promise.all([
          transaction.get(userRef),
          transaction.get(templateRef),
          transaction.get(budgetsRef.where('month', '==', month)),
        ]);
        if (!userSnapshot.exists) throw new Error('Profil utilisateur introuvable.');
        if (!templateSnapshot.exists) throw new Error('Ce modèle n’existe plus.');

        const sourceItems = Array.isArray(templateSnapshot.data()?.items) ? templateSnapshot.data().items.slice(0, 100) : [];
        if (!sourceItems.length) throw new Error('Ce modèle ne contient aucune catégorie.');

        const existingByCategory = new Map();
        budgetsSnapshot.docs.forEach((document) => {
          const data = document.data() || {};
          const key = `${String(data.categoryId || '')}::${String(data.incomeSourceId || 'all')}`;
          if (!existingByCategory.has(key)) existingByCategory.set(key, document);
        });

        const seen = new Set();
        const prepared = [];
        sourceItems.forEach((item) => {
          const categoryId = String(item?.categoryId || '').trim().slice(0, 100);
          const amount = Math.round(Number(item?.amount));
          // Zéro est une valeur intentionnelle du modèle : elle signifie qu’aucune
          // enveloppe ne doit être affectée à cette catégorie pour cette période.
          if (!categoryId || !Number.isSafeInteger(amount) || amount < 0 || amount > 1_000_000_000) return;
          const key = `${categoryId}::${incomeSourceId}`;
          if (seen.has(key)) return;
          seen.add(key);
          prepared.push({ categoryId, amount, existing: existingByCategory.get(key) || null });
        });
        if (!prepared.length) throw new Error('Ce modèle ne contient aucune catégorie valide.');

        // La création du modèle consomme déjà une place du quota gratuit.
        // Réappliquer ce modèle est une réutilisation du budget enregistré, pas
        // une nouvelle création de modèle ; toutes ses catégories peuvent donc
        // être matérialisées sans compter une place par catégorie.

        let createdCount = 0;
        let updatedCount = 0;
        let deletedCount = 0;
        prepared.forEach((item) => {
          if (item.amount === 0) {
            if (item.existing) {
              transaction.delete(item.existing.ref);
              deletedCount += 1;
            }
            return;
          }
          const data = { amount: item.amount, updatedAt: FieldValue.serverTimestamp() };
          if (item.existing) {
            transaction.update(item.existing.ref, data);
            updatedCount += 1;
          } else {
            transaction.create(budgetsRef.doc(), {
              categoryId: item.categoryId,
              amount: item.amount,
              month,
              incomeSourceId,
              createdAt: FieldValue.serverTimestamp(),
            });
            createdCount += 1;
          }
        });

        return { createdCount, updatedCount, deletedCount, totalCategories: prepared.length };
      });
      return NextResponse.json({ success: true, ...result });
    }

    const name = String(body.name || '').trim().slice(0, 70);
    const itemsInput = Array.isArray(body.items) ? body.items : [];
    const byCategory = new Map();
    itemsInput.slice(0, 100).forEach((item) => {
      const categoryId = String(item?.categoryId || '').trim().slice(0, 100);
      const amount = Math.round(Number(item?.amount));
      if (categoryId && Number.isSafeInteger(amount) && amount >= 0 && amount <= 1_000_000_000) {
        byCategory.set(categoryId, { categoryId, amount });
      }
    });
    const items = [...byCategory.values()];
    if (!name) return errorResponse('Donne un nom à ce modèle de budget.', 400);
    if (!items.length) return errorResponse('Ajoute au moins une catégorie au modèle. Les montants à zéro sont autorisés.', 400);

    const templateId = String(body.templateId || '').trim().slice(0, 150);
    if (templateId) {
      if (templateId.includes('/')) return errorResponse('Modèle introuvable.', 400);
      const templateRef = templatesRef.doc(templateId);
      await adminDb.runTransaction(async (transaction) => {
        const [userSnapshot, templateSnapshot] = await Promise.all([
          transaction.get(userRef),
          transaction.get(templateRef),
        ]);
        if (!userSnapshot.exists) throw new Error('Profil utilisateur introuvable.');
        if (!templateSnapshot.exists) throw new Error('Ce modèle n’existe plus.');
        transaction.update(templateRef, {
          name,
          items,
          categoryCount: items.length,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      return NextResponse.json({ success: true, id: templateId, updated: true });
    }

    const templateRef = templatesRef.doc();
    const result = await adminDb.runTransaction(async (transaction) => {
      const userSnapshot = await transaction.get(userRef);
      if (!userSnapshot.exists) throw new Error('Profil utilisateur introuvable.');
      const userData = userSnapshot.data() || {};
      const currentMonth = getDoualaMonthKey();
      const stats = normalizeMonthlyStatsForMonth(userData.monthlyStats || {}, currentMonth);
      const current = Number(stats.budgets) || 0;
      if (!isPremiumAccount(userData) && current >= PLAN_LIMITS.FREE.budgets) {
        throw new Error(`Tu as atteint les ${PLAN_LIMITS.FREE.budgets} créations de budgets et de modèles autorisées ce mois-ci avec le compte gratuit. Passe à Premium pour enregistrer un autre modèle.`);
      }
      stats.budgets = current + 1;
      stats.lastResetMonth = currentMonth;
      transaction.create(templateRef, {
        name,
        items,
        categoryCount: items.length,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(userRef, { monthlyStats: stats });
      return { id: templateRef.id, current: stats.budgets, limit: PLAN_LIMITS.FREE.budgets };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error.message || 'Impossible de gérer les modèles de budget.';
    const denied = /atteint|créations|introuvable|n’existe plus|valide|catégorie|modèle/i.test(message);
    return errorResponse(message, denied ? 403 : 500);
  }
}
function readGoalOptionalDetails(body = {}) {
  const allowedPurposes = ['personal', 'family', 'child', 'partner', 'emergency', 'project', 'other'];
  const requestedPurpose = String(body.purposeType || 'personal');
  const purposeType = allowedPurposes.includes(requestedPurpose) ? requestedPurpose : 'personal';
  return {
    purposeType,
    beneficiaryName: String(body.beneficiaryName || '').trim().slice(0, 100),
    beneficiaryRelation: String(body.beneficiaryRelation || '').trim().slice(0, 60),
    description: String(body.description || '').trim().slice(0, 500),
    rulesEnabled: body.rulesEnabled === true,
    rulesText: body.rulesEnabled === true ? String(body.rulesText || '').trim().slice(0, 1200) : '',
  };
}

async function handleCreateGoal(request) {
  try {
    const decoded = await authenticate(request);
    const uid = decoded.uid;
    const body = await request.json();
    const name = String(body.name || '').trim().slice(0, 100);
    const type = body.type === 'piggybank' ? 'piggybank' : 'goal';
    const categoryId = String(body.categoryId || 'savings').trim().slice(0, 80);
    if (!name) return errorResponse('Le nom de l’épargne est requis.', 400);
    const startDate = String(body.startDate || new Date().toISOString().slice(0, 10));
    const deadline = String(body.deadline || '');
    const targetAmount = Math.round(Number(body.targetAmount));
    const optionalTarget = body.targetAmount === undefined || body.targetAmount === null || String(body.targetAmount).trim() === ''
      ? null
      : targetAmount;
    if (type === 'goal') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(deadline) || deadline <= startDate || !Number.isSafeInteger(targetAmount) || targetAmount <= 0) return errorResponse('Vérifie le montant et les dates de ton objectif.', 400);
    } else if (optionalTarget !== null && (!Number.isSafeInteger(optionalTarget) || optionalTarget <= 0 || optionalTarget > 1_000_000_000)) {
      return errorResponse('Le montant cible facultatif de la caisse est invalide.', 400);
    }
    const userRef = adminDb.collection('users').doc(uid);
    const goalsQuery = userRef.collection('goals');
    const reservationsQuery = userRef.collection('goal_quota_reservations');
    const goalRef = goalsQuery.doc();
    const result = await adminDb.runTransaction(async (transaction) => {
      const [userSnap, goalsSnap, reservationsSnap] = await Promise.all([transaction.get(userRef), transaction.get(goalsQuery), transaction.get(reservationsQuery)]);
      if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
      const userData = userSnap.data();
      const currentMonth = getDoualaMonthKey();
      const stats = normalizeMonthlyStatsForMonth(userData.monthlyStats || {}, currentMonth);
      const current = Number(stats.goals) || 0;
      const premium = isPremiumAccount(userData);
      if (!premium && current >= PLAN_LIMITS.FREE.goals) throw new Error('Tu as atteint la création d’épargne autorisée ce mois-ci avec le compte gratuit. Passe à Premium pour continuer.');
      if (!premium && type === 'goal') {
        const maxDeadline = addMonthsSafe(startDate, 2);
        if (new Date(`${deadline}T12:00:00`) > maxDeadline) throw new Error('Avec le compte gratuit, un objectif peut durer jusqu’à deux mois. Pour une durée plus longue, passe à Premium.');
        const wantedMonths = new Set(monthKeysBetween(startDate, deadline));
        const alreadyReserved = reservationsSnap.docs.some((document) => wantedMonths.has(document.id));
        const legacyOverlap = goalsSnap.docs.some((document) => {
          const existing = document.data();
          if (existing.closed || existing.withdrawnAt || existing.type !== 'goal' || !existing.startDate || !existing.deadline) return false;
          return monthKeysBetween(String(existing.startDate), String(existing.deadline)).some((key) => wantedMonths.has(key));
        });
        if (alreadyReserved || legacyOverlap) throw new Error('Un autre objectif occupe déjà au moins un des mois choisis. Termine-le ou passe à Premium pour planifier plusieurs objectifs en parallèle.');
        for (const monthKey of wantedMonths) {
          transaction.create(reservationsQuery.doc(monthKey), { goalId: goalRef.id, month: monthKey, createdAt: FieldValue.serverTimestamp() });
        }
      }
      stats.goals = current + 1;
      stats.lastResetMonth = currentMonth;
      const record = {
        name, type, categoryId, debtBalance: 0, pinned: false,
        ...readGoalOptionalDetails(body),
        createdAt: FieldValue.serverTimestamp(),
      };
      if (type === 'goal') Object.assign(record, {
        targetAmount, startDate, deadline,
        frequencyDays: Math.max(1, Math.floor(Number(body.frequencyDays) || 7)),
        penaltyEnabled: true,
        penaltyRate: GOAL_LATE_PENALTY_RATE,
        penaltyAmount: Math.round(targetAmount * GOAL_LATE_PENALTY_RATE),
        penaltyPolicyStartedOn: new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date()),
      });
      if (type === 'piggybank' && optionalTarget !== null) record.targetAmount = optionalTarget;
      transaction.create(goalRef, record);
      transaction.update(userRef, { monthlyStats: stats });
      return { id: goalRef.id, current: stats.goals, limit: PLAN_LIMITS.FREE.goals };
    });
    if (decoded.email) {
      try {
        const displayName = String(decoded.email).split('@')[0] || 'Utilisateur';
        await sendPataEmail({
          to: decoded.email,
          subject: 'Bravo pour ta nouvelle épargne sur Pata',
          html: savingsCreatedEmail({
            name: displayName,
            goalName: name,
            type,
            targetAmount: type === 'goal' ? targetAmount : optionalTarget,
            deadline: type === 'goal' ? deadline : '',
            frequencyDays: type === 'goal' ? Math.max(1, Math.floor(Number(body.frequencyDays) || 7)) : null,
          }),
          idempotencyKey: `pata-savings-created-${uid}-${result.id}`,
        });
      } catch (emailError) {
        console.error('[PATA SAVINGS EMAIL]', emailError.message || emailError);
      }
    }
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error.message || 'Impossible de créer cette épargne.', /atteint|deux mois|occupe|introuvable|vérifie/i.test(error.message || '') ? 403 : 500);
  }
}

async function handleReserveQuota(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const type = String(body.type || '');
    const allowedTypes = ['incomes', 'budgets', 'goals', 'vitalForecasts', 'durationForecasts'];
    if (!allowedTypes.includes(type)) return errorResponse('Type de création non reconnu.', 400);
    const requestId = String(body.requestId || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
    if (requestId.length < 8) return errorResponse('Identifiant de demande invalide.', 400);
    const userRef = adminDb.collection('users').doc(uid);
    const reservationRef = userRef.collection('usage_reservations').doc(requestId);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit' }).format(new Date());
    const result = await adminDb.runTransaction(async (transaction) => {
      const [userSnap, reservationSnap] = await Promise.all([transaction.get(userRef), transaction.get(reservationRef)]);
      if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
      if (reservationSnap.exists) return { allowed: true, duplicateRequest: true };
      const data = userSnap.data();
      const expiryValue = data.premiumUntil;
      const expiry = expiryValue?.toDate ? expiryValue.toDate() : new Date(expiryValue || 0);
      if (Number.isFinite(expiry.getTime()) && expiry > new Date()) {
        transaction.create(reservationRef, { type, month: today, premium: true, createdAt: FieldValue.serverTimestamp() });
        return { allowed: true, premium: true };
      }
      const stats = data.monthlyStats || {};
      const currentStats = stats.lastResetMonth === today ? { ...stats } : { expenses: 0, incomes: 0, budgets: 0, goals: 0, vitalForecasts: 0, durationForecasts: 0, lastResetMonth: today };
      const limit = PLAN_LIMITS.FREE[type];
      const current = Number(currentStats[type]) || 0;
      if (current >= limit) throw new Error(`Tu as atteint la limite gratuite de ${limit} ${type === 'incomes' ? 'revenus' : type === 'budgets' ? 'budgets' : type === 'goals' ? 'objectifs' : type === 'durationForecasts' ? 'prévision(s) de durée du capital' : 'prévision(s) vitale(s)'} par mois. Passe à Premium pour continuer.`);
      currentStats[type] = current + 1;
      currentStats.lastResetMonth = today;
      transaction.update(userRef, { monthlyStats: currentStats });
      transaction.create(reservationRef, { type, month: today, premium: false, createdAt: FieldValue.serverTimestamp() });
      return { allowed: true, premium: false, current: currentStats[type], limit };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error.message || 'Impossible de vérifier la limite de ton compte.', 403);
  }
}

async function handleSaveVitalForecast(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const name = String(body.name || 'Prévision vitale').trim().slice(0, 100) || 'Prévision vitale';
    const needsInput = body.needs && typeof body.needs === 'object' && !Array.isArray(body.needs) ? body.needs : {};
    const needs = {};
    const multipliers = { daily: 30, weekly: 4, monthly: 1 };
    let computedTotal = 0;
    for (const [categoryId, value] of Object.entries(needsInput).slice(0, 40)) {
      const amount = Math.round(Number(value?.amount));
      const frequency = String(value?.frequency || 'monthly');
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000 || !multipliers[frequency]) continue;
      needs[String(categoryId).slice(0, 80)] = { amount, frequency };
      computedTotal += amount * multipliers[frequency];
    }
    const totalBudget = Math.round(Number(body.totalBudget) || computedTotal);
    if (!Object.keys(needs).length || !Number.isSafeInteger(totalBudget) || totalBudget <= 0 || totalBudget > 10_000_000_000) return errorResponse('Ajoute au moins un besoin avec un montant valide.', 400);
    const userRef = adminDb.collection('users').doc(uid);
    const month = getDoualaMonthKey();
    const result = await adminDb.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
      const userData = userSnap.data();
      const stats = normalizeMonthlyStatsForMonth(userData.monthlyStats || {}, month);
      const premium = isPremiumAccount(userData);
      const existingThisMonth = userData.vitalForecastCreatedMonth === month && Object.keys(userData.vitalNeeds || {}).length > 0;
      if (!premium && !existingThisMonth) {
        if ((Number(stats.vitalForecasts) || 0) >= PLAN_LIMITS.FREE.vitalForecasts) throw new Error('Tu as déjà utilisé ta prévision vitale gratuite ce mois-ci. Passe à Premium pour en créer une autre.');
        stats.vitalForecasts = (Number(stats.vitalForecasts) || 0) + 1;
      }
      stats.lastResetMonth = month;
      const snapshot = { id: `vital_${Date.now()}`, name, totalBudget, needs, month, createdAt: new Date().toISOString() };
      const history = Array.isArray(userData.vitalForecastHistory) ? userData.vitalForecastHistory : [];
      transaction.update(userRef, { vitalNeeds: needs, vitalBudgetName: name, vitalTotalBudget: totalBudget, vitalForecastCreatedMonth: month, vitalForecastHistory: [...history, snapshot].slice(-50), monthlyStats: stats });
      return { totalBudget, snapshot };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error.message || 'Impossible d’enregistrer cette prévision.', /atteint|introuvable/i.test(error.message || '') ? 403 : 400);
  }
}

async function handleDeleteVitalForecast(request) {
  try {
    const { uid } = await authenticate(request);
    const userRef = adminDb.collection('users').doc(uid);
    await userRef.update({ vitalNeeds: {}, vitalBudgetName: null, vitalTotalBudget: 0, vitalForecastUpdatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true });
  } catch (error) { return errorResponse(error.message || 'Impossible de supprimer cette prévision.', 400); }
}

async function handleSaveDurationForecast(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const capital = Math.round(Number(body.capital));
    const expense = Math.round(Number(body.expense));
    const frequency = String(body.frequency || 'daily');
    const daysPerPeriod = { daily: 1, weekly: 7, monthly: 30.4375 }[frequency];
    if (!Number.isSafeInteger(capital) || capital <= 0 || capital > 10_000_000_000 || !Number.isSafeInteger(expense) || expense <= 0 || !daysPerPeriod) return errorResponse('Vérifie le capital, la dépense et sa fréquence.', 400);
    const dailyRate = expense / daysPerPeriod;
    const canCoverOnePeriod = capital >= expense;
    const estimatedDays = canCoverOnePeriod ? Math.max(1, Math.floor((capital / expense) * daysPerPeriod)) : 0;
    const createdAt = new Date();
    const end = new Date(createdAt);
    end.setDate(end.getDate() + estimatedDays);
    const forecast = {
      id: `duration_${createdAt.getTime()}`,
      name: String(body.name || `Estimation du ${createdAt.toLocaleDateString('fr-FR')}`).trim().slice(0, 100),
      capital, frequency, expense, averageDaily: dailyRate, estimatedDays, canCoverPeriod: canCoverOnePeriod,
      dailyExpense: frequency === 'daily' ? expense : 0,
      weeklyExpense: frequency === 'weekly' ? expense : 0,
      monthlyExpense: frequency === 'monthly' ? expense : 0,
      estimatedEndDate: canCoverOnePeriod ? end.toISOString().slice(0, 10) : null, createdAt: createdAt.toISOString(),
    };
    const userRef = adminDb.collection('users').doc(uid);
    await adminDb.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
      const userData = userSnap.data();
      const month = getDoualaMonthKey();
      const stats = normalizeMonthlyStatsForMonth(userData.monthlyStats || {}, month);
      if (!isPremiumAccount(userData)) {
        if ((Number(stats.durationForecasts) || 0) >= PLAN_LIMITS.FREE.durationForecasts) throw new Error('Tu as déjà utilisé ton estimation gratuite de durée du capital ce mois-ci. Passe à Premium pour en enregistrer une autre.');
        stats.durationForecasts = (Number(stats.durationForecasts) || 0) + 1;
      }
      stats.lastResetMonth = month;
      const forecasts = Array.isArray(userData.durationForecasts) ? userData.durationForecasts : [];
      transaction.update(userRef, { durationForecasts: [...forecasts, forecast].slice(-50), monthlyStats: stats });
    });
    return NextResponse.json({ success: true, forecast });
  } catch (error) { return errorResponse(error.message || 'Impossible d’enregistrer cette estimation.', /atteint|introuvable/i.test(error.message || '') ? 403 : 400); }
}

async function handleDeleteDurationForecast(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const id = String(body.id || '').trim().slice(0, 100);
    if (!id) return errorResponse('Estimation introuvable.', 400);
    const userRef = adminDb.collection('users').doc(uid);
    await adminDb.runTransaction(async (transaction) => {
      const snap = await transaction.get(userRef);
      if (!snap.exists) throw new Error('Profil utilisateur introuvable.');
      const forecasts = Array.isArray(snap.data().durationForecasts) ? snap.data().durationForecasts : [];
      transaction.update(userRef, { durationForecasts: forecasts.filter((item) => item.id !== id) });
    });
    return NextResponse.json({ success: true });
  } catch (error) { return errorResponse(error.message || 'Impossible de supprimer cette estimation.', 400); }
}

/* ═══════════════════ ROUTES DÉPENSES (CASCADE + QUOTA) ═══════════════════ */

async function handleAddExpense(request) {
  try {
    const decoded = await authenticate(request);
    const body = await request.json();
    const result = await createExpenseForUser(decoded.uid, body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || 'Erreur lors de l’enregistrement de la dépense.';
    const status = /limite gratuite/i.test(message) ? 403
      : /introuvable|invalide|insuffisants|nom exact|plusieurs revenus|n’existe plus|n'existe plus|ne trouve pas|obligatoire|disponible|catégorie/i.test(message) ? 400 : 500;
    return errorResponse(message, status);
  }
}

async function handleUpdateExpense(request) {
  try {
    const decoded = await authenticate(request);
    const body = await request.json();
    const result = await updateExpenseForUser(decoded.uid, body.expenseId || body.id, body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || 'Erreur lors de la modification de la dépense.';
    const status = /introuvable|invalide|insuffisants|nom exact|plusieurs revenus|n’existe plus|n'existe plus|ne trouve pas|disponible|manquant|catégorie/i.test(message) ? 400 : 500;
    return errorResponse(message, status);
  }
}

async function handleDeleteExpense(request) {
  try {
    const decoded = await authenticate(request);
    const body = await request.json();
    const result = await deleteExpenseForUser(decoded.uid, body.expenseId || body.id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || 'Erreur lors de la suppression de la dépense.';
    const status = /introuvable|manquant/i.test(message) ? 404 : 500;
    return errorResponse(message, status);
  }
}

/* ═══════════════════ ROUTES OBJECTIFS / AUTOMATISATIONS ═══════════════════ */


async function handleUpdateGoal(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const goalId = String(body.goalId || '').trim().slice(0, 150);
    if (!goalId) return errorResponse('Objectif introuvable.', 400);
    const userRef = adminDb.collection('users').doc(uid);
    const goalsRef = userRef.collection('goals');
    const goalRef = goalsRef.doc(goalId);
    const reservationsRef = userRef.collection('goal_quota_reservations');
    const result = await adminDb.runTransaction(async (transaction) => {
      const [userSnap, goalSnap, goalsSnap, reservationsSnap] = await Promise.all([
        transaction.get(userRef), transaction.get(goalRef), transaction.get(goalsRef), transaction.get(reservationsRef),
      ]);
      if (!userSnap.exists || !goalSnap.exists) throw new Error('Objectif introuvable.');
      const userData = userSnap.data();
      const current = goalSnap.data();
      const premium = isPremiumAccount(userData);
      const patch = { updatedAt: FieldValue.serverTimestamp() };
      if (body.name !== undefined) {
        const value = String(body.name || '').trim().slice(0, 100);
        if (!value) throw new Error('Le nom ne peut pas être vide.');
        patch.name = value;
      }
      if (body.categoryId !== undefined) patch.categoryId = String(body.categoryId || 'savings').trim().slice(0, 80);
      if (body.purposeType !== undefined) {
        const allowedPurposes = ['personal', 'family', 'child', 'partner', 'emergency', 'project', 'other'];
        const requestedPurpose = String(body.purposeType || 'personal');
        patch.purposeType = allowedPurposes.includes(requestedPurpose) ? requestedPurpose : 'personal';
      }
      if (body.beneficiaryName !== undefined) patch.beneficiaryName = String(body.beneficiaryName || '').trim().slice(0, 100);
      if (body.beneficiaryRelation !== undefined) patch.beneficiaryRelation = String(body.beneficiaryRelation || '').trim().slice(0, 60);
      if (body.description !== undefined) patch.description = String(body.description || '').trim().slice(0, 500);
      if (body.rulesEnabled !== undefined) patch.rulesEnabled = body.rulesEnabled === true;
      if (body.rulesText !== undefined) patch.rulesText = body.rulesEnabled === false ? '' : String(body.rulesText || '').trim().slice(0, 1200);
      if (body.targetAmount !== undefined) {
        const rawTarget = body.targetAmount === null || String(body.targetAmount).trim() === '' ? null : Math.round(Number(body.targetAmount));
        if (current.type === 'goal') {
          if (!Number.isSafeInteger(rawTarget) || rawTarget <= 0 || rawTarget > 1_000_000_000) throw new Error('Montant cible invalide.');
          patch.targetAmount = rawTarget;
        } else if (rawTarget === null) {
          patch.targetAmount = FieldValue.delete();
        } else {
          if (!Number.isSafeInteger(rawTarget) || rawTarget <= 0 || rawTarget > 1_000_000_000) throw new Error('Montant cible invalide.');
          patch.targetAmount = rawTarget;
        }
      }
      if (body.frequencyDays !== undefined) patch.frequencyDays = Math.max(1, Math.min(365, Math.floor(Number(body.frequencyDays) || 7)));
      if (current.type === 'goal') {
        const effectiveTarget = body.targetAmount === undefined
          ? Math.max(0, Number(current.targetAmount) || 0)
          : Math.max(0, Math.round(Number(body.targetAmount)) || 0);
        patch.penaltyEnabled = true;
        patch.penaltyRate = GOAL_LATE_PENALTY_RATE;
        patch.penaltyAmount = Math.round(effectiveTarget * GOAL_LATE_PENALTY_RATE);
        patch.penaltyPolicyStartedOn = current.penaltyPolicyStartedOn || GOAL_PENALTY_EFFECTIVE_DATE;
      }
      if (body.pinned !== undefined) patch.pinned = body.pinned === true;
      const nextStart = String(body.startDate ?? current.startDate ?? '');
      const nextDeadline = String(body.deadline ?? current.deadline ?? '');
      const datesChanged = body.startDate !== undefined || body.deadline !== undefined;
      if (datesChanged && current.type === 'goal') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(nextStart) || !/^\d{4}-\d{2}-\d{2}$/.test(nextDeadline) || nextDeadline <= nextStart) throw new Error('Vérifie les dates de ton objectif.');
        if (!premium && new Date(`${nextDeadline}T12:00:00`) > addMonthsSafe(nextStart, 2)) throw new Error('Avec le compte gratuit, un objectif peut durer jusqu’à deux mois.');
        if (!premium) {
          const wanted = new Set(monthKeysBetween(nextStart, nextDeadline));
          const occupiedByOther = reservationsSnap.docs.some((document) => wanted.has(document.id) && document.data()?.goalId !== goalId);
          const legacyOverlap = goalsSnap.docs.some((document) => {
            if (document.id === goalId) return false;
            const item = document.data();
            if (item.type !== 'goal' || item.closed || item.withdrawnAt || !item.startDate || !item.deadline) return false;
            return monthKeysBetween(String(item.startDate), String(item.deadline)).some((month) => wanted.has(month));
          });
          if (occupiedByOther || legacyOverlap) throw new Error('Cette période chevauche déjà un autre objectif.');
          for (const reservation of reservationsSnap.docs) {
            if (reservation.data()?.goalId === goalId && !wanted.has(reservation.id)) transaction.delete(reservation.ref);
          }
          for (const month of wanted) {
            const reservation = reservationsSnap.docs.find((document) => document.id === month);
            if (!reservation) transaction.create(reservationsRef.doc(month), { goalId, month, createdAt: FieldValue.serverTimestamp() });
          }
        }
        patch.startDate = nextStart;
        patch.deadline = nextDeadline;
      }
      transaction.update(goalRef, patch);
      return { id: goalId };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) { return errorResponse(error.message || 'Impossible de modifier cet objectif.', 400); }
}

async function handleDeleteGoal(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const goalId = String(body.goalId || '').trim();
    if (!goalId) return errorResponse('Objectif introuvable.', 400);
    const userRef = adminDb.collection('users').doc(uid);
    const goalRef = userRef.collection('goals').doc(goalId);
    const depositsRef = goalRef.collection('deposits');
    await adminDb.runTransaction(async (transaction) => {
      const [goalSnap, depositsSnap] = await Promise.all([transaction.get(goalRef), transaction.get(depositsRef)]);
      if (!goalSnap.exists) throw new Error('Cette épargne n’existe plus.');
      const totalDeposited = depositsSnap.docs.reduce((sum, item) => sum + (Number(item.data().amount) || 0), 0);
      if (totalDeposited > 0) throw new Error('Cette épargne contient déjà de l’argent. Retire d’abord les fonds depuis sa fiche avant de la supprimer.');
      depositsSnap.docs.forEach((item) => transaction.delete(item.ref));
      transaction.delete(goalRef);
      // Les réservations mensuelles sont conservées : supprimer une épargne ne rend pas le quota gratuit.
    });
    return NextResponse.json({ success: true });
  } catch (error) { return errorResponse(error.message || 'Impossible de supprimer cette épargne.', 400); }
}

async function handleFundGoal(request) {
  try {
    const decoded = await authenticate(request);
    const body = await request.json();
    const goalId = String(body.goalId || '').trim();
    const amount = Math.round(Number(body.amount));
    if (!goalId || !Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000) return errorResponse('Montant invalide.', 400);

    const userRef = adminDb.collection('users').doc(decoded.uid);
    const goalRef = adminDb.collection('users').doc(decoded.uid).collection('goals').doc(goalId);

    await adminDb.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      const goalDoc = await t.get(goalRef);
      if (!userDoc.exists) throw new Error('Profil utilisateur introuvable.');
      if (!goalDoc.exists) throw new Error('Cette épargne n’existe plus.');
      const currentBalance = Math.max(0, Number(userDoc.data().balance) || 0);
      if (currentBalance < amount) throw new Error('Solde Pata insuffisant.');

      t.update(userRef, { balance: currentBalance - amount });
      t.set(goalRef.collection('deposits').doc(), {
        amount, date: getDoualaDateKey(), source: 'wallet', createdAt: FieldValue.serverTimestamp(),
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) { return errorResponse(error.message, 400); }
}

async function handleGoalBorrow(request) {
  try {
    const decoded = await authenticate(request);
    const body = await request.json();
    const { goalId, amount } = body;
    if (!goalId || !amount || amount <= 0) return errorResponse('Montant invalide.');

    const goalRef = adminDb.collection('users').doc(decoded.uid).collection('goals').doc(goalId);
    const interest = Math.round(amount * 0.05);
    const totalDebtToAdd = amount + interest;

    await adminDb.runTransaction(async (t) => {
      const goalDoc = await t.get(goalRef);
      if (!goalDoc.exists) throw new Error('Objectif introuvable.');
      const currentDebt = goalDoc.data().debtBalance || 0;
      t.set(goalRef.collection('deposits').doc(), {
        amount, date: getDoualaDateKey(), source: 'loan', createdAt: FieldValue.serverTimestamp(),
      });
      t.update(goalRef, { debtBalance: currentDebt + totalDebtToAdd });
    });
    return NextResponse.json({ success: true, borrowed: amount, interest, totalDebt: totalDebtToAdd });
  } catch (error) { return errorResponse(error.message, 400); }
}

async function handleRepayLoan(request) {
  try {
    const decoded = await authenticate(request);
    const body = await request.json();
    const { goalId, amount } = body;
    if (!goalId || !amount || amount <= 0) return errorResponse('Montant invalide.');

    const userRef = adminDb.collection('users').doc(decoded.uid);
    const goalRef = adminDb.collection('users').doc(decoded.uid).collection('goals').doc(goalId);

    await adminDb.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      const goalDoc = await t.get(goalRef);
      if (userDoc.data().balance < amount) throw new Error('Solde insuffisant pour rembourser.');
      const currentDebt = goalDoc.data().debtBalance || 0;
      t.update(userRef, { balance: userDoc.data().balance - amount });
      t.update(goalRef, { debtBalance: Math.max(0, currentDebt - amount) });
    });
    return NextResponse.json({ success: true });
  } catch (error) { return errorResponse(error.message, 400); }
}

async function handleGoalWithdraw(request) {
  try {
    const decoded = await authenticate(request);
    const body = await request.json();
    const goalRef = adminDb.collection('users').doc(decoded.uid).collection('goals').doc(body.goalId);
    const userRef = adminDb.collection('users').doc(decoded.uid);

    const result = await adminDb.runTransaction(async (t) => {
      const goalDoc = await t.get(goalRef);
      const depositsSnap = await t.get(goalRef.collection('deposits'));
      if (!goalDoc.exists) throw new Error('Cette épargne n’existe plus.');
      const goalData = goalDoc.data() || {};
      const deposits = depositsSnap.docs.map((document) => document.data() || {});
      const totalDeposited = deposits.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      const debt = Number(goalData.debtBalance) || 0;
      const latePenalty = goalData.type === 'piggybank' ? 0 : (computeGoalPlan(goalData, deposits)?.penalty || 0);
      const netRefund = Math.max(0, totalDeposited - debt - latePenalty);

      if (netRefund > 0) {
        const userDoc = await t.get(userRef);
        t.update(userRef, { balance: (userDoc.data().balance || 0) + netRefund });
      }
      t.delete(goalRef);
      depositsSnap.docs.forEach(d => t.delete(d.ref));
      return { totalDeposited, debt, latePenalty, netRefund };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) { return errorResponse(error.message, 500); }
}

async function handleGoalCancel(request) {
  try {
    const decoded = await authenticate(request);
    const body = await request.json();
    const goalRef = adminDb.collection('users').doc(decoded.uid).collection('goals').doc(body.goalId);
    const userRef = adminDb.collection('users').doc(decoded.uid);

    const result = await adminDb.runTransaction(async (t) => {
      const goalDoc = await t.get(goalRef);
      const depositsSnap = await t.get(goalRef.collection('deposits'));
      if (!goalDoc.exists) throw new Error('Cette épargne n’existe plus.');
      const goalData = goalDoc.data() || {};
      const deposits = depositsSnap.docs.map((document) => document.data() || {});
      const totalDeposited = deposits.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      const debt = Number(goalData.debtBalance) || 0;
      const latePenalty = goalData.type === 'piggybank' ? 0 : (computeGoalPlan(goalData, deposits)?.penalty || 0);
      const cancelPenalty = goalData.type === 'piggybank' ? 0 : Math.round(totalDeposited * 0.10);
      const netRefund = Math.max(0, totalDeposited - debt - latePenalty - cancelPenalty);

      if (netRefund > 0) {
        const userDoc = await t.get(userRef);
        t.update(userRef, { balance: (userDoc.data().balance || 0) + netRefund });
      }
      t.delete(goalRef);
      depositsSnap.docs.forEach(d => t.delete(d.ref));
      return { totalDeposited, debt, latePenalty, cancelPenalty, netRefund };
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) { return errorResponse(error.message, 500); }
}

async function handleAutomationsRun(request) {
  try {
    const decoded = await authenticate(request);
    const result = await runAutomationForUser(decoded.uid);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[API] Automation run error:', error.message);
    return errorResponse(error.message || 'Erreur lors de l’exécution des automatisations.', 500);
  }
}

async function handleAutomationsScheduler(request) {
  try {
    const expectedSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization') || '';
    const suppliedSecret = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : request.headers.get('x-cron-secret');
    if (!expectedSecret || suppliedSecret !== expectedSecret) {
      return errorResponse('Accès au planificateur refusé.', 401);
    }

    const usersSnapshot = await adminDb.collection('users').get();
    let executed = 0;
    let skipped = 0;
    let completed = 0;
    let weeklyReportsGenerated = 0;
    const batchSize = 5;
    for (let offset = 0; offset < usersSnapshot.docs.length; offset += batchSize) {
      const batch = usersSnapshot.docs.slice(offset, offset + batchSize);
      const results = await Promise.all(batch.map(async (userDoc) => {
        const userResult = { executed: 0, skipped: 0, completed: 0, weeklyReportsGenerated: 0 };
        try {
          const automationResult = await runAutomationForUser(userDoc.id);
          userResult.executed += automationResult.executed;
          userResult.skipped += automationResult.skipped;
          userResult.completed += automationResult.completed;
          try {
            const weeklyReport = await generateWeeklyReportForUser(userDoc.id);
            if (weeklyReport.generated) {
              userResult.weeklyReportsGenerated += 1;
              const profileData = userDoc.data() || {};
              const pushTokens = profileData.notificationsEnabled && Array.isArray(profileData.pushTokens)
                ? [...new Set(profileData.pushTokens.filter((token) => typeof token === 'string' && token.length > 20))]
                : [];
              if (profileData.notificationsEnabled) {
                const notificationId = `weekly-${weeklyReport.weekStart}`;
                const title = 'Ton bilan hebdomadaire est disponible';
                const body = 'Ton résumé de la semaine est prêt. Consulte tes revenus, tes dépenses et les tendances de ton budget dans Pata.';
                await userDoc.ref.collection('notifications').doc(notificationId).set({
                  title, body, target: '/reports', source: 'weekly_report',
                  weekStart: weeklyReport.weekStart, weekEnd: weeklyReport.weekEnd,
                  read: false, readAt: null, createdAt: FieldValue.serverTimestamp(),
                }, { merge: true });
                for (const token of pushTokens) {
                  try {
                    await adminMessaging.send({
                      token,
                      data: { title, body, url: '/reports', tag: notificationId },
                      webpush: { headers: { TTL: '604800' } },
                    });
                  } catch (pushError) {
                    console.warn('[WEEKLY REPORT PUSH]', userDoc.id, pushError.code || pushError.message);
                    if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(pushError.code)) {
                      await userDoc.ref.update({ pushTokens: FieldValue.arrayRemove(token) }).catch(() => {});
                    }
                  }
                }
              }
            }
          } catch (reportError) {
            console.error(`[CRON] Rapport hebdomadaire non généré pour ${userDoc.id}:`, reportError.message);
          }
        } catch (userError) {
          // Une donnée invalide chez un utilisateur ne doit pas bloquer les autres.
          userResult.skipped += 1;
          console.error(`[CRON] Automatisations ignorées pour ${userDoc.id}:`, userError.message);
        }
        return userResult;
      }));
      results.forEach((result) => {
        executed += result.executed;
        skipped += result.skipped;
        completed += result.completed;
        weeklyReportsGenerated += result.weeklyReportsGenerated;
      });
    }
    return NextResponse.json({ success: true, checkedUsers: usersSnapshot.size, executed, skipped, completed, weeklyReportsGenerated });
  } catch (error) {
    console.error('[API] Automation scheduler error:', error.message);
    return errorResponse('Échec du planificateur des automatisations.', 500);
  }
}

/* ═══════════════════ ROUTES IA ═══════════════════ */

async function reserveDailyAIQuota(uid) {
  const userRef = adminDb.collection('users').doc(uid);
  return adminDb.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new Error('Utilisateur introuvable.');
    const userData = userSnap.data();
    if (isPremiumAccount(userData)) return { allowed: true, isPremium: true, reserved: false };

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    let stats = userData.dailyStats || {};
    if (stats.lastResetDate !== today) stats = { aiCount: 0, lastResetDate: today };
    const count = Number(stats.aiCount) || 0;
    if (count >= PLAN_LIMITS.FREE.dailyAI) {
      return { allowed: false, remaining: 0, limit: PLAN_LIMITS.FREE.dailyAI, isPremium: false, reserved: false };
    }
    transaction.update(userRef, {
      dailyStats: { aiCount: count + 1, lastResetDate: today },
    });
    return { allowed: true, remaining: PLAN_LIMITS.FREE.dailyAI - count - 1, isPremium: false, reserved: true, date: today };
  });
}

async function releaseDailyAIQuota(uid, reservedDate) {
  if (!reservedDate) return;
  const userRef = adminDb.collection('users').doc(uid);
  await adminDb.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) return;
    const stats = userSnap.data().dailyStats || {};
    if (stats.lastResetDate !== reservedDate) return;
    transaction.update(userRef, {
      dailyStats: { ...stats, aiCount: Math.max(0, (Number(stats.aiCount) || 0) - 1) },
    });
  });
}

function isPremiumAccount(data = {}) {
  const value = data.premiumUntil;
  const expiry = value?.toDate ? value.toDate() : new Date(value || 0);
  return Number.isFinite(expiry.getTime()) && expiry > new Date();
}

async function handleAIChat(request) {
  let reservedQuota = null;
  let uid = null;
  let hasSuccessfulToolExecution = false;
  try {
    const decoded = await authenticate(request);
    uid = decoded.uid;
    const body = await request.json();
    const mode = body.mode === 'audio' ? 'audio' : 'text';
    const incomingMessages = Array.isArray(body.messages) ? body.messages : [];
    if (!incomingMessages.length) return errorResponse('Messages requis.', 400);

    const history = incomingMessages.slice(-24).map((message) => {
      const content = String(message.content || '');
      // Le bouton des documents juridiques transmet le texte complet à résumer.
      // Les messages normaux conservent leur limite courte pour maîtriser le contexte.
      const contentLimit = content.includes('CONTENU DU DOCUMENT :') ? 20000 : 1800;
      return {
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: content.slice(0, contentLimit),
      };
    }).filter((message) => message.content.trim());
    if (!history.length || history[history.length - 1].role !== 'user') {
      return errorResponse('Le dernier message utilisateur est manquant.', 400);
    }

    const quota = await reserveDailyAIQuota(uid);
    if (!quota.allowed) {
      return errorResponse("Tu as utilisé tes 3 utilisations gratuites de l’assistante aujourd’hui. Tu pourras recommencer demain ou découvrir Premium.", 403);
    }
    if (quota.reserved) reservedQuota = quota.date;

    const userRef = adminDb.collection('users').doc(uid);
    const [userDoc, incomesSnap, expensesSnap, goalsSnap, budgetsSnap, automationsSnap, memorySnap, categoriesSnap] = await Promise.all([
      userRef.get(),
      userRef.collection('incomes').orderBy('date', 'desc').limit(100).get(),
      userRef.collection('expenses').orderBy('date', 'desc').limit(200).get(),
      userRef.collection('goals').limit(20).get(),
      userRef.collection('budgets').limit(50).get(),
      userRef.collection('automations').limit(50).get(),
      userRef.collection('ai_memory').doc('profile').get(),
      userRef.collection('categories').limit(50).get(),
    ]);

    const goalsWithDeposits = await Promise.all(goalsSnap.docs.map(async (goalDoc) => {
      const depositsSnap = await goalDoc.ref.collection('deposits').get();
      return { id: goalDoc.id, ...goalDoc.data(), deposits: depositsSnap.docs.map((depositDoc) => depositDoc.data()) };
    }));

    const userData = {
      profile: userDoc.exists ? userDoc.data() : {},
      incomes: incomesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      expenses: expensesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      goals: goalsWithDeposits,
      budgets: budgetsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      automations: automationsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      memories: Array.isArray(memorySnap.data()?.facts) ? memorySnap.data().facts : [],
      categories: categoriesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      now: new Date(),
    };

    const userContext = buildUserContext(userData);
    const userName = userData.profile?.displayName?.split(' ')[0] || 'Utilisateur';
    const systemPrompt = `Tu es Mč, l’assistante financière de Pata. Tu échanges avec ${userName}. Tu es spécialiste du budget personnel, du suivi des revenus et dépenses, de l’épargne et des automatisations.

IDENTITÉ ET MISSION DE PATA
Pata est une application de gestion financière personnelle créée et détenue par NAPOPOLO EXAUCE. Sa mission est d’aider chacun à reprendre le contrôle de son argent : noter ses revenus et ses dépenses, comprendre où part son argent, préparer des budgets réalistes, suivre ses objectifs d’épargne, connaître le solde restant par source de revenu, gérer son portefeuille Pata, consulter ses rapports et programmer des opérations récurrentes. Pata ne consulte pas les comptes bancaires externes et ne garantit pas de rendement financier.

CONNAISSANCE ET ACCOMPAGNEMENT DE L’APPLICATION
Tu connais les rubriques disponibles : Tableau de bord, Portefeuille, Dépenses, Revenus (dont les Prévisions vitales), Budgets, Objectifs, Rapports, Premium et Paramètres. Quand on te demande comment faire quelque chose, explique le chemin exact avec les noms visibles dans l’application, dans l’ordre, avec des mots simples. Si l’utilisateur semble perdu, propose de le faire à sa place lorsque l’action est prise en charge et que les informations nécessaires sont disponibles. Sinon, donne un bouton vers la page concernée.
Les prévisions vitales servent à estimer les dépenses nécessaires sur une période; elles ne constituent pas un revenu réel tant que l’utilisateur ne demande pas explicitement de transformer son plan en revenu et budgets. La prévision de durée du capital estime combien de jours un montant peut tenir selon les dépenses quotidiennes, hebdomadaires et mensuelles déclarées. Le Portefeuille Pata est un solde interne destiné aux recharges et paiements pris en charge par Pata, pas un compte bancaire ni un Mobile Money.

GUIDE PRATIQUE DES RUBRIQUES
- Dépenses : ouvrir « Dépenses », choisir l’ajout, indiquer le montant, la catégorie, la date et, si souhaité, le revenu qui finance la dépense, puis enregistrer. Une dépense répartie sur plusieurs revenus peut apparaître en plusieurs lignes correspondant aux parts financées.
- Revenus : ouvrir « Revenus », ajouter le montant, le nom de la source et la date. Une entrée enregistrée ne peut plus être modifiée : elle peut uniquement être consultée ou supprimée. Pour enregistrer une nouvelle entrée ou un montant supplémentaire, il faut ajouter un nouveau revenu. La durée de consommation est estimée à partir des dépenses associées à cette source.
- Budgets : ouvrir « Budgets », choisir le mois et la source de revenu, puis toucher une catégorie pour voir les opérations, le montant prévu, le montant dépensé et le reste. Le bouton de modification permet de définir l’enveloppe; le bouton de conseil ouvre Mč avec les chiffres de cette catégorie.
- Prévisions vitales : ouvrir « Revenus », accéder aux « Prévisions vitales », définir les besoins par catégorie et leur fréquence. L’analyse avec Mč explique le résultat; la transformation en revenu et budgets ne doit se faire que sur demande explicite.
- Prévision de durée du capital : dans « Revenus », saisir le capital disponible et les dépenses prévues par jour, semaine ou mois. Pata estime la durée et la date de fin, puis peut envoyer ces chiffres à Mč pour une analyse complémentaire.
- Objectifs : ouvrir « Objectifs », créer un objectif avec son nom, sa somme cible et, lorsque nécessaire, sa date limite. Les versements et la progression sont consultables dans cette rubrique. Les objectifs datés comportent une pénalité obligatoire de 15 % du montant cible total par échéance manquée (pas 15 % du versement attendu). Elle est calculée pour les échéances manquées à partir du 8 novembre 2026 et déduite du montant remboursé lors du retrait ou de la clôture. Une annulation anticipée d’un objectif daté entraîne aussi des frais distincts de 10 % du montant épargné. Les tirelires libres ne sont soumises ni aux frais de retard ni aux frais d’annulation. Ne présente jamais cette règle comme optionnelle ou modifiable dans les paramètres.
- Rapports : ouvrir « Rapports », choisir jour, semaine, mois, année ou dates personnalisées, puis consulter les revenus, dépenses, catégories, budgets, objectifs et portefeuille. Les boutons PDF et Excel servent à exporter le rapport.
- Portefeuille : ouvrir « Portefeuille », saisir le montant à recharger et le numéro Mobile Money, puis suivre la confirmation. Le dernier numéro utilisé est conservé dans le profil pour le retrouver sur un autre appareil.
- Premium : ouvrir « Premium », choisir la durée, vérifier le solde affiché et confirmer le paiement depuis le portefeuille. Le prix affiché est de 2 500 FCFA pour 30 jours; l’accès n’est prolongé qu’après confirmation.
- Paramètres : modifier le nom et la devise d’affichage, exporter les données et activer ou désactiver les notifications. Les montants de référence restent stockés en XAF et sont convertis à l’écran.
- Assistante : l’utilisateur peut décrire naturellement une opération à Mč. « @Audio » demande une réponse vocale, « @Image » demande une image et « @Vision » sert à analyser une image jointe.
Ne prétends jamais qu’un bouton, un écran ou un réglage existe s’il n’est pas indiqué ici ou visible dans le contexte de l’application. Si une étape semble différente sur l’appareil de l’utilisateur, demande-lui ce qu’il voit plutôt que d’inventer.

LANGAGE ET PRÉSENTATION
Parle comme une personne qui accompagne un utilisateur, pas comme un développeur. N’affiche JAMAIS les noms techniques des actions, outils, fonctions, collections, identifiants internes ou termes comme apply_budget_plan, add_expense, API, Firestore, tool call ou JSON. Remplace-les par « enregistrer une dépense », « préparer un budget », « créer un objectif », « mettre en pause une opération programmée », etc. Explique tout terme financier inhabituel. Utilise des phrases courtes, des titres simples et, lorsque cela améliore la compréhension, de vrais tableaux Markdown avec en-têtes et lignes. Ne produis pas de tableau si trois lignes simples suffisent.

RÉSUMÉ ET CONSEIL AVANT LES DÉTAILS
Quand l’utilisateur demande un bilan, une analyse, une comparaison, un calcul de dépenses, de revenus, de budget ou d’épargne, commence TOUJOURS par un bref paragraphe de 1 à 2 phrases qui débute exactement par « **En bref —** ». Ce résumé doit donner immédiatement le résultat principal, le montant clé et ce que cela signifie concrètement, sans préambule.
Après ce résumé seulement, donne les détails utiles : chiffres, explications ou un tableau compact lorsque cela apporte une vraie valeur. N’empile pas les tableaux, ne répète pas les mêmes montants et ne transforme pas chaque réponse en rapport long. Pour une analyse courante, un seul tableau maximum suffit, sauf demande explicite de détail.
Parle naturellement à l’utilisateur. Ajoute un conseil concret, proportionné aux chiffres et à sa situation, quand cela peut l’aider. Termine par une proposition d’aide directement liée au résultat, sous forme d’une seule question courte. Si l’utilisateur pose une question simple ou demande une action, réponds directement sans fabriquer un rapport ni ajouter un résumé artificiel.

RÈGLES NON NÉGOCIABLES
- Ne propose jamais de modifier un revenu déjà enregistré : Pata permet seulement d’ajouter un autre revenu ou de supprimer l’entrée existante.
- Pour les objectifs datés, la pénalité de retard est obligatoire : 15 % du montant cible total par échéance manquée depuis le 8 novembre 2026. Elle n’est pas un pourcentage du versement attendu, et ne s’applique pas aux tirelires libres.
1. Réponds toujours en français, directement, avec des explications concrètes et des calculs exacts. Ne salue pas à chaque message.
2. Le dernier message s’inscrit dans une conversation : conserve les corrections, les précisions, les noms et les décisions des messages précédents. Une correction remplace l’information erronée; ne traite pas une correction comme une nouvelle opération.
3. N’invente jamais de montant, date, revenu, catégorie, source, identifiant ou opération déjà faite. Utilise uniquement les informations fournies et les données Pata ci-dessous.
4. Quand une information indispensable manque ou que plusieurs sources correspondent, pose une seule question claire. Ne lance aucun outil tant que tu n’as pas les champs nécessaires.
5. Distingue une intention d’enregistrement d’une simple question, d’un exemple, d’une simulation ou d’un conseil. N’enregistre que lorsque l’utilisateur le demande clairement.
6. Pour ajouter une dépense, utilise add_expense. Si la personne nomme une source (ex. « mon salaire », « le revenu TRIXHUB »), associe-la à l’ID exact de cette source. Ne mets JAMAIS le nom de la source uniquement dans la note. Si aucune source n’est précisée, utilise « all » pour répartir les fonds disponibles.
7. Les soldes disponibles par revenu sont calculés en soustrayant les dépenses déjà associées à cet ID. Si le montant demandé dépasse le solde disponible de cette source (ou de toutes les sources), l’opération sera refusée. N’annonce jamais une réussite avant d’avoir reçu le résultat de l’outil.
8. Pour établir un budget, tu dois uniquement créer ou actualiser les enveloppes demandées. Un budget n’est jamais un revenu : ne crée un revenu que si la personne demande séparément de l’enregistrer.
9. Pour créer une dépense récurrente, demande une précision si la fréquence, le montant ou la source explicitement voulue est ambiguë. Explique simplement que les opérations programmées peuvent continuer à fonctionner même lorsque l’utilisateur ne consulte pas l’application. Ne révèle pas les réglages internes nécessaires à ce fonctionnement.
10. Les actions de modification, suppression ou mise en pause ne concernent que des identifiants exacts présents dans les données. Si la cible n’est pas certaine, demande laquelle. Les suppressions doivent être explicitement demandées.
11. Tu peux mémoriser les objectifs, préférences, limites et corrections financières explicitement déclarés avec remember_user_context. La citation doit être copiée exactement depuis un message de l’utilisateur. Ne mémorise jamais une déduction ou une information incertaine.
12. Après chaque outil, base ta réponse sur son résultat réel. Distingue clairement réussite, refus, dépense répartie sur plusieurs revenus et automatisation mise en pause.
13. Ne prétends pas consulter un compte bancaire, un portefeuille externe ou une donnée qui n’existe pas dans Pata. Le solde calculé est uniquement celui des enregistrements Pata.
14. Si l’utilisateur corrige un montant ou un libellé avant l’exécution, utilise la dernière correction uniquement et ne crée pas deux opérations.
15. À la fin de chaque réponse, propose une seule suite utile, directement liée à la demande, sous forme d’une question simple. Ne propose pas une action que Pata ne sait pas réellement faire.
16. Pour expliquer une fonction, guide l’utilisateur étape par étape avec les libellés visibles. Tu peux proposer un bouton pour ouvrir Dépenses (/expenses), Revenus (/income), Budgets (/budgets), Objectifs (/goals), Portefeuille (/wallet), Rapports (/reports), Premium (/premium) ou Paramètres (/settings).
17. Explique les catégories avec leurs noms courants, les montants dans la devise d’affichage lorsqu’elle est connue, et les calculs sans vocabulaire technique. Ne dis jamais « identifiant », « quota », « collection », « transaction serveur » ou le nom d’une fonction interne à un utilisateur ordinaire; dis simplement ce qui se passe et ce qu’il doit faire.
18. Pour un abonnement Premium, commence par vérifier son statut et son solde. S’il demande explicitement de s’abonner et que le solde suffit, propose/execute le paiement uniquement avec son accord clair. Si le solde est insuffisant, explique la somme manquante et propose le Portefeuille. Ne prétends jamais qu’un paiement est confirmé avant le résultat réel.
19. Si une action indique qu’elle dépasserait un budget et demande une confirmation, n’affirme pas qu’elle est enregistrée. Explique le budget concerné, le montant prévu et le dépassement avec des mots simples, puis demande clairement si l’utilisateur souhaite continuer. Ne confirme l’action qu’après son accord explicite.
20. Ne révèle jamais aux utilisateurs les détails réservés à l’équipe (fournisseurs, clés, planificateurs, quotas internes, base de données, services de notification ou architecture). Explique uniquement le résultat utile et les étapes visibles dans l’application.
19. Pour les questions « comment faire », donne d’abord les étapes visibles dans l’application; si l’utilisateur préfère, fais l’action toi-même lorsque les outils disponibles le permettent.
20. Quand une opération est prise en charge et que les informations sont suffisantes, propose de la faire pour l’utilisateur; n’effectue pas d’action financière sans demande claire.
21. Propose une seule suite utile à la fin, en lien direct avec la conversation. Si une image ou une réponse vocale serait réellement utile, indique simplement qu’il peut utiliser @Image ou @Audio.

DONNÉES FINANCIÈRES ACTUELLES
${userContext}`;

    const modelMessages = [
      { role: 'system', content: systemPrompt },
      ...history,
    ];
    const userMessages = history.filter((message) => message.role === 'user').map((message) => message.content);
    const toolResults = [];
    let reply = '';
    let quickActions = [];
    let requiresFinalPass = false;

    for (let round = 0; round < 4; round += 1) {
      let completion;
      try {
        completion = await completeWithGroq(modelMessages, {
          maxTokens: 1400,
          temperature: 0.15,
          tools: AI_TOOLS,
          timeoutMs: 45000,
        });
      } catch (completionError) {
        if (hasSuccessfulToolExecution) {
          const successful = [...toolResults].reverse().find((item) => item.success);
          reply = successful?.result?.message || 'L’opération a été enregistrée dans Pata. Le service de réponse a rencontré une erreur, mais l’enregistrement est confirmé.';
          break;
        }
        throw completionError;
      }
      const assistantMessage = completion.message;
      const calls = Array.isArray(assistantMessage.tool_calls) ? assistantMessage.tool_calls : [];
      if (!calls.length) {
        reply = String(assistantMessage.content || '').trim();
        break;
      }

      modelMessages.push({
        role: 'assistant',
        content: assistantMessage.content || null,
        tool_calls: calls,
      });
      for (const [callIndex, call] of calls.entries()) {
        const toolName = call.function?.name;
        let result;
        try {
          const requestId = String(body.clientRequestId || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
          result = await executeAITool(uid, toolName, call.function?.arguments || '{}', userMessages, {
            idempotencyKey: requestId ? `${requestId}_${round}_${callIndex}_${toolName}` : null,
          });
          const actionSucceeded = result?.confirmationRequired !== true && result?.success !== false;
          if (actionSucceeded) hasSuccessfulToolExecution = true;
          toolResults.push({ tool: toolName, success: actionSucceeded, result });
        } catch (toolError) {
          result = { success: false, error: toolError.message || 'Action impossible.' };
          toolResults.push({ tool: toolName, success: false, result });
        }
        modelMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: toolName,
          content: JSON.stringify(result),
        });
      }
      requiresFinalPass = round === 3;
    }

    if (toolResults.some((item) => item.tool === 'activate_premium_from_balance' && item.success)) {
      quickActions.push({ label: 'Voir mon abonnement', href: '/premium' });
    } else if (toolResults.some((item) => item.tool === 'activate_premium_from_balance' && !item.success)) {
      quickActions.push({ label: 'Recharger mon portefeuille', href: '/wallet' });
    }
    if (toolResults.some((item) => item.tool === 'get_subscription_status')) quickActions.push({ label: 'Gérer Premium', href: '/premium' });

    const lastUserText = String(history[history.length - 1]?.content || '').toLowerCase();
    const navigationActions = [
      { pattern: /dépense|depense|achat|payer|enregistr.*sortie/, label: 'Ouvrir Dépenses', href: '/expenses' },
      { pattern: /revenu|salaire|source d'argent|prévision vitale|prevision vitale/, label: 'Ouvrir Revenus', href: '/income' },
      { pattern: /budget|enveloppe|catégorie.*dépass|categorie.*depass/, label: 'Voir mes Budgets', href: '/budgets' },
      { pattern: /objectif|épargne|epargne|tirelire/, label: 'Voir mes Objectifs', href: '/goals' },
      { pattern: /portefeuille|recharg|solde pata|mobile money/, label: 'Ouvrir le Portefeuille', href: '/wallet' },
      { pattern: /rapport|bilan|comparaison.*période|comparaison.*periode/, label: 'Consulter les Rapports', href: '/reports' },
      { pattern: /premium|abonnement|renouvel/, label: 'Gérer Premium', href: '/premium' },
      { pattern: /devise|paramètre|parametre|notification/, label: 'Ouvrir les Paramètres', href: '/settings' },
    ];
    const contextualAction = navigationActions.find((item) => item.pattern.test(lastUserText));
    if (contextualAction && !quickActions.some((item) => item.href === contextualAction.href)) quickActions.push({ label: contextualAction.label, href: contextualAction.href });
    quickActions = quickActions.slice(0, 3);

    if (!reply && requiresFinalPass) {
      try {
        const finalCompletion = await completeWithGroq(modelMessages, {
          maxTokens: 1200, temperature: 0.15, timeoutMs: 45000,
        });
        reply = String(finalCompletion.message.content || '').trim();
      } catch (finalError) {
        const successful = [...toolResults].reverse().find((item) => item.success);
        reply = successful?.result?.message || 'Le traitement est terminé. Consulte les données enregistrées dans Pata pour le détail.';
      }
    }
    if (!reply) {
      const lastResult = toolResults[toolResults.length - 1]?.result;
      reply = lastResult?.message || lastResult?.error || 'J’ai terminé le traitement, mais je n’ai pas pu générer le récapitulatif. Consulte les données enregistrées dans Pata.';
    }

    if (mode === 'audio') {
      try {
        const audioBase64 = await generateAudioWithGemini(reply);
        return NextResponse.json({ success: true, audio: audioBase64, isAudio: true, textReply: reply, reply, toolResults, quickActions, quota: { remaining: quota.remaining, isPremium: quota.isPremium } });
      } catch (ttsError) {
        return NextResponse.json({ success: true, reply, audioError: 'Impossible de générer l’audio.', toolResults, quickActions, quota: { remaining: quota.remaining, isPremium: quota.isPremium } });
      }
    }

    return NextResponse.json({ success: true, reply, toolResults, quickActions, quota: { remaining: quota.remaining, isPremium: quota.isPremium } });
  } catch (error) {
    if (uid && reservedQuota && !hasSuccessfulToolExecution) {
      try { await releaseDailyAIQuota(uid, reservedQuota); } catch (quotaError) {
        console.error('[API] Impossible de restituer le quota IA:', quotaError.message);
      }
    }
    console.error('[API] AI chat error:', error.message);
    return errorResponse(error.message || 'Erreur de l’assistante.', 500);
  }
}

async function handleAIImage(request) {
  let uid = null;
  let reservedDate = null;
  try {
    const decoded = await authenticate(request);
    uid = decoded.uid;
    const body = await request.json();
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return errorResponse('Prompt manquant.', 400);

    const quota = await reserveDailyAIQuota(uid);
    if (!quota.allowed) return errorResponse(`Tu as utilisé tes 3 utilisations gratuites de l’assistante aujourd’hui. Tu pourras recommencer demain ou découvrir Premium.`, 403);
    if (quota.reserved) reservedDate = quota.date;

    const imageUrl = await generateImageWithPollinations(prompt);
    return NextResponse.json({ success: true, imageUrl, isImage: true });
  } catch (error) {
    if (uid && reservedDate) {
      try { await releaseDailyAIQuota(uid, reservedDate); } catch (quotaError) {
        console.error('[API] Impossible de restituer le quota image:', quotaError.message);
      }
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

async function handleAIVision(request) {
  let uid = null;
  let reservedDate = null;
  try {
    const decoded = await authenticate(request);
    uid = decoded.uid;
    const body = await request.json();
    const { messages, imageBase64 } = body;
    if (!imageBase64) return errorResponse('Image manquante.', 400);

    const quota = await reserveDailyAIQuota(uid);
    if (!quota.allowed) return errorResponse(`Tu as utilisé tes 3 utilisations gratuites de l’assistante aujourd’hui. Tu pourras recommencer demain ou découvrir Premium.`, 403);
    if (quota.reserved) reservedDate = quota.date;

    const reply = await chatWithGroqVision(messages || [], imageBase64);
    return NextResponse.json({ success: true, reply });
  } catch (error) {
    if (uid && reservedDate) {
      try { await releaseDailyAIQuota(uid, reservedDate); } catch (quotaError) {
        console.error('[API] Impossible de restituer le quota vision:', quotaError.message);
      }
    }
    return errorResponse(error.message || 'Erreur d’analyse d’image.', 500);
  }
}

/* ═══════════════════ ACTIVITÉ DU COMPTE & STATISTIQUES ═══════════════════ */

async function handleProfileActivity(request) {
  try {
    const decoded = await authenticate(request);
    const userRef = adminDb.collection('users').doc(decoded.uid);
    const profileSnap = await userRef.get();
    // Do not create a skeletal profile here: the registration flow initializes
    // the profile and triggers the one-time welcome email.
    if (!profileSnap.exists) return NextResponse.json({ success: true, profilePending: true });
    await userRef.set({ lastSeenAt: FieldValue.serverTimestamp(), email: decoded.email || profileSnap.data()?.email || null }, { merge: true });
    return NextResponse.json({ success: true });
  } catch (error) { return errorResponse(error.message || 'Impossible de mettre à jour le profil.', 401); }
}

async function handleIncomeAnalyticsEvent(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const incomeId = String(body.incomeId || '').slice(0, 150);
    if (!incomeId || incomeId.includes('/')) return errorResponse('Revenu invalide.', 400);
    const userRef = adminDb.collection('users').doc(uid);
    const incomeRef = userRef.collection('incomes').doc(incomeId);
    const markerRef = userRef.collection('analyticsEvents').doc(`income_${incomeId}`);
    await adminDb.runTransaction(async (transaction) => {
      const [incomeSnap, markerSnap] = await Promise.all([transaction.get(incomeRef), transaction.get(markerRef)]);
      if (!incomeSnap.exists) throw new Error('Revenu introuvable.');
      if (markerSnap.exists) return;
      const amount = Math.max(0, Number(incomeSnap.data().amount) || 0);
      transaction.set(markerRef, { type: 'income_created', amount, createdAt: FieldValue.serverTimestamp() });
      transaction.set(userRef, { lifetimeIncomeAmount: FieldValue.increment(amount), lifetimeIncomeCount: FieldValue.increment(1) }, { merge: true });
    });
    return NextResponse.json({ success: true });
  } catch (error) { return errorResponse(error.message || 'Statistique indisponible.', 400); }
}

/* ═══════════════════ ADMINISTRATION SÉCURISÉE ═══════════════════ */

function safeStringEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function createAdminSession(uid, expiresAt) {
  const secret = process.env.CODE_ADMIN;
  const payload = `${uid}:${expiresAt}`;
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}:${signature}`;
}

function verifyAdminSession(request, uid) {
  const secret = process.env.CODE_ADMIN;
  if (!secret) return false;
  const cookies = String(request.headers.get('cookie') || '').split(';').map((part) => part.trim());
  const raw = cookies.find((part) => part.startsWith('pata_admin_session='))?.slice('pata_admin_session='.length);
  if (!raw) return false;
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch { return false; }
  const parts = decoded.split(':');
  if (parts.length !== 3) return false;
  const [sessionUid, expiresText, signature] = parts;
  const expiresAt = Number(expiresText);
  if (sessionUid !== uid || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  const expected = createHmac('sha256', secret).update(`${sessionUid}:${expiresAt}`).digest('base64url');
  return safeStringEqual(signature, expected);
}

async function requireAdmin(request) {
  const decoded = await authenticate(request);
  if (!verifyAdminSession(request, decoded.uid)) throw new Error('Session administrateur expirée. Entre de nouveau ton code.');
  return decoded;
}

async function handleAdminUnlock(request) {
  try {
    const decoded = await authenticate(request);
    const configuredCode = String(process.env.CODE_ADMIN || '');
    if (configuredCode.length < 16) return errorResponse('La protection administrateur doit contenir au moins 16 caractères.', 503);
    const body = await request.json();
    const supplied = String(body.code || '');
    const ip = String(request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim().slice(0, 100);
    const attemptId = createHash('sha256').update(ip).digest('hex');
    const attemptRef = adminDb.collection('adminLoginAttempts').doc(attemptId);
    const attemptSnap = await attemptRef.get();
    const attemptData = attemptSnap.exists ? attemptSnap.data() : {};
    const lockedUntil = attemptData.lockedUntil?.toDate ? attemptData.lockedUntil.toDate().getTime() : (typeof attemptData.lockedUntil === 'string' ? new Date(attemptData.lockedUntil).getTime() : Number(attemptData.lockedUntil || 0));
    if (lockedUntil > Date.now()) return errorResponse('Trop de tentatives. Réessaie dans quelques minutes.', 429);

    if (!safeStringEqual(supplied, configuredCode)) {
      await adminDb.runTransaction(async (transaction) => {
        const fresh = await transaction.get(attemptRef);
        const current = fresh.exists ? fresh.data() : {};
        const count = (Number(current.count) || 0) + 1;
        transaction.set(attemptRef, {
          count: count >= 5 ? 0 : count,
          lockedUntil: count >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      return errorResponse('Code administrateur incorrect.', 401);
    }

    await attemptRef.delete().catch(() => {});
    const expiresAt = Date.now() + 4 * 60 * 60 * 1000;
    const response = NextResponse.json({ success: true, expiresAt });
    response.cookies.set('pata_admin_session', createAdminSession(decoded.uid, expiresAt), {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
      path: '/', maxAge: 4 * 60 * 60,
    });
    return response;
  } catch (error) { return errorResponse(error.message || 'Accès refusé.', 401); }
}

async function handleAdminLogout(request) {
  try {
    await requireAdmin(request);
    const response = NextResponse.json({ success: true });
    response.cookies.set('pata_admin_session', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0 });
    return response;
  } catch (error) { return errorResponse(error.message, 401); }
}

function safeAdminUser(doc) {
  const data = { ...doc.data() };
  delete data.pushTokens; delete data.monthlyStats; delete data.dailyStats; delete data.password;
  return { id: doc.id, ...serializeAdminValue(data) };
}

function serializeAdminValue(value) {
  if (value?.toDate && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeAdminValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serializeAdminValue(child)]));
  return value;
}

async function aggregateTotal(query, field = 'amount') {
  try {
    const snapshot = await query.aggregate({ count: AggregateField.count(), total: AggregateField.sum(field) }).get();
    return { count: Number(snapshot.data().count) || 0, total: Number(snapshot.data().total) || 0 };
  } catch (error) {
    console.warn('[ADMIN AGGREGATE]', error.message);
    return { count: 0, total: 0, unavailable: true };
  }
}


async function getGoalCashDepositSummary(goalRef) {
  const depositsRef = goalRef.collection('deposits');
  try {
    const [allSnapshot, loanSnapshot] = await Promise.all([
      depositsRef.aggregate({
        total: AggregateField.sum('amount'),
        count: AggregateField.count(),
      }).get(),
      depositsRef.where('source', '==', 'loan').aggregate({
        total: AggregateField.sum('amount'),
        count: AggregateField.count(),
      }).get(),
    ]);
    const all = allSnapshot.data() || {};
    const loans = loanSnapshot.data() || {};
    const total = Math.max(0, Number(all.total) || 0);
    const count = Math.max(0, Number(all.count) || 0);
    const borrowedTotal = Math.min(total, Math.max(0, Number(loans.total) || 0));
    const borrowedCount = Math.min(count, Math.max(0, Number(loans.count) || 0));
    return {
      total, count, borrowedTotal, borrowedCount,
      cashTotal: Math.max(0, total - borrowedTotal),
      cashCount: Math.max(0, count - borrowedCount),
      unavailable: false,
    };
  } catch (aggregateError) {
    // Repli sur les documents : inclut les anciens dépôts sans champ « source ».
    try {
      const snapshot = await depositsRef.get();
      let total = 0;
      let borrowedTotal = 0;
      let borrowedCount = 0;
      let cashCount = 0;
      snapshot.docs.forEach((document) => {
        const item = document.data() || {};
        const value = Number(item.amount);
        const amount = Number.isFinite(value) && value > 0 ? value : 0;
        total += amount;
        if (item.source === 'loan') {
          borrowedTotal += amount;
          borrowedCount += 1;
        } else {
          cashCount += 1;
        }
      });
      return {
        total, count: snapshot.size, borrowedTotal, borrowedCount,
        cashTotal: Math.max(0, total - borrowedTotal), cashCount,
        unavailable: false,
      };
    } catch (readError) {
      console.error('[ADMIN SAVINGS READ]', goalRef.path, aggregateError.message, readError.message);
      return {
        total: null, count: null, borrowedTotal: null, borrowedCount: null,
        cashTotal: null, cashCount: null, unavailable: true,
      };
    }
  }
}

async function calculateAdminSavingsOverview() {
  try {
    const snapshot = await adminDb.collectionGroup('goals').get();
    const goals = snapshot.docs.map((document) => ({ ref: document.ref, data: document.data() }));
    const activeGoals = goals.filter(({ data }) => !data.closed && !data.withdrawnAt);
    const categoryBreakdown = new Map();
    const typeBreakdown = new Map();
    let totalProtectedSavings = 0;
    let cashSavings = 0;
    let borrowedSavings = 0;
    let activeDepositCount = 0;
    let unavailable = false;

    for (let offset = 0; offset < activeGoals.length; offset += 10) {
      const group = activeGoals.slice(offset, offset + 10);
      const amounts = await Promise.all(group.map(({ ref }) => getGoalCashDepositSummary(ref)));
      group.forEach(({ data }, index) => {
        const amount = amounts[index];
        if (amount.unavailable) {
          unavailable = true;
          return;
        }
        totalProtectedSavings += amount.total;
        cashSavings += amount.cashTotal;
        borrowedSavings += amount.borrowedTotal;
        activeDepositCount += amount.count;
        const category = String(data.categoryId || 'other');
        const type = String(data.type || 'goal');
        categoryBreakdown.set(category, (categoryBreakdown.get(category) || 0) + amount.total);
        typeBreakdown.set(type, (typeBreakdown.get(type) || 0) + amount.total);
      });
    }

    return {
      totalGoals: goals.length,
      activeGoals: activeGoals.length,
      closedGoals: goals.length - activeGoals.length,
      totalProtectedSavings: unavailable ? null : totalProtectedSavings,
      cashSavings: unavailable ? null : cashSavings,
      borrowedSavings: unavailable ? null : borrowedSavings,
      activeDepositCount: unavailable ? null : activeDepositCount,
      byCategory: unavailable ? [] : [...categoryBreakdown.entries()]
        .map(([categoryId, amount]) => ({ categoryId, amount }))
        .sort((a, b) => b.amount - a.amount),
      byType: unavailable ? [] : [...typeBreakdown.entries()]
        .map(([type, amount]) => ({ type, amount }))
        .sort((a, b) => b.amount - a.amount),
      unavailable,
    };
  } catch (error) {
    console.error('[ADMIN SAVINGS OVERVIEW]', error.message);
    return {
      totalGoals: 0, activeGoals: 0, closedGoals: 0,
      totalProtectedSavings: null, cashSavings: null, borrowedSavings: null,
      activeDepositCount: null, byCategory: [], byType: [], unavailable: true,
    };
  }
}

async function handleAdminOverview(request) {
  try {
    await requireAdmin(request);
    const nowIso = new Date().toISOString();
    const users = adminDb.collection('users');
    const withdrawals = adminDb.collection('withdrawalRequests');
    const [userTotals, premiumCount, deposits, subscriptions, paidPayouts, pendingPayouts, latestUsers, latestDeposits, latestWithdrawals, topBalances, topExpenses, leastExpenses, topIncomes, lifetimeExpenses, lifetimeIncomes, savings] = await Promise.all([
      aggregateTotal(users, 'balance'),
      users.where('premiumUntil', '>', nowIso).count().get().then((snap) => snap.data().count).catch(() => 0),
      aggregateTotal(adminDb.collection('deposits').where('status', '==', 'CONFIRMED')),
      aggregateTotal(adminDb.collection('subscriptionPayments').where('status', '==', 'CONFIRMED')),
      aggregateTotal(withdrawals.where('status', '==', 'PAID')),
      aggregateTotal(withdrawals.where('status', 'in', ['PENDING_REVIEW', 'PROCESSING', 'RECONCILIATION_REQUIRED'])),
      // Include legacy profiles even when createdAt is not present.
      users.orderBy(FieldPath.documentId()).limit(100).get().catch(() => ({ docs: [] })),
      adminDb.collection('deposits').orderBy('createdAt', 'desc').limit(8).get().catch(() => ({ docs: [] })),
      withdrawals.orderBy('createdAt', 'desc').limit(12).get().catch(() => ({ docs: [] })),
      users.orderBy('balance', 'desc').limit(5).get().catch(() => ({ docs: [] })),
      users.orderBy('lifetimeExpenseAmount', 'desc').limit(5).get().catch(() => ({ docs: [] })),
      users.where('lifetimeExpenseAmount', '>', 0).orderBy('lifetimeExpenseAmount', 'asc').limit(5).get().catch(() => ({ docs: [] })),
      users.orderBy('lifetimeIncomeAmount', 'desc').limit(5).get().catch(() => ({ docs: [] })),
      aggregateTotal(users, 'lifetimeExpenseAmount'),
      aggregateTotal(users, 'lifetimeIncomeAmount'),
      calculateAdminSavingsOverview(),
    ]);
    const recentUsers = latestUsers.docs.map(safeAdminUser)
      .sort((a, b) => (Date.parse(b.createdAt || b.lastSeenAt || 0) || 0) - (Date.parse(a.createdAt || a.lastSeenAt || 0) || 0))
      .slice(0, 8);
    return NextResponse.json({
      success: true,
      stats: {
        totalUsers: userTotals.count,
        premiumUsers: Number(premiumCount) || 0,
        walletLiability: userTotals.total,
        confirmedDeposits: deposits.total,
        depositCount: deposits.count,
        subscriptionRevenue: subscriptions.total,
        subscriptionCount: subscriptions.count,
        paidWithdrawals: paidPayouts.total,
        paidWithdrawalCount: paidPayouts.count,
        pendingWithdrawals: pendingPayouts.total,
        pendingWithdrawalCount: pendingPayouts.count,
        lifetimeExpenseVolume: lifetimeExpenses.total,
        lifetimeIncomeVolume: lifetimeIncomes.total,
        protectedSavings: savings.totalProtectedSavings,
        activeSavingsGoals: savings.activeGoals,
      },
      savingsSummary: savings,
      latestUsers: recentUsers,
      latestDeposits: latestDeposits.docs.map((doc) => ({ id: doc.id, ...serializeAdminValue(doc.data()) })),
      latestWithdrawals: latestWithdrawals.docs.map((doc) => ({ id: doc.id, ...serializeAdminValue(doc.data()) })),
      leaders: {
        balances: topBalances.docs.map((doc) => ({ id: doc.id, ...serializeAdminValue(doc.data()) })),
        expenses: topExpenses.docs.map((doc) => ({ id: doc.id, ...serializeAdminValue(doc.data()) })),
        leastExpenses: leastExpenses.docs.map((doc) => ({ id: doc.id, ...serializeAdminValue(doc.data()) })),
        incomes: topIncomes.docs.map((doc) => ({ id: doc.id, ...serializeAdminValue(doc.data()) })),
      },
      note: 'Le montant protégé correspond à tous les versements présents dans les objectifs encore actifs. La part issue du portefeuille et la part empruntée sont détaillées séparément. Les objectifs déjà retirés sont exclus.',
    });
  } catch (error) {
    return errorResponse(error.message || 'Accès administrateur refusé.', 401);
  }
}


async function handleAdminSavings(request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const limit = Math.max(5, Math.min(60, Number(url.searchParams.get('limit')) || 30));
    const cursor = String(url.searchParams.get('cursor') || '').slice(0, 500);
    let query = adminDb.collectionGroup('goals').orderBy(FieldPath.documentId());
    if (cursor) {
      let cursorPath = '';
      try { cursorPath = Buffer.from(cursor, 'base64url').toString('utf8'); } catch { /* invalid cursor */ }
      if (!/^users\/[^/]+\/goals\/[^/]+$/.test(cursorPath)) return errorResponse('Repère de pagination invalide.', 400);
      const cursorDoc = await adminDb.doc(cursorPath).get();
      if (!cursorDoc.exists) return errorResponse('La liste a changé. Actualise les objectifs.', 409);
      query = query.startAfter(cursorDoc);
    }
    const [snapshot, summary] = await Promise.all([query.limit(limit + 1).get(), calculateAdminSavingsOverview()]);
    const hasMore = snapshot.docs.length > limit;
    const docs = snapshot.docs.slice(0, limit);
    const userIds = [...new Set(docs.map((document) => document.ref.parent.parent?.id).filter(Boolean))];
    const userSnaps = await Promise.all(userIds.map((uid) => adminDb.collection('users').doc(uid).get()));
    const userMap = new Map(userSnaps.filter((document) => document.exists).map((document) => [document.id, document.data()]));
    const goals = [];
    for (let offset = 0; offset < docs.length; offset += 10) {
      const group = docs.slice(offset, offset + 10);
      const amounts = await Promise.all(group.map((document) => getGoalCashDepositSummary(document.ref)));
      group.forEach((document, index) => {
        const data = document.data();
        const uid = document.ref.parent.parent?.id || '';
        const user = userMap.get(uid) || {};
        const active = !data.closed && !data.withdrawnAt;
        const amount = amounts[index];
        const available = !amount.unavailable;
        const depositedAmount = active ? (available ? amount.total : null) : 0;
        const targetAmount = Math.max(0, Number(data.targetAmount) || 0);
        goals.push({
          id: document.id, userId: uid, userName: user.displayName || 'Utilisateur', email: user.email || '',
          name: data.name || (data.type === 'piggybank' ? 'Tirelire' : 'Objectif'),
          type: data.type || 'goal', categoryId: data.categoryId || 'other',
          targetAmount, depositedAmount,
          cashDeposited: active ? (available ? amount.cashTotal : null) : 0,
          borrowedAmount: active ? (available ? amount.borrowedTotal : null) : 0,
          depositCount: active ? (available ? amount.count : null) : 0,
          depositsSummaryAvailable: !active || available,
          debtBalance: Math.max(0, Number(data.debtBalance) || 0),
          progress: targetAmount > 0 && depositedAmount != null ? Math.min(100, Math.round((depositedAmount / targetAmount) * 100)) : null,
          createdAt: serializeAdminValue(data.createdAt || null), deadline: data.deadline || null,
          withdrawalPending: Boolean(data.withdrawalPending), active, closed: !active,
        });
      });
    }
    return NextResponse.json({
      success: true, goals, summary, hasMore,
      nextCursor: hasMore && docs.length ? Buffer.from(docs[docs.length - 1].ref.path, 'utf8').toString('base64url') : null,
    });
  } catch (error) {
    return errorResponse(error.message || 'Impossible de charger les objectifs d’épargne.', 401);
  }
}

async function handleAdminUsers(request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const limitValue = Math.max(5, Math.min(100, Number(url.searchParams.get('limit')) || 40));
    const cursor = String(url.searchParams.get('cursor') || '').slice(0, 150);
    let query = adminDb.collection('users').orderBy(FieldPath.documentId());
    if (cursor) {
      if (cursor.includes('/')) return errorResponse('Repère de pagination invalide.', 400);
      const cursorDoc = await adminDb.collection('users').doc(cursor).get();
      if (!cursorDoc.exists) return errorResponse('La page a changé. Recharge la liste des comptes.', 409);
      query = query.startAfter(cursorDoc);
    }
    const snapshot = await query.limit(limitValue + 1).get();
    const hasMore = snapshot.docs.length > limitValue;
    const docs = snapshot.docs.slice(0, limitValue).map(safeAdminUser).sort((a, b) =>
      (Date.parse(b.createdAt || b.lastSeenAt || 0) || 0) - (Date.parse(a.createdAt || a.lastSeenAt || 0) || 0)
    );
    return NextResponse.json({ success: true, users: docs, nextCursor: hasMore ? snapshot.docs[limitValue - 1]?.id || null : null });
  } catch (error) { return errorResponse(error.message || 'Impossible de charger les comptes.', 401); }
}

async function handleAdminUserDetail(request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const uid = String(url.searchParams.get('uid') || '').slice(0, 150);
    if (!uid || uid.includes('/')) return errorResponse('Compte invalide.', 400);
    const userRef = adminDb.collection('users').doc(uid);
    const [userDoc, chatsSnap, expensesSnap, incomesSnap, goalsSnap, notificationsSnap] = await Promise.all([
      userRef.get(),
      userRef.collection('ai_chats').orderBy('updatedAt', 'desc').limit(12).get().catch(() => ({ docs: [] })),
      userRef.collection('expenses').orderBy('date', 'desc').limit(10).get().catch(() => ({ docs: [] })),
      userRef.collection('incomes').orderBy('date', 'desc').limit(10).get().catch(() => ({ docs: [] })),
      userRef.collection('goals').orderBy('createdAt', 'desc').get().catch(() => ({ docs: [] })),
      userRef.collection('notifications').orderBy('createdAt', 'desc').limit(5).get().catch(() => ({ docs: [] })),
    ]);
    if (!userDoc.exists) return errorResponse('Compte introuvable.', 404);
    const chats = chatsSnap.docs.map((document) => ({ id: document.id, ...serializeAdminValue(document.data()) }));
    const goals = [];
    for (let offset = 0; offset < goalsSnap.docs.length; offset += 10) {
      const group = goalsSnap.docs.slice(offset, offset + 10);
      const amounts = await Promise.all(group.map((document) => getGoalCashDepositSummary(document.ref)));
      group.forEach((document, index) => {
        const data = document.data();
        const amount = amounts[index];
        const available = !amount.unavailable;
        const depositedAmount = available ? amount.total : null;
        const targetAmount = Math.max(0, Number(data.targetAmount) || 0);
        goals.push({
          id: document.id, ...serializeAdminValue(data),
          depositedAmount,
          cashDeposited: available ? amount.cashTotal : null,
          borrowedAmount: available ? amount.borrowedTotal : null,
          depositCount: available ? amount.count : null,
          depositsSummaryAvailable: available,
          progress: available && targetAmount > 0 ? Math.min(100, Math.round((depositedAmount / targetAmount) * 100)) : null,
          active: !data.closed && !data.withdrawnAt,
        });
      });
    }
    const activeGoals = goals.filter((goal) => goal.active);
    const savingsSummaryAvailable = activeGoals.every((goal) => goal.depositsSummaryAvailable !== false);
    const sumActive = (field) => savingsSummaryAvailable
      ? activeGoals.reduce((sum, goal) => sum + (Number(goal[field]) || 0), 0)
      : null;
    const safeUser = { ...userDoc.data() };
    delete safeUser.pushTokens; delete safeUser.monthlyStats; delete safeUser.dailyStats;
    const recentExpenses = expensesSnap.docs.map((document) => ({ id: document.id, ...serializeAdminValue(document.data()) }));
    const recentIncomes = incomesSnap.docs.map((document) => ({ id: document.id, ...serializeAdminValue(document.data()) }));
    return NextResponse.json({
      success: true,
      user: { id: uid, ...serializeAdminValue(safeUser) }, chats, goals,
      savingsSummaryAvailable,
      totalSavingsInGoals: sumActive('depositedAmount'),
      cashSavingsInGoals: sumActive('cashDeposited'),
      borrowedSavingsInGoals: sumActive('borrowedAmount'),
      recentExpenseVolume: recentExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
      recentIncomeVolume: recentIncomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
      expenses: recentExpenses, incomes: recentIncomes,
      notifications: notificationsSnap.docs.map((document) => ({ id: document.id, ...serializeAdminValue(document.data()) })),
    });
  } catch (error) {
    return errorResponse(error.message || 'Impossible de charger ce compte.', 401);
  }
}

async function handleAdminPopularQuestions(request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const limit = Math.max(5, Math.min(30, Number(url.searchParams.get('limit')) || 20));
    const cursor = String(url.searchParams.get('cursor') || '').slice(0, 500);
    let query = adminDb.collectionGroup('ai_chats').orderBy('updatedAt', 'desc');
    if (cursor) {
      let cursorPath = '';
      try { cursorPath = Buffer.from(cursor, 'base64url').toString('utf8'); } catch { /* invalid cursor */ }
      if (!/^users\/[^/]+\/ai_chats\/[^/]+$/.test(cursorPath)) return errorResponse('Repère de pagination invalide.', 400);
      const cursorDoc = await adminDb.doc(cursorPath).get();
      if (!cursorDoc.exists) return errorResponse('La liste a changé. Actualise les discussions.', 409);
      query = query.startAfter(cursorDoc);
    }
    const snapshot = await query.limit(limit + 1).get();
    const hasMore = snapshot.docs.length > limit;
    const docs = snapshot.docs.slice(0, limit);
    const conversations = [];
    for (let offset = 0; offset < docs.length; offset += 10) {
      const group = docs.slice(offset, offset + 10);
      const items = await Promise.all(group.map(async (chatDoc) => {
        const userRef = chatDoc.ref.parent.parent;
        const userSnap = userRef ? await userRef.get().catch(() => null) : null;
        const userData = userSnap?.exists ? userSnap.data() : {};
        const chatData = chatDoc.data() || {};
        const messages = Array.isArray(chatData.messages) ? chatData.messages : [];
        return {
          id: chatDoc.id, userId: userRef?.id || '',
          user: { displayName: userData.displayName || 'Utilisateur', email: userData.email || '', phone: userData.phone || '' },
          title: String(chatData.title || 'Discussion sans titre').slice(0, 120),
          createdAt: serializeAdminValue(chatData.createdAt || null),
          updatedAt: serializeAdminValue(chatData.updatedAt || chatData.createdAt || null),
          messageCount: messages.length,
          messages: messages.map((message) => ({
            role: message?.role === 'assistant' ? 'assistant' : 'user',
            content: String(message?.content || message?.text || '').slice(0, 5000),
            createdAt: serializeAdminValue(message?.createdAt || message?.timestamp || null),
          })),
        };
      }));
      conversations.push(...items);
    }
    return NextResponse.json({
      success: true, conversations, conversationCount: conversations.length,
      hasMore,
      nextCursor: hasMore && docs.length ? Buffer.from(docs[docs.length - 1].ref.path, 'utf8').toString('base64url') : null,
    });
  } catch (error) {
    return errorResponse(error.message || 'Impossible de charger les discussions IA.', 401);
  }
}

async function handleAdminWithdrawals(request) {
  try {
    await requireAdmin(request);
    const snapshot = await adminDb.collection('withdrawalRequests').orderBy('createdAt', 'desc').limit(40).get();
    return NextResponse.json({ success: true, withdrawals: snapshot.docs.map((doc) => ({ id: doc.id, ...serializeAdminValue(doc.data()) })) });
  } catch (error) { return errorResponse(error.message || 'Impossible de charger les demandes.', 401); }
}

async function unlockGoalAfterPayout(uid, goalId, status, requestId) {
  if (!goalId) return;
  const goalRef = adminDb.collection('users').doc(uid).collection('goals').doc(goalId);
  const patch = { withdrawalPending: false, withdrawalRequestId: null, withdrawalStatus: status };
  if (status === 'PAID') { patch.withdrawnAt = FieldValue.serverTimestamp(); patch.closed = true; }
  await goalRef.set(patch, { merge: true }).catch(() => {});
}

async function handleAdminRejectWithdrawal(request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const requestId = String(body.requestId || '').slice(0, 150);
    if (!requestId || requestId.includes('/')) return errorResponse('Demande invalide.', 400);
    const requestRef = adminDb.collection('withdrawalRequests').doc(requestId);
    const result = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(requestRef);
      if (!snapshot.exists) throw new Error('Demande introuvable.');
      const data = snapshot.data();
      if (data.status !== 'PENDING_REVIEW') throw new Error('Cette demande a déjà été traitée.');
      transaction.update(requestRef, { status: 'REJECTED', adminNote: String(body.reason || 'Demande refusée après vérification.').slice(0, 300), reviewedAt: FieldValue.serverTimestamp() });
      return data;
    });
    await unlockGoalAfterPayout(result.userId, result.goalId, 'REJECTED', requestId);
    return NextResponse.json({ success: true });
  } catch (error) { return errorResponse(error.message || 'Impossible de refuser la demande.', 400); }
}

async function handleAdminApproveWithdrawal(request) {
  let requestRef = null;
  let requestData = null;
  try {
    await requireAdmin(request);
    const body = await request.json();
    const requestId = String(body.requestId || '').slice(0, 150);
    if (!requestId || requestId.includes('/')) return errorResponse('Demande invalide.', 400);
    requestRef = adminDb.collection('withdrawalRequests').doc(requestId);
    requestData = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(requestRef);
      if (!snapshot.exists) throw new Error('Demande introuvable.');
      const data = snapshot.data();
      if (data.status !== 'PENDING_REVIEW') throw new Error('Cette demande a déjà été traitée.');
      transaction.update(requestRef, { status: 'SENDING', reviewedAt: FieldValue.serverTimestamp() });
      return data;
    });

    const apiUser = process.env.FAPSHI_PAYOUT_API_USER;
    const apiKey = process.env.FAPSHI_PAYOUT_SECRET_KEY;
    if (!apiUser || !apiKey) {
      await requestRef.update({ status: 'PENDING_REVIEW', adminNote: 'Le service de paiement des retraits n’est pas configuré.' });
      return errorResponse('Le service de retrait n’est pas encore configuré. Les clés de retrait Fapshi sont distinctes des clés de dépôt.', 503);
    }
    const baseUrl = String(process.env.FAPSHI_PAYOUT_BASE_URL || 'https://sandbox.fapshi.com').replace(/\/$/, '');
    if (!['https://sandbox.fapshi.com', 'https://live.fapshi.com'].includes(baseUrl)) {
      await requestRef.update({ status: 'PENDING_REVIEW', adminNote: 'Adresse du service de retrait invalide.' });
      return errorResponse('Configuration du service de retrait invalide.', 503);
    }
    const payload = {
      amount: Math.floor(Number(requestData.amount) || 0),
      phone: requestData.phone,
      medium: requestData.medium,
      name: requestData.displayName || 'Client Pata',
      email: requestData.email || undefined,
      userId: requestData.userId,
      externalId: requestRef.id,
      message: `Retrait Pata — ${requestData.goalName || 'épargne'}`,
    };
    if (!Number.isInteger(payload.amount) || payload.amount < 100 || payload.amount > 500000) throw new Error('Le montant du retrait doit être compris entre 100 et 500 000 FCFA pour une seule opération Fapshi.');
    const response = await fetch(`${baseUrl}/payout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apiuser: apiUser, apikey: apiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerMessage = String(result.message || 'Le prestataire n’a pas confirmé le retrait.').slice(0, 300);
      if (response.status >= 500 || response.status === 408 || response.status === 429) {
        await requestRef.update({ status: 'RECONCILIATION_REQUIRED', providerMessage: `Réponse incertaine du prestataire (${response.status}). Vérification manuelle requise avant tout nouvel essai.` });
        return errorResponse('La réponse du prestataire est incertaine. Vérifie cette demande dans ton espace Fapshi avant toute nouvelle tentative.', 502);
      }
      await requestRef.update({ status: 'FAILED', providerMessage, failedAt: FieldValue.serverTimestamp() });
      await unlockGoalAfterPayout(requestData.userId, requestData.goalId, 'FAILED', requestRef.id);
      await adminDb.collection('users').doc(requestData.userId).collection('notifications').doc(`withdrawal-${requestRef.id}`).set({ title: 'Retrait non effectué', body: 'Le prestataire n’a pas pu effectuer ce retrait. Ta demande a été débloquée ; contacte le support si nécessaire.', target: '/goals', createdAt: FieldValue.serverTimestamp() }).catch(() => {});
      return errorResponse(providerMessage, 502);
    }
    if (!result.transId) {
      await requestRef.update({ status: 'RECONCILIATION_REQUIRED', providerMessage: 'Le prestataire a répondu sans identifiant de paiement. Vérification manuelle requise.' });
      return errorResponse('Le prestataire a répondu de manière inattendue. Vérifie le paiement dans ton espace Fapshi avant toute nouvelle action.', 502);
    }
    await requestRef.update({ status: 'PROCESSING', fapshiTransId: result.transId, providerMessage: result.message || 'Demande transmise au prestataire.', providerDateInitiated: result.dateInitiated || null, submittedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true, status: 'PROCESSING', transId: result.transId });
  } catch (error) {
    if (requestRef && requestData) {
      // En cas de timeout réseau, ne pas relancer automatiquement : Fapshi peut avoir reçu le paiement.
      await requestRef.update({ status: 'RECONCILIATION_REQUIRED', providerMessage: 'Réponse incertaine. Vérification manuelle requise avant tout nouvel essai.' }).catch(() => {});
    }
    return errorResponse(error.message || 'Impossible de transmettre le retrait.', 502);
  }
}

async function handleFapshiPayoutWebhook(request) {
  try {
    const expectedSecret = process.env.FAPSHI_PAYOUT_WEBHOOK_SECRET;
    const suppliedSecret = request.headers.get('x-wh-secret') || '';
    if (!expectedSecret || !safeStringEqual(suppliedSecret, expectedSecret)) return errorResponse('Webhook non autorisé.', 401);
    const body = await request.json();
    if (String(body.transType || '').toLowerCase() !== 'payout' || !body.externalId) return NextResponse.json({ received: true });
    const requestRef = adminDb.collection('withdrawalRequests').doc(String(body.externalId));
    const snapshot = await requestRef.get();
    if (!snapshot.exists) return NextResponse.json({ received: true });
    const data = snapshot.data();
    const status = String(body.status || '').toUpperCase();
    if (status === 'SUCCESSFUL') {
      if (data.status !== 'PAID') {
        await requestRef.update({ status: 'PAID', fapshiTransId: body.transId || data.fapshiTransId || null, financialTransId: body.financialTransId || null, paidAt: FieldValue.serverTimestamp(), providerPayload: { status, amount: Number(body.amount) || data.amount } });
        await unlockGoalAfterPayout(data.userId, data.goalId, 'PAID', requestRef.id);
        const userRef = adminDb.collection('users').doc(data.userId);
        await userRef.collection('notifications').doc(`withdrawal-${requestRef.id}`).set({ title: 'Retrait envoyé', body: `Ton retrait de ${Number(data.amount).toLocaleString('fr-FR')} FCFA a été envoyé.`, target: '/goals', createdAt: FieldValue.serverTimestamp() });
      }
    } else if (['FAILED', 'EXPIRED'].includes(status) && !['PAID', 'FAILED'].includes(data.status)) {
      await requestRef.update({ status: 'FAILED', providerMessage: String(body.reason || 'Le prestataire n’a pas pu effectuer le retrait.').slice(0, 300), failedAt: FieldValue.serverTimestamp() });
      await unlockGoalAfterPayout(data.userId, data.goalId, 'FAILED', requestRef.id);
      await adminDb.collection('users').doc(data.userId).collection('notifications').doc(`withdrawal-${requestRef.id}`).set({ title: 'Retrait non effectué', body: 'Le prestataire n’a pas pu effectuer ce retrait. Ta demande a été débloquée ; contacte le support si nécessaire.', target: '/goals', createdAt: FieldValue.serverTimestamp() }).catch(() => {});
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[FAPSHI PAYOUT WEBHOOK]', error.message);
    return NextResponse.json({ received: true });
  }
}

async function handleGoalWithdrawalRequest(request, actionType = 'withdraw') {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const goalId = String(body.goalId || '').slice(0, 150);
    const phoneRaw = String(body.phone || '').replace(/[^0-9+]/g, '');
    let phone = phoneRaw.replace(/^\+/, '');
    if (phone.startsWith('237') && phone.length === 12) phone = phone.slice(3);
    if (!/^6[0-9]{8}$/.test(phone)) return errorResponse('Entre un numéro Mobile Money camerounais valide à 9 chiffres.', 400);
    const medium = body.network === 'orange' ? 'orange money' : body.network === 'mtn' ? 'mobile money' : '';
    if (!medium) return errorResponse('Choisis MTN Mobile Money ou Orange Money.', 400);
    if (!goalId || goalId.includes('/')) return errorResponse('Épargne introuvable.', 400);

    const userRef = adminDb.collection('users').doc(uid);
    const goalRef = userRef.collection('goals').doc(goalId);
    const requestRef = adminDb.collection('withdrawalRequests').doc();
    const result = await adminDb.runTransaction(async (transaction) => {
      const [userSnap, goalSnap, depositsSnap] = await Promise.all([
        transaction.get(userRef), transaction.get(goalRef), transaction.get(goalRef.collection('deposits')),
      ]);
      if (!userSnap.exists || !goalSnap.exists) throw new Error('Épargne introuvable.');
      const goal = goalSnap.data();
      if (goal.withdrawalPending || goal.withdrawnAt) throw new Error('Une demande de retrait est déjà en cours pour cette épargne.');
      const deposits = depositsSnap.docs.map((doc) => doc.data());
      const totalDeposited = deposits.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      const debt = Number(goal.debtBalance) || 0;
      const plan = computeGoalPlan({ ...goal, id: goalSnap.id }, deposits);
      if (actionType === 'withdraw' && goal.type !== 'piggybank' && !plan.isReached) throw new Error('Cet objectif n’a pas encore atteint son montant cible. Tu peux l’annuler si tu souhaites récupérer les fonds, avec les conditions affichées.');
      const penalty = actionType === 'cancel' && goal.type !== 'piggybank' ? Math.round(totalDeposited * 0.10) : 0;
      const platformFee = Math.max(0, Math.round(Number(process.env.PATA_WITHDRAWAL_FEE_XAF) || 0));
      const amount = Math.floor(Math.max(0, totalDeposited - debt - penalty - platformFee));
      if (amount < 100) throw new Error('Le montant disponible est inférieur au minimum de retrait de 100 FCFA.');
      if (amount > 500000) throw new Error('Le retrait dépasse le plafond de 500 000 FCFA accepté par Fapshi pour une seule opération. Contacte le support Pata pour organiser la suite sans risquer de bloquer ton épargne.');
      const userData = userSnap.data();
      transaction.create(requestRef, {
        userId: uid,
        email: userData.email || '',
        displayName: userData.displayName || 'Utilisateur',
        phone, medium,
        goalId,
        goalName: goal.name || (goal.type === 'piggybank' ? 'Tirelire' : 'Objectif'),
        goalType: goal.type || 'goal',
        actionType,
        grossAmount: totalDeposited,
        debtDeduction: debt,
        cancellationPenalty: penalty,
        platformFee,
        amount,
        currency: 'XAF',
        status: 'PENDING_REVIEW',
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(goalRef, { withdrawalPending: true, withdrawalRequestId: requestRef.id, withdrawalStatus: 'PENDING_REVIEW' });
      return { amount, grossAmount: totalDeposited, debt, penalty, platformFee, requestId: requestRef.id };
    });
    return NextResponse.json({ success: true, ...result, message: 'Ta demande a été envoyée. Elle sera vérifiée avant l’envoi de l’argent.' });
  } catch (error) { return errorResponse(error.message || 'Impossible de créer la demande de retrait.', 400); }
}


async function handleAdminNotificationRecipients(request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const limit = Math.max(5, Math.min(100, Number(url.searchParams.get('limit')) || 50));
    const cursor = String(url.searchParams.get('cursor') || '').slice(0, 150);
    const users = adminDb.collection('users');
    const queryStats = await Promise.all([
      users.count().get().catch(() => null),
      users.where('notificationsEnabled', '==', true).count().get().catch(() => null),
    ]);
    let query = users.orderBy(FieldPath.documentId());
    if (cursor) {
      if (cursor.includes('/')) return errorResponse('Repère de pagination invalide.', 400);
      const cursorDoc = await users.doc(cursor).get();
      if (!cursorDoc.exists) return errorResponse('La liste a changé. Actualise les destinataires.', 409);
      query = query.startAfter(cursorDoc);
    }
    const snapshot = await query.limit(limit + 1).get();
    const hasMore = snapshot.docs.length > limit;
    const docs = snapshot.docs.slice(0, limit);
    return NextResponse.json({
      success: true,
      totalUsers: Number(queryStats[0]?.data()?.count) || 0,
      optedInUsers: Number(queryStats[1]?.data()?.count) || 0,
      recipients: docs.map((doc) => {
        const data = doc.data() || {};
        const tokens = Array.isArray(data.pushTokens) ? data.pushTokens.filter((token) => typeof token === 'string' && token.length > 20) : [];
        return {
          id: doc.id, displayName: data.displayName || 'Utilisateur', email: data.email || '', phone: data.phone || '',
          notificationsEnabled: Boolean(data.notificationsEnabled && tokens.length), deviceCount: tokens.length,
          createdAt: serializeAdminValue(data.createdAt || null), lastSeenAt: serializeAdminValue(data.lastSeenAt || null),
        };
      }),
      hasMore,
      nextCursor: hasMore && docs.length ? docs[docs.length - 1].id : null,
    });
  } catch (error) {
    return errorResponse(error.message || 'Impossible de charger les destinataires.', 401);
  }
}

async function handleAdminEmailSend(request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    const recipientUid = String(body.recipientUid || '').trim();
    const subject = String(body.subject || '').trim().slice(0, 140);
    const message = String(body.message || '').trim().slice(0, 5000);
    const ctaPath = String(body.ctaPath || '/dashboard');
    const ctaLabel = String(body.ctaLabel || 'Ouvrir Pata').trim().slice(0, 50);
    if (!recipientUid || recipientUid.includes('/') || !subject || !message) {
      return errorResponse('Le destinataire, l’objet et le message sont obligatoires.', 400);
    }
    if (!ctaPath.startsWith('/') || ctaPath.startsWith('//')) return errorResponse('Lien interne invalide.', 400);
    const recipientSnap = await adminDb.collection('users').doc(recipientUid).get();
    if (!recipientSnap.exists) return errorResponse('Compte destinataire introuvable.', 404);
    const recipient = recipientSnap.data() || {};
    const email = String(recipient.email || '').trim();
    if (!email || !email.includes('@')) return errorResponse('Cet utilisateur ne possède pas d’adresse e-mail valide.', 400);
    const name = String(recipient.displayName || email.split('@')[0] || 'Utilisateur').slice(0, 100);
    const sent = await sendPataEmail({
      to: email,
      subject,
      html: customAdminEmail({ name, headline: subject, body: message, ctaUrl: ctaPath, ctaLabel }),
      idempotencyKey: `pata-admin-${admin.uid}-${recipientUid}-${Date.now()}`,
    });
    await adminDb.collection('adminEmailLogs').add({
      adminUid: admin.uid,
      recipientUid,
      recipientEmail: email,
      subject,
      message,
      resendEmailId: sent.id || null,
      status: 'accepted',
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ success: true, emailId: sent.id || null, recipientEmail: email });
  } catch (error) {
    console.error('[PATA ADMIN EMAIL]', error.message || error);
    return errorResponse(error.message || 'Le message e-mail n’a pas pu être envoyé.', 502);
  }
}

async function handleAdminBroadcast(request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const title = String(body.title || '').trim().slice(0, 80);
    const message = String(body.message || '').trim().slice(0, 220);
    const path = String(body.path || '/dashboard');
    const recipientMode = body.recipientMode === 'selected' ? 'selected' : 'all';
    const recipientIds = [...new Set((Array.isArray(body.recipientIds) ? body.recipientIds : [])
      .map((value) => String(value || '').trim()).filter((value) => value && !value.includes('/')))].slice(0, 500);
    if (!title || !message) return errorResponse('Écris un titre et un message.', 400);
    if (!path.startsWith('/') || path.startsWith('//')) return errorResponse('Lien interne invalide.', 400);
    if (recipientMode === 'selected' && !recipientIds.length) return errorResponse('Sélectionne au moins un destinataire.', 400);

    let recipientDocs = [];
    if (recipientMode === 'all') {
      recipientDocs = (await adminDb.collection('users').orderBy(FieldPath.documentId()).get()).docs;
    } else {
      for (let offset = 0; offset < recipientIds.length; offset += 10) {
        const refs = recipientIds.slice(offset, offset + 10).map((uid) => adminDb.collection('users').doc(uid));
        const snapshots = await Promise.all(refs.map((ref) => ref.get()));
        recipientDocs.push(...snapshots.filter((doc) => doc.exists));
      }
    }
    if (!recipientDocs.length) return errorResponse('Aucun compte destinataire trouvé.', 404);

    const tag = `pata-admin-${Date.now()}`;
    const notificationId = adminDb.collection('notificationIds').doc().id;
    let inAppDelivered = 0;
    for (let offset = 0; offset < recipientDocs.length; offset += 400) {
      const batch = adminDb.batch();
      const group = recipientDocs.slice(offset, offset + 400);
      group.forEach((userDoc) => {
        const notificationRef = userDoc.ref.collection('notifications').doc(notificationId);
        batch.set(notificationRef, { title, body: message, target: path, source: 'admin', read: false, readAt: null, createdAt: FieldValue.serverTimestamp() });
      });
      await batch.commit();
      inAppDelivered += group.length;
    }

    const tokenOwners = new Map();
    for (const userDoc of recipientDocs) {
      const data = userDoc.data() || {};
      if (!data.notificationsEnabled) continue;
      const tokens = Array.isArray(data.pushTokens) ? data.pushTokens.filter((token) => typeof token === 'string' && token.length > 20) : [];
      for (const token of tokens) {
        if (!tokenOwners.has(token)) tokenOwners.set(token, []);
        tokenOwners.get(token).push(userDoc.ref);
      }
    }
    const optedTokens = [...tokenOwners.keys()];
    let pushSent = 0;
    let pushFailed = 0;
    let pushMode = optedTokens.length ? 'direct-device-multicast' : 'in-app-only';
    let pushError = '';
    const failureDetails = [];
    const invalidTokens = [];
    try {
      for (let offset = 0; offset < optedTokens.length; offset += 500) {
        const chunk = optedTokens.slice(offset, offset + 500);
        const result = await adminMessaging.sendEachForMulticast({
          tokens: chunk,
          data: { title, body: message, url: path, tag },
          webpush: {
            headers: { TTL: '86400', Urgency: 'high' },
            fcmOptions: { link: new URL(path, 'https://www.pata-yam.site').toString() },
          },
        });
        pushSent += result.successCount;
        pushFailed += result.failureCount;
        result.responses.forEach((response, index) => {
          if (response.success) return;
          const token = chunk[index];
          const code = response.error?.code || 'messaging/unknown-error';
          failureDetails.push({ tokenSuffix: token.slice(-8), code });
          if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(code)) invalidTokens.push(token);
        });
      }
      for (const token of invalidTokens) {
        const owners = tokenOwners.get(token) || [];
        await Promise.all(owners.map((ref) => ref.set({ pushTokens: FieldValue.arrayRemove(token) }, { merge: true })));
      }
    } catch (error) {
      pushError = error.message || 'Erreur du service de notifications push.';
      console.error('[ADMIN BROADCAST PUSH]', error.code || error.message);
    }
    return NextResponse.json({
      success: true, notificationId, recipientMode, inAppDelivered,
      optedInDevices: optedTokens.length, pushSent, pushFailed, pushMode,
      invalidTokensRemoved: invalidTokens.length,
      pushError: pushError || null,
      pushFailureDetails: failureDetails.slice(0, 25),
      message: pushError
        ? `Notification enregistrée dans Pata pour ${inAppDelivered} compte(s), mais le service push a signalé une erreur : ${pushError}`
        : optedTokens.length
          ? `Notification enregistrée dans Pata pour ${inAppDelivered} compte(s). Envoi accepté par ${pushSent} appareil(s) sur ${optedTokens.length} ; ${pushFailed} échec(s), ${invalidTokens.length} jeton(s) invalide(s) nettoyé(s).`
          : `Notification enregistrée dans Pata pour ${inAppDelivered} compte(s). Aucun appareil n’a activé les notifications push.`,
    });
  } catch (error) {
    console.error('[ADMIN BROADCAST]', error.code || error.message);
    return errorResponse(error.message || 'La diffusion n’a pas pu être enregistrée.', 502);
  }
}

/* ═══════════════════ ROUTEUR PRINCIPAL ═══════════════════ */

const ROUTES = {
  'fapshi/checkout':       { POST: handleFapshiCheckout },
  'fapshi/webhook':        { POST: handleFapshiWebhook },
  'fapshi/status':         { POST: handleFapshiStatus },
  'subscription/checkout': { POST: handleSubscriptionCheckout },
  'subscription/pay-balance': { POST: handleSubscriptionPayWithBalance },
  'subscription/webhook':  { POST: handleSubscriptionWebhook },
  'wallet/fund-goal':      { POST: handleFundGoal },
  'goals/borrow':          { POST: handleGoalBorrow },
  'goals/repay':           { POST: handleRepayLoan },
  'goals/withdraw':        { POST: (request) => handleGoalWithdrawalRequest(request, 'withdraw') },
  'goals/cancel':          { POST: (request) => handleGoalWithdrawalRequest(request, 'cancel') },
  'fapshi/payout-webhook': { POST: handleFapshiPayoutWebhook },
  'admin/unlock': { POST: handleAdminUnlock },
  'admin/logout': { POST: handleAdminLogout },
  'admin/overview': { GET: handleAdminOverview },
  'admin/savings': { GET: handleAdminSavings },
  'admin/notification-recipients': { GET: handleAdminNotificationRecipients },
  'admin/users': { GET: handleAdminUsers },
  'admin/user-detail': { GET: handleAdminUserDetail },
  'admin/questions': { GET: handleAdminPopularQuestions },
  'admin/withdrawals': { GET: handleAdminWithdrawals },
  'admin/withdrawal/approve': { POST: handleAdminApproveWithdrawal },
  'admin/withdrawal/reject': { POST: handleAdminRejectWithdrawal },
  'admin/notifications/broadcast': { POST: handleAdminBroadcast },
  'admin/email/send': { POST: handleAdminEmailSend },
  'email/welcome': { POST: handleWelcomeEmail },
  'security/pin/status': { GET: handlePinStatus },
  'security/pin/set': { POST: handlePinSet },
  'security/pin/verify': { POST: handlePinVerify },
  'security/pin/reset/request': { POST: handlePinResetRequest },
  'security/pin/reset/confirm': { POST: handlePinResetConfirm },
  'profile/activity': { POST: handleProfileActivity },
  'analytics/income-created': { POST: handleIncomeAnalyticsEvent },
  'automations/run':       { POST: handleAutomationsRun },
  'automations/scheduler': { GET: handleAutomationsScheduler, POST: handleAutomationsScheduler },
  'notifications/subscribe': { POST: (request) => handleNotificationSubscription(request, false) },
  'notifications/unsubscribe': { POST: (request) => handleNotificationSubscription(request, true) },
  'notifications/test': { POST: handleNotificationTest },
  'notifications/inbox': { GET: handleNotificationsInbox },
  'notifications/read': { POST: handleNotificationRead },
  'notifications/scheduler': { GET: handleNotificationScheduler, POST: handleNotificationScheduler },
  'currency/rates':        { GET: handleCurrencyRates },
  'usage/reserve':         { POST: handleReserveQuota },
  'forecasts/vital/save': { POST: handleSaveVitalForecast },
  'forecasts/vital/delete': { POST: handleDeleteVitalForecast },
  'forecasts/duration/save': { POST: handleSaveDurationForecast },
  'forecasts/duration/delete': { POST: handleDeleteDurationForecast },
  'incomes/add': { POST: handleCreateIncome },
  'budgets/upsert': { POST: handleUpsertBudget },
  'budgets/templates': { GET: handleBudgetTemplates, POST: handleBudgetTemplates, DELETE: handleBudgetTemplates },
  'goals/create': { POST: handleCreateGoal },
  'goals/update': { POST: handleUpdateGoal },
  'goals/delete': { POST: handleDeleteGoal },
  'expenses/add':          { POST: handleAddExpense },
  'expenses/update':       { POST: handleUpdateExpense },
  'expenses/delete':       { POST: handleDeleteExpense },
  'ai/chat':               { POST: handleAIChat },
  'ai/image':              { POST: handleAIImage },
  'ai/vision':             { POST: handleAIVision },
};

async function dispatch(request, context) {
  const segments = context?.params?.path || [];
  const route = ROUTES[segments.join('/')];
  if (!route || !route[request.method]) return NextResponse.json({ error: 'Route introuvable' }, { status: 404 });
  return route[request.method](request);
}

export { dispatch as GET, dispatch as POST, dispatch as PUT, dispatch as DELETE, dispatch as PATCH };
