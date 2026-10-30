import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

async function authenticate(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Token manquant.');
  }
  const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
  return decoded;
}

function errorResponse(message, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function getBaseUrl(request) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  return process.env.FAPSHI_WEBHOOK_URL?.replace(/\/$/, '') || `${proto}://${host}`;
}

/* ═══════════════════════════════════════════════════════════
   POST /api/fapshi/checkout
   Crée une session de paiement Fapshi et un document deposits/{transId}.
   ═══════════════════════════════════════════════════════════ */

async function handleFapshiCheckout(request) {
  try {
    const decoded = await authenticate(request);
    const uid = decoded.uid;

    const body = await request.json();
    const amount = Math.round(Number(body.amount));
    if (!amount || amount < 100) return errorResponse('Montant minimum : 100 FCFA.', 400);

    const API_USER = process.env.FAPSHI_API_USER;
    const SECRET_KEY = process.env.FAPSHI_SECRET_KEY;
    if (!API_USER || !SECRET_KEY) {
      return errorResponse('Configuration Fapshi incomplète.', 500);
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
      description: body.description || 'Recharge Pata',
      redirect_url: `${origin}/wallet`,
      webhook_url: webhookUrl,
      phone,
      email: userData.email || decoded.email || '',
      name: userData.displayName || 'Client',
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    let fapshiRes;
    try {
      fapshiRes = await fetch('https://live.fapshi.com/initiate-pay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apiuser: API_USER,
          apikey: SECRET_KEY,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      return errorResponse('Impossible de contacter Fapshi.', 502);
    }
    clearTimeout(timer);

    const raw = await fapshiRes.text();
    let data;
    try { data = JSON.parse(raw); } catch {
      return errorResponse('Réponse Fapshi invalide.', 502);
    }

    if (!fapshiRes.ok) {
      return errorResponse(data.message || data.error || 'Erreur Fapshi.', 400);
    }

    const checkoutUrl = data.data?.url || data.link || data.url;
    const transId = data.transId || data.data?.transId;
    if (!checkoutUrl || !transId) {
      return errorResponse('URL de paiement manquante.', 502);
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

    return NextResponse.json({ success: true, checkoutUrl, transId });
  } catch (error) {
    console.error('Fapshi checkout error:', error);
    return errorResponse(error.message || 'Erreur serveur.', 500);
  }
}

/* ═══════════════════════════════════════════════════════════
   POST /api/fapshi/webhook
   Appelé par Fapshi. Vérifie le statut réel puis crédite le solde.
   Aucune authentification Firebase : la source de vérité est Fapshi.
   ═══════════════════════════════════════════════════════════ */

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
    if (!API_USER || !SECRET_KEY) {
      return NextResponse.json({ received: true, error: 'config' });
    }

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
    console.error('Fapshi webhook error:', error);
    return NextResponse.json({ received: true });
  }
}

/* ═══════════════════════════════════════════════════════════
   POST /api/fapshi/status
   Vérification manuelle ou polling : valide auprès de Fapshi puis crédite.
   ═══════════════════════════════════════════════════════════ */

async function handleFapshiStatus(request) {
  try {
    const decoded = await authenticate(request);
    const uid = decoded.uid;

    const body = await request.json();
    const transId = body.transId;
    if (!transId) return errorResponse('transId requis.', 400);

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
    if (!API_USER || !SECRET_KEY) return errorResponse('Config Fapshi incomplète.', 500);

    const fapshiRes = await fetch(`https://live.fapshi.com/payment-status/${transId}`, {
      headers: { apiuser: API_USER, apikey: SECRET_KEY, 'Content-Type': 'application/json' },
    });

    if (!fapshiRes.ok) return errorResponse('Erreur Fapshi.', 502);

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
        t.update(depositRef, {
          status: 'CONFIRMED',
          confirmedAt: FieldValue.serverTimestamp(),
        });
      });
      return NextResponse.json({ success: true, status: 'CONFIRMED', credited: true });
    }

    if (['FAILED', 'EXPIRED', 'CANCELED', 'REVERSED'].includes(realStatus)) {
      await depositRef.update({ status: 'FAILED', failedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ success: true, status: 'FAILED' });
    }

    return NextResponse.json({ success: true, status: 'PENDING' });
  } catch (error) {
    console.error('Fapshi status error:', error);
    return errorResponse(error.message || 'Erreur serveur.', 500);
  }
}

/* ═══════════════════════════════════════════════════════════
   POST /api/wallet/fund-goal
   Débite le solde wallet et ajoute un deposit dans un objectif.
   Seul endpoint qui a le droit de DÉBITER le solde.
   ═══════════════════════════════════════════════════════════ */

async function handleFundGoal(request) {
  try {
    const decoded = await authenticate(request);
    const uid = decoded.uid;

    const body = await request.json();
    const goalId = body.goalId;
    const amount = Math.round(Number(body.amount));

    if (!goalId || !amount || amount <= 0) {
      return errorResponse('goalId et amount requis.', 400);
    }

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

/* ═══════════════════════════════════════════════════════════
   ROUTEUR INTERNE
   ═══════════════════════════════════════════════════════════ */

const ROUTES = {
  'fapshi/checkout':  { POST: handleFapshiCheckout },
  'fapshi/webhook':   { POST: handleFapshiWebhook },
  'fapshi/status':    { POST: handleFapshiStatus },
  'wallet/fund-goal': { POST: handleFundGoal },
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
    return NextResponse.json(
      { success: false, error: `Méthode ${request.method} non autorisée.` },
      { status: 405 }
    );
  }

  return handler(request);
}

export const GET = dispatch;
export const POST = dispatch;
export const PUT = dispatch;
export const DELETE = dispatch;
export const PATCH = dispatch;
