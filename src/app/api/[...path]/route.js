import { NextResponse } from 'next/server';
import { adminAuth, adminDb, adminMessaging } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { completeWithGroq } from '@/lib/ai/groqClient';
import { AI_TOOLS, createExpenseForUser, updateExpenseForUser, deleteExpenseForUser, executeAITool, runAutomationForUser, generateWeeklyReportForUser } from '@/lib/ai/financialTools';
import { generateAudioWithGemini } from '@/lib/ai/geminiTTS';
import { chatWithGroqVision } from '@/lib/ai/groqVision';
import { generateImageWithPollinations } from '@/lib/ai/pollinationsImage';
import { buildUserContext } from '@/lib/ai/buildUserContext';

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
    goals: 2,
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

async function handleNotificationSubscription(request, remove = false) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const token = String(body.token || '').trim();
    if (token.length < 40 || token.length > 4096) return errorResponse('Jeton de notification invalide.', 400);
    const userRef = adminDb.collection('users').doc(uid);
    if (remove) {
      await adminDb.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(userRef);
        const remaining = (Array.isArray(snapshot.data()?.pushTokens) ? snapshot.data().pushTokens : []).filter((item) => item !== token);
        transaction.set(userRef, { pushTokens: FieldValue.arrayRemove(token), notificationsEnabled: remaining.length > 0, notificationsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
    } else {
      await userRef.set({ pushTokens: FieldValue.arrayUnion(token), notificationsEnabled: true, notificationsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error.message || 'Impossible d’enregistrer les notifications.', 400);
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
              notification: { title, body },
              data: { url: target, tag: `pata-${today}` },
              webpush: { notification: { icon: '/android-chrome-192x192.png', badge: '/android-chrome-192x192.png', tag: `pata-${today}`, renotify: false } },
            });
            delivered += 1;
          } catch (sendError) {
            if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(sendError.code)) invalidTokens.push(token);
            console.error(`[PUSH] ${userDoc.id}:`, sendError.code || sendError.message);
          }
        }
        if (invalidTokens.length) await userDoc.ref.update({ pushTokens: FieldValue.arrayRemove(...invalidTokens) });
        if (delivered > 0) {
          await userDoc.ref.update({ notificationsDailyDate: today, lastNotificationAt: FieldValue.serverTimestamp() });
          await userDoc.ref.collection('notifications').doc(today).set({ title, body, target, date: today, delivered, createdAt: FieldValue.serverTimestamp() });
          sent += 1;
        } else failed += 1;
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

