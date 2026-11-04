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

/* ═══════════════════ ROUTE ADD EXPENSE (CASCADE) ═══════════════════ */
async function handleAddExpense(request) {
  try {
    const decoded = await authenticate(request);
    const uid = decoded.uid;
    const body = await request.json();
    const { amount, categoryId, note, date, incomeSourceId } = body;

    if (!amount || amount <= 0) return errorResponse('Montant invalide.');

    const [incomesSnap, expensesSnap] = await Promise.all([
      adminDb.collection('users').doc(uid).collection('incomes').get(),
      adminDb.collection('users').doc(uid).collection('expenses').get(),
    ]);

    const incomes = incomesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const expenses = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Calculer le solde de chaque revenu
    const incomesWithBalance = incomes.map(inc => {
      const linkedExpenses = expenses.filter(e => e.incomeSourceId === inc.id);
      const spent = linkedExpenses.reduce((s, e) => s + (e.amount || 0), 0);
      const remaining = Math.max(0, (inc.amount || 0) - spent);
      return { ...inc, remaining };
    });

    const batch = adminDb.batch();
    const expenseDate = date || new Date().toISOString().slice(0, 10);
    const expenseNote = note || '';

    // 🟢 LOGIQUE CASCADE : Si 'all', on trie du plus petit au plus grand
    if (!incomeSourceId || incomeSourceId === 'all') {
      const totalAvailable = incomesWithBalance.reduce((s, i) => s + i.remaining, 0);
      
      if (amount > totalAvailable) {
        return errorResponse(`Fonds insuffisants. Le solde total de tes revenus est de ${totalAvailable} FCFA, mais tu demandes ${amount} FCFA.`);
      }

      // Trier par solde restant croissant (le plus petit d'abord)
      const sortedIncomes = [...incomesWithBalance].sort((a, b) => a.remaining - b.remaining);
      
      let remainingToDeduct = amount;
      let isFirstSplit = true;

      for (const inc of sortedIncomes) {
        if (remainingToDeduct <= 0) break;
        if (inc.remaining <= 0) continue;

        const deduct = Math.min(inc.remaining, remainingToDeduct);
        
        const expenseRef = adminDb.collection('users').doc(uid).collection('expenses').doc();
        batch.set(expenseRef, {
          amount: deduct,
          categoryId: categoryId || 'other',
          note: isFirstSplit ? expenseNote : `${expenseNote} (Partagé)`,
          date: expenseDate,
          incomeSourceId: inc.id,
          incomeSourceName: inc.source,
          createdAt: FieldValue.serverTimestamp(),
        });

        remainingToDeduct -= deduct;
        isFirstSplit = false;
      }

      await batch.commit();
      return NextResponse.json({ success: true });

    } else {
      // 🟢 LOGIQUE CLASSIQUE : Un seul revenu ciblé
      const inc = incomesWithBalance.find(i => i.id === incomeSourceId);
      if (!inc) return errorResponse('Revenu introuvable.');

      if (amount > inc.remaining) {
        return errorResponse(`Fonds insuffisants. Il ne reste que ${inc.remaining} FCFA sur "${inc.source}".`);
      }

      const expenseRef = adminDb.collection('users').doc(uid).collection('expenses').doc();
      batch.set(expenseRef, {
        amount: Number(amount),
        categoryId: categoryId || 'other',
        note: expenseNote,
        date: expenseDate,
        incomeSourceId: inc.id,
        incomeSourceName: inc.source,
        createdAt: FieldValue.serverTimestamp(),
      });

      await batch.commit();
      return NextResponse.json({ success: true });
    }

  } catch (error) {
    return errorResponse(error.message, 500);
  }
}

/* ═══════════════════ ROUTES FAPSHI / GOALS / AUTOMATIONS ═══════════════════ */
// (Je garde les fonctions existantes pour que tu n'aies pas à recoller)

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
        const [incomesSnap, expensesSnap] = await Promise.all([
            adminDb.collection('users').doc(uid).collection('incomes').get(),
            adminDb.collection('users').doc(uid).collection('expenses').get(),
        ]);
        const totalIncome = incomesSnap.docs.reduce((s, d) => s + (d.data().amount || 0), 0);
        const totalExpense = expensesSnap.docs.reduce((s, d) => s + (d.data().amount || 0), 0);
        const globalBalance = totalIncome - totalExpense;

        if (auto.amount <= globalBalance) {
            await adminDb.collection('users').doc(uid).collection('expenses').add({
                amount: auto.amount, categoryId: auto.categoryId, note: auto.note || 'Dépense automatique',
                date: now.slice(0, 10), incomeSourceId: auto.incomeSourceId, incomeSourceName: auto.incomeSourceName,
                createdAt: FieldValue.serverTimestamp(),
            });
        }

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

