import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { isValidDateKey, normalizeScheduledKind, isRecurringFrequency } from '@/lib/scheduling/scheduledTransactions.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXPENSE_CATEGORIES = new Set(['food', 'transport', 'housing', 'internet', 'health', 'leisure', 'gift_donation', 'investment', 'contribution', 'savings', 'debt_repayment', 'loan_given', 'other']);
const INCOME_CATEGORIES = new Set(['salary', 'business', 'sales', 'commission', 'rental', 'pension', 'gift', 'debt_repayment_received', 'debt_borrowed', 'other_income']);
const clean = (value, max = 180) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const todayDouala = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function authenticate(request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw Object.assign(new Error('Session manquante. Reconnecte-toi à Pata.'), { status: 401 });
  return adminAuth.verifyIdToken(authorization.slice(7));
}
function premiumActive(profile = {}) {
  const raw = profile.premiumUntil;
  const expiry = raw?.toDate ? raw.toDate() : new Date(raw || 0);
  return Number.isFinite(expiry.getTime()) && expiry > new Date();
}
function errorResponse(error) {
  return NextResponse.json({ success: false, error: error?.message || 'Programmation indisponible.' }, { status: Number(error?.status) || (/Premium|abonnement/i.test(error?.message || '') ? 403 : 400) });
}

async function validateCategory(userRef, kind, categoryId) {
  const id = clean(categoryId, 80);
  const builtins = kind === 'expense' || kind === 'loan_given' || kind === 'debt_repayment' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  if (!id) throw new Error('Choisis une catégorie avant de programmer cette opération.');
  if (builtins.has(id)) return id;
  const snapshot = await userRef.collection('categories').doc(id).get();
  const expectedType = kind === 'expense' || kind === 'loan_given' || kind === 'debt_repayment' ? 'expense' : 'income';
  if (!snapshot.exists || snapshot.data()?.type !== expectedType) throw new Error('La catégorie choisie n’existe plus dans ton compte.');
  return id;
}