async function handleFundGoal(request) {
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
      if (userDoc.data().balance < amount) throw new Error('Solde insuffisant.');

      t.update(userRef, { balance: userDoc.data().balance - amount });
      t.set(goalRef.collection('deposits').doc(), {
        amount, date: new Date().toISOString().slice(0, 10), source: 'wallet', createdAt: FieldValue.serverTimestamp(),
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
        amount, date: new Date().toISOString().slice(0, 10), source: 'loan', createdAt: FieldValue.serverTimestamp(),
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
      const totalDeposited = depositsSnap.docs.reduce((s, d) => s + (d.data().amount || 0), 0);
      const debt = goalDoc.data().debtBalance || 0;
      const netRefund = Math.max(0, totalDeposited - debt);

      if (netRefund > 0) {
        const userDoc = await t.get(userRef);
        t.update(userRef, { balance: (userDoc.data().balance || 0) + netRefund });
      }
      t.delete(goalRef);
      depositsSnap.docs.forEach(d => t.delete(d.ref));
      return { totalDeposited, debt, netRefund };
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
      const totalDeposited = depositsSnap.docs.reduce((s, d) => s + (d.data().amount || 0), 0);
      const debt = goalDoc.data().debtBalance || 0;
      const cancelPenalty = Math.round(totalDeposited * 0.10);
      const netRefund = Math.max(0, totalDeposited - debt - cancelPenalty);

      if (netRefund > 0) {
        const userDoc = await t.get(userRef);
        t.update(userRef, { balance: (userDoc.data().balance || 0) + netRefund });
      }
      t.delete(goalRef);
      depositsSnap.docs.forEach(d => t.delete(d.ref));
      return { totalDeposited, debt, cancelPenalty, netRefund };
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
            if (weeklyReport.generated) userResult.weeklyReportsGenerated += 1;
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

    const history = incomingMessages.slice(-24).map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: String(message.content || '').slice(0, 1800),
    })).filter((message) => message.content.trim());
    if (!history.length || history[history.length - 1].role !== 'user') {
      return errorResponse('Le dernier message utilisateur est manquant.', 400);
    }

    const quota = await reserveDailyAIQuota(uid);
    if (!quota.allowed) {
      return errorResponse("Tu as utilisé tes 3 questions gratuites aujourd'hui. Reviens demain ou passe Premium.", 403);
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
- Revenus : ouvrir « Revenus », ajouter le montant, le nom de la source et la date. La durée de consommation est estimée à partir des dépenses associées à cette source.
- Budgets : ouvrir « Budgets », choisir le mois et la source de revenu, puis toucher une catégorie pour voir les opérations, le montant prévu, le montant dépensé et le reste. Le bouton de modification permet de définir l’enveloppe; le bouton de conseil ouvre Mč avec les chiffres de cette catégorie.
- Prévisions vitales : ouvrir « Revenus », accéder aux « Prévisions vitales », définir les besoins par catégorie et leur fréquence. L’analyse avec Mč explique le résultat; la transformation en revenu et budgets ne doit se faire que sur demande explicite.
- Prévision de durée du capital : dans « Revenus », saisir le capital disponible et les dépenses prévues par jour, semaine ou mois. Pata estime la durée et la date de fin, puis peut envoyer ces chiffres à Mč pour une analyse complémentaire.
- Objectifs : ouvrir « Objectifs », créer un objectif avec son nom, sa somme cible et, lorsque nécessaire, sa date limite. Les versements et la progression sont consultables dans cette rubrique.
- Rapports : ouvrir « Rapports », choisir jour, semaine, mois, année ou dates personnalisées, puis consulter les revenus, dépenses, catégories, budgets, objectifs et portefeuille. Les boutons PDF et Excel servent à exporter le rapport.
- Portefeuille : ouvrir « Portefeuille », saisir le montant à recharger et le numéro Mobile Money, puis suivre la confirmation. Le dernier numéro utilisé est conservé dans le profil pour le retrouver sur un autre appareil.
- Premium : ouvrir « Premium », choisir la durée, vérifier le solde affiché et confirmer le paiement depuis le portefeuille. Le prix affiché est de 2 500 FCFA pour 30 jours; l’accès n’est prolongé qu’après confirmation.
- Paramètres : modifier le nom et la devise d’affichage, exporter les données et activer ou désactiver les notifications. Les montants de référence restent stockés en XAF et sont convertis à l’écran.
- Assistante : l’utilisateur peut décrire naturellement une opération à Mč. « @Audio » demande une réponse vocale, « @Image » demande une image et « @Vision » sert à analyser une image jointe.
Ne prétends jamais qu’un bouton, un écran ou un réglage existe s’il n’est pas indiqué ici ou visible dans le contexte de l’application. Si une étape semble différente sur l’appareil de l’utilisateur, demande-lui ce qu’il voit plutôt que d’inventer.

LANGAGE ET PRÉSENTATION
Parle comme une personne qui accompagne un utilisateur, pas comme un développeur. N’affiche JAMAIS les noms techniques des actions, outils, fonctions, collections, identifiants internes ou termes comme apply_budget_plan, add_expense, API, Firestore, tool call ou JSON. Remplace-les par « enregistrer une dépense », « préparer un budget », « créer un objectif », « mettre en pause une opération programmée », etc. Explique tout terme financier inhabituel. Utilise des phrases courtes, des titres simples et, lorsque cela améliore la compréhension, de vrais tableaux Markdown avec en-têtes et lignes. Ne produis pas de tableau si trois lignes simples suffisent.

RÈGLES NON NÉGOCIABLES
1. Réponds toujours en français, directement, avec des explications concrètes et des calculs exacts. Ne salue pas à chaque message.
2. Le dernier message s’inscrit dans une conversation : conserve les corrections, les précisions, les noms et les décisions des messages précédents. Une correction remplace l’information erronée; ne traite pas une correction comme une nouvelle opération.
3. N’invente jamais de montant, date, revenu, catégorie, source, identifiant ou opération déjà faite. Utilise uniquement les informations fournies et les données Pata ci-dessous.
4. Quand une information indispensable manque ou que plusieurs sources correspondent, pose une seule question claire. Ne lance aucun outil tant que tu n’as pas les champs nécessaires.
5. Distingue une intention d’enregistrement d’une simple question, d’un exemple, d’une simulation ou d’un conseil. N’enregistre que lorsque l’utilisateur le demande clairement.
6. Pour ajouter une dépense, utilise add_expense. Si la personne nomme une source (ex. « mon salaire », « le revenu TRIXHUB »), associe-la à l’ID exact de cette source. Ne mets JAMAIS le nom de la source uniquement dans la note. Si aucune source n’est précisée, utilise « all » pour répartir les fonds disponibles.
7. Les soldes disponibles par revenu sont calculés en soustrayant les dépenses déjà associées à cet ID. Si le montant demandé dépasse le solde disponible de cette source (ou de toutes les sources), l’opération sera refusée. N’annonce jamais une réussite avant d’avoir reçu le résultat de l’outil.
8. Pour établir un budget, tu dois uniquement créer ou actualiser les enveloppes demandées. Un budget n’est jamais un revenu : ne crée un revenu que si la personne demande séparément de l’enregistrer.
9. Pour créer une dépense récurrente, demande une précision si la fréquence, le montant ou la source explicitement voulue est ambiguë. Explique qu’une automatisation nécessite que le planificateur serveur soit configuré pour fonctionner même lorsque l’application est fermée.
10. Les actions de modification, suppression ou mise en pause ne concernent que des identifiants exacts présents dans les données. Si la cible n’est pas certaine, demande laquelle. Les suppressions doivent être explicitement demandées.
11. Tu peux mémoriser les objectifs, préférences, limites et corrections financières explicitement déclarés avec remember_user_context. La citation doit être copiée exactement depuis un message de l’utilisateur. Ne mémorise jamais une déduction ou une information incertaine.
12. Après chaque outil, base ta réponse sur son résultat réel. Distingue clairement réussite, refus, dépense répartie sur plusieurs revenus et automatisation mise en pause.
13. Ne prétends pas consulter un compte bancaire, un portefeuille externe ou une donnée qui n’existe pas dans Pata. Le solde calculé est uniquement celui des enregistrements Pata.
14. Si l’utilisateur corrige un montant ou un libellé avant l’exécution, utilise la dernière correction uniquement et ne crée pas deux opérations.
15. À la fin de chaque réponse, propose une seule suite utile, directement liée à la demande, sous forme d’une question simple. Ne propose pas une action que Pata ne sait pas réellement faire.
16. Pour expliquer une fonction, guide l’utilisateur étape par étape avec les libellés visibles. Tu peux proposer un bouton pour ouvrir Dépenses (/expenses), Revenus (/income), Budgets (/budgets), Objectifs (/goals), Portefeuille (/wallet), Rapports (/reports), Premium (/premium) ou Paramètres (/settings).
17. Explique les catégories avec leurs noms courants, les montants dans la devise d’affichage lorsqu’elle est connue, et les calculs sans vocabulaire technique. Ne dis jamais « identifiant », « quota », « collection », « transaction serveur » ou le nom d’une fonction interne à un utilisateur ordinaire; dis simplement ce qui se passe et ce qu’il doit faire.
18. Pour un abonnement Premium, commence par vérifier son statut et son solde. S’il demande explicitement de s’abonner et que le solde suffit, propose/execute le paiement uniquement avec son accord clair. Si le solde est insuffisant, explique la somme manquante et propose le Portefeuille. Ne prétends jamais qu’un paiement est confirmé avant le résultat réel.
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
          hasSuccessfulToolExecution = true;
          toolResults.push({ tool: toolName, success: true, result });
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
    if (!quota.allowed) return errorResponse(`Tu as utilisé tes 3 requêtes IA gratuites aujourd'hui. Reviens demain ou passe Premium.`, 403);
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
    if (!quota.allowed) return errorResponse(`Tu as utilisé tes 3 requêtes IA gratuites aujourd'hui. Reviens demain ou passe Premium.`, 403);
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
  'goals/withdraw':        { POST: handleGoalWithdraw },
  'goals/cancel':          { POST: handleGoalCancel },
  'automations/run':       { POST: handleAutomationsRun },
  'automations/scheduler': { GET: handleAutomationsScheduler, POST: handleAutomationsScheduler },
  'notifications/subscribe': { POST: (request) => handleNotificationSubscription(request, false) },
  'notifications/unsubscribe': { POST: (request) => handleNotificationSubscription(request, true) },
  'notifications/scheduler': { GET: handleNotificationScheduler, POST: handleNotificationScheduler },
  'currency/rates':        { GET: handleCurrencyRates },
  'usage/reserve':         { POST: handleReserveQuota },
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
