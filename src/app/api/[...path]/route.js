import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

// ⚠️ FORCE VERCEL À UTILISER NODE.JS (pas Edge)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ═══════════════════ HELPERS ═══════════════════ */

async function authenticate(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Token manquant.');
  }
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

/* ═══════════════════ ROUTES FAPSHI ═══════════════════ */

async function handleFapshiCheckout(request) {
  try {
    console.log('[API] Début de /api/fapshi/checkout');
    const decoded = await authenticate(request);
    const uid = decoded.uid;

    const body = await request.json();
    const amount = Math.round(Number(body.amount));
    if (!amount || amount < 100) return errorResponse('Montant minimum : 100 FCFA.', 400);

    const API_USER = process.env.FAPSHI_API_USER;
    const SECRET_KEY = process.env.FAPSHI_SECRET_KEY;
    if (!API_USER || !SECRET_KEY) {
      console.error('[API] Erreur: clés Fapshi manquantes');
      return errorResponse('Configuration de paiement incomplète.', 500);
    }

    const userDoc = await adminDb.collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    const phone = String(body.phone || userData.phone || '').replace(/\D/g, '');
    if (phone && !userData.phone) {
      await adminDb.collection('users').doc(uid).update({ phone });
    }

    const baseUrl = getBaseUrl(request);
    const webhookUrl = `${baseUrl}/api/fapshi/webhook`;
    const origin = request.headers.get('origin') || baseUrl;

    const payload = {
      amount,
      currency: 'XAF',
      description: body.description || 'Recharge de solde',
      redirect_url: `${origin}/wallet`,
      webhook_url: webhookUrl,
      phone,
      email: userData.email || decoded.email || '',
      name: userData.displayName || 'Client',
    };

    console.log('[API] Envoi requête à Fapshi pour montant:', amount);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    let fapshiRes;
    try {
      fapshiRes = await fetch('https://live.fapshi.com/initiate-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apiuser: API_USER, apikey: SECRET_KEY },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      console.error('[API] Fapshi fetch error:', err.message);
      return errorResponse('Le service de paiement ne répond pas.', 502);
    }
    clearTimeout(timer);

    const raw = await fapshiRes.text();
    let data;
    try { data = JSON.parse(raw); } catch {
      console.error('[API] Fapshi réponse non-JSON:', raw);
      return errorResponse('Réponse de paiement invalide.', 502);
    }

    if (!fapshiRes.ok) {
      console.error('[API] Fapshi refus:', data);
      return errorResponse(data.message || data.error || 'Paiement refusé.', 400);
    }

    const checkoutUrl = data.data?.url || data.link || data.url;
    const transId = data.transId || data.data?.transId;

    if (!checkoutUrl || !transId) {
      console.error('[API] URL ou transId manquant:', data);
      return errorResponse('Lien de paiement indisponible.', 502);
    }

    await adminDb.collection('deposits').doc(transId).set({
      transId,
      userId: uid,
      amount,
      currency: 'XAF',
      description: payload.description,
      phone,
      status: 'PENDING',
      checkoutUrl,
      createdAt: FieldValue.serverTimestamp(),
      confirmedAt: null,
      failedAt: null,
    });

    console.log('[API] Succès checkout, URL:', checkoutUrl);
    return NextResponse.json({ success: true, checkoutUrl, transId });
  } catch (error) {
    console.error('[API] CRASH checkout:', error.message);
    return errorResponse(error.message || 'Erreur interne.', 500);
  }
}

async function handleFapshiWebhook(request) {
  try {
    const body = await request.json();
    const transId = body.transId;
    if (!transId) return NextResponse.json({ received: true });

    const depositRef = adminDb.collection('deposits').doc(transId);
    const depDoc = await depositRef.get();
    if (!depDoc.exists) return NextResponse.json({ received: true });

    if (depDoc.data().status === 'CONFIRMED') {
      return NextResponse.json({ received: true, alreadyConfirmed: true });
    }

    const API_USER = process.env.FAPSHI_API_USER;
    const SECRET_KEY = process.env.FAPSHI_SECRET_KEY;
    if (!API_USER || !SECRET_KEY) return NextResponse.json({ received: true, error: 'config' });

    const verifyRes = await fetch(`https://live.fapshi.com/payment-status/${transId}`, {
      headers: { apiuser: API_USER, apikey: SECRET_KEY, 'Content-Type': 'application/json' },
    });

    if (!verifyRes.ok) return NextResponse.json({ received: true, error: 'verify' });

    const verifyData = await verifyRes.json();
    const realStatus = (verifyData.status || '').toUpperCase();

    if (realStatus !== 'SUCCESSFUL') {
      if (['FAILED', 'EXPIRED', 'CANCELED', 'REVERSED'].includes(realStatus)) {
        await depositRef.update({ status: 'FAILED', failedAt: FieldValue.serverTimestamp() });
      }
      return NextResponse.json({ received: true, deferred: realStatus });
    }

    await adminDb.runTransaction(async (t) => {
      const fresh = await t.get(depositRef);
      if (!fresh.exists || fresh.data().status === 'CONFIRMED') return;

      const dep = fresh.data();
      const userRef = adminDb.collection('users').doc(dep.userId);
      const userDoc = await t.get(userRef);
      const balance = userDoc.exists ? (userDoc.data().balance || 0) : 0;

      t.update(userRef, { balance: balance + (dep.amount || 0) });
      t.update(depositRef, {
        status: 'CONFIRMED',
        confirmedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ received: true, status: 'CONFIRMED' });
  } catch (error) {
    console.error('[API] Webhook error:', error.message);
    return NextResponse.json({ received: true });
  }
}

async function handleFapshiStatus(request) {
  try {
    const decoded = await authenticate(request);
    const uid = decoded.uid;
    const body = await request.json();
    const transId = body.transId;
    
    if (!transId) return errorResponse('Transaction manquante.', 400);

    const depositRef = adminDb.collection('deposits').doc(transId);
    const depDoc = await depositRef.get();
    
    if (!depDoc.exists) return errorResponse('Transaction introuvable.', 404);
    const dep = depDoc.data();
    
    if (dep.userId !== uid) return errorResponse('Accès refusé.', 403);
    if (dep.status === 'CONFIRMED') {
      return NextResponse.json({ success: true, status: 'CONFIRMED', alreadyConfirmed: true });
    }

    const API_USER = process.env.FAPSHI_API_USER;
    const SECRET_KEY = process.env.FAPSHI_SECRET_KEY;
    if (!API_USER || !SECRET_KEY) return errorResponse('Service indisponible.', 500);

    const fapshiRes = await fetch(`https://live.fapshi.com/payment-status/${transId}`, {
      headers: { apiuser: API_USER, apikey: SECRET_KEY, 'Content-Type': 'application/json' },
    });

    if (!fapshiRes.ok) return errorResponse('Vérification impossible.', 502);
    const fapshiData = await fapshiRes.json();
    const realStatus = (fapshiData.status || '').toUpperCase();

    if (realStatus === 'SUCCESSFUL') {
      await adminDb.runTransaction(async (t) => {
        const fresh = await t.get(depositRef);
        if (!fresh.exists || fresh.data().status === 'CONFIRMED') return;
        const d = fresh.data();
        const userRef = adminDb.collection('users').doc(d.userId);
        const userDoc = await t.get(userRef);
        const balance = userDoc.exists ? (userDoc.data().balance || 0) : 0;
        t.update(userRef, { balance: balance + (d.amount || 0) });
        t.update(depositRef, { status: 'CONFIRMED', confirmedAt: FieldValue.serverTimestamp() });
      });
      return NextResponse.json({ success: true, status: 'CONFIRMED', credited: true });
    }

    if (['FAILED', 'EXPIRED', 'CANCELED', 'REVERSED'].includes(realStatus)) {
      await depositRef.update({ status: 'FAILED', failedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ success: true, status: 'FAILED' });
    }

    return NextResponse.json({ success: true, status: 'PENDING' });
  } catch (error) {
    console.error('[API] Status error:', error.message);
    return errorResponse(error.message || 'Erreur serveur.', 500);
  }
}

/* ═══════════════════ ROUTES PORTEFEUILLE & OBJECTIFS ═══════════════════ */

async function handleFundGoal(request) {
  try {
    const decoded = await authenticate(request);
    const uid = decoded.uid;
    const body = await request.json();
    const goalId = body.goalId;
    const amount = Math.round(Number(body.amount));

    if (!goalId || !amount || amount <= 0) return errorResponse('Montant invalide.', 400);

    const userRef = adminDb.collection('users').doc(uid);
    const goalRef = adminDb.collection('users').doc(uid).collection('goals').doc(goalId);

    await adminDb.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      const goalDoc = await t.get(goalRef);

      if (!userDoc.exists) throw new Error('Utilisateur introuvable.');
      if (!goalDoc.exists) throw new Error('Objectif introuvable.');

      const balance = userDoc.data().balance || 0;
      if (balance < amount) {
        throw new Error(`Solde insuffisant. Disponible : ${balance.toLocaleString('fr-FR')} FCFA.`);
      }

      const depositRef = goalRef.collection('deposits').doc();
      t.set(depositRef, {
        amount,
        date: new Date().toISOString().slice(0, 10),
        source: 'wallet',
        createdAt: FieldValue.serverTimestamp(),
      });
      t.update(userRef, { balance: balance - amount });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error.message || 'Erreur transaction.', 400);
  }
}

async function handleGoalWithdraw(request) {
  try {
    const decoded = await authenticate(request);
    const uid = decoded.uid;
    const body = await request.json();
    const goalId = body.goalId;

    if (!goalId) return errorResponse('Objectif manquant.', 400);

    const userRef = adminDb.collection('users').doc(uid);
    const goalRef = adminDb.collection('users').doc(uid).collection('goals').doc(goalId);
    const depositsRef = goalRef.collection('deposits');

    const goalDoc = await goalRef.get();
    if (!goalDoc.exists) return errorResponse('Objectif introuvable.', 404);

    const depositsSnap = await depositsRef.get();
    const totalDeposited = depositsSnap.docs.reduce((s, d) => s + (d.data().amount || 0), 0);

    if (totalDeposited <= 0) return errorResponse('Aucun montant à retirer.', 400);

    await adminDb.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      const balance = userDoc.exists ? (userDoc.data().balance || 0) : 0;
      t.update(userRef, { balance: balance + totalDeposited });
      t.delete(goalRef);
    });

    const batch = adminDb.batch();
    depositsSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    return NextResponse.json({ success: true, amount: totalDeposited, penalty: 0 });
  } catch (error) {
    return errorResponse(error.message || 'Retrait impossible.', 500);
  }
}

