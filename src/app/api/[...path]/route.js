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
import {
  sendPataEmail, welcomeEmail, savingsCreatedEmail, customAdminEmail, pinResetEmail, referralJoinedEmail, referralRewardActivatedEmail,
  cotisationCreatedEmail, cotisationJoinedEmail, cotisationOwnerJoinedEmail, cotisationStartedEmail, cotisationTurnEmail, cotisationDueEmail, cotisationContributionPaidEmail, financialReminderEmail,
} from '@/lib/email/resend';

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

function getPataAppUrl(request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    try { return new URL(configured).origin; } catch { /* utiliser le domaine de la requête */ }
  }
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  if (host) return `${proto}://${host}`;
  return getBaseUrl(request);
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
    const baseUrl = getBaseUrl(request);
    const payload = {
      amount, currency: 'XAF', description: 'Recharge Pata',
      redirect_url: `${request.headers.get('origin') || baseUrl}/wallet`,
      webhook_url: `${baseUrl}/api/fapshi/webhook`,
      email: userData.email || decoded.email || '', name: userData.displayName || 'Client',
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
      status: 'PENDING', checkoutUrl, createdAt: FieldValue.serverTimestamp(), confirmedAt: null, failedAt: null,
    });

    return NextResponse.json({ success: true, checkoutUrl, transId });
  } catch (error) { return errorResponse(error.message, 500); }
}

