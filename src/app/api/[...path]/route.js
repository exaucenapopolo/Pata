import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { chatWithGroq } from '@/lib/ai/groqClient';
import { generateAudioWithGemini } from '@/lib/ai/geminiTTS';
import { chatWithGroqVision } from '@/lib/ai/groqVision';
import { generateImageWithPollinations } from '@/lib/ai/pollinationsImage';
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
// ... (garde tes fonctions existantes identiques : handleFapshiCheckout, handleFundGoal, etc.)

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
    const uid = decoded.uid;
    const now = new Date().toISOString();

    const snapshot = await adminDb.collection('users').doc(uid).collection('automations').get();
    let executedCount = 0;

    for (const doc of snapshot.docs) {
      const auto = doc.data();
      if (auto.nextRun <= now) {
        await adminDb.collection('users').doc(uid).collection('expenses').add({
          amount: auto.amount, categoryId: auto.categoryId, note: auto.note || 'Dépense automatique',
          date: now.slice(0, 10), incomeSourceId: auto.incomeSourceId, incomeSourceName: auto.incomeSourceName,
          createdAt: FieldValue.serverTimestamp(),
        });

        const next = new Date(auto.nextRun);
        if (auto.frequency === 'daily') next.setDate(next.getDate() + 1);
        else if (auto.frequency === 'weekly') next.setDate(next.getDate() + 7);
        else if (auto.frequency === 'monthly') next.setMonth(next.getMonth() + 1);

        await doc.ref.update({ nextRun: next.toISOString() });
        executedCount++;
      }
    }
    return NextResponse.json({ success: true, executed: executedCount });
  } catch (error) { return errorResponse(error.message, 500); }
}

/* ═══════════════════ AI CHAT ═══════════════════ */

