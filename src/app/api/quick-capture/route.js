import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { createExpenseForUser } from '@/lib/ai/financialTools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXPENSE_CATEGORIES = new Set(['food', 'transport', 'housing', 'internet', 'gift_donation', 'health', 'leisure', 'investment', 'contribution', 'savings', 'other']);
const INCOME_CATEGORIES = new Set(['salary', 'business', 'sales', 'commission', 'rental', 'pension', 'gift', 'other_income']);
function isPremium(profile = {}) {
  const raw = profile.premiumUntil;
  const expiry = raw?.toDate ? raw.toDate() : new Date(raw || 0);
  return Number.isFinite(expiry.getTime()) && expiry.getTime() > Date.now();
}
function errorResponse(message, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(String(value) + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export async function POST(request) {
  try {
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return errorResponse('Session manquante. Reconnecte-toi à Pata.', 401);
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const uid = decoded.uid;
    const body = await request.json();
    const type = body.type === 'income' ? 'income' : body.type === 'expense' ? 'expense' : '';
    const amount = Number(body.amount);
    const categoryId = String(body.categoryId || '').trim();
    const date = String(body.date || '').trim();
    const note = String(body.note || '').trim().slice(0, 250);
    const idempotencyKey = String(body.idempotencyKey || '').trim();
    if (!type) return errorResponse('Choisis une dépense ou un revenu.', 400);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000000) return errorResponse('Le montant doit être un nombre entier positif en FCFA.', 400);
    if (!validDate(date)) return errorResponse('La date de l’opération est invalide.', 400);
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(idempotencyKey)) return errorResponse('Identifiant de saisie invalide. Réessaie.', 400);
    const userRef = adminDb.collection('users').doc(uid);
    const profileSnap = await userRef.get();
    if (!profileSnap.exists) return errorResponse('Profil Pata introuvable.', 404);
    if (!isPremium(profileSnap.data() || {})) return errorResponse('Pata Quick Capture est réservé aux abonnés Premium. Aucune opération n’a été enregistrée.', 403);

    if (type === 'expense') {
      if (!EXPENSE_CATEGORIES.has(categoryId)) return errorResponse('Choisis une catégorie de dépense valide.', 400);
      const result = await createExpenseForUser(uid, {
        amount, categoryId, note, date,
        expenseType: ['savings', 'investment'].includes(body.expenseType)
          ? body.expenseType
          : categoryId === 'savings' ? 'savings' : categoryId === 'investment' ? 'investment' : 'consumption',
        incomeSourceId: 'all', incomeSourceName: 'Tous les revenus',
        time: new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Douala', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
      }, {
        idempotencyKey: 'quick_capture_' + idempotencyKey,
        premiumOnly: true,
        skipBudgetConfirmation: body.confirmBudgetOverrun === true,
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (!INCOME_CATEGORIES.has(categoryId)) return errorResponse('Choisis une catégorie de revenu valide.', 400);
    const source = String(body.source || '').trim().slice(0, 100);
    if (!source) return errorResponse('Indique la source de ce revenu, par exemple « Salaire ».', 400);
    const month = date.slice(0, 7);
    const currentMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit' }).format(new Date());
    const actionRef = userRef.collection('quick_capture_actions').doc(idempotencyKey);
    const incomeRef = userRef.collection('incomes').doc();
    const result = await adminDb.runTransaction(async (transaction) => {
      const [latestProfile, existingAction] = await Promise.all([transaction.get(userRef), transaction.get(actionRef)]);
      if (!latestProfile.exists) throw new Error('Profil Pata introuvable.');
      const profile = latestProfile.data() || {};
      if (!isPremium(profile)) throw new Error('Ton abonnement Premium n’est plus actif. Aucune opération n’a été enregistrée.');
      if (existingAction.exists) return { ...existingAction.data(), duplicate: true };
      const previousStats = profile.monthlyStats || {};
      const stats = previousStats.lastResetMonth === currentMonth
        ? { ...previousStats }
        : { ...previousStats, expenses: 0, incomes: 0, budgets: 0, goals: 0, lastResetMonth: currentMonth };
      stats.incomes = (Number(stats.incomes) || 0) + 1;
      transaction.create(incomeRef, {
        amount, source, categoryId, month, date, note, flowType: 'normal', neutralFlow: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      const saved = { incomeId: incomeRef.id, amount, source, categoryId, date };
      transaction.create(actionRef, { ...saved, type: 'income', createdAt: FieldValue.serverTimestamp() });
      transaction.set(userRef, {
        monthlyStats: stats,
        lifetimeIncomeAmount: FieldValue.increment(amount),
        lifetimeIncomeCount: FieldValue.increment(1),
      }, { merge: true });
      return saved;
    });
    return NextResponse.json({ success: true, ...result });
  } catch (caught) {
    const message = caught?.message || 'Impossible d’enregistrer cette opération rapide.';
    const status = /session|token|auth/i.test(message) ? 401
      : /premium|abonnement/i.test(message) ? 403
      : /montant|catégorie|date|source|choisis|indique|valide|fonds insuffisants|budget/i.test(message) ? 400 : 500;
    console.error('[PATA QUICK CAPTURE]', message);
    return errorResponse(message, status);
  }
}