async function handleFapshiWebhook(request) {
  try {
    const body = await request.json();
    const transId = String(body.transId || '').trim();
    if (!transId) return NextResponse.json({ received: true });
    const depositRef = adminDb.collection('deposits').doc(transId);
    const cotisationPaymentRef = adminDb.collection('cotisationPayments').doc(transId);
    const [depDoc, cotisationDoc] = await Promise.all([depositRef.get(), cotisationPaymentRef.get()]);
    if ((!depDoc.exists || depDoc.data()?.status === 'CONFIRMED') && (!cotisationDoc.exists || cotisationDoc.data()?.status === 'CONFIRMED')) {
      return NextResponse.json({ received: true });
    }
    const API_USER = process.env.FAPSHI_API_USER;
    const SECRET_KEY = process.env.FAPSHI_SECRET_KEY;
    if (!API_USER || !SECRET_KEY) return NextResponse.json({ received: true });
    const verifyRes = await fetch('https://live.fapshi.com/payment-status/' + transId, {
      headers: { apiuser: API_USER, apikey: SECRET_KEY },
    });
    const verifyData = await verifyRes.json();
    const providerStatus = String(verifyData.status || '').toUpperCase();
    if (providerStatus === 'SUCCESSFUL') {
      if (depDoc.exists) {
        await adminDb.runTransaction(async (transaction) => {
          const fresh = await transaction.get(depositRef);
          if (!fresh.exists || fresh.data().status === 'CONFIRMED') return;
          const userRef = adminDb.collection('users').doc(fresh.data().userId);
          const userDoc = await transaction.get(userRef);
          if (!userDoc.exists) throw new Error('Utilisateur introuvable pour cette recharge.');
          transaction.update(userRef, { balance: (Number(userDoc.data().balance) || 0) + Number(fresh.data().amount || 0) });
          transaction.update(depositRef, { status: 'CONFIRMED', confirmedAt: FieldValue.serverTimestamp() });
        });
      } else if (cotisationDoc.exists) {
        validateCotisationProviderPayment(verifyData, cotisationDoc.data(), transId);
        await confirmCotisationPayment(transId);
      }
    } else if (cotisationDoc.exists && ['FAILED', 'EXPIRED', 'CANCELLED', 'CANCELED'].includes(providerStatus)) {
      await releaseCotisationPayment(transId, providerStatus);
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[FAPSHI DEPOSIT WEBHOOK]', error.message || error);
    return NextResponse.json({ received: true });
  }
}

async function handleFapshiStatus(request) {
  try {
    const decoded = await authenticate(request);
    const body = await request.json();
    const transId = String(body.transId || '').trim();
    if (!transId) return errorResponse('Transaction introuvable.', 404);
    const depositRef = adminDb.collection('deposits').doc(transId);
    const cotisationRef = adminDb.collection('cotisationPayments').doc(transId);
    const [depDoc, cotDoc] = await Promise.all([depositRef.get(), cotisationRef.get()]);
    if (depDoc.exists && depDoc.data().userId === decoded.uid) {
      if (depDoc.data().status === 'CONFIRMED') return NextResponse.json({ success: true, status: 'CONFIRMED' });
    } else if (cotDoc.exists && cotDoc.data().userId === decoded.uid) {
      if (cotDoc.data().status === 'CONFIRMED') return NextResponse.json({ success: true, status: 'CONFIRMED' });
    } else {
      return errorResponse('Transaction introuvable.', 404);
    }
    const API_USER = process.env.FAPSHI_API_USER;
    const SECRET_KEY = process.env.FAPSHI_SECRET_KEY;
    const res = await fetch('https://live.fapshi.com/payment-status/' + transId, { headers: { apiuser: API_USER, apikey: SECRET_KEY } });
    const data = await res.json();
    if ((data.status || '').toUpperCase() === 'SUCCESSFUL') {
      if (depDoc.exists) {
        await adminDb.runTransaction(async (transaction) => {
          const fresh = await transaction.get(depositRef);
          if (!fresh.exists || fresh.data().status === 'CONFIRMED') return;
          const userRef = adminDb.collection('users').doc(decoded.uid);
          const userDoc = await transaction.get(userRef);
          if (!userDoc.exists) throw new Error('Utilisateur introuvable.');
          transaction.update(userRef, { balance: (Number(userDoc.data().balance) || 0) + Number(fresh.data().amount || 0) });
          transaction.update(depositRef, { status: 'CONFIRMED', confirmedAt: FieldValue.serverTimestamp() });
        });
      } else {
        validateCotisationProviderPayment(data, cotDoc.data(), transId);
        await confirmCotisationPayment(transId);
      }
      return NextResponse.json({ success: true, status: 'CONFIRMED' });
    }
    const providerStatus = String(data.status || '').toUpperCase();
    if (cotDoc.exists && ['FAILED', 'EXPIRED', 'CANCELLED', 'CANCELED'].includes(providerStatus)) {
      await releaseCotisationPayment(transId, providerStatus);
      return NextResponse.json({ success: true, status: 'FAILED' });
    }
    return NextResponse.json({ success: true, status: 'PENDING' });
  } catch (error) { return errorResponse(error.message || 'Impossible de vérifier le paiement.', 500); }
}

/* ═══════════════════ ROUTES ABONNEMENT ═══════════════════ */


async function reserveReferralDiscount(uid) {
  const referralRef = adminDb.collection('referrals').doc(uid);
  const reservationKey = randomBytes(18).toString('hex');
  return adminDb.runTransaction(async (transaction) => {
    const referralSnap = await transaction.get(referralRef);
    if (!referralSnap.exists) return { eligible: false, reservationKey: null };
    const referral = referralSnap.data() || {};
    if (referral.status !== 'PENDING_PREMIUM' || referral.discountUsed === true) {
      return { eligible: false, reservationKey: null };
    }
    if (Number(referral.discountReservedUntil || 0) > Date.now()) {
      throw new Error('Un paiement Premium avec ta remise de parrainage est déjà en attente. Termine-le ou attends son expiration avant de recommencer.');
    }
    transaction.set(referralRef, {
      discountReservationKey: reservationKey,
      discountReservedUntil: Date.now() + 30 * 60 * 1000,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { eligible: true, reservationKey };
  });
}

async function releaseReferralDiscount(uid, reservationKey) {
  if (!uid || !reservationKey) return;
  const referralRef = adminDb.collection('referrals').doc(uid);
  await adminDb.runTransaction(async (transaction) => {
    const referralSnap = await transaction.get(referralRef);
    if (!referralSnap.exists) return;
    const referral = referralSnap.data() || {};
    if (referral.discountReservationKey !== reservationKey || referral.status !== 'PENDING_PREMIUM') return;
    transaction.set(referralRef, {
      discountReservationKey: FieldValue.delete(),
      discountReservedUntil: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

function referralPremiumPrice(months, discounted) {
  const safeMonths = Math.max(1, Math.min(12, Math.floor(Number(months) || 1)));
  return discounted ? 1250 + (safeMonths - 1) * 2500 : 2500 * safeMonths;
}

async function handleSubscriptionCheckout(request) {
  let referralReservation = null;
  let uid = '';
  try {
    const decoded = await authenticate(request);
    uid = decoded.uid;
    const body = await request.json();
    const months = Math.max(1, Math.min(12, parseInt(body.months, 10) || 1));
    const API_USER = process.env.FAPSHI_API_USER;
    const SECRET_KEY = process.env.FAPSHI_SECRET_KEY;
    if (!API_USER || !SECRET_KEY) return errorResponse('Configuration incomplète.', 500);

    const userDoc = await adminDb.collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    referralReservation = await reserveReferralDiscount(uid);
    const amount = referralPremiumPrice(months, referralReservation.eligible);

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
    let res;
    try {
      res = await fetch('https://live.fapshi.com/initiate-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apiuser: API_USER, apikey: SECRET_KEY },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      if (referralReservation.eligible) await releaseReferralDiscount(uid, referralReservation.reservationKey);
      referralReservation = null;
      return errorResponse('Service indisponible. Réessaie plus tard.', 503);
    }
    clearTimeout(timer);

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (referralReservation.eligible) await releaseReferralDiscount(uid, referralReservation.reservationKey);
      referralReservation = null;
      return errorResponse(data.message || 'Paiement refusé.', 400);
    }

    const checkoutUrl = data.data?.url || data.link || data.url;
    const transId = data.transId || data.data?.transId;
    if (!checkoutUrl || !transId) {
      if (referralReservation.eligible) await releaseReferralDiscount(uid, referralReservation.reservationKey);
      referralReservation = null;
      return errorResponse('Lien indisponible.', 502);
    }

    await adminDb.collection('subscriptionPayments').doc(transId).set({
      transId,
      userId: uid,
      amount,
      months,
      status: 'PENDING',
      checkoutUrl,
      referralDiscountApplied: referralReservation.eligible === true,
      referralReservationKey: referralReservation.reservationKey || null,
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ success: true, checkoutUrl, transId, amount, referralDiscountApplied: referralReservation.eligible === true });
  } catch (error) {
    if (uid && referralReservation?.eligible) {
      await releaseReferralDiscount(uid, referralReservation.reservationKey).catch(() => {});
    }
    return errorResponse(error.message || 'Impossible de préparer le paiement Premium.', 500);
  }
}
async function handleSubscriptionPayWithBalance(request) {
  try {
    const decoded = await authenticate(request);
    const uid = decoded.uid;
    const body = await request.json();
    const requestedMonths = Number(body.months);
    const months = Math.floor(requestedMonths);
    if (!Number.isInteger(months) || months < 1 || months > 12) return errorResponse('Choisis une durée comprise entre 1 et 12 mois.', 400);

    const userRef = adminDb.collection('users').doc(uid);
    const referralRef = adminDb.collection('referrals').doc(uid);
    const paymentRef = adminDb.collection('subscriptionPayments').doc();
    const result = await adminDb.runTransaction(async (transaction) => {
      const [userDoc, referralSnap] = await Promise.all([
        transaction.get(userRef),
        transaction.get(referralRef),
      ]);
      if (!userDoc.exists) throw new Error('Utilisateur introuvable.');
      const userData = userDoc.data() || {};
      const referral = referralSnap.exists ? referralSnap.data() || {} : {};
      const isReferred = referral.status === 'PENDING_PREMIUM' && referral.discountUsed !== true;
      if (isReferred && Number(referral.discountReservedUntil || 0) > Date.now()) {
        throw new Error('Un paiement Premium avec la remise de parrainage est déjà en attente. Termine-le ou attends son expiration.');
      }
      const amount = referralPremiumPrice(months, isReferred);
      const balance = Number(userData.balance) || 0;
      if (balance < amount) throw new Error(`Solde insuffisant. Ton solde est de ${balance.toLocaleString('fr-FR')} FCFA; il manque ${(amount - balance).toLocaleString('fr-FR')} FCFA.`);

      const referrerUid = isReferred ? String(referral.referrerUid || '') : '';
      const referrerRef = referrerUid ? adminDb.collection('users').doc(referrerUid) : null;
      const ledgerRef = referrerRef ? referrerRef.collection('referralTransactions').doc('invite-' + uid) : null;
      const nestedReferralRef = referrerRef ? referrerRef.collection('referrals').doc(uid) : null;
      let referrerSnap = null;
      let ledgerSnap = null;
      if (referrerRef) {
        [referrerSnap, ledgerSnap] = await Promise.all([
          transaction.get(referrerRef),
          transaction.get(ledgerRef),
        ]);
      }

      const now = new Date();
      const currentValue = userData.premiumUntil;
      const currentExpiry = currentValue?.toDate ? currentValue.toDate() : new Date(currentValue || 0);
      const baseDate = currentExpiry > now ? currentExpiry : now;
      const newExpiration = new Date(baseDate.getTime() + months * 30 * 86400000);
      transaction.update(userRef, {
        balance: balance - amount,
        premiumUntil: newExpiration.toISOString(),
        lastPaymentDate: now.toISOString(),
        lastPaymentAmount: amount,
        lastPaymentMethod: 'balance',
        premiumLastStartDate: now.toISOString(),
        ...(isReferred ? { referralDiscountUsed: true } : {}),
      });
      transaction.create(paymentRef, {
        transId: paymentRef.id,
        userId: uid,
        amount,
        months,
        status: 'CONFIRMED',
        method: 'balance',
        referralDiscountApplied: isReferred,
        createdAt: FieldValue.serverTimestamp(),
        confirmedAt: FieldValue.serverTimestamp(),
      });

      let reward = null;
      if (isReferred && referrerRef && referrerSnap?.exists) {
        const rewardAmount = 1000;
        if (!ledgerSnap?.exists) {
          const referrerData = referrerSnap.data() || {};
          transaction.update(referrerRef, { referralBalance: (Number(referrerData.referralBalance) || 0) + rewardAmount });
          transaction.create(ledgerRef, {
            type: 'REWARD',
            amount: rewardAmount,
            invitedUid: uid,
            invitedName: userData.displayName || decoded.email || 'Filleul',
            status: 'CONFIRMED',
            sourcePaymentId: paymentRef.id,
            createdAt: FieldValue.serverTimestamp(),
          });
          reward = { referrerUid, invitedName: userData.displayName || decoded.email || 'Filleul' };
        }
        const referralUpdate = {
          status: 'REWARDED',
          discountUsed: true,
          rewardedAmount: rewardAmount,
          premiumPaymentId: paymentRef.id,
          rewardedAt: FieldValue.serverTimestamp(),
          discountReservationKey: FieldValue.delete(),
          discountReservedUntil: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        transaction.set(referralRef, referralUpdate, { merge: true });
        transaction.set(nestedReferralRef, referralUpdate, { merge: true });
      }
      return { newExpiration: newExpiration.toISOString(), amount, referralDiscountApplied: isReferred, reward };
    });

    if (result.reward) {
      try {
        const referrerDoc = await adminDb.collection('users').doc(result.reward.referrerUid).get();
        const referrer = referrerDoc.exists ? referrerDoc.data() || {} : {};
        if (referrer.email) {
          await sendPataEmail({
            to: referrer.email,
            subject: 'Ton bonus de parrainage Pata est disponible',
            html: referralRewardActivatedEmail({ referrerName: referrer.displayName, invitedName: result.reward.invitedName }),
            idempotencyKey: 'pata-referral-reward-' + uid,
          });
        }
      } catch (emailError) { console.warn('[PATA REFERRAL REWARD EMAIL]', emailError.message || emailError); }
    }
    return NextResponse.json({ success: true, ...result, reward: undefined });
  } catch (error) { return errorResponse(error.message || 'Impossible de confirmer le paiement Premium.', 500); }
}
async function handleSubscriptionWebhook(request) {
  try {
    const body = await request.json();
    const transId = String(body.transId || '').trim();
    if (!transId) return NextResponse.json({ received: true });

    const paymentRef = adminDb.collection('subscriptionPayments').doc(transId);
    const paymentDoc = await paymentRef.get();
    if (!paymentDoc.exists || paymentDoc.data()?.status === 'CONFIRMED') return NextResponse.json({ received: true });

    const API_USER = process.env.FAPSHI_API_USER;
    const SECRET_KEY = process.env.FAPSHI_SECRET_KEY;
    const verifyRes = await fetch(`https://live.fapshi.com/payment-status/${encodeURIComponent(transId)}`, {
      headers: { apiuser: API_USER, apikey: SECRET_KEY },
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    const verifyData = await verifyRes.json().catch(() => ({}));
    const realStatus = String(verifyData.status || '').toUpperCase();

    if (realStatus !== 'SUCCESSFUL') {
      if (['FAILED', 'EXPIRED', 'CANCELED', 'REVERSED'].includes(realStatus)) {
        await paymentRef.update({ status: 'FAILED', failedAt: FieldValue.serverTimestamp() });
        const pending = paymentDoc.data() || {};
        if (pending.referralReservationKey) {
          await releaseReferralDiscount(pending.userId, pending.referralReservationKey).catch(() => {});
        }
      }
      return NextResponse.json({ received: true });
    }

    const payment = paymentDoc.data() || {};
    if (verifyData.amount !== undefined && verifyData.amount !== null && verifyData.amount !== '') {
      const verifiedAmount = Math.round(Number(verifyData.amount));
      if (!Number.isSafeInteger(verifiedAmount) || verifiedAmount !== Number(payment.amount)) {
        console.error('[PATA PREMIUM WEBHOOK] Amount mismatch', transId);
        return NextResponse.json({ received: true, verificationPending: true });
      }
    }

    const userRef = adminDb.collection('users').doc(payment.userId);
    const referralRef = adminDb.collection('referrals').doc(payment.userId);
    const result = await adminDb.runTransaction(async (transaction) => {
      const [freshPayment, userSnap, referralSnap] = await Promise.all([
        transaction.get(paymentRef),
        transaction.get(userRef),
        transaction.get(referralRef),
      ]);
      if (!freshPayment.exists || freshPayment.data()?.status === 'CONFIRMED') return { confirmed: true, duplicate: true };
      if (freshPayment.data()?.status !== 'PENDING') return { confirmed: false };
      if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
      const userData = userSnap.data() || {};
      const now = new Date();
      const currentPremiumValue = userData.premiumUntil;
      const currentPremiumUntil = currentPremiumValue?.toDate ? currentPremiumValue.toDate() : new Date(currentPremiumValue || 0);
      const baseDate = currentPremiumUntil > now ? currentPremiumUntil : now;
      const newExpiration = new Date(baseDate.getTime() + Number(payment.months || 1) * 30 * 24 * 60 * 60 * 1000);

      let reward = null;
      const referral = referralSnap.exists ? referralSnap.data() || {} : {};
      const shouldReward = referral.status === 'PENDING_PREMIUM' && referral.referrerUid && referral.referrerUid !== payment.userId;
      let referrerRef = null;
      let referrerSnap = null;
      let ledgerRef = null;
      let ledgerSnap = null;
      if (shouldReward) {
        referrerRef = adminDb.collection('users').doc(referral.referrerUid);
        ledgerRef = referrerRef.collection('referralTransactions').doc('invite-' + payment.userId);
        [referrerSnap, ledgerSnap] = await Promise.all([
          transaction.get(referrerRef),
          transaction.get(ledgerRef),
        ]);
      }

      transaction.update(userRef, {
        premiumUntil: newExpiration.toISOString(),
        lastPaymentDate: now.toISOString(),
        lastPaymentAmount: payment.amount,
        lastPaymentMethod: 'fapshi',
        ...(shouldReward ? { referralDiscountUsed: true } : {}),
      });
      transaction.update(paymentRef, {
        status: 'CONFIRMED',
        confirmedAt: FieldValue.serverTimestamp(),
      });

      if (shouldReward) {
        const rewardAmount = 1000;
        if (referrerSnap?.exists && !ledgerSnap?.exists) {
          const referrerData = referrerSnap.data() || {};
          transaction.update(referrerRef, { referralBalance: (Number(referrerData.referralBalance) || 0) + rewardAmount });
          transaction.create(ledgerRef, {
            type: 'REWARD',
            amount: rewardAmount,
            invitedUid: payment.userId,
            invitedName: userData.displayName || payment.email || 'Filleul',
            status: 'CONFIRMED',
            sourcePaymentId: transId,
            createdAt: FieldValue.serverTimestamp(),
          });
          reward = {
            referrerUid: referral.referrerUid,
            invitedName: userData.displayName || payment.email || 'Filleul',
          };
        }
        const referralUpdate = {
          status: 'REWARDED',
          discountUsed: true,
          rewardedAmount: rewardAmount,
          premiumPaymentId: transId,
          rewardedAt: FieldValue.serverTimestamp(),
          discountReservationKey: FieldValue.delete(),
          discountReservedUntil: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        transaction.set(referralRef, referralUpdate, { merge: true });
        transaction.set(
          adminDb.collection('users').doc(referral.referrerUid).collection('referrals').doc(payment.userId),
          referralUpdate,
          { merge: true }
        );
      }
      return { confirmed: true, newExpiration: newExpiration.toISOString(), reward };
    });

    if (result.reward) {
      try {
        const referrerDoc = await adminDb.collection('users').doc(result.reward.referrerUid).get();
        const referrer = referrerDoc.exists ? referrerDoc.data() || {} : {};
        if (referrer.email) {
          await sendPataEmail({
            to: referrer.email,
            subject: 'Ton bonus de parrainage Pata est disponible',
            html: referralRewardActivatedEmail({ referrerName: referrer.displayName, invitedName: result.reward.invitedName }),
            idempotencyKey: 'pata-referral-reward-' + payment.userId,
          });
        }
      } catch (emailError) { console.warn('[PATA REFERRAL REWARD EMAIL]', emailError.message || emailError); }
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[PATA PREMIUM WEBHOOK]', error.message || error);
    return NextResponse.json({ received: true });
  }
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


function normalizeReferralPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00237')) digits = digits.slice(2);
  if (digits.startsWith('237') && digits.length === 12) digits = digits.slice(3);
  return digits;
}

async function handleReferralStatus(request) {
  try {
    const { uid } = await authenticate(request);
    const userRef = adminDb.collection('users').doc(uid);
    const codeCollection = adminDb.collection('referralCodes');
    let profileSnap = await userRef.get();
    if (!profileSnap.exists) return errorResponse('Profil utilisateur introuvable.', 404);
    let profile = profileSnap.data() || {};
    let referralCode = String(profile.referralCode || '').trim().toUpperCase();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const code = referralCode || randomBytes(6).toString('hex').toUpperCase();
      const codeRef = codeCollection.doc(code);
      try {
        const assigned = await adminDb.runTransaction(async (transaction) => {
          const [freshProfile, codeSnap] = await Promise.all([
            transaction.get(userRef),
            transaction.get(codeRef),
          ]);
          const savedCode = String(freshProfile.data()?.referralCode || '').trim().toUpperCase();
          if (savedCode) {
            if (!codeSnap.exists) transaction.create(codeRef, { referrerUid: uid, createdAt: FieldValue.serverTimestamp() });
            else if (codeSnap.data()?.referrerUid !== uid) throw new Error('Ton code de parrainage est déjà associé à un autre compte.');
            return savedCode;
          }
          if (codeSnap.exists) throw new Error('CODE_COLLISION');
          transaction.create(codeRef, { referrerUid: uid, createdAt: FieldValue.serverTimestamp() });
          transaction.set(userRef, { referralCode: code, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          return code;
        });
        referralCode = assigned;
        break;
      } catch (error) {
        if (error.message === 'CODE_COLLISION' && !profile.referralCode) continue;
        throw error;
      }
    }
    if (!referralCode) return errorResponse('Impossible de créer ton lien de parrainage. Réessaie.', 500);

    const [freshProfile, referralSnap, historySnap] = await Promise.all([
      userRef.get(),
      adminDb.collection('referrals').doc(uid).get(),
      userRef.collection('referrals').orderBy('createdAt', 'desc').limit(50).get(),
    ]);
    const data = freshProfile.data() || {};
    const ownReferral = referralSnap.exists ? referralSnap.data() || {} : {};
    const reservationActive = Number(ownReferral.discountReservedUntil || 0) > Date.now();
    const referrals = historySnap.docs.map((document) => ({ id: document.id, ...document.data() }));
    return NextResponse.json({
      success: true,
      referralCode,
      referralLink: getPataAppUrl(request) + '/register?ref=' + encodeURIComponent(referralCode),
      referralBalance: Math.max(0, Number(data.referralBalance) || 0),
      discountEligible: ownReferral.status === 'PENDING_PREMIUM' && ownReferral.discountUsed !== true && !reservationActive,
      discountPending: ownReferral.status === 'PENDING_PREMIUM',
      referrals,
    });
  } catch (error) {
    console.error('[PATA REFERRAL STATUS]', error.message || error);
    return errorResponse(error.message || 'Impossible de charger ton parrainage.', 500);
  }
}

async function handleReferralAttribute(request) {
  try {
    const decoded = await authenticate(request);
    const uid = decoded.uid;
    const body = await request.json();
    const code = String(body.code || '').trim().toUpperCase();
    if (!/^[A-F0-9]{12}$/.test(code)) return errorResponse('Lien de parrainage invalide.', 400);

    const inviteeAuth = await adminAuth.getUser(uid);
    const createdAt = inviteeAuth.metadata?.creationTime ? new Date(inviteeAuth.metadata.creationTime).getTime() : 0;
    if (!createdAt || !Number.isFinite(createdAt) || Date.now() - createdAt > 24 * 60 * 60 * 1000) {
      return errorResponse('Le parrainage est réservé aux comptes créés depuis moins de 24 heures.', 403);
    }

    const inviteeRef = adminDb.collection('users').doc(uid);
    const referralRef = adminDb.collection('referrals').doc(uid);
    const codeRef = adminDb.collection('referralCodes').doc(code);
    const [initialProfileSnap, initialCodeSnap] = await Promise.all([inviteeRef.get(), codeRef.get()]);
    if (!initialCodeSnap.exists) return errorResponse('Ce lien de parrainage n’existe pas ou n’est plus valide.', 404);
    const referrerUid = String(initialCodeSnap.data()?.referrerUid || '');
    if (!referrerUid || referrerUid === uid) return errorResponse('Tu ne peux pas utiliser ton propre lien de parrainage.', 400);
    const referrerRef = adminDb.collection('users').doc(referrerUid);
    const [referrerProfileSnap, referrerAuth] = await Promise.all([
      referrerRef.get(),
      adminAuth.getUser(referrerUid),
    ]);
    if (!referrerProfileSnap.exists) return errorResponse('Le compte de la personne qui t’a invité n’est plus disponible.', 404);
    const inviteeProfile = initialProfileSnap.exists ? initialProfileSnap.data() || {} : {};
    const referrerProfile = referrerProfileSnap.data() || {};
    const inviteeEmail = String(inviteeAuth.email || inviteeProfile.email || decoded.email || '').trim().toLowerCase();
    const referrerEmail = String(referrerAuth.email || referrerProfile.email || '').trim().toLowerCase();
    const inviteePhone = normalizeReferralPhone(inviteeAuth.phoneNumber || inviteeProfile.phone || '');
    const referrerPhone = normalizeReferralPhone(referrerAuth.phoneNumber || referrerProfile.phone || '');
    if (inviteeEmail && referrerEmail && inviteeEmail === referrerEmail) return errorResponse('Le parrain et le filleul doivent utiliser des comptes distincts.', 400);
    if (inviteePhone && referrerPhone && inviteePhone === referrerPhone) return errorResponse('Un même numéro de téléphone ne peut pas servir au parrain et au filleul.', 400);

    await adminDb.runTransaction(async (transaction) => {
      const [freshCode, freshInvitee, existingReferral, freshReferrer] = await Promise.all([
        transaction.get(codeRef),
        transaction.get(inviteeRef),
        transaction.get(referralRef),
        transaction.get(referrerRef),
      ]);
      if (!freshCode.exists || freshCode.data()?.referrerUid !== referrerUid) throw new Error('Ce lien de parrainage n’est plus valide.');
      if (!freshReferrer.exists) throw new Error('Le compte du parrain est introuvable.');
      if (existingReferral.exists || freshInvitee.data()?.referredByUid) throw new Error('Un parrain a déjà été associé à ce compte. Cette attribution ne peut pas être modifiée.');
      const currentEmail = String(freshInvitee.data()?.email || inviteeEmail).trim().toLowerCase();
      const currentReferrerEmail = String(freshReferrer.data()?.email || referrerEmail).trim().toLowerCase();
      const currentPhone = normalizeReferralPhone(freshInvitee.data()?.phone || inviteeAuth.phoneNumber || '');
      const currentReferrerPhone = normalizeReferralPhone(freshReferrer.data()?.phone || referrerAuth.phoneNumber || '');
      if (currentEmail && currentReferrerEmail && currentEmail === currentReferrerEmail) throw new Error('Le parrain et le filleul doivent utiliser des comptes distincts.');
      if (currentPhone && currentReferrerPhone && currentPhone === currentReferrerPhone) throw new Error('Un même numéro de téléphone ne peut pas servir au parrain et au filleul.');
      const invitedName = String(freshInvitee.data()?.displayName || inviteeAuth.displayName || inviteeEmail.split('@')[0] || 'Nouveau membre').slice(0, 100);
      const referralData = {
        referrerUid,
        invitedUid: uid,
        invitedName,
        invitedEmail: inviteeEmail,
        referralCode: code,
        status: 'PENDING_PREMIUM',
        rewardAmount: 1000,
        discountAmount: 1250,
        discountUsed: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      transaction.create(referralRef, referralData);
      transaction.create(referrerRef.collection('referrals').doc(uid), referralData);
      transaction.set(inviteeRef, {
        referredByUid: referrerUid,
        referralDiscountUsed: false,
        referralCodeUsed: code,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    try {
      const invitedName = String(inviteeProfile.displayName || inviteeAuth.displayName || inviteeEmail.split('@')[0] || 'Nouveau membre').slice(0, 100);
      await sendPataEmail({
        to: referrerEmail,
        subject: 'Une personne vient de rejoindre Pata grâce à toi',
        html: referralJoinedEmail({ referrerName: referrerProfile.displayName, invitedName }),
        idempotencyKey: 'pata-referral-joined-' + uid,
      });
    } catch (emailError) { console.warn('[PATA REFERRAL JOINED EMAIL]', emailError.message || emailError); }

    return NextResponse.json({ success: true, attributed: true, discountEligible: true });
  } catch (error) {
    const status = /déjà|même numéro|ne peux pas|moins de 24 heures|invalide/i.test(error.message || '') ? 400 : 500;
    return errorResponse(error.message || 'Impossible d’enregistrer cette invitation.', status);
  }
}

async function handleReferralTransfer(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const destination = String(body.destination || '');
    const amount = Math.round(Number(body.amount));
    const goalId = String(body.goalId || '').trim();
    if (!['wallet', 'goal'].includes(destination)) return errorResponse('Choisis un portefeuille ou une épargne.', 400);
    if (!Number.isSafeInteger(amount) || amount < 100 || amount > 1_000_000_000) return errorResponse('Montant de transfert invalide.', 400);
    if (destination === 'goal' && (!goalId || goalId.includes('/'))) return errorResponse('Choisis une épargne valide.', 400);

    const userRef = adminDb.collection('users').doc(uid);
    const goalRef = destination === 'goal' ? userRef.collection('goals').doc(goalId) : null;
    const ledgerRef = userRef.collection('referralTransactions').doc();
    await adminDb.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      const goalSnap = goalRef ? await transaction.get(goalRef) : null;
      if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
      if (goalRef && (!goalSnap || !goalSnap.exists || goalSnap.data()?.closed)) throw new Error('Cette épargne n’existe plus ou n’est plus active.');
      const userData = userSnap.data() || {};
      const referralBalance = Math.max(0, Number(userData.referralBalance) || 0);
      if (referralBalance < amount) throw new Error('Ton solde de parrainage est insuffisant.');
      transaction.update(userRef, {
        referralBalance: referralBalance - amount,
        ...(destination === 'wallet' ? { balance: (Number(userData.balance) || 0) + amount } : {}),
      });
      if (goalRef) {
        transaction.create(goalRef.collection('deposits').doc(), {
          amount,
          date: getDoualaDateKey(),
          source: 'referral_reward',
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      transaction.create(ledgerRef, {
        type: 'TRANSFER',
        destination,
        amount,
        goalId: destination === 'goal' ? goalId : null,
        status: 'CONFIRMED',
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return NextResponse.json({ success: true, amount, destination });
  } catch (error) {
    return errorResponse(error.message || 'Impossible de transférer ce bonus.', 400);
  }
}


async function settleReferralWithdrawal(data, status) {
  if (!data || data.withdrawalType !== 'referral' || !data.userId || !data.requestId) return;
  const userRef = adminDb.collection('users').doc(data.userId);
  const ledgerRef = userRef.collection('referralTransactions').doc('withdrawal-' + data.requestId);
  await adminDb.runTransaction(async (transaction) => {
    const [userSnap, ledgerSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(ledgerRef),
    ]);
    if (!userSnap.exists) return;
    const userData = userSnap.data() || {};
    const ledger = ledgerSnap.exists ? ledgerSnap.data() || {} : {};
    const pendingMatches = userData.referralWithdrawalRequestId === data.requestId;
    const shouldRefund = ['REJECTED', 'FAILED'].includes(status) && ledger.status === 'PENDING_REVIEW';
    transaction.update(userRef, {
      ...(pendingMatches ? { referralWithdrawalPending: false, referralWithdrawalRequestId: null } : {}),
      ...(shouldRefund ? { referralBalance: (Number(userData.referralBalance) || 0) + Math.max(0, Number(data.amount) || 0) } : {}),
    });
    if (ledgerSnap.exists && ledger.status === 'PENDING_REVIEW') {
      transaction.update(ledgerRef, {
        status,
        processedAt: FieldValue.serverTimestamp(),
      });
    }
  });
}

async function handleReferralWithdrawal(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const amount = Math.floor(Number(body.amount));
    const phoneRaw = String(body.phone || '').replace(/[^0-9+]/g, '');
    let phone = phoneRaw.replace(/^\+/, '');
    if (phone.startsWith('237') && phone.length === 12) phone = phone.slice(3);
    const medium = body.network === 'orange' ? 'orange money' : body.network === 'mtn' ? 'mobile money' : '';
    if (!Number.isSafeInteger(amount) || amount < 100 || amount > 500000) return errorResponse('Le retrait doit être compris entre 100 et 500 000 FCFA.', 400);
    if (!/^6[0-9]{8}$/.test(phone)) return errorResponse('Entre un numéro Mobile Money camerounais valide à 9 chiffres.', 400);
    if (!medium) return errorResponse('Choisis MTN Mobile Money ou Orange Money.', 400);

    const userRef = adminDb.collection('users').doc(uid);
    const requestRef = adminDb.collection('withdrawalRequests').doc();
    const ledgerRef = userRef.collection('referralTransactions').doc('withdrawal-' + requestRef.id);
    const result = await adminDb.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
      const userData = userSnap.data() || {};
      if (userData.referralWithdrawalPending === true) throw new Error('Une demande de retrait de ton bonus est déjà en cours.');
      const available = Math.max(0, Number(userData.referralBalance) || 0);
      if (available < amount) throw new Error('Ton solde de parrainage est insuffisant.');
      transaction.update(userRef, {
        referralBalance: available - amount,
        referralWithdrawalPending: true,
        referralWithdrawalRequestId: requestRef.id,
      });
      transaction.create(requestRef, {
        withdrawalType: 'referral',
        userId: uid,
        email: String(userData.email || ''),
        displayName: String(userData.displayName || 'Utilisateur'),
        phone,
        medium,
        goalName: 'Bonus de parrainage Pata',
        grossAmount: amount,
        amount,
        currency: 'XAF',
        status: 'PENDING_REVIEW',
        requestId: requestRef.id,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.create(ledgerRef, {
        type: 'WITHDRAWAL',
        destination: 'mobile_money',
        amount,
        phone,
        medium,
        requestId: requestRef.id,
        status: 'PENDING_REVIEW',
        createdAt: FieldValue.serverTimestamp(),
      });
      return { requestId: requestRef.id, amount, email: userData.email || '', displayName: userData.displayName || 'Utilisateur', goalName: 'Bonus de parrainage Pata' };
    });
    await cotisationSendWithdrawalEmail({
      withdrawalType: 'referral',
      userId: uid,
      requestId: result.requestId,
      amount: result.amount,
      email: result.email,
      displayName: result.displayName,
      goalName: result.goalName,
    }, 'received');
    return NextResponse.json({ success: true, ...result, message: 'Ta demande de retrait a été reçue. Elle sera vérifiée avant le transfert Mobile Money.' });
  } catch (error) {
    return errorResponse(error.message || 'Impossible de créer la demande de retrait du bonus.', 400);
  }
}

async function handleCotisationReferralPayment(request) {
  let uid = '';
  let reservationId = '';
  let amountReserved = 0;
  let transId = '';
  try {
    const { uid: authenticatedUid } = await authenticate(request);
    uid = authenticatedUid;
    const body = await request.json();
    const groupId = String(body.groupId || '').trim().slice(0, 150);
    const amount = Math.round(Number(body.amount));
    if (!groupId || groupId.includes('/')) return errorResponse('Groupe invalide.', 400);
    if (!Number.isSafeInteger(amount) || amount < 100 || amount % 100 !== 0) return errorResponse('Le versement doit être d’au moins 100 FCFA et par multiples de 100.', 400);

    const groupRef = adminDb.collection('cotisationGroups').doc(groupId);
    const memberRef = groupRef.collection('members').doc(uid);
    const userRef = adminDb.collection('users').doc(uid);
    const paymentRef = adminDb.collection('cotisationPayments').doc();
    transId = paymentRef.id;
    const referralLedgerRef = userRef.collection('referralTransactions').doc('cotisation-' + transId);
    reservationId = randomBytes(18).toString('hex');

    const paymentData = await adminDb.runTransaction(async (transaction) => {
      const [groupSnap, memberSnap, userSnap] = await Promise.all([
        transaction.get(groupRef),
        transaction.get(memberRef),
        transaction.get(userRef),
      ]);
      if (!groupSnap.exists || !memberSnap.exists || !userSnap.exists) throw new Error('Tu ne fais pas partie de ce groupe.');
      const group = groupSnap.data() || {};
      const member = memberSnap.data() || {};
      if (group.status !== 'active' || !group.startedAt) throw new Error('Cette cotisation n’accepte pas encore de versement.');
      if (member.pendingPaymentId) throw new Error('Un paiement est déjà en attente pour cette période.');
      const meta = await resolveCurrentCotisationCycleMeta(groupRef, group, cotisationToday(), transaction);
      if (meta.notStarted) throw new Error('Les cotisations commencent le ' + meta.startDate + '.');
      const cycleRef = groupRef.collection('cycles').doc(meta.cycleKey);
      const contributionRef = cycleRef.collection('contributions').doc(uid);
      const [cycleSnap, contributionSnap] = await Promise.all([
        transaction.get(cycleRef),
        transaction.get(contributionRef),
      ]);
      const cycle = cycleSnap.data() || {};
      const contribution = contributionSnap.data() || {};
      if (cycle.status && cycle.status !== 'OPEN') throw new Error('Cette période n’accepte plus de versement.');
      const due = Math.max(0, cotisationMoney(group.contributionAmount) - cotisationMoney(contribution.amount));
      if (!due || amount > due) throw new Error('Le montant dépasse le reste de ta part (' + due.toLocaleString('fr-FR') + ' FCFA).');
      const penaltyAmount = due > 0 && !cotisationMoney(contribution.penaltyPaid) && cotisationIsLate(group, meta)
        ? cotisationLateFee(group) : 0;
      const grossAmount = amount + penaltyAmount;
      const userData = userSnap.data() || {};
      const available = Math.max(0, Number(userData.referralBalance) || 0);
      if (available < grossAmount) throw new Error('Ton solde de parrainage est insuffisant pour ce versement et sa majoration éventuelle.');
      const expectedMembers = cotisationExpectedMembers(group, group.memberCount);
      const baseTarget = cotisationMoney(cycle.baseTargetAmount) || cotisationMoney(group.contributionAmount) * expectedMembers;
      if (cotisationMoney(cycle.targetAmount || baseTarget) + penaltyAmount > 500000) {
        throw new Error('Cette majoration ferait dépasser la limite autorisée de retrait de 500 000 FCFA.');
      }
      transaction.update(userRef, { referralBalance: available - grossAmount });
      transaction.create(referralLedgerRef, {
        type: 'TRANSFER',
        destination: 'cotisation',
        amount: grossAmount,
        contributionAmount: amount,
        penaltyAmount,
        groupId,
        groupName: group.name || 'Cotisation',
        status: 'PENDING',
        sourcePaymentId: transId,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(memberRef, {
        pendingPaymentId: reservationId,
        pendingPaymentAmount: amount + penaltyAmount,
        pendingPaymentAt: FieldValue.serverTimestamp(),
        pendingPaymentTransId: transId,
      });
      transaction.create(paymentRef, {
        transId,
        reservationId,
        userId: uid,
        groupId,
        groupName: group.name || 'Cotisation',
        cycleKey: meta.cycleKey,
        cycleIndex: meta.cycleIndex,
        cycleStartDate: meta.startDate,
        dueAt: meta.dueAt,
        displayName: userData.displayName || 'Membre',
        amount,
        penaltyAmount,
        fee: 0,
        grossAmount,
        method: 'referral_balance',
        status: 'PENDING',
        createdAt: FieldValue.serverTimestamp(),
      });
      amountReserved = grossAmount;
      return { groupName: group.name || 'Cotisation', cycleKey: meta.cycleKey };
    });

    const confirmation = await confirmCotisationPayment(transId);
    if (!confirmation.confirmed) throw new Error('Le versement n’a pas pu être confirmé. Le solde de parrainage sera restauré.');
    await referralLedgerRef.update({ status: 'CONFIRMED', confirmedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true, amount, paidFromReferralBalance: true, groupName: paymentData.groupName });
  } catch (error) {
    if (uid && transId && amountReserved > 0) {
      try {
        const userRef = adminDb.collection('users').doc(uid);
        const paymentRef = adminDb.collection('cotisationPayments').doc(transId);
        const groupSnap = await paymentRef.get();
        if (groupSnap.exists && groupSnap.data()?.status === 'PENDING') {
          const payment = groupSnap.data();
          const groupRef = adminDb.collection('cotisationGroups').doc(payment.groupId);
          const memberRef = groupRef.collection('members').doc(uid);
          await adminDb.runTransaction(async (transaction) => {
            const [userSnap, memberSnap, freshPayment] = await Promise.all([
              transaction.get(userRef), transaction.get(memberRef), transaction.get(paymentRef),
            ]);
            if (!freshPayment.exists || freshPayment.data()?.status !== 'PENDING') return;
            const userData = userSnap.data() || {};
            if (memberSnap.exists && memberSnap.data()?.pendingPaymentId === reservationId) {
              transaction.update(memberRef, { pendingPaymentId: null, pendingPaymentAmount: 0, pendingPaymentAt: null, pendingPaymentTransId: null });
            }
            transaction.update(userRef, { referralBalance: (Number(userData.referralBalance) || 0) + amountReserved });
            transaction.update(paymentRef, { status: 'FAILED', failedAt: FieldValue.serverTimestamp() });
            transaction.set(referralLedgerRef, { status: 'FAILED', processedAt: FieldValue.serverTimestamp() }, { merge: true });
          });
        }
      } catch (rollbackError) {
        console.error('[PATA REFERRAL COTISATION ROLLBACK]', rollbackError.message || rollbackError);
      }
    }
    return errorResponse(error.message || 'Impossible de payer avec le solde de parrainage.', 400);
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
    let referrerName = '';
    if (profile.referredByUid) {
      const referrerSnap = await adminDb.collection('users').doc(String(profile.referredByUid)).get();
      if (referrerSnap.exists) referrerName = String(referrerSnap.data()?.displayName || '').slice(0, 100);
    }
    const sent = await sendPataEmail({
      to: recipient,
      subject: `Bienvenue sur Pata, ${name} !`,
      html: welcomeEmail({ name, referrerName }),
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
  let uidForCleanup = '';
  let tokenForCleanup = '';
  try {
    const { uid } = await authenticate(request);
    uidForCleanup = uid;
    const body = await request.json();
    const token = String(body.token || '').trim();
    tokenForCleanup = token;
    if (token.length < 40 || token.length > 4096) return errorResponse('Appareil non reconnu.', 400);
    const userRef = adminDb.collection('users').doc(uid);
    const userSnap = await userRef.get();
    const savedTokens = Array.isArray(userSnap.data()?.pushTokens) ? userSnap.data().pushTokens : [];
    if (!savedTokens.includes(token)) {
      await userRef.set({ pushTokens: FieldValue.arrayUnion(token), notificationsEnabled: true, notificationsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    const tag = `pata-test-${Date.now()}`;
    const appUrl = getPataAppUrl(request);
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
    const invalidToken = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(error.code);
    if (invalidToken && uidForCleanup && tokenForCleanup) {
      try {
        const userRef = adminDb.collection('users').doc(uidForCleanup);
        await userRef.set({ pushTokens: FieldValue.arrayRemove(tokenForCleanup), notificationsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
        const fresh = await userRef.get();
        const remaining = Array.isArray(fresh.data()?.pushTokens) ? fresh.data().pushTokens : [];
        await userRef.set({ notificationsEnabled: remaining.length > 0 }, { merge: true });
      } catch (cleanupError) {
        console.warn('[PUSH TEST TOKEN CLEANUP]', cleanupError.code || cleanupError.message);
      }
    }
    const message = invalidToken
      ? 'Ce jeton est devenu obsolète et vient d’être supprimé. Dans les paramètres Pata, utilise « Réparer cet appareil » pour créer et enregistrer un nouveau jeton.'
      : 'Le test de notification a échoué. Vérifie les autorisations et les paramètres de notification de cet appareil.';
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
    const usersSnapshot = await adminDb.collection('users').get();
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const tokens = Array.isArray(userData.pushTokens) ? [...new Set(userData.pushTokens.filter(Boolean))] : [];
      if (userData.notificationsDailyDate === today) { skipped += 1; continue; }
      try {
        const monthStart = `${month}-01`;
        const [todayExpensesSnap, monthExpensesSnap, budgetsSnap, automationsSnap, goalsSnap] = await Promise.all([
          userDoc.ref.collection('expenses').where('date', '==', today).get(),
          userDoc.ref.collection('expenses').where('date', '>=', monthStart).where('date', '<=', today).get(),
          userDoc.ref.collection('budgets').where('month', '==', month).get(),
          userDoc.ref.collection('automations').get(),
          userDoc.ref.collection('goals').limit(20).get(),
        ]);
        const todayExpenses = todayExpensesSnap.docs.map((doc) => doc.data()).filter((item) => !item.expenseType || item.expenseType === 'consumption');
        const monthExpenses = monthExpensesSnap.docs.map((doc) => doc.data()).filter((item) => !item.expenseType || item.expenseType === 'consumption');
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
        const topCategory = Object.entries(categoryTotals).sort((left, right) => right[1] - left[1])[0] || null;
        const automationRuns = runsToday.filter((item) => item.lastRunStatus === 'EXECUTED');
        const savingsReminders = [];
        for (const goalDoc of goalsSnap.docs) {
          const goal = goalDoc.data() || {};
          if (goal.closed || goal.withdrawnAt || goal.type !== 'goal' || !Number(goal.frequencyDays)) continue;
          const depositsSnap = await goalDoc.ref.collection('deposits').orderBy('createdAt', 'desc').limit(1).get();
          const latestDeposit = depositsSnap.docs[0]?.data() || {};
          const anchorDate = String(latestDeposit.date || goal.startDate || today).slice(0, 10);
          const anchor = new Date(anchorDate + 'T00:00:00Z');
          const current = new Date(today + 'T00:00:00Z');
          const daysSinceDeposit = Number.isNaN(anchor.getTime()) ? 0 : Math.floor((current.getTime() - anchor.getTime()) / 86400000);
          if (daysSinceDeposit >= Math.max(1, Number(goal.frequencyDays))) savingsReminders.push({ name: String(goal.name || 'ton objectif'), frequencyDays: Number(goal.frequencyDays), daysSinceDeposit });
        }

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
        } else if (savingsReminders.length) {
          const goal = savingsReminders.sort((x, y) => y.daysSinceDeposit - x.daysSinceDeposit)[0];
          title = 'Ton épargne attend ton prochain versement';
          body = `Tu avais prévu d’alimenter « ${goal.name} » tous les ${goal.frequencyDays} jour(s). Ton dernier versement remonte à ${goal.daysSinceDeposit} jour(s). Même un petit montant peut t’aider à garder le rythme.`;
          target = '/goals';
        } else if (topCategory && monthExpenses.length) {
          const labels = { food: 'Alimentation', transport: 'Transport', housing: 'Logement', internet: 'Internet', health: 'Santé', leisure: 'Loisirs', investment: 'Investissement', contribution: 'Cotisations', savings: 'Épargne', other: 'Autres' };
          const categoryName = labels[topCategory[0]] || 'une catégorie';
          title = 'Un aperçu de tes dépenses du mois';
          body = `Ta catégorie la plus élevée est ${categoryName.toLowerCase()} avec ${Number(topCategory[1]).toLocaleString('fr-FR')} FCFA enregistrés. Consulte ton analyse pour voir comment cette catégorie évolue et ajuster ton budget si nécessaire.`;
          target = '/reports';
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
        let emailSent = false;
        if(userData.email&&String(userData.email).includes('@')){try{await sendPataEmail({to:userData.email,subject:title,html:financialReminderEmail({name:userData.displayName,headline:title,message:body,category:overBudget?({food:'Alimentation',transport:'Transport',housing:'Logement',internet:'Internet',health:'Santé',leisure:'Loisirs',investment:'Investissement',contribution:'Cotisations',savings:'Épargne',other:'Autres'}[overBudget.categoryId]||'Dépenses'):'',amount:overBudget?overBudget.spent:null,budgetAmount:overBudget?overBudget.allocated:null,targetUrl:target}),idempotencyKey:'pata-daily-financial-'+userDoc.id+'-'+today});emailSent=true;}catch(emailError){console.warn('[DAILY FINANCIAL EMAIL]',userDoc.id,emailError.message||emailError);}}
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
        if (delivered > 0 || emailSent) sent += 1;
        else failed += 1;
      } catch (userError) {
        failed += 1;
        console.error(`[PUSH] Échec utilisateur ${userDoc.id}:`, userError.message);
      }
    }
    // Le planificateur quotidien existant gère également les rappels de cotisation.
    // Cela évite d'exiger un troisième Cron sur les projets Vercel Hobby.
    const cotisationResponse = await handleCotisationsScheduler(request);
    const cotisationSummary = await cotisationResponse.json().catch(() => ({ success: false, error: 'Réponse du planificateur de cotisations illisible.' }));
    return NextResponse.json({
      success: true, date: today, checked: usersSnapshot.size, sent, skipped, failed,
      cotisations: cotisationSummary,
    });
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
    const projectId = String(body.projectId || '').trim().slice(0, 150);
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
      let projectName = '';
      if (projectId) {
        if (!isPremiumAccount(userData)) throw new Error('L’association d’un revenu à un projet est réservée à Pata Premium.');
        if (projectId.includes('/')) throw new Error('Projet invalide.');
        const projectSnap = await transaction.get(userRef.collection('projects').doc(projectId));
        if (!projectSnap.exists || projectSnap.data()?.status === 'archived') throw new Error('Le projet choisi est introuvable ou archivé.');
        projectName = String(projectSnap.data()?.name || '').slice(0, 100);
      }
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
        ...(projectId ? { projectId, projectName } : {}),
        ...optionalMetadata,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(userRef, {
        monthlyStats: stats,
        lifetimeIncomeAmount: FieldValue.increment(amount),
        lifetimeIncomeCount: FieldValue.increment(1),
      });
      return { id: incomeRef.id, current: stats.incomes, limit: PLAN_LIMITS.FREE.incomes, ...(projectId ? { projectId, projectName } : {}) };
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
        penaltyPolicyStartedOn: GOAL_PENALTY_EFFECTIVE_DATE,
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
        patch.penaltyEnabled = true;
        patch.penaltyRate = GOAL_LATE_PENALTY_RATE;
        patch.penaltyPolicyStartedOn = GOAL_PENALTY_EFFECTIVE_DATE;
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
              if (profileData.email && String(profileData.email).includes('@')) {
                try {
                  await sendPataEmail({
                    to: profileData.email,
                    subject: 'Ton bilan hebdomadaire est disponible',
                    html: financialReminderEmail({
                      name: profileData.displayName,
                      headline: 'Ton bilan hebdomadaire est prêt',
                      message: 'Ton résumé de la semaine est disponible dans Pata. Tu peux retrouver tes revenus, tes dépenses courantes, tes objectifs d’épargne et les évolutions de ton budget, puis décider des ajustements utiles pour la semaine qui commence.',
                      targetUrl: '/reports',
                    }),
                    idempotencyKey: 'pata-weekly-report-email-' + userDoc.id + '-' + weeklyReport.weekStart,
                  });
                } catch (emailError) { console.warn('[WEEKLY REPORT EMAIL]', userDoc.id, emailError.message || emailError); }
              }
              const notificationId = `weekly-${weeklyReport.weekStart}`;
                const title = 'Ton bilan hebdomadaire est disponible';
                const body = 'Ton résumé de la semaine est prêt. Consulte tes revenus, tes dépenses et les tendances de ton budget dans Pata.';
                await userDoc.ref.collection('notifications').doc(notificationId).set({
                title, body, target: '/reports', source: 'weekly_report',
                weekStart: weeklyReport.weekStart, weekEnd: weeklyReport.weekEnd,
                read: false, readAt: null, createdAt: FieldValue.serverTimestamp(),
              }, { merge: true });
              if (profileData.notificationsEnabled) {
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
    const [userDoc, incomesSnap, expensesSnap, goalsSnap, budgetsSnap, automationsSnap, memorySnap, categoriesSnap, projectsSnap, cotisationMembershipsSnap] = await Promise.all([
      userRef.get(),
      userRef.collection('incomes').orderBy('date', 'desc').limit(100).get(),
      userRef.collection('expenses').orderBy('date', 'desc').limit(200).get(),
      userRef.collection('goals').limit(20).get(),
      userRef.collection('budgets').limit(50).get(),
      userRef.collection('automations').limit(50).get(),
      userRef.collection('ai_memory').doc('profile').get(),
      userRef.collection('categories').limit(50).get(),
      userRef.collection('projects').orderBy('createdAt', 'desc').limit(50).get(),
      userRef.collection('cotisationMemberships').limit(50).get(),
    ]);

    const goalsWithDeposits = await Promise.all(goalsSnap.docs.map(async (goalDoc) => {
      const depositsSnap = await goalDoc.ref.collection('deposits').get();
      return { id: goalDoc.id, ...goalDoc.data(), deposits: depositsSnap.docs.map((depositDoc) => depositDoc.data()) };
    }));

    const cotisations = await Promise.all(cotisationMembershipsSnap.docs.map(async (membershipDoc) => {
      const membership = membershipDoc.data() || {};
      const groupRef = adminDb.collection('cotisationGroups').doc(String(membership.groupId || membershipDoc.id));
      const groupSnap = await groupRef.get();
      if (!groupSnap.exists) return null;
      const group = groupSnap.data() || {};
      const membersSnap = await groupRef.collection('members').orderBy('turnOrder', 'asc').limit(50).get();
      const members = membersSnap.docs
        .map((memberDoc) => ({ uid: memberDoc.id, ...memberDoc.data() }))
        .filter((member) => member.active !== false);
      const hasAssignedOrder = Boolean(group.orderConfirmedAt) && members.length > 0 && members.every((member) => Number.isInteger(Number(member.turnOrder)) && Number(member.turnOrder) >= 1);
      members.sort((a, b) => hasAssignedOrder
        ? Number(a.turnOrder) - Number(b.turnOrder)
        : String(a.displayName || '').localeCompare(String(b.displayName || ''), 'fr'));
      const meta = await resolveCurrentCotisationCycleMeta(groupRef, group);
      const cycleRef = groupRef.collection('cycles').doc(meta.cycleKey);
      const [cycleSnap, contributionsSnap] = await Promise.all([
        cycleRef.get(),
        cycleRef.collection('contributions').limit(50).get(),
      ]);
      const contributionMap = new Map(contributionsSnap.docs.map((doc) => [doc.id, doc.data()]));
      const turnMember = group.startedAt && members.length ? members[meta.cycleIndex % members.length] : null;
      const myMember = members.find((member) => member.uid === uid);
      const mine = contributionMap.get(uid) || {};
      const myPaid = cotisationMoney(mine.amount);
      const myPenaltyPaid = cotisationMoney(mine.penaltyPaid);
      const memberContributions = members.map((member) => {
        const value = contributionMap.get(member.uid) || {};
        const principal = cotisationMoney(value.amount);
        const penalty = cotisationMoney(value.penaltyPaid);
        return {
          position: Number(member.turnOrder) || null,
          displayName: String(member.displayName || 'Membre'),
          isOwner: member.uid === group.ownerId,
          isMe: member.uid === uid,
          principalPaid: principal,
          penaltyPaid: penalty,
          totalPaid: principal + penalty,
          remainingPrincipal: Math.max(0, cotisationMoney(group.contributionAmount) - principal),
        };
      });
      const expectedMembers = cotisationExpectedMembers(group, members.length);
      const baseTarget = cotisationMoney(cycleSnap.data()?.baseTargetAmount) || cotisationMoney(group.contributionAmount) * expectedMembers;
      const totalCollected = cotisationMoney(cycleSnap.data()?.totalCollected);
      const targetAmount = cotisationMoney(cycleSnap.data()?.targetAmount) || baseTarget;
      const status = !group.startedAt ? 'NOT_STARTED' : cycleSnap.data()?.status || (totalCollected >= targetAmount && targetAmount > 0 ? 'READY' : 'OPEN');
      const reminderAfter = cotisationAddDays(meta.dueAt, cotisationMoney(group.graceDays));
      const currentUserPenaltyDue = cotisationIsLate(group, meta) && myPaid < cotisationMoney(group.contributionAmount) && !myPenaltyPaid
        ? cotisationLateFee(group) : 0;
      return {
        id: groupRef.id,
        name: group.name || membership.name || 'Cotisation',
        role: group.ownerId === uid ? 'Chef du groupe' : 'Membre',
        status: group.status || 'active',
        started: Boolean(group.startedAt),
        frequency: cotisationFrequencyLabel(group.frequency),
        contributionAmount: cotisationMoney(group.contributionAmount),
        expectedMembers,
        memberCount: members.length,
        dueDay: group.dueDay || null,
        dueAt: meta.dueAt,
        graceDays: cotisationMoney(group.graceDays),
        graceEndDate: reminderAfter,
        lateFeeLabel: cotisationPenaltyLabel(group),
        lateFeeDue: currentUserPenaltyDue,
        myPosition: Number(myMember?.turnOrder) || null,
        myPrincipalPaid: myPaid,
        myPenaltyPaid,
        myRemaining: Math.max(0, cotisationMoney(group.contributionAmount) - myPaid),
        currentBeneficiary: turnMember?.displayName || 'Non défini',
        beneficiaryPosition: Number(turnMember?.turnOrder) || null,
        myTurnToReceive: turnMember?.uid === uid,
        basePot: baseTarget,
        totalCollected,
        totalTargetWithLateFees: targetAmount,
        remainingToCollect: Math.max(0, targetAmount - totalCollected),
        cycleStatus: status,
        members: memberContributions,
      };
    }));
    const cotisationData = cotisations.filter(Boolean);

    const userData = {
      profile: userDoc.exists ? userDoc.data() : {},
      incomes: incomesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      expenses: expensesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      goals: goalsWithDeposits,
      budgets: budgetsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      projects: projectsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      cotisations: cotisationData,
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
Tu connais les rubriques disponibles : Tableau de bord, Portefeuille, Dépenses, Revenus (dont les Prévisions vitales), Budgets, Objectifs, Cotisations, Rapports, Premium et Paramètres. Les projets sont une fonction Premium accessible depuis Dépenses.
COTISATIONS : tu peux consulter les groupes auxquels l’utilisateur appartient, son rôle (chef ou membre), les positions définies par le chef, le nombre de participants attendu/inscrits, le bénéficiaire du tour courant, l’échéance, le délai de grâce, la règle de majoration, les contributions confirmées, les montants restant à verser et le statut du cycle. Le principal et les majorations sont indiqués séparément. Les frais de service sont de 5 % à chaque versement ; Pata n’ajoute aucun frais de retrait. Ne considère jamais un lien de paiement initié comme une contribution confirmée : seuls les montants déjà inscrits dans les données de contributions après validation du prestataire peuvent être présentés comme payés. Tu peux expliquer comment rejoindre, réorganiser les positions avant le lancement ou effectuer un versement, mais ne prétends jamais avoir lancé, réorganisé ou payé une cotisation si tu ne disposes pas du résultat réel de l’action.
CLASSIFICATION DES SORTIES — À RESPECTER POUR CHAQUE SAISIE ET CHAQUE ANALYSE :
1. consumption / dépense courante : nourriture, transport, loyer, factures, loisirs et autres besoins du quotidien. C’est cette catégorie qui mesure la consommation et permet de dire si la personne dépense beaucoup au quotidien.
2. project / dépense liée à un projet : achat ou réalisation identifié(e), par exemple construire une maison, acheter un ordinateur pour un objectif précis, équiper un logement ou réaliser un projet personnel. Présente le projet, ses revenus réservés et ses sorties séparément.
3. savings / épargne : argent transféré vers un objectif ou une réserve. C’est une sortie de l’argent disponible, mais pas une consommation ni une perte.
4. investment / investissement : argent affecté à une activité ou à un actif dans l’intention de créer une valeur future. Ce n’est pas une dépense de consommation.
Pour calculer le solde de trésorerie, soustrais toutes les sorties des revenus. Pour juger la consommation et les dépenses quotidiennes, utilise uniquement consumption. Ne dis jamais qu’un utilisateur a « trop dépensé » en comptant ses versements d’épargne ou investissements comme de la consommation. Les revenus affectés à un projet sont réservés exclusivement à ce projet : ils ne financent ni les dépenses générales ni un autre projet. En cas de doute sur la nature d’une opération, demande une précision plutôt que de deviner. Quand on te demande comment faire quelque chose, explique le chemin exact avec les noms visibles dans l’application, dans l’ordre, avec des mots simples. Si l’utilisateur semble perdu, propose de le faire à sa place lorsque l’action est prise en charge et que les informations nécessaires sont disponibles. Sinon, donne un bouton vers la page concernée.
Les prévisions vitales servent à estimer les dépenses nécessaires sur une période; elles ne constituent pas un revenu réel tant que l’utilisateur ne demande pas explicitement de transformer son plan en revenu et budgets. La prévision de durée du capital estime combien de jours un montant peut tenir selon les dépenses quotidiennes, hebdomadaires et mensuelles déclarées. Le Portefeuille Pata est un solde interne destiné aux recharges et paiements pris en charge par Pata, pas un compte bancaire ni un Mobile Money.

GUIDE PRATIQUE DES RUBRIQUES
- Dépenses : ouvrir « Dépenses », choisir l’ajout, indiquer le montant, la catégorie, la date et, si souhaité, le revenu qui finance la dépense, puis enregistrer. Une dépense répartie sur plusieurs revenus peut apparaître en plusieurs lignes correspondant aux parts financées.
- Revenus : ouvrir « Revenus », ajouter le montant, le nom de la source et la date. Une entrée enregistrée ne peut plus être modifiée : elle peut uniquement être consultée ou supprimée. Pour enregistrer une nouvelle entrée ou un montant supplémentaire, il faut ajouter un nouveau revenu. La durée de consommation est estimée à partir des dépenses associées à cette source.
- Budgets : ouvrir « Budgets », choisir le mois et la source de revenu, puis toucher une catégorie pour voir les opérations, le montant prévu, le montant dépensé et le reste. Le bouton de modification permet de définir l’enveloppe; le bouton de conseil ouvre Mč avec les chiffres de cette catégorie.
- Prévisions vitales : ouvrir « Revenus », accéder aux « Prévisions vitales », définir les besoins par catégorie et leur fréquence. L’analyse avec Mč explique le résultat; la transformation en revenu et budgets ne doit se faire que sur demande explicite.
- Prévision de durée du capital : dans « Revenus », saisir le capital disponible et les dépenses prévues par jour, semaine ou mois. Pata estime la durée et la date de fin, puis peut envoyer ces chiffres à Mč pour une analyse complémentaire.
- Objectifs : ouvrir « Objectifs », créer un objectif avec son nom, sa somme cible et, lorsque nécessaire, sa date limite. Les versements et la progression sont consultables dans cette rubrique. Les objectifs datés peuvent entraîner un ajustement de retard de 7 % du montant resté impayé à chaque échéance, uniquement pour les échéances à partir du 9 novembre 2026. Le montant est calculé sur le manque réel à la date prévue, et non sur la cible totale. Il est déduit du montant remboursé lors du retrait ou de la clôture. Les caisses et tirelires libres ne sont jamais concernées. Une annulation anticipée d’un objectif daté entraîne aussi des frais distincts de 10 % du montant épargné. Les tirelires libres ne sont soumises ni aux frais de retard ni aux frais d’annulation. Ne présente jamais cette règle comme optionnelle ou modifiable dans les paramètres.
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
- Pour les objectifs datés, l'ajustement de retard est de 7 % du montant réellement resté impayé à chaque échéance, uniquement depuis le 9 novembre 2026. Il ne se calcule pas sur la cible totale et ne s'applique jamais aux caisses ou tirelires libres.
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
      transaction.update(requestRef, {
        status: 'REJECTED',
        adminNote: String(body.reason || 'Demande refusée après vérification.').slice(0, 300),
        reviewedAt: FieldValue.serverTimestamp(),
      });
      return { ...data, requestId };
    });
    if (result.withdrawalType === 'cotisation') await restoreCotisationCycle(result, 'REJECTED');
    else if (result.withdrawalType === 'referral') await settleReferralWithdrawal({ ...result, requestId }, 'REJECTED');
    else await unlockGoalAfterPayout(result.userId, result.goalId, 'REJECTED', requestId);
    await cotisationSendWithdrawalEmail(result, 'rejected');
    await adminDb.collection('users').doc(result.userId).collection('notifications').doc('withdrawal-' + requestId).set({
      title: 'Demande de retrait refusée',
      body: 'Ta demande de retrait a été refusée après vérification. Consulte ton historique pour plus de détails.',
      target: result.withdrawalType === 'cotisation' ? '/cotisations' : result.withdrawalType === 'referral' ? '/settings' : '/goals',
      createdAt: FieldValue.serverTimestamp(),
    }).catch(() => {});
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
      return errorResponse('Le service de retrait n’est pas encore disponible. Contacte l’assistance pour plus d’informations.', 503);
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
    if (!Number.isInteger(payload.amount) || payload.amount < 100 || payload.amount > 500000) throw new Error('Le montant du retrait doit être compris entre 100 et 500 000 FCFA pour une seule opération.');
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
        return errorResponse('La réponse du prestataire est incertaine. Vérifie le statut de cette demande auprès du support avant toute nouvelle tentative.', 502);
      }
      await requestRef.update({ status: 'FAILED', providerMessage, failedAt: FieldValue.serverTimestamp() });
      if (requestData.withdrawalType === 'cotisation') await restoreCotisationCycle({ ...requestData, requestId: requestRef.id }, 'FAILED');
      else if (requestData.withdrawalType === 'referral') await settleReferralWithdrawal({ ...requestData, requestId: requestRef.id }, 'FAILED');
      else await unlockGoalAfterPayout(requestData.userId, requestData.goalId, 'FAILED', requestRef.id);
      await adminDb.collection('users').doc(requestData.userId).collection('notifications').doc(`withdrawal-${requestRef.id}`).set({ title: 'Retrait non effectué', body: 'Le prestataire n’a pas pu effectuer ce retrait. Consulte ton historique ou contacte le support.', target: requestData.withdrawalType === 'cotisation' ? '/cotisations' : requestData.withdrawalType === 'referral' ? '/settings' : '/goals', createdAt: FieldValue.serverTimestamp() }).catch(() => {});
      await cotisationSendWithdrawalEmail({ ...requestData, requestId: requestRef.id }, 'failed');
      return errorResponse(providerMessage, 502);
    }
    if (!result.transId) {
      await requestRef.update({ status: 'RECONCILIATION_REQUIRED', providerMessage: 'Le prestataire a répondu sans identifiant de paiement. Vérification manuelle requise.' });
      return errorResponse('Le prestataire a répondu de manière inattendue. Contacte le support avant toute nouvelle action.', 502);
    }
    const finalStatus = await adminDb.runTransaction(async (transaction) => {
      const freshRequest = await transaction.get(requestRef);
      if (!freshRequest.exists) throw new Error('La demande de retrait est introuvable.');
      const status = freshRequest.data().status;
      if (status === 'PAID' || status === 'FAILED' || status === 'REJECTED') return status;
      transaction.update(requestRef, {
        status: 'PROCESSING', fapshiTransId: result.transId,
        providerMessage: result.message || 'Demande transmise au prestataire.',
        providerDateInitiated: result.dateInitiated || null,
        submittedAt: FieldValue.serverTimestamp(),
      });
      return 'PROCESSING';
    });
    if (finalStatus === 'PROCESSING') {
      if (requestData.withdrawalType === 'cotisation') await restoreCotisationCycle({ ...requestData, requestId: requestRef.id }, 'PROCESSING');
      await cotisationSendWithdrawalEmail({ ...requestData, requestId: requestRef.id }, 'approved');
    }
    return NextResponse.json({ success: true, status: finalStatus, transId: result.transId });
  } catch (error) {
    if (requestRef && requestData) {
      // En cas de timeout réseau, ne pas écraser un webhook qui aurait déjà confirmé le paiement.
      await adminDb.runTransaction(async (transaction) => {
        const freshRequest = await transaction.get(requestRef);
        if (!freshRequest.exists || ['PAID', 'FAILED', 'REJECTED'].includes(freshRequest.data().status)) return;
        transaction.update(requestRef, {
          status: 'RECONCILIATION_REQUIRED',
          providerMessage: 'Réponse incertaine. Vérification manuelle requise avant tout nouvel essai.',
        });
      }).catch(() => {});
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
    const data = { ...snapshot.data(), requestId: requestRef.id };
    const status = String(body.status || '').toUpperCase();
    if (status === 'SUCCESSFUL' && !['PAID', 'FAILED', 'REJECTED'].includes(data.status)) {
      await requestRef.update({
        status: 'PAID', fapshiTransId: body.transId || data.fapshiTransId || null,
        financialTransId: body.financialTransId || null, paidAt: FieldValue.serverTimestamp(),
        providerPayload: { status, amount: Number(body.amount) || data.amount },
      });
      if (data.withdrawalType === 'cotisation') await restoreCotisationCycle(data, 'PAID');
      else if (data.withdrawalType === 'referral') await settleReferralWithdrawal(data, 'PAID');
      else await unlockGoalAfterPayout(data.userId, data.goalId, 'PAID', requestRef.id);
      const target = data.withdrawalType === 'cotisation' ? '/cotisations' : data.withdrawalType === 'referral' ? '/settings' : '/goals';
      await adminDb.collection('users').doc(data.userId).collection('notifications').doc('withdrawal-' + requestRef.id).set({
        title: 'Retrait envoyé',
        body: 'Ton retrait de ' + Number(data.amount).toLocaleString('fr-FR') + ' FCFA a été envoyé.',
        target, createdAt: FieldValue.serverTimestamp(),
      });
      await cotisationSendWithdrawalEmail(data, 'paid');
    } else if (['FAILED', 'EXPIRED'].includes(status) && !['PAID', 'FAILED', 'REJECTED'].includes(data.status)) {
      await requestRef.update({
        status: 'FAILED',
        providerMessage: String(body.reason || 'Le retrait n’a pas pu être effectué.').slice(0, 300),
        failedAt: FieldValue.serverTimestamp(),
      });
      if (data.withdrawalType === 'cotisation') await restoreCotisationCycle(data, 'FAILED');
      else if (data.withdrawalType === 'referral') await settleReferralWithdrawal(data, 'FAILED');
      else await unlockGoalAfterPayout(data.userId, data.goalId, 'FAILED', requestRef.id);
      const target = data.withdrawalType === 'cotisation' ? '/cotisations' : data.withdrawalType === 'referral' ? '/settings' : '/goals';
      await adminDb.collection('users').doc(data.userId).collection('notifications').doc('withdrawal-' + requestRef.id).set({
        title: 'Retrait non effectué',
        body: 'Le prestataire n’a pas pu effectuer ce retrait. Consulte ton historique ou contacte le support.',
        target, createdAt: FieldValue.serverTimestamp(),
      }).catch(() => {});
      await cotisationSendWithdrawalEmail(data, 'failed');
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
      const latePenalty = goal.type === 'piggybank' ? 0 : Math.max(0, Math.round(Number(plan.penalty) || 0));
      const cancellationPenalty = actionType === 'cancel' && goal.type !== 'piggybank'
        ? Math.round(totalDeposited * 0.10) : 0;
      const platformFee = 0; // Aucun frais de retrait ajouté par Pata.
      const amount = Math.floor(Math.max(0, totalDeposited - debt - latePenalty - cancellationPenalty - platformFee));
      if (amount < 100) throw new Error('Le montant disponible est inférieur au minimum de retrait de 100 FCFA.');
      if (amount > 500000) throw new Error('Le retrait dépasse le plafond autorisé de 500 000 FCFA pour une seule opération. Contacte le support Pata pour organiser la suite sans risquer de bloquer ton épargne.');
      const userData = userSnap.data();
      transaction.create(requestRef, {
        withdrawalType: 'savings',
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
        latePenalty,
        cancellationPenalty,
        platformFee,
        amount,
        currency: 'XAF',
        status: 'PENDING_REVIEW',
        requestId: requestRef.id,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(goalRef, { withdrawalPending: true, withdrawalRequestId: requestRef.id, withdrawalStatus: 'PENDING_REVIEW' });
      return { amount, grossAmount: totalDeposited, debt, latePenalty, cancellationPenalty, platformFee, requestId: requestRef.id, goalName: goal.name || (goal.type === 'piggybank' ? 'Tirelire' : 'Objectif') };
    });
    const userForEmail = await userRef.get();
    await cotisationSendWithdrawalEmail({
      userId: uid, requestId: result.requestId, amount: result.amount,
      email: userForEmail.data()?.email || '', displayName: userForEmail.data()?.displayName || 'Utilisateur',
      goalName: (actionType === 'cancel' ? 'Clôture · ' : 'Retrait · ') + result.goalName,
      withdrawalType: 'savings',
    }, 'received');
    return NextResponse.json({ success: true, ...result, message: 'Ta demande a été reçue. Elle sera vérifiée avant l’envoi de l’argent.' });
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

async function buildAdminEmailHighlights(uid) {
  const userRef = adminDb.collection('users').doc(uid);
  const [projectsSnap, goalsSnap, membershipsSnap] = await Promise.all([
    userRef.collection('projects').orderBy('createdAt', 'desc').limit(30).get(),
    userRef.collection('goals').orderBy('createdAt', 'desc').limit(20).get(),
    userRef.collection('cotisationMemberships').limit(30).get(),
  ]);

  const projects = projectsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const activeProjects = projects.filter((project) => project.status === 'active');
  const completedProjects = projects.filter((project) => ['completed', 'done'].includes(String(project.status || '').toLowerCase()));

  const savings = await Promise.all(goalsSnap.docs.map(async (goalDoc) => {
    const data = goalDoc.data() || {};
    const summary = await getGoalCashDepositSummary(goalDoc.ref).catch(() => ({ unavailable: true }));
    const deposited = summary.unavailable ? null : Number(summary.cashTotal ?? summary.total ?? 0);
    const target = Math.max(0, Number(data.targetAmount) || 0);
    return {
      id: goalDoc.id,
      name: String(data.name || 'Objectif sans nom'),
      active: !data.closed && !data.withdrawnAt,
      deposited,
      target,
      progress: target > 0 && deposited !== null ? Math.min(100, Math.round(deposited / target * 100)) : null,
    };
  }));
  const completedSavings = savings.filter((goal) => goal.deposited !== null && goal.target > 0 && goal.deposited >= goal.target);
  const completedSavingsIds = new Set(completedSavings.map((goal) => goal.id));
  const activeSavings = savings.filter((goal) => goal.active && !completedSavingsIds.has(goal.id));

  const cotisations = await Promise.all(membershipsSnap.docs.map(async (membershipDoc) => {
    const membership = membershipDoc.data() || {};
    const groupRef = adminDb.collection('cotisationGroups').doc(String(membership.groupId || membershipDoc.id));
    const groupSnap = await groupRef.get();
    if (!groupSnap.exists) return null;
    const group = groupSnap.data() || {};
    const membersSnap = await groupRef.collection('members').where('active', '==', true).get();
    const cyclesSnap = await groupRef.collection('cycles').orderBy('cycleIndex', 'desc').limit(6).get().catch(() => ({ docs: [] }));
    const latestCycleDoc = cyclesSnap.docs[0] || null;
    const latestCycle = latestCycleDoc?.data() || {};
    const memberRows = membersSnap.docs.map((doc) => ({ uid: doc.id, ...doc.data() }))
      .sort((a, b) => Number(a.turnOrder || 0) - Number(b.turnOrder || 0));
    const ownMember = memberRows.find((member) => member.uid === uid) || null;
    const ownContributionSnap = latestCycleDoc
      ? await groupRef.collection('cycles').doc(latestCycleDoc.id).collection('contributions').doc(uid).get()
      : null;
    const ownContribution = ownContributionSnap?.exists ? ownContributionSnap.data() : {};
    const myPaid = cotisationMoney(ownContribution.amount) + cotisationMoney(ownContribution.penaltyPaid);
    const myRemaining = Math.max(0, cotisationMoney(group.contributionAmount) - cotisationMoney(ownContribution.amount));
    const currentBeneficiary = group.startedAt && memberRows.length
      ? memberRows[(cotisationMoney(latestCycle.cycleIndex) % memberRows.length)]
      : null;
    return {
      name: String(group.name || membership.name || 'Cotisation'),
      role: group.ownerId === uid ? 'Chef de groupe' : 'Membre',
      frequency: cotisationFrequencyLabel(group.frequency),
      amount: cotisationMoney(group.contributionAmount),
      memberCount: membersSnap.size,
      expectedMembers: cotisationExpectedMembers(group, membersSnap.size),
      active: group.status === 'active',
      started: Boolean(group.startedAt),
      position: ownMember?.turnOrder ? cotisationMoney(ownMember.turnOrder) : null,
      beneficiaryName: currentBeneficiary?.displayName || null,
      isMyTurn: currentBeneficiary?.uid === uid,
      dueAt: String(latestCycle.dueAt || ''),
      myPaid,
      myRemaining,
      lastCycleStatus: String(latestCycle.status || ''),
      lastCycleTotal: cotisationMoney(latestCycle.totalCollected),
      lastCycleTarget: cotisationMoney(latestCycle.targetAmount || latestCycle.baseTargetAmount),
    };
  }));
  const activeCotisations = cotisations.filter((item) => item && item.active);
  const completedCotisations = cotisations.filter((item) => item && item.lastCycleStatus === 'PAID');

  const lines = [];
  if (completedProjects.length) {
    lines.push('Projets réalisés : ' + completedProjects.slice(0, 5).map((item) => item.name).join(', ') + '.');
  }
  if (activeProjects.length) {
    lines.push('Projets en cours : ' + activeProjects.slice(0, 5).map((item) => item.name).join(', ') + '.');
  }
  if (completedSavings.length) {
    lines.push('Objectifs d’épargne atteints : ' + completedSavings.slice(0, 5).map((item) => item.name + (item.deposited === null ? '' : ' (' + item.deposited.toLocaleString('fr-FR') + ' FCFA')).join(', ') + '.');
  }
  if (activeSavings.length) {
    lines.push('Épargnes en cours : ' + activeSavings.slice(0, 5).map((item) => item.name + (item.progress === null ? '' : ' (' + item.progress + ' % de progression)')).join(', ') + '.');
  }
  if (completedCotisations.length) {
    lines.push('Tours de cotisation terminés : ' + completedCotisations.slice(0, 5).map((item) => item.name + ' (' + item.lastCycleTotal.toLocaleString('fr-FR') + ' FCFA réunis)').join(', ') + '.');
  }
  if (activeCotisations.length) {
    lines.push('Cotisations en cours : ' + activeCotisations.slice(0, 5).map((item) => {
      const details = [
        item.name + ' — ' + item.amount.toLocaleString('fr-FR') + ' FCFA par personne, ' + item.frequency,
        item.memberCount + '/' + item.expectedMembers + ' membres',
        item.role,
        item.started ? (item.position ? 'ta position : ' + item.position : 'position à confirmer') : 'en attente du lancement',
        item.started && item.beneficiaryName ? 'bénéficiaire actuel : ' + item.beneficiaryName + (item.isMyTurn ? ' (ton tour)' : '') : '',
        item.dueAt ? 'échéance : ' + item.dueAt : '',
        item.started ? 'versements confirmés par toi : ' + item.myPaid.toLocaleString('fr-FR') + ' FCFA, reste personnel : ' + item.myRemaining.toLocaleString('fr-FR') + ' FCFA' : '',
        item.started ? 'collecte du tour : ' + item.lastCycleTotal.toLocaleString('fr-FR') + ' / ' + item.lastCycleTarget.toLocaleString('fr-FR') + ' FCFA' : '',
      ].filter(Boolean);
      return details.join(' ; ');
    }).join(' | ') + '.');
  }
  if (!lines.length) lines.push('Ton compte ne comporte pas encore de projet, d’objectif d’épargne ou de cotisation renseigné. Tu peux commencer progressivement, selon tes priorités.');
  return {
    completedProjects: completedProjects.length,
    activeProjects: activeProjects.length,
    activeSavings: activeSavings.length,
    completedSavings: completedSavings.length,
    activeCotisations: activeCotisations.length,
    completedCotisations: completedCotisations.length,
    text: lines.join('\n'),
  };
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
    const templateKey = String(body.templateKey || 'custom').slice(0, 40);
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
    const highlights = await buildAdminEmailHighlights(recipientUid);
    const messageWithHighlights = templateKey === 'congratulations'
      ? message + '\n\nVoici ce que nous pouvons mettre en valeur dans ton parcours sur Pata :\n' + highlights.text + '\n\nNous tenons à souligner les efforts engagés dans ces projets, ces objectifs d’épargne et ces cotisations. Chaque réalisation mérite d’être reconnue, tout en gardant un rythme qui reste adapté à ta situation.'
      : message + '\n\nTon parcours Pata :\n' + highlights.text;
    const sent = await sendPataEmail({
      to: email,
      subject,
      html: customAdminEmail({ name, headline: subject, body: messageWithHighlights, ctaUrl: ctaPath, ctaLabel }),
      idempotencyKey: `pata-admin-${admin.uid}-${recipientUid}-${Date.now()}`,
    });
    await adminDb.collection('adminEmailLogs').add({
      adminUid: admin.uid,
      recipientUid,
      recipientEmail: email,
      subject,
      message: messageWithHighlights,
      templateKey,
      highlights,
      resendEmailId: sent.id || null,
      status: 'accepted',
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ success: true, emailId: sent.id || null, recipientEmail: email, highlights });
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
            fcmOptions: { link: new URL(path, getPataAppUrl(request)).toString() },
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
      if (invalidTokens.length) {
        const invalidSet = new Set(invalidTokens);
        const ownerRefs = new Map();
        for (const token of invalidTokens) {
          for (const ref of tokenOwners.get(token) || []) ownerRefs.set(ref.path, ref);
        }
        for (const ref of ownerRefs.values()) {
          await adminDb.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(ref);
            if (!snapshot.exists) return;
            const currentTokens = Array.isArray(snapshot.data()?.pushTokens) ? snapshot.data().pushTokens : [];
            const remainingTokens = currentTokens.filter((token) => !invalidSet.has(token));
            transaction.set(ref, {
              pushTokens: remainingTokens,
              notificationsEnabled: remainingTokens.length > 0,
              notificationsUpdatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
          });
        }
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
          ? `Notification enregistrée dans la boîte Pata de ${inAppDelivered} compte(s). FCM a accepté l’envoi vers ${pushSent} appareil(s) sur ${optedTokens.length}. ${invalidTokens.length} ancien(s) jeton(s) ont été supprimés ; les appareils concernés doivent réactiver les notifications. Autres erreurs push : ${Math.max(0, pushFailed - invalidTokens.length)}.`
          : `Notification enregistrée dans Pata pour ${inAppDelivered} compte(s). Aucun appareil n’a activé les notifications push.`,
    });
  } catch (error) {
    console.error('[ADMIN BROADCAST]', error.code || error.message);
    return errorResponse(error.message || 'La diffusion n’a pas pu être enregistrée.', 502);
  }
}

/* ═══════════════════ PROJETS PREMIUM ═══════════════════ */

async function handleCreateProject(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const name = String(body.name || '').trim().slice(0, 100);
    const description = String(body.description || '').trim().slice(0, 500);
    const targetAmount = body.targetAmount === '' || body.targetAmount == null ? null : Math.round(Number(body.targetAmount));
    if (!name) return errorResponse('Donne un nom à ton projet.', 400);
    if (targetAmount !== null && (!Number.isSafeInteger(targetAmount) || targetAmount <= 0 || targetAmount > 1_000_000_000)) return errorResponse('Le budget indicatif est invalide.', 400);
    const userRef = adminDb.collection('users').doc(uid);
    const projectRef = userRef.collection('projects').doc();
    await adminDb.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
      if (!isPremiumAccount(userSnap.data())) throw new Error('La création de projets est réservée à Pata Premium.');
      transaction.create(projectRef, { name, description, targetAmount, status: 'active', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ success: true, id: projectRef.id });
  } catch (error) { return errorResponse(error.message || 'Impossible de créer ce projet.', /Premium|introuvable/i.test(error.message || '') ? 403 : 400); }
}

async function handleUpdateProject(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const projectId = String(body.projectId || '').trim().slice(0, 150);
    if (!projectId || projectId.includes('/')) return errorResponse('Projet invalide.', 400);
    const patch = {};
    if (body.name !== undefined) patch.name = String(body.name || '').trim().slice(0, 100);
    if (body.description !== undefined) patch.description = String(body.description || '').trim().slice(0, 500);
    if (body.status !== undefined) {
      if (!['active', 'completed', 'archived'].includes(body.status)) return errorResponse('Statut de projet invalide.', 400);
      patch.status = body.status;
    }
    if (body.targetAmount !== undefined) {
      const amount = body.targetAmount === '' || body.targetAmount == null ? null : Math.round(Number(body.targetAmount));
      if (amount !== null && (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000)) return errorResponse('Budget indicatif invalide.', 400);
      patch.targetAmount = amount;
    }
    if (patch.name === '') return errorResponse('Le nom du projet est obligatoire.', 400);
    patch.updatedAt = FieldValue.serverTimestamp();
    const userRef = adminDb.collection('users').doc(uid);
    const projectRef = userRef.collection('projects').doc(projectId);
    await adminDb.runTransaction(async (transaction) => {
      const [userSnap, projectSnap] = await Promise.all([transaction.get(userRef), transaction.get(projectRef)]);
      if (!userSnap.exists || !projectSnap.exists) throw new Error('Projet introuvable.');
      if (!isPremiumAccount(userSnap.data())) throw new Error('Cette fonction nécessite Pata Premium.');
      transaction.update(projectRef, patch);
    });
    return NextResponse.json({ success: true });
  } catch (error) { return errorResponse(error.message || 'Impossible de modifier le projet.', 400); }
}

/* ═══════════════════ COTISATIONS / TONTINES ═══════════════════ */

function cotisationToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function cotisationAddDays(dateKey, days) {
  const date = new Date(String(dateKey) + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function cotisationAddMonths(dateKey, months) {
  const source = new Date(String(dateKey) + 'T12:00:00Z');
  const day = source.getUTCDate();
  const first = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, lastDay));
  return first.toISOString().slice(0, 10);
}

function getCotisationCycleMeta(group, today = cotisationToday()) {
  const startDate = String(group.startDate || today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('La date de début de cette cotisation est invalide.');
  const start = new Date(startDate + 'T12:00:00Z');
  const current = new Date(today + 'T12:00:00Z');
  if (Number.isNaN(start.getTime()) || Number.isNaN(current.getTime())) throw new Error('Période de cotisation invalide.');
  const frequency = ['daily', 'weekly', 'monthly'].includes(group.frequency) ? group.frequency : 'monthly';
  if (current < start) {
    const next = frequency === 'daily' ? cotisationAddDays(startDate, 1)
      : frequency === 'weekly' ? cotisationAddDays(startDate, 7)
      : cotisationMonthlyDueDate(startDate, group.dueDay);
    return { cycleIndex: 0, cycleKey: 'cycle-0001', startDate, dueAt: next, notStarted: true };
  }
  let index = 0;
  if (frequency === 'daily' || frequency === 'weekly') {
    const days = Math.floor((Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate()) - Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) / 86400000);
    index = Math.floor(days / (frequency === 'daily' ? 1 : 7));
  } else {
    // Les périodes mensuelles se calent sur le jour d'origine, ou le dernier jour d'un mois plus court.
    // Ex. 31 janvier -> 28 février -> 31 mars.
    index = 0;
    while (index < 6000) {
      const nextCycleStart = cotisationAddMonths(startDate, index + 1);
      if (nextCycleStart > today) break;
      index += 1;
    }
  }
  const periodStart = frequency === 'daily' ? cotisationAddDays(startDate, index)
    : frequency === 'weekly' ? cotisationAddDays(startDate, index * 7)
    : cotisationAddMonths(startDate, index);
  const dueAt = frequency === 'daily' ? cotisationAddDays(periodStart, 1)
    : frequency === 'weekly' ? cotisationAddDays(periodStart, 7)
    : cotisationMonthlyDueDate(periodStart, group.dueDay);
  return { cycleIndex: index, cycleKey: 'cycle-' + String(index + 1).padStart(4, '0'), startDate: periodStart, dueAt, notStarted: false };
}

function cotisationMoney(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function cotisationExpectedMembers(group, actualCount = 0) {
  const configured = Math.floor(Number(group?.expectedMembers));
  if (Number.isInteger(configured) && configured >= 2 && configured <= 50) return configured;
  const current = Math.floor(Number(group?.memberCount || actualCount || 2));
  return Math.max(2, Math.min(50, current || 2));
}

function cotisationMonthlyDueDate(periodStart, dueDay = 30) {
  const start = new Date(String(periodStart) + 'T12:00:00Z');
  const desiredDay = Math.max(1, Math.min(31, Math.floor(Number(dueDay) || start.getUTCDate())));
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();
  if (desiredDay < start.getUTCDate()) {
    month += 1;
    if (month > 11) { year += 1; month = 0; }
  }
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(desiredDay, lastDay), 12)).toISOString().slice(0, 10);
}

function cotisationLateFee(group) {
  const value = cotisationMoney(group.lateFeeValue);
  if (!value || group.lateFeeType === 'none') return 0;
  if (group.lateFeeType === 'fixed') return value;
  if (group.lateFeeType === 'percent') {
    return Math.round(cotisationMoney(group.contributionAmount) * Math.min(100, value) / 100);
  }
  return 0;
}

function cotisationPenaltyLabel(group) {
  const fee = cotisationLateFee(group);
  if (!fee) return 'Aucune majoration';
  if (group.lateFeeType === 'fixed') return fee.toLocaleString('fr-FR') + ' FCFA par retard';
  return Math.min(100, cotisationMoney(group.lateFeeValue)) + ' % de la contribution par retard (' + fee.toLocaleString('fr-FR') + ' FCFA)';
}

function cotisationIsLate(group, meta, today = cotisationToday()) {
  const graceEnd = cotisationAddDays(meta.dueAt, cotisationMoney(group.graceDays));
  return today > graceEnd;
}

function cotisationFrequencyLabel(frequency) {
  return ({ daily: 'Chaque jour', weekly: 'Chaque semaine', monthly: 'Chaque mois' })[frequency] || 'Chaque mois';
}

function getCotisationCycleMetaForIndex(group, index) {
  const startDate = String(group.startDate || cotisationToday());
  const frequency = ['daily', 'weekly', 'monthly'].includes(group.frequency) ? group.frequency : 'monthly';
  const periodStart = frequency === 'daily' ? cotisationAddDays(startDate, index)
    : frequency === 'weekly' ? cotisationAddDays(startDate, index * 7)
    : cotisationAddMonths(startDate, index);
  const dueAt = frequency === 'daily' ? cotisationAddDays(periodStart, 1)
    : frequency === 'weekly' ? cotisationAddDays(periodStart, 7)
    : cotisationMonthlyDueDate(periodStart, group.dueDay);
  return {
    cycleIndex: index,
    cycleKey: 'cycle-' + String(index + 1).padStart(4, '0'),
    startDate: periodStart,
    dueAt,
    notStarted: false,
  };
}

async function resolveCurrentCotisationCycleMeta(groupRef, group, today = cotisationToday(), transaction = null) {
  const calendarMeta = getCotisationCycleMeta(group, today);
  if (calendarMeta.notStarted || calendarMeta.cycleIndex <= 0) return calendarMeta;
  for (let index = 0; index < calendarMeta.cycleIndex; index += 1) {
    const cycleKey = 'cycle-' + String(index + 1).padStart(4, '0');
    const cycleRef = groupRef.collection('cycles').doc(cycleKey);
    const cycleSnap = transaction ? await transaction.get(cycleRef) : await cycleRef.get();
    if (!cycleSnap.exists || cycleSnap.data()?.status !== 'PAID') {
      return getCotisationCycleMetaForIndex(group, index);
    }
  }
  return calendarMeta;
}

function validateCotisationProviderPayment(providerResponse, payment, transId) {
  const data = providerResponse?.data && typeof providerResponse.data === 'object'
    ? providerResponse.data : providerResponse;
  const providerTransId = data?.transId || data?.trans_id;
  if (providerTransId && String(providerTransId) !== String(transId)) {
    throw new Error('L’identifiant de transaction ne correspond pas au paiement enregistré.');
  }
  const providerAmount = data?.amount;
  if (providerAmount !== undefined && providerAmount !== null && providerAmount !== '') {
    const amount = Number(providerAmount);
    if (!Number.isSafeInteger(amount) || amount !== cotisationMoney(payment.grossAmount)) {
      throw new Error('Le montant confirmé ne correspond pas au montant demandé. Le versement reste bloqué pour vérification.');
    }
  }
  const externalId = data?.externalId || data?.external_id;
  if (externalId && payment.reservationId && String(externalId) !== String(payment.reservationId)) {
    throw new Error('La référence de paiement ne correspond pas à cette réservation de cotisation.');
  }
  const providerUserId = data?.userId || data?.user_id;
  if (providerUserId && String(providerUserId) !== String(payment.userId)) {
    throw new Error('Le compte associé à ce paiement ne correspond pas au membre concerné.');
  }
  return data;
}

async function confirmCotisationPayment(transId) {
  const paymentRef = adminDb.collection('cotisationPayments').doc(String(transId));
  const confirmation = await adminDb.runTransaction(async (transaction) => {
    const paymentSnap = await transaction.get(paymentRef);
    if (!paymentSnap.exists) return { confirmed: false, missing: true };
    const payment = paymentSnap.data();
    if (payment.status === 'CONFIRMED') return { confirmed: true, duplicate: true };
    if (payment.status !== 'PENDING') return { confirmed: false, status: payment.status };
    const groupRef = adminDb.collection('cotisationGroups').doc(payment.groupId);
    const cycleRef = groupRef.collection('cycles').doc(payment.cycleKey);
    const contributionRef = cycleRef.collection('contributions').doc(payment.userId);
    const memberRef = groupRef.collection('members').doc(payment.userId);
    const paymentHistoryRef = cycleRef.collection('payments').doc(String(transId));
    const [groupSnap, cycleSnap, contributionSnap, memberSnap] = await Promise.all([
      transaction.get(groupRef), transaction.get(cycleRef), transaction.get(contributionRef), transaction.get(memberRef),
    ]);
    if (!groupSnap.exists || !memberSnap.exists) throw new Error('Groupe ou membre de cotisation introuvable.');
    const group = groupSnap.data();
    if (payment.reservationId && memberSnap.data()?.pendingPaymentId !== payment.reservationId) {
      throw new Error('Cette confirmation ne correspond plus au versement en attente.');
    }
    const amount = cotisationMoney(payment.amount);
    const penaltyAmount = cotisationMoney(payment.penaltyAmount);
    const previousContribution = contributionSnap.data() || {};
    const nextMemberTotal = cotisationMoney(previousContribution.amount) + amount;
    const nextPenaltyTotal = cotisationMoney(previousContribution.penaltyPaid) + penaltyAmount;
    const nextTotal = cotisationMoney(cycleSnap.data()?.totalCollected) + amount + penaltyAmount;
    const expectedMembers = cotisationExpectedMembers(group);
    const baseTarget = cotisationMoney(cycleSnap.data()?.baseTargetAmount) || cotisationMoney(group.contributionAmount) * expectedMembers;
    const currentTarget = cotisationMoney(cycleSnap.data()?.targetAmount) || baseTarget;
    const targetAmount = currentTarget + penaltyAmount;
    if (cycleSnap.data()?.status && cycleSnap.data().status !== 'OPEN') throw new Error('Cette période de cotisation n’accepte plus de versement.');
    if (nextMemberTotal > cotisationMoney(group.contributionAmount)) throw new Error('Le paiement dépasse la contribution attendue pour ce membre.');
    if (penaltyAmount > 0 && cotisationMoney(previousContribution.penaltyPaid) > 0) throw new Error('La majoration de retard a déjà été réglée pour cette période.');
    transaction.set(contributionRef, {
      userId: payment.userId,
      displayName: payment.displayName || 'Membre',
      amount: nextMemberTotal,
      penaltyPaid: nextPenaltyTotal,
      totalPaid: nextMemberTotal + nextPenaltyTotal,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(paymentHistoryRef, {
      transId: String(transId), userId: payment.userId,
      displayName: payment.displayName || 'Membre',
      amount, penaltyAmount, totalContribution: amount + penaltyAmount,
      fee: cotisationMoney(payment.fee), grossAmount: cotisationMoney(payment.grossAmount),
      status: 'CONFIRMED', createdAt: FieldValue.serverTimestamp(), confirmedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.update(memberRef, { pendingPaymentId: null, pendingPaymentAmount: 0, pendingPaymentAt: null, pendingPaymentTransId: null });
    transaction.set(cycleRef, {
      cycleKey: payment.cycleKey, cycleIndex: payment.cycleIndex,
      startDate: payment.cycleStartDate, dueAt: payment.dueAt,
      baseTargetAmount: baseTarget,
      targetAmount, totalCollected: nextTotal,
      status: nextTotal >= targetAmount ? 'READY' : 'OPEN',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.update(groupRef, { membershipLockedCycle: payment.cycleKey, updatedAt: FieldValue.serverTimestamp() });
    transaction.update(paymentRef, { status: 'CONFIRMED', confirmedAt: FieldValue.serverTimestamp() });
    return { confirmed: true, amount, totalCollected: nextTotal, targetAmount, userId: payment.userId, groupId: payment.groupId, cycleKey: payment.cycleKey };
  });
  if (confirmation.confirmed && !confirmation.duplicate) {
    try {
      const groupRef=adminDb.collection('cotisationGroups').doc(confirmation.groupId), cycleRef=groupRef.collection('cycles').doc(confirmation.cycleKey);
      const [userSnap,groupSnap,cycleSnap,paymentSnap]=await Promise.all([adminDb.collection('users').doc(confirmation.userId).get(),groupRef.get(),cycleRef.get(),paymentRef.get()]);
      const userData=userSnap.exists?userSnap.data():{}, groupData=groupSnap.exists?groupSnap.data():{}, contributionSnap=await cycleRef.collection('contributions').doc(confirmation.userId).get(), contribution=contributionSnap.data()||{}, payment=paymentSnap.data()||{};
      const remainingAmount=Math.max(0,cotisationMoney(groupData.contributionAmount)-cotisationMoney(contribution.amount)), dueAt=cycleSnap.data()?.dueAt||'', dueDate=dueAt?new Date(dueAt+'T23:59:59'):null, daysRemaining=dueDate&&!Number.isNaN(dueDate.getTime())?Math.ceil((dueDate.getTime()-Date.now())/86400000):null;
      const title='Ton versement de cotisation est confirmé', body='Ton versement de '+cotisationMoney(payment.amount).toLocaleString('fr-FR')+' FCFA pour '+(groupData.name||'ton groupe')+' a été confirmé. Il te reste '+remainingAmount.toLocaleString('fr-FR')+' FCFA à contribuer pour cette période.';
      await adminDb.collection('users').doc(confirmation.userId).collection('notifications').doc('cotisation-paid-'+transId).set({title,body,target:'/cotisations',source:'cotisation',groupId:confirmation.groupId,read:false,readAt:null,createdAt:FieldValue.serverTimestamp()},{merge:true});
      if(userData.email&&String(userData.email).includes('@')) await sendPataEmail({to:userData.email,subject:title,html:cotisationContributionPaidEmail({name:userData.displayName,groupName:groupData.name,amount:payment.amount,paidAmount:cotisationMoney(contribution.amount)+cotisationMoney(contribution.penaltyPaid),remainingAmount,contributionAmount:groupData.contributionAmount,dueLabel:dueAt,daysRemaining}),idempotencyKey:'pata-cotisation-paid-'+transId});
    } catch(emailError){console.warn('[COTISATION PAYMENT EMAIL]',transId,emailError.message||emailError);}
  }
  return confirmation;
}

async function releaseCotisationReservation(groupId, userId, reservationId, reason = 'FAILED') {
  if (!groupId || !userId || !reservationId) return;
  const groupRef = adminDb.collection('cotisationGroups').doc(groupId);
  const memberRef = groupRef.collection('members').doc(userId);
  await adminDb.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(memberRef);
    if (!memberSnap.exists || memberSnap.data()?.pendingPaymentId !== reservationId) return;
    transaction.update(memberRef, {
      pendingPaymentId: null, pendingPaymentAmount: 0, pendingPaymentAt: null,
      pendingPaymentTransId: null, lastPaymentFailure: reason,
    });
  });
}

async function releaseCotisationPayment(transId, reason = 'FAILED') {
  const paymentRef = adminDb.collection('cotisationPayments').doc(String(transId));
  await adminDb.runTransaction(async (transaction) => {
    const paymentSnap = await transaction.get(paymentRef);
    if (!paymentSnap.exists || paymentSnap.data()?.status !== 'PENDING') return;
    const payment = paymentSnap.data();
    const memberRef = adminDb.collection('cotisationGroups').doc(payment.groupId).collection('members').doc(payment.userId);
    const memberSnap = await transaction.get(memberRef);
    if (memberSnap.exists && memberSnap.data()?.pendingPaymentId === payment.reservationId) {
      transaction.update(memberRef, {
        pendingPaymentId: null, pendingPaymentAmount: 0, pendingPaymentAt: null,
        pendingPaymentTransId: null, lastPaymentFailure: reason,
      });
    }
    transaction.update(paymentRef, { status: 'FAILED', failureReason: String(reason).slice(0, 200), failedAt: FieldValue.serverTimestamp() });
  });
}

async function cotisationSendWithdrawalEmail(data, status) {
  if (!data || !data.email) return;
  const details = {
    received: ['Demande de retrait reçue par Pata', 'Ta demande a bien été reçue.', 'Nous avons reçu ta demande de retrait de ' + cotisationMoney(data.amount).toLocaleString('fr-FR') + ' FCFA concernant ' + (data.goalName || 'ta cotisation') + '. Elle sera vérifiée par l’administration avant l’envoi.'],
    approved: ['Ta demande de retrait Pata a été approuvée', 'Ta demande a été approuvée.', 'L’administration a approuvé ta demande de retrait de ' + cotisationMoney(data.amount).toLocaleString('fr-FR') + ' FCFA concernant ' + (data.goalName || 'ton épargne') + '. Le paiement a été transmis pour traitement. Nous te confirmerons dès que le transfert sera terminé.'],
    paid: ['Ton retrait Pata a été envoyé', 'Ton retrait a été envoyé.', 'Le retrait de ' + cotisationMoney(data.amount).toLocaleString('fr-FR') + ' FCFA concernant ' + (data.goalName || 'ta cotisation') + ' a été confirmé.'],
    rejected: ['Mise à jour de ta demande de retrait Pata', 'Ta demande de retrait n’a pas été approuvée.', 'La demande concernant ' + (data.goalName || 'ton épargne') + ' a été refusée après vérification. Tu peux consulter le statut dans ton espace Pata ou contacter l’assistance.'],
    failed: ['Ton retrait Pata n’a pas abouti', 'Le prestataire n’a pas pu effectuer le retrait.', 'Le retrait de ' + cotisationMoney(data.amount).toLocaleString('fr-FR') + ' FCFA concernant ' + (data.goalName || 'ta cotisation') + ' n’a pas été confirmé. Consulte ton espace Pata avant toute nouvelle demande.'],
  }[status];
  if (!details) return;
  await sendPataEmail({
    to: data.email, subject: details[0],
    html: customAdminEmail({
      name: data.displayName || 'Utilisateur', headline: details[1], body: details[2],
      ctaUrl: data.withdrawalType === 'cotisation' ? '/cotisations' : data.withdrawalType === 'referral' ? '/settings' : '/goals',
      ctaLabel: 'Consulter ma demande',
    }),
    idempotencyKey: 'pata-withdrawal-' + (data.requestId || data.id || 'request') + '-' + status,
  }).catch((error) => console.warn('[PATA WITHDRAWAL EMAIL]', error.message || error));
}

async function restoreCotisationCycle(data, status) {
  if (!data || data.withdrawalType !== 'cotisation' || !data.groupId || !data.cycleKey) return;
  const cycleRef = adminDb.collection('cotisationGroups').doc(data.groupId).collection('cycles').doc(data.cycleKey);
  const cycleSnap = await cycleRef.get().catch(() => null);
  if (!cycleSnap || !cycleSnap.exists) return;
  const cycle = cycleSnap.data();
  const stillFunded = cotisationMoney(cycle.totalCollected) >= cotisationMoney(cycle.targetAmount);
  await cycleRef.set({
    status: status === 'PAID' ? 'PAID' : (status === 'PROCESSING' ? 'PROCESSING' : (stillFunded ? 'READY' : 'OPEN')),
    withdrawalRequestId: ['PAID', 'PROCESSING'].includes(status) ? (data.requestId || null) : null,
    paidAt: status === 'PAID' ? FieldValue.serverTimestamp() : null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function handleCotisationsList(request) {
  try {
    const { uid } = await authenticate(request);
    const membershipsSnap = await adminDb.collection('users').doc(uid).collection('cotisationMemberships').limit(100).get();
    const memberships = membershipsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const groups = await Promise.all(memberships.map(async (membership) => {
      const groupRef = adminDb.collection('cotisationGroups').doc(membership.groupId || membership.id);
      const groupSnap = await groupRef.get();
      if (!groupSnap.exists) return null;
      const group = groupSnap.data();
      const membersSnap = await groupRef.collection('members').orderBy('joinedAt', 'asc').limit(50).get();
      const members = membersSnap.docs.map((doc) => ({ uid: doc.id, ...doc.data() })).filter((member) => member.active !== false);
      const hasAssignedOrder = Boolean(group.orderConfirmedAt) && members.length > 0 && members.every((member) => Number.isInteger(Number(member.turnOrder)) && Number(member.turnOrder) >= 1);
      members.sort((a, b) => hasAssignedOrder || group.startedAt
        ? Number(a.turnOrder) - Number(b.turnOrder)
        : String(a.displayName || '').localeCompare(String(b.displayName || ''), 'fr'));
      const meta = await resolveCurrentCotisationCycleMeta(groupRef, group);
      const cycleRef = groupRef.collection('cycles').doc(meta.cycleKey);
      const [cycleSnap, contributionsSnap, paymentsSnap] = await Promise.all([
        cycleRef.get(),
        cycleRef.collection('contributions').limit(50).get(),
        cycleRef.collection('payments').orderBy('createdAt', 'desc').limit(200).get(),
      ]);
      const contributions = new Map(contributionsSnap.docs.map((doc) => [doc.id, doc.data()]));
      const paymentCounts = new Map();
      paymentsSnap.docs.forEach((doc) => {
        const item = doc.data();
        paymentCounts.set(item.userId, (paymentCounts.get(item.userId) || 0) + 1);
      });
      const turnMember = group.startedAt && members.length ? members[meta.cycleIndex % members.length] : null;
      const contributionAmount = cotisationMoney(group.contributionAmount);
      const expectedMembers = cotisationExpectedMembers(group, members.length);
      const baseTarget = cotisationMoney(cycleSnap.data()?.baseTargetAmount) || contributionAmount * expectedMembers;
      const totalCollected = cotisationMoney(cycleSnap.data()?.totalCollected);
      const targetAmount = cotisationMoney(cycleSnap.data()?.targetAmount) || baseTarget;
      const memberRows = members.map((member) => {
        const data = contributions.get(member.uid) || {};
        const principalPaid = cotisationMoney(data.amount);
        const penaltyPaid = cotisationMoney(data.penaltyPaid);
        // Ne jamais exposer les e-mails ni les jetons de paiement internes aux autres membres.
        return {
          uid: member.uid,
          displayName: member.displayName || 'Membre',
          isOwner: member.isOwner === true,
          turnOrder: group.orderConfirmedAt && member.turnOrder != null ? cotisationMoney(member.turnOrder) : null,
          whatsappPhone: member.uid === uid || group.ownerId === uid ? String(member.whatsappPhone || '') : undefined,
          paid: principalPaid + penaltyPaid,
          principalPaid,
          penaltyPaid,
          remaining: Math.max(0, contributionAmount - principalPaid),
          installments: paymentCounts.get(member.uid) || 0,
        };
      });
      const myContribution = contributions.get(uid) || {};
      const myPaid = cotisationMoney(myContribution.amount);
      const myPenaltyPaid = cotisationMoney(myContribution.penaltyPaid);
      const cycleStatus = !group.startedAt ? 'NOT_STARTED' : cycleSnap.data()?.status || (totalCollected >= targetAmount && targetAmount > 0 ? 'READY' : 'OPEN');
      const lateFeeDue = group.startedAt && cotisationIsLate(group, meta) && myPaid < contributionAmount && !myPenaltyPaid
        ? cotisationLateFee(group) : 0;
      const myMember = members.find((member) => member.uid === uid);
      let myMemberPendingPayment = null;
      if (myMember?.pendingPaymentTransId) {
        const pendingSnap = await adminDb.collection('cotisationPayments').doc(myMember.pendingPaymentTransId).get();
        if (pendingSnap.exists && pendingSnap.data()?.status === 'PENDING') {
          const payment = pendingSnap.data();
          myMemberPendingPayment = {
            transId: payment.transId, checkoutUrl: payment.checkoutUrl,
            amount: cotisationMoney(payment.amount), penaltyAmount: cotisationMoney(payment.penaltyAmount),
            fee: cotisationMoney(payment.fee), grossAmount: cotisationMoney(payment.grossAmount),
          };
        }
      }
      return {
        id: groupRef.id, name: group.name, ownerId: group.ownerId, isOwner: group.ownerId === uid, createdAt: serializeAdminValue(group.createdAt || null), isPinned: membership.pinned === true,
        contributionAmount, frequency: group.frequency, startDate: group.startDate, status: group.status || 'active',
        dueDay: group.dueDay || null, expectedMembers, graceDays: cotisationMoney(group.graceDays),
        lateFeeType: group.lateFeeType || 'none', lateFeeValue: cotisationMoney(group.lateFeeValue),
        lateFeeLabel: cotisationPenaltyLabel(group), startedAt: Boolean(group.startedAt), responsibilityAccepted: group.responsibilityAcceptedBy === uid,
        inviteToken: group.ownerId === uid ? group.inviteToken : null,
        members: memberRows, memberCount: members.length, maxMembers: expectedMembers,
        orderDefined: hasAssignedOrder,
        canStart: group.ownerId === uid && !group.startedAt && Boolean(group.orderConfirmedAt) && !meta.notStarted && members.length >= 2 && members.length === expectedMembers
          && members.every((member) => Number.isInteger(Number(member.turnOrder)) && Number(member.turnOrder) >= 1)
          && new Set(members.map((member) => Number(member.turnOrder))).size === members.length
          && members.map((member) => Number(member.turnOrder)).sort((a, b) => a - b).every((position, index) => position === index + 1),
        currentCycle: {
          ...meta, targetAmount, baseTarget, totalCollected, remainingTotal: Math.max(0, targetAmount - totalCollected),
          status: cycleStatus, pendingPayment: myMemberPendingPayment, beneficiaryUid: turnMember?.uid || null,
          beneficiaryName: turnMember?.displayName || 'Membre', beneficiaryPosition: turnMember?.turnOrder || null,
          isMyTurn: turnMember?.uid === uid,
          myPaid: myPaid + myPenaltyPaid,
          myPrincipalPaid: myPaid, myPenaltyPaid,
          myRemaining: Math.max(0, contributionAmount - myPaid),
          lateFeeDue,
          myTotalToPay: Math.max(0, contributionAmount - myPaid) + lateFeeDue,
          canWithdraw: Boolean(group.startedAt) && turnMember?.uid === uid && targetAmount > 0 && totalCollected >= targetAmount && ['READY', 'OPEN'].includes(cycleStatus),
        },
      };
    }));
    return NextResponse.json({ success: true, groups: groups.filter(Boolean) });
  } catch (error) { return errorResponse(error.message || 'Impossible de charger les cotisations.', 500); }
}

async function handleCotisationCreate(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const name = String(body.name || '').trim().slice(0, 90);
    if (body.responsibilityAccepted !== true) return errorResponse('Tu dois lire et accepter les responsabilités du chef de groupe avant de créer une cotisation.', 400);
    const amount = Math.round(Number(body.contributionAmount));
    const expectedMembers = Math.floor(Number(body.expectedMembers));
    const frequency = ['daily', 'weekly', 'monthly'].includes(body.frequency) ? body.frequency : '';
    const startDate = String(body.startDate || cotisationToday());
    const dueDay = frequency === 'monthly' ? Math.floor(Number(body.dueDay || 0)) : null;
    const graceDays = Math.floor(Number(body.graceDays ?? 0));
    const lateFeeType = ['none', 'fixed', 'percent'].includes(body.lateFeeType) ? body.lateFeeType : 'none';
    const lateFeeValue = lateFeeType === 'none' ? 0 : Math.round(Number(body.lateFeeValue));
    if (!name) return errorResponse('Donne un nom au groupe.', 400);
    if (!Number.isSafeInteger(amount) || amount < 100 || amount > 250000 || amount % 100 !== 0) return errorResponse('La cotisation par membre doit être comprise entre 100 et 250 000 FCFA, par multiples de 100.', 400);
    if (!Number.isSafeInteger(expectedMembers) || expectedMembers < 2 || expectedMembers > 50) return errorResponse('Choisis un nombre de participants compris entre 2 et 50.', 400);
    if (!frequency) return errorResponse('Choisis une fréquence de cotisation.', 400);
    if (frequency === 'monthly' && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) return errorResponse('Choisis un jour d’échéance compris entre 1 et 31.', 400);
    if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 30) return errorResponse('Le délai de grâce doit être compris entre 0 et 30 jours.', 400);
    if (lateFeeType !== 'none' && (!Number.isSafeInteger(lateFeeValue) || lateFeeValue <= 0 || (lateFeeType === 'percent' && lateFeeValue > 100) || (lateFeeType === 'fixed' && lateFeeValue > 250000))) return errorResponse('Vérifie la valeur de la majoration de retard.', 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || startDate < cotisationToday()) return errorResponse('Choisis une date de début à partir d’aujourd’hui.', 400);
    const lateFee = lateFeeType === 'fixed' ? lateFeeValue : lateFeeType === 'percent' ? Math.round(amount * lateFeeValue / 100) : 0;
    const maximumPayout = (amount + lateFee) * expectedMembers;
    if (maximumPayout > 500000) return errorResponse('Le total maximal possible de ce tour dépasse la limite autorisée de 500 000 FCFA. Réduis le montant, le nombre de participants ou la majoration.', 400);

    const userRef = adminDb.collection('users').doc(uid);
    const groupRef = adminDb.collection('cotisationGroups').doc();
    const inviteToken = randomBytes(24).toString('hex');
    const memberRef = groupRef.collection('members').doc(uid);
    const membershipRef = userRef.collection('cotisationMemberships').doc(groupRef.id);
    const owner = await adminDb.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
      const userData = userSnap.data();
      const member = {
        uid,
        displayName: String(userData.displayName || 'Organisateur').slice(0, 100),
        email: String(userData.email || '').slice(0, 180),
        isOwner: true, turnOrder: null, joinedAt: FieldValue.serverTimestamp(), active: true,
      };
      transaction.create(groupRef, {
        name, contributionAmount: amount, frequency, startDate, dueDay,
        expectedMembers, maxMembers: expectedMembers, memberCount: 1,
        graceDays, lateFeeType, lateFeeValue,
        ownerId: uid, inviteToken, status: 'active', startedAt: null,
        orderConfirmedAt: null, orderConfirmedBy: null,
        responsibilityAcceptedAt: FieldValue.serverTimestamp(), responsibilityAcceptedBy: uid,
        membershipLockedCycle: null,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(memberRef, member);
      transaction.create(membershipRef, { groupId: groupRef.id, name, joinedAt: FieldValue.serverTimestamp() });
      return {
        name: String(userData.displayName || 'Organisateur'),
        email: String(userData.email || ''),
      };
    });
    const appUrl = getPataAppUrl(request);
    const inviteUrl = appUrl + '/invitation/cotisation/' + inviteToken;
    const dueLabel = frequency === 'monthly' ? 'Le ' + dueDay + ' de chaque mois' : frequency === 'weekly' ? 'Tous les 7 jours à partir du ' + startDate : 'Chaque jour à partir du ' + startDate;
    const penaltyLabel = cotisationPenaltyLabel({ contributionAmount: amount, lateFeeType, lateFeeValue });
    let emailSent = false;
    if (owner.email && owner.email.includes('@')) {
      try {
        await sendPataEmail({
          to: owner.email,
          subject: 'Ton groupe de cotisation « ' + name + ' » est créé',
          html: cotisationCreatedEmail({
            name: owner.name, groupName: name, contributionAmount: amount,
            frequency: cotisationFrequencyLabel(frequency), expectedMembers, dueLabel,
            graceDays, penaltyLabel, inviteUrl,
          }),
          idempotencyKey: 'pata-cotisation-created-' + groupRef.id,
        });
        emailSent = true;
      } catch (emailError) {
        console.error('[COTISATION CREATED EMAIL]', emailError.message || emailError);
      }
    }
    return NextResponse.json({ success: true, groupId: groupRef.id, inviteUrl, emailSent, message: emailSent ? 'Groupe créé et e-mail de confirmation envoyé.' : 'Groupe créé. Le courriel de confirmation n’a pas pu être envoyé ; vérifie l’adresse e-mail du compte et la configuration Resend.' });
  } catch (error) { return errorResponse(error.message || 'Impossible de créer le groupe.', 400); }
}


async function handleCotisationUpdate(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const groupId = String(body.groupId || '').trim().slice(0, 150);
    const name = String(body.name || '').trim().slice(0, 90);
    const amount = Math.round(Number(body.contributionAmount));
    const expectedMembers = Math.floor(Number(body.expectedMembers));
    const frequency = ['daily', 'weekly', 'monthly'].includes(body.frequency) ? body.frequency : '';
    const startDate = String(body.startDate || cotisationToday());
    const dueDay = frequency === 'monthly' ? Math.floor(Number(body.dueDay || 0)) : null;
    const graceDays = Math.floor(Number(body.graceDays ?? 0));
    const lateFeeType = ['none', 'fixed', 'percent'].includes(body.lateFeeType) ? body.lateFeeType : 'none';
    const lateFeeValue = lateFeeType === 'none' ? 0 : Math.round(Number(body.lateFeeValue));
    if (!groupId || groupId.includes('/') || !name) return errorResponse('Vérifie le nom du groupe.', 400);
    if (!Number.isSafeInteger(amount) || amount < 100 || amount > 250000 || amount % 100 !== 0) return errorResponse('La contribution doit être comprise entre 100 et 250 000 FCFA, par multiples de 100.', 400);
    if (!Number.isSafeInteger(expectedMembers) || expectedMembers < 2 || expectedMembers > 50) return errorResponse('Le nombre de participants doit être compris entre 2 et 50.', 400);
    if (!frequency || (frequency === 'monthly' && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31))) return errorResponse('Vérifie la fréquence et le jour limite de paiement.', 400);
    if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 30) return errorResponse('Le délai de grâce doit être compris entre 0 et 30 jours.', 400);
    if (lateFeeType !== 'none' && (!Number.isSafeInteger(lateFeeValue) || lateFeeValue <= 0 || (lateFeeType === 'percent' && lateFeeValue > 100) || (lateFeeType === 'fixed' && lateFeeValue > 250000))) return errorResponse('Vérifie la majoration de retard.', 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || startDate < cotisationToday()) return errorResponse('La date de début doit être aujourd’hui ou ultérieure.', 400);
    const lateAmount = lateFeeType === 'fixed' ? lateFeeValue : lateFeeType === 'percent' ? Math.round(amount * lateFeeValue / 100) : 0;
    if ((amount + lateAmount) * expectedMembers > 500000) return errorResponse('Le montant total maximal du tour dépasse la limite autorisée de 500 000 FCFA.', 400);
    const groupRef = adminDb.collection('cotisationGroups').doc(groupId);
    await adminDb.runTransaction(async (transaction) => {
      const groupSnap = await transaction.get(groupRef);
      if (!groupSnap.exists) throw new Error('Groupe introuvable.');
      const group = groupSnap.data();
      if (group.ownerId !== uid) throw new Error('Seul le chef du groupe peut modifier ses paramètres.');
      if (group.startedAt || group.membershipLockedCycle) throw new Error('Les paramètres sont verrouillés depuis le lancement de la cotisation.');
      const membersSnap = await transaction.get(groupRef.collection('members').where('active', '==', true));
      if (expectedMembers < membersSnap.size) throw new Error('Le nombre de participants ne peut pas être inférieur au nombre de personnes déjà inscrites.');
      const resetOrder = expectedMembers !== cotisationExpectedMembers(group, group.memberCount);
      if (resetOrder) membersSnap.docs.forEach((doc) => transaction.update(doc.ref, { turnOrder: null, orderUpdatedAt: null }));
      transaction.update(groupRef, {
        name, contributionAmount: amount, expectedMembers, maxMembers: expectedMembers,
        frequency, startDate, dueDay, graceDays, lateFeeType, lateFeeValue,
        ...(resetOrder ? { orderConfirmedAt: null, orderConfirmedBy: null } : {}),
        ...(body.responsibilityAccepted === true ? { responsibilityAcceptedAt: FieldValue.serverTimestamp(), responsibilityAcceptedBy: uid } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return NextResponse.json({ success: true, message: 'Les paramètres de ton groupe ont été mis à jour.' });
  } catch (error) {
    return errorResponse(error.message || 'Impossible de modifier les paramètres du groupe.', 400);
  }
}

async function handleCotisationJoin(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const token = String(body.inviteToken || '').trim().slice(0, 100);
    if (!token) return errorResponse('Lien d’invitation invalide.', 400);
    const found = await adminDb.collection('cotisationGroups').where('inviteToken', '==', token).limit(1).get();
    if (found.empty) return errorResponse('Ce lien ne correspond à aucun groupe actif.', 404);
    const groupRef = found.docs[0].ref;
    const group = found.docs[0].data();
    if (group.status !== 'active') return errorResponse('Ce groupe n’accepte plus de membres.', 409);
    if (group.startedAt) return errorResponse('Cette cotisation a déjà démarré. Les nouvelles adhésions sont fermées.', 409);
    const meta = getCotisationCycleMeta(group);
    const cycleRef = groupRef.collection('cycles').doc(meta.cycleKey);
    const memberRef = groupRef.collection('members').doc(uid);
    const userRef = adminDb.collection('users').doc(uid);
    const ownerRef = adminDb.collection('users').doc(String(group.ownerId || ''));
    const membershipRef = userRef.collection('cotisationMemberships').doc(groupRef.id);
    const result = await adminDb.runTransaction(async (transaction) => {
      const [freshGroup, existingMember, cycleSnap, userSnap] = await Promise.all([
        transaction.get(groupRef), transaction.get(memberRef), transaction.get(cycleRef), transaction.get(userRef),
      ]);
      if (!freshGroup.exists || !userSnap.exists) throw new Error('Groupe ou profil utilisateur introuvable.');
      const data = freshGroup.data();
      if (data.startedAt) throw new Error('Le chef a déjà lancé cette cotisation. Les adhésions sont fermées.');
      if (existingMember.exists) return {
        alreadyJoined: true,
        position: Number(existingMember.data()?.turnOrder) || null,
        user: userSnap.data(),
      };
      const expectedMembers = cotisationExpectedMembers(data, data.memberCount);
      const memberCount = cotisationMoney(data.memberCount);
      if (memberCount >= expectedMembers) throw new Error('Le nombre de participants prévu est déjà atteint.');
      if (data.membershipLockedCycle === meta.cycleKey || cotisationMoney(cycleSnap.data()?.totalCollected) > 0) {
        throw new Error('Les versements de cette période ont déjà commencé. Contacte le chef du groupe.');
      }
      const user = userSnap.data();
      const position = null;
      transaction.create(memberRef, {
        uid,
        displayName: String(user.displayName || 'Membre').slice(0, 100),
        email: String(user.email || '').slice(0, 180),
        isOwner: false, turnOrder: null,
        joinedAt: FieldValue.serverTimestamp(), active: true,
      });
      transaction.create(membershipRef, { groupId: groupRef.id, name: data.name, joinedAt: FieldValue.serverTimestamp() });
      transaction.update(groupRef, {
        memberCount: memberCount + 1,
        orderConfirmedAt: null,
        orderConfirmedBy: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { alreadyJoined: false, position, user, memberCount: memberCount + 1 };
    });
    const ownerSnap = await ownerRef.get().catch(() => null);
    const ownerName = String(ownerSnap?.data()?.displayName || 'Chef du groupe');
    const ownerEmail = String(ownerSnap?.data()?.email || '');
    const joinerName = String(result.user?.displayName || 'Membre');
    const joinerEmail = String(result.user?.email || '');
    const dueLabel = group.frequency === 'monthly' ? 'Le ' + (group.dueDay || 'jour défini') + ' de chaque mois' : group.frequency === 'weekly' ? 'Tous les 7 jours' : 'Chaque jour';
    let emailSent = false;
    if (!result.alreadyJoined && joinerEmail.includes('@')) {
      try {
        await sendPataEmail({
          to: joinerEmail,
          subject: 'Ton adhésion au groupe « ' + String(group.name || 'Cotisation') + ' » est confirmée',
          html: cotisationJoinedEmail({
            name: joinerName, groupName: group.name, ownerName,
            contributionAmount: group.contributionAmount,
            frequency: cotisationFrequencyLabel(group.frequency),
            position: 'À définir par le chef', expectedMembers: cotisationExpectedMembers(group, group.memberCount),
            joinedMembers: result.memberCount || group.memberCount, remainingMembers: Math.max(0, cotisationExpectedMembers(group, group.memberCount) - (result.memberCount || group.memberCount)),
            dueLabel, groupUrl: '/cotisations?group=' + groupRef.id,
          }),
          idempotencyKey: 'pata-cotisation-joined-' + groupRef.id + '-' + uid,
        });
        emailSent = true;
      } catch (emailError) {
        console.error('[COTISATION JOINED EMAIL]', emailError.message || emailError);
      }
    }
    if (!result.alreadyJoined && ownerEmail.includes('@')) {
      await sendPataEmail({
        to: ownerEmail,
        subject: 'Un nouveau membre a rejoint « ' + String(group.name || 'ta cotisation') + ' »',
        html: cotisationOwnerJoinedEmail({
          ownerName, joinerName, groupName: group.name, contributionAmount: group.contributionAmount,
          frequency: cotisationFrequencyLabel(group.frequency), joinedMembers: result.memberCount || group.memberCount,
          expectedMembers: cotisationExpectedMembers(group, group.memberCount),
          remainingMembers: Math.max(0, cotisationExpectedMembers(group, group.memberCount) - (result.memberCount || group.memberCount)),
          dueLabel, groupUrl: '/cotisations?group=' + groupRef.id,
        }),
        idempotencyKey: 'pata-cotisation-owner-joined-' + groupRef.id + '-' + uid,
      }).catch((emailError) => console.warn('[COTISATION OWNER EMAIL]', emailError.message || emailError));
    }
    return NextResponse.json({
      success: true, groupId: groupRef.id, alreadyJoined: result.alreadyJoined,
      position: result.position, emailSent,
      message: result.alreadyJoined ? 'Tu fais déjà partie de ce groupe.' : 'Tu as rejoint le groupe. Un e-mail de confirmation a été envoyé si une adresse est associée à ton compte.',
    });
  } catch (error) { return errorResponse(error.message || 'Impossible de rejoindre ce groupe.', 400); }
}


async function handleCotisationInvitePreview(request) {
  try {
    const token = String(new URL(request.url).searchParams.get('token') || '').trim().slice(0, 100);
    if (!token) return errorResponse('Lien d’invitation invalide.', 400);
    const result = await adminDb.collection('cotisationGroups').where('inviteToken', '==', token).limit(1).get();
    if (result.empty) return errorResponse('Cette invitation n’existe plus ou son lien est incorrect.', 404);
    const snapshot = result.docs[0];
    const group = snapshot.data();
    const ownerSnap = await adminDb.collection('users').doc(String(group.ownerId || '')).get();
    const owner = ownerSnap.exists ? ownerSnap.data() : {};
    const expectedMembers = cotisationExpectedMembers(group, group.memberCount);
    const memberCount = cotisationMoney(group.memberCount);
    return NextResponse.json({
      success: true,
      group: {
        id: snapshot.id,
        name: String(group.name || 'Cotisation Pata'),
        ownerName: String(owner.displayName || 'Organisateur'),
        contributionAmount: cotisationMoney(group.contributionAmount),
        frequency: group.frequency,
        dueDay: group.dueDay || null,
        startDate: group.startDate,
        graceDays: cotisationMoney(group.graceDays),
        lateFeeLabel: cotisationPenaltyLabel(group),
        expectedMembers,
        memberCount,
        status: group.startedAt ? 'started' : group.status || 'forming',
        startedAt: Boolean(group.startedAt),
        canJoin: !group.startedAt && group.status === 'active' && memberCount < expectedMembers,
      },
    });
  } catch (error) {
    return errorResponse(error.message || 'Impossible de consulter cette invitation.', 500);
  }
}


async function handleCotisationContact(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const groupId = String(body.groupId || '').trim().slice(0, 150);
    const whatsappPhone = String(body.whatsappPhone || '').replace(/[^0-9]/g, '');
    if (!groupId || groupId.includes('/') || !/^[0-9]{8,15}$/.test(whatsappPhone)) {
      return errorResponse('Entre un numéro WhatsApp valide avec son indicatif pays.', 400);
    }
    const memberRef = adminDb.collection('cotisationGroups').doc(groupId).collection('members').doc(uid);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists || memberSnap.data()?.active === false) return errorResponse('Tu ne fais pas partie de ce groupe.', 403);
    await memberRef.update({ whatsappPhone, whatsappUpdatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true, message: 'Ton numéro WhatsApp a été enregistré.' });
  } catch (error) {
    return errorResponse(error.message || 'Impossible d’enregistrer ton numéro WhatsApp.', 400);
  }
}


async function handleCotisationPin(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const groupId = String(body.groupId || '').trim().slice(0, 150);
    if (!groupId || groupId.includes('/')) return errorResponse('Groupe invalide.', 400);
    const membershipRef = adminDb.collection('users').doc(uid).collection('cotisationMemberships').doc(groupId);
    const membershipSnap = await membershipRef.get();
    if (!membershipSnap.exists) return errorResponse('Tu ne fais pas partie de ce groupe.', 403);
    await membershipRef.set({ pinned: body.pinned === true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return NextResponse.json({ success: true, pinned: body.pinned === true });
  } catch (error) {
    return errorResponse(error.message || 'Impossible de modifier cet épinglage.', 400);
  }
}

async function handleCotisationReorder(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const groupId = String(body.groupId || '').trim().slice(0, 150);
    const orderedIds = Array.isArray(body.memberIds) ? body.memberIds.map((id) => String(id || '').trim()) : [];
    if (!groupId || groupId.includes('/') || !orderedIds.length || orderedIds.some((id) => !id || id.includes('/')) || new Set(orderedIds).size !== orderedIds.length) {
      return errorResponse('La liste des positions est invalide.', 400);
    }
    const groupRef = adminDb.collection('cotisationGroups').doc(groupId);
    const membersQuery = groupRef.collection('members').where('active', '==', true);
    await adminDb.runTransaction(async (transaction) => {
      const [groupSnap, membersSnap] = await Promise.all([transaction.get(groupRef), transaction.get(membersQuery)]);
      if (!groupSnap.exists) throw new Error('Groupe introuvable.');
      const group = groupSnap.data();
      if (group.ownerId !== uid) throw new Error('Seul le chef du groupe peut modifier l’ordre de passage.');
      if (group.startedAt || group.membershipLockedCycle) throw new Error('L’ordre de passage est verrouillé depuis le démarrage de la cotisation.');
      if (membersSnap.docs.some((doc) => !/^[0-9]{8,15}$/.test(String(doc.data()?.whatsappPhone || '').replace(/[^0-9]/g, '')))) {
        throw new Error('Chaque membre doit enregistrer son numéro WhatsApp avant que le chef attribue les positions.');
      }
      const currentIds = membersSnap.docs.map((doc) => doc.id);
      if (orderedIds.length !== currentIds.length || currentIds.some((id) => !orderedIds.includes(id))) {
        throw new Error('La liste des positions doit contenir tous les membres actifs, une seule fois chacun.');
      }
      orderedIds.forEach((memberId, index) => {
        transaction.update(groupRef.collection('members').doc(memberId), {
          turnOrder: index + 1,
          orderUpdatedAt: FieldValue.serverTimestamp(),
        });
      });
      transaction.update(groupRef, {
        orderConfirmedAt: FieldValue.serverTimestamp(),
        orderConfirmedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return NextResponse.json({ success: true, message: 'L’ordre de passage a été enregistré.' });
  } catch (error) { return errorResponse(error.message || 'Impossible de modifier l’ordre des membres.', 400); }
}

async function handleCotisationStart(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const groupId = String(body.groupId || '').trim().slice(0, 150);
    if (!groupId || groupId.includes('/')) return errorResponse('Groupe invalide.', 400);
    const groupRef = adminDb.collection('cotisationGroups').doc(groupId);
    const result = await adminDb.runTransaction(async (transaction) => {
      const groupSnap = await transaction.get(groupRef);
      if (!groupSnap.exists) throw new Error('Groupe introuvable.');
      const group = groupSnap.data();
      if (group.ownerId !== uid) throw new Error('Seul le chef du groupe peut lancer la cotisation.');
      if (group.responsibilityAcceptedBy !== uid) throw new Error('Le chef doit accepter les responsabilités du groupe avant le lancement.');
      if (group.startedAt) throw new Error('Cette cotisation a déjà été lancée.');
      if (!group.orderConfirmedAt) throw new Error('Le chef doit enregistrer explicitement l’ordre des membres avant le lancement.');
      const expectedMembers = cotisationExpectedMembers(group, group.memberCount);
      const membersQuery = groupRef.collection('members').where('active', '==', true);
      const membersSnap = await transaction.get(membersQuery);
      if (membersSnap.size < 2) throw new Error('Au moins deux personnes doivent avoir rejoint le groupe.');
      if (membersSnap.size !== expectedMembers) throw new Error('Il faut exactement ' + expectedMembers + ' participants avant de lancer ce groupe. Il en manque ' + Math.max(0, expectedMembers - membersSnap.size) + '.');
      if (membersSnap.docs.some((doc) => !/^[0-9]{8,15}$/.test(String(doc.data()?.whatsappPhone || '').replace(/[^0-9]/g, '')))) throw new Error('Chaque participant doit enregistrer son numéro WhatsApp avant le lancement.');
      const members = membersSnap.docs.map((doc) => ({ uid: doc.id, ...doc.data() })).sort((a, b) => Number(a.turnOrder) - Number(b.turnOrder));
      if (new Set(members.map((member) => Number(member.turnOrder))).size !== members.length || members.some((member, index) => Number(member.turnOrder) !== index + 1)) {
        throw new Error('Le chef doit enregistrer une position unique pour chaque participant avant le lancement.');
      }
      const meta = getCotisationCycleMeta(group);
      if (meta.notStarted) throw new Error('La date de début choisie est le ' + meta.startDate + '. Le groupe pourra être lancé à cette date.');
      const cycleRef = groupRef.collection('cycles').doc(meta.cycleKey);
      const cycleSnap = await transaction.get(cycleRef);
      if (cotisationMoney(cycleSnap.data()?.totalCollected) > 0) throw new Error('Des versements sont déjà enregistrés pour cette période.');
      const baseTarget = cotisationMoney(group.contributionAmount) * expectedMembers;
      if (baseTarget > 500000) throw new Error('Le montant total dépasse la limite de retrait autorisée de 500 000 FCFA.');
      transaction.set(cycleRef, {
        cycleKey: meta.cycleKey, cycleIndex: meta.cycleIndex,
        startDate: meta.startDate, dueAt: meta.dueAt,
        baseTargetAmount: baseTarget, targetAmount: baseTarget,
        totalCollected: 0, status: 'OPEN',
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.update(groupRef, {
        startedAt: FieldValue.serverTimestamp(),
        startedBy: uid,
        membershipLockedCycle: meta.cycleKey,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { group, members, meta, baseTarget };
    });
    const frequencyLabel = cotisationFrequencyLabel(result.group.frequency);
    const dueLabel = result.meta.dueAt;
    const emailResults = await Promise.all(result.members.map(async (member, index) => {
      let emailSent = false;
      if (member.email && String(member.email).includes('@')) {
        try {
          await sendPataEmail({
            to: member.email,
            subject: 'La cotisation « ' + String(result.group.name || '') + ' » a démarré',
            html: cotisationStartedEmail({
              name: member.displayName,
              groupName: result.group.name,
              contributionAmount: result.group.contributionAmount,
              frequency: frequencyLabel,
              position: index + 1,
              beneficiaryName: result.members[0]?.displayName,
              turnAmount: result.baseTarget,
              dueLabel,
              expectedMembers: result.members.length,
            }),
            idempotencyKey: 'pata-cotisation-start-' + groupId + '-' + result.meta.cycleKey + '-' + member.uid,
          });
          emailSent = true;
        } catch (emailError) {
          console.warn('[COTISATION START EMAIL]', member.uid, emailError.message || emailError);
        }
      }
      // La boîte Pata doit être alimentée même si Resend est momentanément indisponible.
      await adminDb.collection('users').doc(member.uid).collection('notifications').doc('cotisation-start-' + groupId + '-' + result.meta.cycleKey).set({
        title: 'Ta cotisation a démarré',
        body: 'Le groupe ' + result.group.name + ' est lancé. Ta position dans le groupe est ' + (index + 1) + '.',
        target: '/cotisations', source: 'cotisation', read: false, readAt: null,
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true }).catch((notificationError) => {
        console.warn('[COTISATION START IN-APP]', member.uid, notificationError.message || notificationError);
      });
      return emailSent;
    }));
    const beneficiary = result.members[0];
    let beneficiaryTurnEmailSent = false;
    if (beneficiary?.email && String(beneficiary.email).includes('@')) {
      try {
        await sendPataEmail({
          to: beneficiary.email,
          subject: 'Tu es le premier bénéficiaire de « ' + String(result.group.name || '') + ' »',
          html: cotisationTurnEmail({
            name: beneficiary.displayName, groupName: result.group.name,
            frequency: frequencyLabel, position: 1,
            contributionAmount: result.group.contributionAmount,
            totalAmount: result.baseTarget, dueLabel, isMyTurn: true,
          }),
          idempotencyKey: 'pata-cotisation-turn-' + groupId + '-' + result.meta.cycleKey + '-' + beneficiary.uid,
        });
        beneficiaryTurnEmailSent = true;
      } catch (emailError) {
        console.warn('[COTISATION TURN EMAIL]', emailError.message || emailError);
      }
    }
    await adminDb.collection('users').doc(beneficiary.uid).collection('notifications').doc('cotisation-turn-' + groupId + '-' + result.meta.cycleKey).set({
      title: 'C’est ton tour de recevoir la cotisation',
      body: 'Le groupe ' + result.group.name + ' t’a désigné comme premier bénéficiaire. Tu dois aussi verser ta propre contribution.',
      target: '/cotisations', source: 'cotisation', read: false, readAt: null,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true }).catch((notificationError) => console.warn('[COTISATION TURN IN-APP]', notificationError.message || notificationError));
    if (beneficiaryTurnEmailSent) {
      await groupRef.collection('turnNotifications').doc(result.meta.cycleKey).set({
        status: 'SENT', beneficiaryUid: beneficiary.uid, sentAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return NextResponse.json({ success: true, notified: emailResults.filter(Boolean).length, message: 'La cotisation est lancée. Les positions sont verrouillées et les membres peuvent commencer à verser.' });
  } catch (error) { return errorResponse(error.message || 'Impossible de lancer le groupe.', 400); }
}

async function handleCotisationsScheduler(request) {
  try {
    const expectedSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('authorization') || '';
    const suppliedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : request.headers.get('x-cron-secret');
    if (!expectedSecret || !suppliedSecret || !safeStringEqual(suppliedSecret, expectedSecret)) {
      return errorResponse('Accès au planificateur des cotisations refusé.', 401);
    }

    const today = cotisationToday();
    const groupsSnap = await adminDb.collection('cotisationGroups').where('status', '==', 'active').limit(500).get();
    const totals = { groupsChecked: groupsSnap.size, turnEmails: 0, dueReminders: 0, overdueReminders: 0, pushSent: 0, failed: 0 };
    const appUrl = getPataAppUrl(request);

    const claimMessage = async (ref) => {
      return adminDb.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (snapshot.exists) {
          const data = snapshot.data() || {};
          if (data.status === 'SENT') return false;
          const started = data.startedAt?.toDate ? data.startedAt.toDate().getTime() : Number(data.startedAt || 0);
          if (data.status === 'SENDING' && started && Date.now() - started < 20 * 60 * 1000) return false;
        }
        transaction.set(ref, {
          status: 'SENDING',
          startedAt: FieldValue.serverTimestamp(),
          attempts: FieldValue.increment(1),
        }, { merge: true });
        return true;
      });
    };

    const sendCotisationMessage = async ({ group, member, meta, title, body, dueAmount, penaltyDue, reminderType }) => {
      const reminderId = 'cotisation-' + group.id + '-' + meta.cycleKey + '-' + member.uid + '-' + reminderType;
      const reminderRef = adminDb.collection('cotisationReminderRuns').doc(reminderId);
      const claimed = await claimMessage(reminderRef);
      if (!claimed) return false;

      const userRef = adminDb.collection('users').doc(member.uid);
      const inAppRef = userRef.collection('notifications').doc(reminderId);
      let emailSent = false;
      let pushSent = 0;
      try {
        await inAppRef.set({
          title, body, target: '/cotisations', source: 'cotisation',
          groupId: group.id, cycleKey: meta.cycleKey,
          read: false, readAt: null, createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        if (member.email && String(member.email).includes('@')) {
          await sendPataEmail({
            to: member.email,
            subject: title,
            html: cotisationDueEmail({
              name: member.displayName,
              groupName: group.name,
              contributionAmount: group.contributionAmount,
              paidAmount: member.paid,
              remainingAmount: dueAmount,
              dueLabel: meta.dueAt,
              graceDays: group.graceDays,
              lateFeeLabel: penaltyDue > 0
                ? cotisationPenaltyLabel(group) + ' — montant appliqué : ' + penaltyDue.toLocaleString('fr-FR') + ' FCFA'
                : cotisationPenaltyLabel(group),
              overdue: reminderType === 'overdue',
            }),
            idempotencyKey: 'pata-' + reminderId,
          });
          emailSent = true;
        }

        const userSnap = await userRef.get();
        const userData = userSnap.exists ? userSnap.data() : {};
        if (userData.notificationsEnabled && Array.isArray(userData.pushTokens)) {
          const tokens = [...new Set(userData.pushTokens.filter((token) => typeof token === 'string' && token.length > 20))];
          const invalidTokens = [];
          for (const token of tokens) {
            try {
              await adminMessaging.send({
                token,
                data: { title, body, url: '/cotisations', tag: reminderId },
                webpush: { headers: { TTL: '86400', Urgency: 'high' }, fcmOptions: { link: appUrl + '/cotisations' } },
              });
              pushSent += 1;
            } catch (pushError) {
              if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(pushError.code)) invalidTokens.push(token);
              console.warn('[COTISATION REMINDER PUSH]', member.uid, pushError.code || pushError.message);
            }
          }
          if (invalidTokens.length) {
            await userRef.set({ pushTokens: FieldValue.arrayRemove(...invalidTokens) }, { merge: true });
            const remaining = tokens.filter((token) => !invalidTokens.includes(token));
            if (!remaining.length) await userRef.set({ notificationsEnabled: false }, { merge: true });
          }
        }

        await reminderRef.set({
          status: 'SENT',
          emailSent,
          pushSent,
          completedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return true;
      } catch (error) {
        await reminderRef.set({
          status: 'FAILED',
          error: String(error.message || error).slice(0, 300),
          failedAt: FieldValue.serverTimestamp(),
        }, { merge: true }).catch(() => {});
        throw error;
      }
    };

    for (const groupDoc of groupsSnap.docs) {
      const group = { id: groupDoc.id, ...groupDoc.data() };
      if (!group.startedAt) continue;
      try {
        const meta = await resolveCurrentCotisationCycleMeta(groupDoc.ref, group, today);
        if (meta.notStarted) continue;
        const membersSnap = await groupDoc.ref.collection('members').orderBy('turnOrder', 'asc').limit(50).get();
        const members = membersSnap.docs
          .map((doc) => ({ uid: doc.id, ...doc.data() }))
          .filter((member) => member.active !== false)
          .sort((a, b) => Number(a.turnOrder) - Number(b.turnOrder));
        if (members.length < 2) continue;

        const beneficiary = members[meta.cycleIndex % members.length];
        const turnRef = groupDoc.ref.collection('turnNotifications').doc(meta.cycleKey);
        const claimed = await claimMessage(turnRef);
        if (claimed) {
          try {
            await adminDb.collection('users').doc(beneficiary.uid).collection('notifications').doc('cotisation-turn-' + group.id + '-' + meta.cycleKey).set({
              title: 'C’est ton tour de recevoir la cotisation',
              body: 'Le groupe ' + group.name + ' t’a désigné comme bénéficiaire de cette période. Tu dois aussi verser ta propre contribution.',
              target: '/cotisations', source: 'cotisation', read: false, readAt: null,
              createdAt: FieldValue.serverTimestamp(),
            }, { merge: true });
            let emailSent = false;
            if (beneficiary.email && String(beneficiary.email).includes('@')) {
              await sendPataEmail({
                to: beneficiary.email,
                subject: 'Ton tour est arrivé dans « ' + String(group.name || 'ta cotisation') + ' »',
                html: cotisationTurnEmail({
                  name: beneficiary.displayName,
                  groupName: group.name,
                  frequency: cotisationFrequencyLabel(group.frequency),
                  position: Number(beneficiary.turnOrder) || meta.cycleIndex + 1,
                  contributionAmount: group.contributionAmount,
                  totalAmount: cotisationMoney(group.contributionAmount) * members.length,
                  dueLabel: meta.dueAt,
                  isMyTurn: true,
                }),
                idempotencyKey: 'pata-cotisation-turn-' + group.id + '-' + meta.cycleKey + '-' + beneficiary.uid,
              });
              emailSent = true;
              totals.turnEmails += 1;
            }
            await turnRef.set({
              status: 'SENT', beneficiaryUid: beneficiary.uid, emailSent,
              sentAt: FieldValue.serverTimestamp(),
            }, { merge: true });
          } catch (emailError) {
            await turnRef.set({ status: 'FAILED', error: String(emailError.message || emailError).slice(0, 300) }, { merge: true });
            throw emailError;
          }
        }

        const cycleRef = groupDoc.ref.collection('cycles').doc(meta.cycleKey);
        const [cycleSnap, contributionsSnap] = await Promise.all([
          cycleRef.get(),
          cycleRef.collection('contributions').limit(50).get(),
        ]);
        const contributions = new Map(contributionsSnap.docs.map((doc) => [doc.id, doc.data()]));
        const isDueDay = today === meta.dueAt;
        const graceEnd = cotisationAddDays(meta.dueAt, cotisationMoney(group.graceDays));
        const isOverdueDay = today > graceEnd;
        if (!isDueDay && !isOverdueDay) continue;

        const expectedPrincipal = cotisationMoney(group.contributionAmount);
        for (const member of members) {
          const contribution = contributions.get(member.uid) || {};
          const paid = cotisationMoney(contribution.amount);
          const remaining = Math.max(0, expectedPrincipal - paid);
          if (!remaining) continue;
          const penaltyDue = isOverdueDay && !cotisationMoney(contribution.penaltyPaid) ? cotisationLateFee(group) : 0;
          const reminderType = isOverdueDay ? 'overdue' : 'due';
          const title = isOverdueDay ? 'Délai de grâce terminé — cotisation à régulariser' : 'La date limite de ta cotisation est arrivée';
          const body = isOverdueDay
            ? 'Il te reste ' + remaining.toLocaleString('fr-FR') + ' FCFA à verser dans « ' + group.name + ' ». Le délai de grâce est terminé. La règle du groupe prévoit une majoration de ' + penaltyDue.toLocaleString('fr-FR') + ' FCFA, le cas échéant.'
            : 'La date limite de paiement de « ' + group.name + ' » est aujourd’hui. Il te reste ' + remaining.toLocaleString('fr-FR') + ' FCFA à verser. Tu peux cotiser en plusieurs fois dans Pata.';
          const sent = await sendCotisationMessage({
            group, member, meta, title, body,
            dueAmount: remaining, penaltyDue, reminderType,
          });
          if (sent) {
            if (isOverdueDay) totals.overdueReminders += 1;
            else totals.dueReminders += 1;
          }
        }
      } catch (error) {
        totals.failed += 1;
        console.error('[COTISATION SCHEDULER]', group.id, error.message || error);
      }
    }

    return NextResponse.json({ success: true, date: today, ...totals });
  } catch (error) {
    console.error('[CRON] Cotisations:', error.message || error);
    return errorResponse(error.message || 'Le rappel quotidien des cotisations a échoué.', 500);
  }
}

async function handleCotisationPay(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const groupId = String(body.groupId || '').trim().slice(0, 150);
    const amount = Math.round(Number(body.amount));
    if (!groupId || groupId.includes('/')) return errorResponse('Groupe invalide.', 400);
    if (!Number.isSafeInteger(amount) || amount < 100 || amount % 100 !== 0) return errorResponse('Chaque versement doit être d’au moins 100 FCFA et par multiples de 100.', 400);
    const groupRef = adminDb.collection('cotisationGroups').doc(groupId);
    const memberRef = groupRef.collection('members').doc(uid);
    const [groupSnap, memberSnap, userSnap] = await Promise.all([
      groupRef.get(), memberRef.get(), adminDb.collection('users').doc(uid).get(),
    ]);
    if (!groupSnap.exists || !memberSnap.exists || !userSnap.exists) return errorResponse('Tu ne fais pas partie de ce groupe.', 403);
    const group = groupSnap.data();
    if (group.status !== 'active') return errorResponse('Ce groupe n’accepte plus de versements.', 409);
    if (!group.startedAt) return errorResponse('Le chef du groupe doit d’abord lancer la cotisation après l’adhésion de tous les participants prévus.', 409);
    const meta = await resolveCurrentCotisationCycleMeta(groupRef, group);
    if (meta.notStarted) return errorResponse('Les cotisations commencent le ' + meta.startDate + '.', 409);
    const cycleRef = groupRef.collection('cycles').doc(meta.cycleKey);
    const contributionRef = cycleRef.collection('contributions').doc(uid);
    const membersSnap = await groupRef.collection('members').where('active', '==', true).get();
    const expectedMembers = cotisationExpectedMembers(group, group.memberCount);
    if (membersSnap.size < 2 || membersSnap.size !== expectedMembers) return errorResponse('Le groupe doit être complet et lancé avant les versements.', 409);
    const apiUser = process.env.FAPSHI_API_USER;
    const apiKey = process.env.FAPSHI_SECRET_KEY;
    if (!apiUser || !apiKey) return errorResponse('Le service de paiement est momentanément indisponible. Réessaie plus tard.', 503);

    // Réservation atomique : un seul lien Fapshi non terminé par membre et par cycle.
    const reservationId = randomBytes(18).toString('hex');
    const reservation = await adminDb.runTransaction(async (transaction) => {
      const [freshGroup, freshMember, cycleSnap, contributionSnap, freshUser] = await Promise.all([
        transaction.get(groupRef), transaction.get(memberRef), transaction.get(cycleRef),
        transaction.get(contributionRef), transaction.get(adminDb.collection('users').doc(uid)),
      ]);
      if (!freshGroup.exists || !freshMember.exists || !freshUser.exists) throw new Error('Groupe ou profil utilisateur introuvable.');
      const fresh = freshGroup.data();
      if (fresh.status !== 'active') throw new Error('Ce groupe n’accepte plus de versements.');
      if (!fresh.startedAt) throw new Error('Le chef du groupe doit d’abord lancer la cotisation.');
      const freshMeta = await resolveCurrentCotisationCycleMeta(groupRef, fresh, cotisationToday(), transaction);
      if (freshMeta.notStarted) throw new Error('Les cotisations commencent le ' + freshMeta.startDate + '.');
      if (freshMeta.cycleKey !== meta.cycleKey) throw new Error('Le tour de cotisation a changé. Actualise la page puis réessaie.');
      const cycleStatus = cycleSnap.data()?.status || 'OPEN';
      if (cycleStatus !== 'OPEN') throw new Error('Cette période est déjà entièrement financée ou en cours de retrait.');
      const member = freshMember.data();
      if (member.pendingPaymentId) throw new Error('Un paiement est déjà en attente pour cette période. Termine-le ou vérifie son statut avant d’en ouvrir un autre.');
      const contributionAmount = cotisationMoney(fresh.contributionAmount);
      const contribution = contributionSnap.data() || {};
      const paid = cotisationMoney(contribution.amount);
      const due = Math.max(0, contributionAmount - paid);
      if (amount > due) throw new Error('Il reste ' + due.toLocaleString('fr-FR') + ' FCFA à verser pour ta part de ce cycle.');
      const penaltyAmount = due > 0 && !cotisationMoney(contribution.penaltyPaid) && cotisationIsLate(fresh, freshMeta)
        ? cotisationLateFee(fresh) : 0;
      const fee = Math.round((amount + penaltyAmount) * 0.05);
      const grossAmount = amount + penaltyAmount + fee;
      if (cotisationMoney(cycleSnap.data()?.targetAmount || cycleSnap.data()?.baseTargetAmount) + penaltyAmount > 500000) {
        throw new Error('Cette majoration ferait dépasser la limite autorisée de retrait de 500 000 FCFA.');
      }
      transaction.update(memberRef, {
        pendingPaymentId: reservationId, pendingPaymentAmount: amount + penaltyAmount,
        pendingPaymentAt: FieldValue.serverTimestamp(), pendingPaymentTransId: null,
      });
      return { group: fresh, user: freshUser.data(), due, penaltyAmount, fee, grossAmount, meta: freshMeta };
    });

    const baseUrl = getBaseUrl(request);
    const userData = reservation.user;
    const payload = {
      amount: reservation.grossAmount, currency: 'XAF',
      description: 'Cotisation Pata — ' + String(reservation.group.name || 'Groupe').slice(0, 60),
      userId: uid,
      externalId: reservationId,
      redirect_url: (request.headers.get('origin') || baseUrl) + '/cotisations',
      webhook_url: baseUrl + '/api/fapshi/webhook',
      email: userData.email || '', name: userData.displayName || 'Membre',
    };
    try {
      const response = await fetch('https://live.fapshi.com/initiate-pay', {
        method: 'POST', headers: { 'Content-Type': 'application/json', apiuser: apiUser, apikey: apiKey },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        await releaseCotisationReservation(groupId, uid, reservationId, data.message || 'Paiement refusé');
        return errorResponse(data.message || 'Le paiement n’a pas été accepté. Réessaie ou contacte le support.', 502);
      }
      const checkoutUrl = data.data?.url || data.link || data.url;
      const transId = data.transId || data.data?.transId;
      if (!checkoutUrl || !transId) {
        await releaseCotisationReservation(groupId, uid, reservationId, 'Lien de paiement absent');
        return errorResponse('Le lien de paiement n’a pas pu être créé. Réessaie plus tard.', 502);
      }
      await adminDb.collection('cotisationPayments').doc(transId).create({
        transId, reservationId, userId: uid, groupId, groupName: reservation.group.name || 'Cotisation',
        cycleKey: reservation.meta.cycleKey, cycleIndex: reservation.meta.cycleIndex, cycleStartDate: reservation.meta.startDate, dueAt: reservation.meta.dueAt,
        displayName: userData.displayName || 'Membre', amount, penaltyAmount: reservation.penaltyAmount,
        fee: reservation.fee, grossAmount: reservation.grossAmount,
        status: 'PENDING', checkoutUrl, createdAt: FieldValue.serverTimestamp(),
      });
      // Ne rattache le lien que si la réservation existe toujours : le webhook peut avoir confirmé très vite.
      await adminDb.runTransaction(async (transaction) => {
        const freshMember = await transaction.get(memberRef);
        if (freshMember.exists && freshMember.data()?.pendingPaymentId === reservationId) {
          transaction.update(memberRef, { pendingPaymentTransId: transId });
        }
      });
      return NextResponse.json({
        success: true, checkoutUrl, transId, amount, penaltyAmount: reservation.penaltyAmount,
        fee: reservation.fee, grossAmount: reservation.grossAmount,
      });
    } catch (error) {
      await releaseCotisationReservation(groupId, uid, reservationId, error.message || 'Erreur au démarrage du paiement').catch(() => {});
      throw error;
    }
  } catch (error) { return errorResponse(error.message || 'Impossible de démarrer le paiement.', 502); }
}

async function handleCotisationWithdrawalRequest(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const groupId = String(body.groupId || '').trim().slice(0, 150);
    const phoneRaw = String(body.phone || '').replace(/[^0-9+]/g, '');
    let phone = phoneRaw.replace(/^\+/, '');
    if (phone.startsWith('237') && phone.length === 12) phone = phone.slice(3);
    const medium = body.network === 'orange' ? 'orange money' : body.network === 'mtn' ? 'mobile money' : '';
    if (!groupId || groupId.includes('/')) return errorResponse('Groupe invalide.', 400);
    if (!/^6[0-9]{8}$/.test(phone) || !medium) return errorResponse('Vérifie ton numéro MTN ou Orange Money.', 400);
    const groupRef = adminDb.collection('cotisationGroups').doc(groupId);
    const membersQuery = groupRef.collection('members').where('active', '==', true);
    const requestRef = adminDb.collection('withdrawalRequests').doc();
    const result = await adminDb.runTransaction(async (transaction) => {
      const groupSnap = await transaction.get(groupRef);
      if (!groupSnap.exists) throw new Error('Groupe introuvable.');
      const group = groupSnap.data();
      const meta = await resolveCurrentCotisationCycleMeta(groupRef, group, cotisationToday(), transaction);
      if (meta.notStarted) throw new Error('La période de cotisation n’a pas encore commencé.');
      const cycleRef = groupRef.collection('cycles').doc(meta.cycleKey);
      const userRef = adminDb.collection('users').doc(uid);
      const [membersSnap, cycleSnap, userSnap, memberSnap] = await Promise.all([
        transaction.get(membersQuery), transaction.get(cycleRef), transaction.get(userRef),
        transaction.get(groupRef.collection('members').doc(uid)),
      ]);
      if (!memberSnap.exists || !userSnap.exists) throw new Error('Tu ne fais pas partie de ce groupe.');
      const members = membersSnap.docs.map((doc) => ({ uid: doc.id, ...doc.data() })).sort((a, b) => Number(a.turnOrder) - Number(b.turnOrder));
      const beneficiary = members.length ? members[meta.cycleIndex % members.length] : null;
      if (members.length < 2) throw new Error('Le groupe doit compter au moins deux membres avant un retrait.');
      if (!beneficiary || beneficiary.uid !== uid) throw new Error('Ce n’est pas encore ton tour de recevoir la cotisation.');
      const cycle = cycleSnap.data() || {};
      const target = cotisationMoney(cycle.targetAmount) || cotisationMoney(group.contributionAmount) * members.length;
      const collected = cotisationMoney(cycle.totalCollected);
      if (collected < target) throw new Error('Tous les membres doivent avoir terminé leur cotisation avant le retrait.');
      if (!['READY', 'OPEN'].includes(cycle.status || 'OPEN')) throw new Error('Une demande de retrait est déjà en cours ou ce cycle est terminé.');
      const user = userSnap.data();
      if (collected < 100 || collected > 500000) throw new Error('Le montant du retrait doit être compris entre 100 et 500 000 FCFA.');
      if (!/^[0-9]{8,15}$/.test(String(memberSnap.data()?.whatsappPhone || '').replace(/[^0-9]/g, ''))) throw new Error('Enregistre ton numéro WhatsApp dans les informations du groupe avant de demander le retrait.');
      transaction.create(requestRef, {
        withdrawalType: 'cotisation', userId: uid, email: user.email || '',
        displayName: user.displayName || beneficiary.displayName || 'Membre', phone, medium,
        groupId, cycleKey: meta.cycleKey, goalName: 'Cotisation · ' + (group.name || 'Groupe'),
        grossAmount: collected, debtDeduction: 0, cancellationPenalty: 0, platformFee: 0,
        amount: collected, currency: 'XAF', status: 'PENDING_REVIEW', createdAt: FieldValue.serverTimestamp(),
      });
      transaction.set(cycleRef, {
        cycleKey: meta.cycleKey, cycleIndex: meta.cycleIndex, startDate: meta.startDate, dueAt: meta.dueAt,
        targetAmount: target, totalCollected: collected, status: 'PENDING_REVIEW',
        withdrawalRequestId: requestRef.id, updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { amount: collected, requestId: requestRef.id, user: { email: user.email || '', displayName: user.displayName || beneficiary.displayName || 'Membre' }, groupName: group.name || 'Groupe' };
    });
    const mailData = { ...result.user, amount: result.amount, goalName: 'Cotisation · ' + result.groupName, requestId: result.requestId, withdrawalType: 'cotisation' };
    await cotisationSendWithdrawalEmail(mailData, 'received');
    await adminDb.collection('users').doc(uid).collection('notifications').doc('withdrawal-' + result.requestId).set({
      title: 'Demande de retrait reçue',
      body: 'Ta demande de retrait de ' + result.amount.toLocaleString('fr-FR') + ' FCFA a été reçue et attend la validation de l’administration.',
      target: '/cotisations', createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ success: true, amount: result.amount, requestId: result.requestId, message: 'Ta demande de retrait a été reçue et sera vérifiée avant l’envoi.' });
  } catch (error) { return errorResponse(error.message || 'Impossible de demander ce retrait.', 400); }
}

async function handleUserWithdrawalHistory(request) {
  try {
    const { uid } = await authenticate(request);
    const snapshot = await adminDb.collection('withdrawalRequests').where('userId', '==', uid).limit(100).get();
    const withdrawals = snapshot.docs.map((doc) => ({ id: doc.id, ...serializeAdminValue(doc.data()) }))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return NextResponse.json({ success: true, withdrawals });
  } catch (error) { return errorResponse(error.message || 'Impossible de charger l’historique des retraits.', 401); }
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
  'referrals/status': { GET: handleReferralStatus },
  'referrals/attribute': { POST: handleReferralAttribute },
  'referrals/transfer': { POST: handleReferralTransfer },
  'referrals/withdraw': { POST: handleReferralWithdrawal },
  'cotisations/pay-referral': { POST: handleCotisationReferralPayment },
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
  'projects/create': { POST: handleCreateProject },
  'cotisations/invite': { GET: handleCotisationInvitePreview },
  'cotisations/scheduler': { GET: handleCotisationsScheduler, POST: handleCotisationsScheduler },
  'cotisations/create': { POST: handleCotisationCreate },
  'cotisations/update': { POST: handleCotisationUpdate },
  'cotisations/join': { POST: handleCotisationJoin },
  'cotisations/reorder': { POST: handleCotisationReorder },
  'cotisations/contact': { POST: handleCotisationContact },
  'cotisations/pin': { POST: handleCotisationPin },
  'cotisations/start': { POST: handleCotisationStart },
  'cotisations/pay': { POST: handleCotisationPay },
  'cotisations/withdraw': { POST: handleCotisationWithdrawalRequest },
  'cotisations/list': { GET: handleCotisationsList },
  'withdrawals/list': { GET: handleUserWithdrawalHistory },
  'projects/update': { POST: handleUpdateProject },
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