async function handleGoalCancel(request) {
  try {
    const decoded = await authenticate(request);
    const uid = decoded.uid;
    const body = await request.json();
    const goalId = body.goalId;

    if (!goalId) return errorResponse('Objectif manquant.', 400);

    const userRef = adminDb.collection('users').doc(uid);
    const goalRef = adminDb.collection('users').doc(uid).collection('goals').doc(goalId);
    const depositsRef = goalRef.collection('deposits');

    const goalDoc = await goalRef.get();
    if (!goalDoc.exists) return errorResponse('Objectif introuvable.', 404);

    const depositsSnap = await depositsRef.get();
    const totalDeposited = depositsSnap.docs.reduce((s, d) => s + (d.data().amount || 0), 0);

    const penalty = Math.round(totalDeposited * 0.10);
    const refund = totalDeposited - penalty;

    await adminDb.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      const balance = userDoc.exists ? (userDoc.data().balance || 0) : 0;
      t.update(userRef, { balance: balance + refund });
      t.delete(goalRef);
    });

    if (depositsSnap.docs.length > 0) {
      const batch = adminDb.batch();
      depositsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    return NextResponse.json({ success: true, amount: refund, penalty, total: totalDeposited });
  } catch (error) {
    return errorResponse(error.message || 'Annulation impossible.', 500);
  }
}

/* ═══════════════════ ROUTEUR PRINCIPAL ═══════════════════ */

const ROUTES = {
  'fapshi/checkout':  { POST: handleFapshiCheckout },
  'fapshi/webhook':   { POST: handleFapshiWebhook },
  'fapshi/status':    { POST: handleFapshiStatus },
  'wallet/fund-goal': { POST: handleFundGoal },
  'goals/withdraw':   { POST: handleGoalWithdraw },
  'goals/cancel':     { POST: handleGoalCancel },
};

async function dispatch(request, context) {
  const segments = context?.params?.path || [];
  const key = segments.join('/');
  const route = ROUTES[key];

  if (!route) {
    return NextResponse.json({ success: false, error: 'Route inconnue.' }, { status: 404 });
  }

  const handler = route[request.method];
  if (!handler) {
    return NextResponse.json({ success: false, error: `Méthode non autorisée.` }, { status: 405 });
  }

  return handler(request);
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const DELETE = dispatch;
export const PATCH = dispatch;
