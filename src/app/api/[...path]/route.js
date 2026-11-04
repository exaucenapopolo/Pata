import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
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
    
    if (phone && !userData.phone) await adminDb.collection('users').doc(uid).update({ phone });

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
    const months = Math.max(1, parseInt(body.months) || 1);
    const amount = 2500 * months;

    const userRef = adminDb.collection('users').doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return errorResponse('Utilisateur introuvable.', 404);

    const balance = userDoc.data().balance || 0;
    if (balance < amount) {
      return errorResponse(`Solde insuffisant. Tu as ${balance} FCFA, il te faut ${amount} FCFA.`);
    }

    const now = new Date();
    const currentPremiumUntil = userDoc.data().premiumUntil ? new Date(userDoc.data().premiumUntil) : null;
    const baseDate = currentPremiumUntil && currentPremiumUntil > now ? currentPremiumUntil : now;
    const newExpiration = new Date(baseDate.getTime() + months * 30 * 24 * 60 * 60 * 1000);

    await userRef.update({
      balance: balance - amount,
      premiumUntil: newExpiration.toISOString(),
      lastPaymentDate: now.toISOString(),
      lastPaymentAmount: amount,
      lastPaymentMethod: 'balance',
    });

    return NextResponse.json({ success: true, newExpiration: newExpiration.toISOString() });
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

RÈGLES NON NÉGOCIABLES
1. Réponds toujours en français, directement, avec des explications concrètes et des calculs exacts. Ne salue pas à chaque message.
2. Le dernier message s’inscrit dans une conversation : conserve les corrections, les précisions, les noms et les décisions des messages précédents. Une correction remplace l’information erronée; ne traite pas une correction comme une nouvelle opération.
3. N’invente jamais de montant, date, revenu, catégorie, source, identifiant ou opération déjà faite. Utilise uniquement les informations fournies et les données Pata ci-dessous.
4. Quand une information indispensable manque ou que plusieurs sources correspondent, pose une seule question claire. Ne lance aucun outil tant que tu n’as pas les champs nécessaires.
5. Distingue une intention d’enregistrement d’une simple question, d’un exemple, d’une simulation ou d’un conseil. N’enregistre que lorsque l’utilisateur le demande clairement.
6. Pour ajouter une dépense, utilise add_expense. Si la personne nomme une source (ex. « mon salaire », « le revenu TRIXHUB »), associe-la à l’ID exact de cette source. Ne mets JAMAIS le nom de la source uniquement dans la note. Si aucune source n’est précisée, utilise « all » pour répartir les fonds disponibles.
7. Les soldes disponibles par revenu sont calculés en soustrayant les dépenses déjà associées à cet ID. Si le montant demandé dépasse le solde disponible de cette source (ou de toutes les sources), l’opération sera refusée. N’annonce jamais une réussite avant d’avoir reçu le résultat de l’outil.
8. Pour établir un budget, applique_budget_plan ne doit jamais créer un revenu. Un budget est une enveloppe; ne crée un revenu que si la personne demande séparément de l’enregistrer.
9. Pour créer une dépense récurrente, demande une précision si la fréquence, le montant ou la source explicitement voulue est ambiguë. Explique qu’une automatisation nécessite que le planificateur serveur soit configuré pour fonctionner même lorsque l’application est fermée.
10. Les actions de modification, suppression ou mise en pause ne concernent que des identifiants exacts présents dans les données. Si la cible n’est pas certaine, demande laquelle. Les suppressions doivent être explicitement demandées.
11. Tu peux mémoriser les objectifs, préférences, limites et corrections financières explicitement déclarés avec remember_user_context. La citation doit être copiée exactement depuis un message de l’utilisateur. Ne mémorise jamais une déduction ou une information incertaine.
12. Après chaque outil, base ta réponse sur son résultat réel. Distingue clairement réussite, refus, dépense répartie sur plusieurs revenus et automatisation mise en pause.
13. Ne prétends pas consulter un compte bancaire, un portefeuille externe ou une donnée qui n’existe pas dans Pata. Le solde calculé est uniquement celui des enregistrements Pata.
14. Si l’utilisateur corrige un montant ou un libellé avant l’exécution, utilise la dernière correction uniquement et ne crée pas deux opérations.

DONNÉES FINANCIÈRES ACTUELLES
${userContext}`;

    const modelMessages = [
      { role: 'system', content: systemPrompt },
      ...history,
    ];
    const userMessages = history.filter((message) => message.role === 'user').map((message) => message.content);
    const toolResults = [];
    let reply = '';
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
        return NextResponse.json({ success: true, audio: audioBase64, isAudio: true, textReply: reply, reply, toolResults });
      } catch (ttsError) {
        return NextResponse.json({ success: true, reply, audioError: 'Impossible de générer l’audio.', toolResults });
      }
    }

    return NextResponse.json({ success: true, reply, toolResults, quota: { remaining: quota.remaining, isPremium: quota.isPremium } });
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