/* ═══════════════════ AI CHAT & AUTRES ═══════════════════ */

async function handleAIChat(request) {
  try {
    const decoded = await authenticate(request);
    const uid = decoded.uid;
    const body = await request.json();

    const mode = body.mode || 'text'; 
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) return errorResponse('Messages requis.', 400);

    const [userDoc, incomesSnap, expensesSnap, goalsSnap, budgetsSnap] = await Promise.all([
      adminDb.collection('users').doc(uid).get(),
      adminDb.collection('users').doc(uid).collection('incomes').limit(100).get(),
      adminDb.collection('users').doc(uid).collection('expenses').limit(200).get(),
      adminDb.collection('users').doc(uid).collection('goals').limit(20).get(),
      adminDb.collection('users').doc(uid).collection('budgets').get(),
    ]);

    const userData = {
      profile: userDoc.exists ? userDoc.data() : {},
      incomes: incomesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      expenses: expensesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      goals: goalsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      budgets: budgetsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    };

    const userContext = buildUserContext(userData);
    const userName = userData.profile?.displayName?.split(' ')[0] || 'Utilisateur';

    const tools = [
      {
        type: 'function',
        function: {
          name: 'add_expense',
          parameters: {
            type: 'object',
            properties: {
              amount: { type: 'number' },
              category: { type: 'string' },
              note: { type: 'string' },
              incomeSourceId: { type: 'string', description: 'ID exact du revenu ou "all".' },
              incomeSourceName: { type: 'string' }
            },
            required: ['amount', 'category', 'incomeSourceId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'add_income',
          parameters: {
            type: 'object',
            properties: {
              amount: { type: 'number' },
              source: { type: 'string' },
              categoryId: { type: 'string', enum: ['salary', 'business', 'gift', 'other_income'] },
              note: { type: 'string' }
            },
            required: ['amount', 'source', 'categoryId']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'apply_budget_plan',
          description: 'Appliquer un plan budgétaire complet.',
          parameters: {
            type: 'object',
            properties: {
              budgetName: { type: 'string' },
              totalIncome: { type: 'number' },
              plan: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { categoryId: { type: 'string' }, amount: { type: 'number' } },
                  required: ['categoryId', 'amount']
                }
              }
            },
            required: ['budgetName', 'totalIncome', 'plan']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'add_automation',
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
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              targetAmount: { type: 'number' },
              deadline: { type: 'string' }
            },
            required: ['name', 'targetAmount', 'deadline']
          }
        }
      }
    ];

    const SYSTEM_PROMPT = `Tu es Mč, l'assistante financière de Pata. Tu parles à ${userName}.

RÈGLES DE SÉCURITÉ FINANCIÈRE (CRITIQUE) :
1. Tu ne peux PAS enregistrer de dépense si le solde global est insuffisant.
2. Avant d'enregistrer, LIS ATTENTIVEMENT le "SOLDE GLOBAL" et le "DÉTAIL DES REVENUS".
3. Si la dépense dépasse le solde, refuse et explique poliment à l'utilisateur.
4. Quand on choisit "Tous les revenus", l'application va automatiquement piocher dans les plus petits soldes pour compléter. Tu n'as pas à calculer ça, le système le fait pour toi.

RÈGLES DE COMPORTEMENT :
1. Ne salue pas l'utilisateur. Va droit au but.
2. Sois concise, factuelle, et en français.

DONNÉES ACTUELLES :
${userContext}`;

    const trimmedHistory = messages.slice(-8).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 500),
    }));

    const reply = await chatWithGroq([
      { role: 'system', content: SYSTEM_PROMPT },
      ...trimmedHistory,
    ], { maxTokens: 1000, temperature: 0.1, tools });

    if (mode === 'audio') {
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

async function handleAIImage(request) {
  try {
    await authenticate(request);
    const body = await request.json();
    const { prompt } = body;
    if (!prompt) return errorResponse('Prompt manquant.', 400);

    const imageUrl = await generateImageWithPollinations(prompt);
    return NextResponse.json({ success: true, imageUrl, isImage: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
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
  'expenses/add':     { POST: handleAddExpense },
  'ai/chat':          { POST: handleAIChat },
  'ai/image':         { POST: handleAIImage },
  'ai/vision':        { POST: handleAIVision },
};

async function dispatch(request, context) {
  const segments = context?.params?.path || [];
  const route = ROUTES[segments.join('/')];
  if (!route || !route[request.method]) return NextResponse.json({ error: 'Route introuvable' }, { status: 404 });
  return route[request.method](request);
}

export { dispatch as GET, dispatch as POST, dispatch as PUT, dispatch as DELETE, dispatch as PATCH };
