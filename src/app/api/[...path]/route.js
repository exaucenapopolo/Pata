import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { chatWithGroq } from '@/lib/ai/groqClient';
import { buildUserContext } from '@/lib/ai/buildUserContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

/* ═══════════════════ ROUTES FAPSHI ═══════════════════ */

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

/* ═══════════════════ ROUTES WALLET & OBJECTIFS ═══════════════════ */

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

/* ═══════════════════ ROUTE AI MČ ═══════════════════ */

async function handleAIChat(request) {
  try {
    const decoded = await authenticate(request);
    const uid = decoded.uid;
    const body = await request.json();

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) return errorResponse('Messages requis.', 400);

    const [userDoc, incomesSnap, expensesSnap, goalsSnap] = await Promise.all([
      adminDb.collection('users').doc(uid).get(),
      adminDb.collection('users').doc(uid).collection('incomes').limit(100).get(),
      adminDb.collection('users').doc(uid).collection('expenses').limit(200).get(),
      adminDb.collection('users').doc(uid).collection('goals').limit(20).get(),
    ]);

    const userData = {
      profile: userDoc.exists ? userDoc.data() : {},
      incomes: incomesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      expenses: expensesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      goals: goalsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    };

    const userContext = buildUserContext(userData);
    const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const SYSTEM_PROMPT = `Tu es Mč, l'assistante financière personnelle de Pata (créée par Napopolo Exaucé).
Nous sommes le ${today}.

Voici les VRAIES données de l'utilisateur (mises à jour en temps réel). Tu DOIS te baser UNIQUEMENT sur ces données pour répondre. Ne calcule pas toi-même les restes, ils sont déjà calculés dans les données ci-dessous.

RÈGLES ABSOLUES :
1. INTERDICTION TOTALE d'utiliser des astérisques (*), des dièses (#) ou des underscores (_). N'utilise aucun symbole Markdown. Pour mettre en valeur une idée, écris le mot ou la phrase EN MAJUSCULES.
2. Tu peux utiliser des sauts de ligne et des tirets simples (-) pour structurer tes réponses si elles sont longues.
3. Ne salue PAS à chaque message. Si l'historique contient déjà des messages, ne dis pas "Salut", "Bonjour", ni le prénom. Va directement au but.
4. Sois concise, va droit au but, sois précise, et assure-toi de TOUJOURS FINIR TES PHRASES.
5. N'invente JAMAIS de chiffres. Si une info manque, dis-le. Si on te demande où est passé l'argent d'un revenu, regarde la section "SITUATION DES REVENUS" ci-dessous qui liste exactement les dépenses liées.
6. Si on te demande une prévision, pose 2 ou 3 questions ciblées avant de calculer.
7. Ton ton : bienveillant, professionnel, comme un conseiller qui veut vraiment aider.

DONNÉES DE L'UTILISATEUR :
${userContext}`;

    const trimmedHistory = messages.slice(-6).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 500),
    }));

    const reply = await chatWithGroq([
      { role: 'system', content: SYSTEM_PROMPT },
      ...trimmedHistory,
    ], { maxTokens: 2000, temperature: 0.3 }); // Température abaissée à 0.3 pour qu'elle soit plus factuelle

    return NextResponse.json({ success: true, reply });
  } catch (error) {
    console.error('[API] AI chat error:', error.message);
    return errorResponse(error.message || 'Erreur de l\'assistante.', 500);
  }
}

/* ═══════════════════ ROUTEUR ═══════════════════ */

const ROUTES = {
  'fapshi/checkout':  { POST: handleFapshiCheckout },
  'fapshi/webhook':   { POST: handleFapshiWebhook },
  'fapshi/status':    { POST: handleFapshiStatus },
  'wallet/fund-goal': { POST: handleFundGoal },
  'goals/borrow':     { POST: handleGoalBorrow },
  'goals/repay':      { POST: handleRepayLoan },
  'goals/withdraw':   { POST: handleGoalWithdraw },
  'goals/cancel':     { POST: handleGoalCancel },
  'ai/chat':          { POST: handleAIChat },
};

async function dispatch(request, context) {
  const segments = context?.params?.path || [];
  const route = ROUTES[segments.join('/')];
  if (!route || !route[request.method]) return NextResponse.json({ error: 'Route introuvable' }, { status: 404 });
  return route[request.method](request);
}

export { dispatch as GET, dispatch as POST, dispatch as PUT, dispatch as DELETE, dispatch as PATCH };