async function handleAIChat(request) {
  try {
    const decoded = await authenticate(request);
    const uid = decoded.uid;
    const body = await request.json();

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) return errorResponse('Messages requis.', 400);

    const lastUserMessage = messages[messages.length - 1].content.toLowerCase();
    const wantsAudio = /audio|voix|vocal/i.test(lastUserMessage);
    const wantsImage = /génère|générer|crée|créer|dessine|dessiner|fais|faire/i.test(lastUserMessage) 
                    && /image|photo|illustration|dessin/i.test(lastUserMessage);

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

    const tools = [
      {
        type: 'function',
        function: {
          name: 'add_expense',
          description: 'Ajouter une dépense. ATTENTION : L\'ID du revenu doit être EXACTEMENT celui fourni dans le contexte. Ne jamais utiliser "all" si l\'utilisateur a spécifié un nom.',
          parameters: {
            type: 'object',
            properties: {
              amount: { type: 'number', description: 'Le montant de la dépense' },
              category: { type: 'string', description: 'La catégorie (ex: transport, food, etc.)' },
              note: { type: 'string', description: 'Description optionnelle' },
              incomeSourceId: { type: 'string', description: 'L\'ID du revenu (ex: "xYz123"). Si l\'utilisateur dit "global" ou "tous", mets "all".' },
              incomeSourceName: { type: 'string', description: 'Le nom du revenu (ex: SBH, Salaire)' }
            },
            required: ['amount', 'category', 'incomeSourceId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'add_income',
          description: 'Ajouter un revenu. Nécessite un montant, un nom et une catégorie.',
          parameters: {
            type: 'object',
            properties: {
              amount: { type: 'number', description: 'Le montant perçu' },
              source: { type: 'string', description: 'Le nom du revenu (ex: Salaire, SBH, Freelance)' },
              categoryId: { 
                type: 'string', 
                enum: ['salary', 'business', 'gift', 'other_income'], 
                description: 'La catégorie : salary, business, gift, other_income' 
              },
              note: { type: 'string', description: 'Description optionnelle' }
            },
            required: ['amount', 'source', 'categoryId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'add_automation',
          description: 'Créer une dépense récurrente automatique',
          parameters: {
            type: 'object',
            properties: {
              amount: { type: 'number' },
              category: { type: 'string' },
              frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
              note: { type: 'string' }
            },
            required: ['amount', 'category', 'frequency']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'create_goal',
          description: 'Créer un nouvel objectif d\'épargne',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              targetAmount: { type: 'number' },
              deadline: { type: 'string', description: 'Date au format YYYY-MM-DD' }
            },
            required: ['name', 'targetAmount', 'deadline']
          }
        }
      }
    ];

    // 🟢 PROMPT SYSTÈME INTRANSIGEANT
    const SYSTEM_PROMPT = `Tu es Mč, l'assistante financière personnelle de Pata. 

RÈGLES DE SÉCURITÉ ABSOLUES (TU ES UNE IA, PAS UNE ROBOT) :
1. Si l'utilisateur te corrige (ex: "Non je t'ai demandé de le faire dans SBH"), TU NE DOIS PAS OUBLIER le montant et la catégorie précédents. Tu dois UNIQUEMENT changer le revenu.
2. TU NE DOIS JAMAIS utiliser "all" (Tous les revenus) si l'utilisateur a mentionné un nom de revenu spécifique (ex: SBH).
3. Pour trouver l'ID d'un revenu, regarde la section "SITUATION DES REVENUS" ci-dessous. Cherche le nom exact (ex: "SBH") et prends l'ID associé (ex: "xYz123").
4. Si tu ne trouves pas l'ID du revenu demandé, ARRÊTE-TOI et demande à l'utilisateur de choisir parmi la liste. N'invente pas.
5. Si l'utilisateur demande d'ajouter un revenu sans préciser la catégorie, ARRÊTE-TOI et demande-lui de choisir parmi : Salaire, Freelance, Cadeau, Autre.

RÈGLES DE FORMATAGE ABSOLUES (SOUS PEINE DE REJET) :
1. INTERDICTION TOTALE d'utiliser des astérisques (*) ou des dièses (#). N'utilise AUCUN symbole Markdown.
2. Tu DOIS faire des sauts de ligne quand tu changes d'idée ou listes des éléments.
3. Tu peux utiliser des tirets simples (-) pour les listes.
4. Pour mettre en valeur une idée, écris le mot EN MAJUSCULES.
5. Ne salue PAS à chaque message. Va directement au but.
6. ⚠️ SI L'UTILISATEUR MENTIONNE LE MOT "AUDIO", "VOIX" OU "VOCAL" : Ne lui donne PAS de tutoriel sur comment faire de l'audio. Réponds simplement à sa question de manière naturelle et complète.
7. ⚠️ SI L'UTILISATEUR DEMANDE DE GÉNÉRER UNE IMAGE : Ne génère PAS de texte, le système s'occupe de créer l'image.

DONNÉES ACTUELLES DE L'UTILISATEUR :
${userContext}`;

    const trimmedHistory = messages.slice(-8).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 500),
    }));

    if (wantsImage) {
      try {
        const imageUrl = await generateImageWithPollinations(lastUserMessage);
        return NextResponse.json({ success: true, imageUrl, isImage: true });
      } catch (imageError) {
        return NextResponse.json({ success: false, error: imageError.message }, { status: 500 });
      }
    }

    const reply = await chatWithGroq([
      { role: 'system', content: SYSTEM_PROMPT },
      ...trimmedHistory,
    ], { maxTokens: 1000, temperature: 0.1, tools }); // Température très basse pour être factuel

    if (wantsAudio) {
      try {
        const audioBase64 = await generateAudioWithGemini(reply);
        return NextResponse.json({ success: true, audio: audioBase64, isAudio: true, textReply: reply });
      } catch (ttsError) {
        return NextResponse.json({ success: true, reply, audioError: 'Impossible de générer l\'audio.' });
      }
    }

    return NextResponse.json({ success: true, reply });
  } catch (error) {
    console.error('[API] AI chat error:', error.message);
    return errorResponse(error.message || 'Erreur de l\'assistante.', 500);
  }
}

async function handleAIVision(request) {
  try {
    await authenticate(request);
    const body = await request.json();
    const { messages, imageBase64 } = body;

    if (!imageBase64) return errorResponse('Image manquante.', 400);

    const reply = await chatWithGroqVision(messages || [], imageBase64);
    return NextResponse.json({ success: true, reply });
  } catch (error) {
    console.error('[API] AI Vision error:', error.message);
    return errorResponse(error.message || 'Erreur d\'analyse d\'image.', 500);
  }
}

const ROUTES = {
  'fapshi/checkout':  { POST: handleFapshiCheckout },
  'fapshi/webhook':   { POST: handleFapshiWebhook },
  'fapshi/status':    { POST: handleFapshiStatus },
  'wallet/fund-goal': { POST: handleFundGoal },
  'goals/borrow':     { POST: handleGoalBorrow },
  'goals/repay':      { POST: handleRepayLoan },
  'goals/withdraw':   { POST: handleGoalWithdraw },
  'goals/cancel':     { POST: handleGoalCancel },
  'automations/run':  { POST: handleAutomationsRun },
  'ai/chat':          { POST: handleAIChat },
  'ai/vision':        { POST: handleAIVision },
};

async function dispatch(request, context) {
  const segments = context?.params?.path || [];
  const route = ROUTES[segments.join('/')];
  if (!route || !route[request.method]) return NextResponse.json({ error: 'Route introuvable' }, { status: 404 });
  return route[request.method](request);
}

export { dispatch as GET, dispatch as POST, dispatch as PUT, dispatch as DELETE, dispatch as PATCH };