export async function GET(request) {
  try {
    const { uid } = await authenticate(request);
    const snapshot = await adminDb.collection('users').doc(uid).collection('scheduledTransactions').limit(100).get();
    const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((item) => ['scheduled', 'failed', 'needs_source'].includes(item.status))
      .sort((a, b) => String(a.nextRunDate || a.scheduleDate || '').localeCompare(String(b.nextRunDate || b.scheduleDate || '')));
    return NextResponse.json({ success: true, scheduledTransactions: items });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const userRef = adminDb.collection('users').doc(uid);
    const [profileSnap] = await Promise.all([userRef.get()]);
    if (!profileSnap.exists) throw new Error('Profil Pata introuvable.');
    if (!premiumActive(profileSnap.data() || {})) throw Object.assign(new Error('La programmation des opérations est réservée à Pata Premium.'), { status: 403 });

    const kind = normalizeScheduledKind(body.kind || body.flowType || '');
    const scheduleDate = clean(body.scheduleDate || body.date, 10);
    const today = todayDouala();
    if (!isValidDateKey(scheduleDate) || scheduleDate <= today) throw new Error('Choisis une date future valide pour cette programmation.');
    const amount = Math.round(Number(body.amount));
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000) throw new Error('Le montant doit être un nombre entier positif en FCFA.');

    const categoryId = await validateCategory(userRef, kind, body.categoryId);
    const isExpense = ['expense', 'loan_given', 'debt_repayment'].includes(kind);
    const isIncome = ['income', 'debt_borrowed', 'repayment_received'].includes(kind);
    const note = clean(body.note, 250);
    const recurrenceEnabled = body.recurrenceEnabled === true && ['expense', 'income'].includes(kind);
    const frequency = recurrenceEnabled ? clean(body.frequency || (kind === 'income' && categoryId === 'salary' ? 'monthly' : 'monthly'), 20) : null;
    if (recurrenceEnabled && !isRecurringFrequency(frequency)) throw new Error('Choisis une fréquence quotidienne, hebdomadaire ou mensuelle.');

    const payload = {
      kind,
      amount,
      categoryId,
      date: scheduleDate,
      scheduleDate,
      nextRunDate: scheduleDate,
      note,
      status: 'scheduled',
      active: true,
      recurrenceEnabled,
      frequency,
      anchorDay: Number(scheduleDate.slice(8, 10)),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (kind === 'expense' || kind === 'loan_given' || kind === 'debt_repayment') {
      const expenseType = clean(body.expenseType || 'consumption', 30);
      if (!['consumption', 'project', 'savings', 'investment'].includes(expenseType)) throw new Error('Nature de sortie invalide.');
      if (kind === 'expense' && expenseType === 'project') {
        const projectId = clean(body.projectId, 150);
        if (!projectId) throw new Error('Sélectionne le projet lié à cette sortie.');
        const project = await userRef.collection('projects').doc(projectId).get();
        if (!project.exists || project.data()?.status === 'archived') throw new Error('Le projet choisi est introuvable ou archivé.');
        payload.projectId = projectId;
      }
      payload.expenseType = expenseType;
      payload.incomeSourceId = clean(body.incomeSourceId || 'all', 150) || 'all';
      payload.incomeSourceName = clean(body.incomeSourceName || (payload.incomeSourceId === 'all' ? 'Toutes les sources disponibles' : ''), 150);
      if (payload.incomeSourceId === 'future') {
        if (kind !== 'expense') throw new Error('La source future peut uniquement être utilisée pour une dépense programmée.');
        payload.futureIncomeSourceName = clean(body.futureIncomeSourceName || body.incomeSourceName, 120);
        if (!payload.futureIncomeSourceName) throw new Error('Indique le nom de la future source de revenu à laquelle tu souhaites rattacher cette dépense.');
      } else if (payload.incomeSourceId !== 'all') {
        if (payload.incomeSourceId.includes('/')) throw new Error('Source de revenu invalide.');
        const income = await userRef.collection('incomes').doc(payload.incomeSourceId).get();
        if (!income.exists) throw new Error('La source sélectionnée n’existe pas dans ton compte.');
        payload.incomeSourceName = clean(income.data()?.source || payload.incomeSourceName, 150);
      }
      payload.flowType = kind === 'loan_given' ? 'loan_given' : kind === 'debt_repayment' ? 'repayment' : 'normal';
      if (kind === 'loan_given') {
        payload.person = clean(body.person, 100);
        payload.phone = clean(body.phone, 30);
        payload.dueDate = clean(body.dueDate, 10);
        if (!payload.person || !isValidDateKey(payload.dueDate)) throw new Error('Pour programmer un prêt accordé, indique la personne et sa date d’échéance.');
        payload.counterpartyUid = clean(body.counterpartyUid, 150);
      }
      if (kind === 'debt_repayment') {
        payload.repaymentDebtId = clean(body.repaymentDebtId, 150);
        if (!payload.repaymentDebtId || payload.repaymentDebtId.includes('/')) throw new Error('Choisis la dette à rembourser.');
        const debt = await userRef.collection('debts').doc(payload.repaymentDebtId).get();
        if (!debt.exists || debt.data()?.type !== 'i_owe' || !['active', 'partial', 'late'].includes(debt.data()?.status)) throw new Error('Cette dette ne peut pas être remboursée.');
      }
      payload.time = clean(body.time, 5);
      payload.locationLabel = clean(body.locationLabel, 160);
      payload.latitude = body.latitude == null || body.latitude === '' ? null : Number(body.latitude);
      payload.longitude = body.longitude == null || body.longitude === '' ? null : Number(body.longitude);
      payload.locationAccuracy = body.locationAccuracy == null || body.locationAccuracy === '' ? null : Number(body.locationAccuracy);
      payload.paymentMethod = clean(body.paymentMethod, 30);
      payload.details = clean(body.details, 160);
    }

    if (kind === 'income' || kind === 'debt_borrowed' || kind === 'repayment_received') {
      payload.source = clean(body.source || (kind === 'debt_borrowed' ? body.person : ''), 100);
      payload.image = clean(body.image, 2048);
      payload.person = clean(body.person, 100);
      payload.phone = clean(body.phone, 30);
      payload.counterpartyType = body.counterpartyType === 'bank' ? 'bank' : 'person';
      payload.bankName = clean(body.bankName, 100);
      payload.dueDate = clean(body.dueDate, 10);
      payload.counterpartyUid = clean(body.counterpartyUid, 150);
      payload.repaymentDebtId = clean(body.repaymentDebtId, 150);
      payload.projectId = clean(body.projectId, 150);
      if (kind === 'income' && payload.projectId) {
        const project = await userRef.collection('projects').doc(payload.projectId).get();
        if (!project.exists || project.data()?.status === 'archived') throw new Error('Le projet choisi est introuvable ou archivé.');
      }
      payload.time = clean(body.time, 5);
      payload.locationLabel = clean(body.locationLabel, 160);
      payload.latitude = body.latitude == null || body.latitude === '' ? null : Number(body.latitude);
      payload.longitude = body.longitude == null || body.longitude === '' ? null : Number(body.longitude);
      payload.locationAccuracy = body.locationAccuracy == null || body.locationAccuracy === '' ? null : Number(body.locationAccuracy);
      payload.paymentMethod = clean(body.paymentMethod, 30);
      payload.details = clean(body.details, 160);
      payload.flowType = kind === 'debt_borrowed' ? 'debt_borrowed' : kind === 'repayment_received' ? 'repayment_received' : 'normal';
      if (kind === 'income' && !payload.source) throw new Error('Indique le nom ou la source du revenu à programmer.');
      if (kind === 'debt_borrowed') {
        payload.person = payload.counterpartyType === 'bank' ? payload.bankName : payload.person;
        if (typeof body.availableAsFunding !== 'boolean') {
          throw new Error('Choisis si tu recevras de l’argent ou des biens/services à crédit.');
        }
        payload.availableAsFunding = body.availableAsFunding === true;
        if (!payload.person || !isValidDateKey(payload.dueDate)) throw new Error('Pour programmer un emprunt, indique le créancier et la date d’échéance.');
        payload.source = payload.person;
      }
      if (kind === 'repayment_received') {
        if (!payload.repaymentDebtId || payload.repaymentDebtId.includes('/')) throw new Error('Choisis la créance qui doit être remboursée.');
        const debt = await userRef.collection('debts').doc(payload.repaymentDebtId).get();
        if (!debt.exists || debt.data()?.type !== 'owed_to_me' || !['active', 'partial', 'late'].includes(debt.data()?.status)) throw new Error('Cette créance ne peut pas recevoir de remboursement.');
      }
    }

    const docRef = userRef.collection('scheduledTransactions').doc();
    await docRef.create(payload);
    return NextResponse.json({ success: true, id: docRef.id, scheduledTransaction: { id: docRef.id, ...payload, createdAt: null } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request) {
  try {
    const { uid } = await authenticate(request);
    const { id } = await request.json();
    const cleanId = clean(id, 150);
    if (!cleanId || cleanId.includes('/')) throw new Error('Programmation introuvable.');
    const ref = adminDb.collection('users').doc(uid).collection('scheduledTransactions').doc(cleanId);
    await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new Error('Cette programmation n’existe plus.');
      const data = snapshot.data() || {};
      if (data.status !== 'scheduled') throw new Error('Cette opération a déjà été traitée et ne peut plus être annulée ici.');
      transaction.update(ref, { status: 'cancelled', active: false, updatedAt: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ success: true, id: cleanId });
  } catch (error) { return errorResponse(error); }
}
