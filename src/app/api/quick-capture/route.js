import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { createExpenseForUser, executeAITool } from '@/lib/ai/financialTools';
import { parseQuickCapture } from '@/lib/quickCapture/parser.mjs';
import { buildIncomeBudgetRecommendation } from '@/lib/finance/incomeBudgetRecommendation.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXPENSE_CATEGORIES = new Set(['food', 'transport', 'housing', 'internet', 'gift_donation', 'health', 'leisure', 'investment', 'contribution', 'savings', 'other']);
const INCOME_CATEGORIES = new Set(['salary', 'business', 'sales', 'commission', 'rental', 'pension', 'gift', 'other_income']);
const BILL_TYPES = new Set(['electricity', 'water', 'rent', 'television', 'internet', 'telephone', 'taxes', 'insurance', 'school', 'subscription', 'other']);
const BILL_FREQUENCIES = new Set(['weekly', 'monthly', 'quarterly', 'yearly', 'once']);
const BILL_CATEGORIES = new Set(['food', 'transport', 'housing', 'internet', 'health', 'leisure', 'gift_donation', 'contribution', 'other']);

function isPremium(profile = {}) {
  const raw = profile.premiumUntil;
  const expiry = raw?.toDate ? raw.toDate() : new Date(raw || 0);
  return Number.isFinite(expiry.getTime()) && expiry.getTime() > Date.now();
}
function errorResponse(message, status = 400, details = {}) {
  return NextResponse.json({ success: false, error: message, ...details }, { status });
}
function doualaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day;
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(String(value) + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function cleanText(value, max = 100) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}
function isValidBillImageUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com'
      && url.pathname.startsWith('/do83voiqy/image/upload/');
  } catch {
    return false;
  }
}
function makeRecognized(parsed, extra = {}) {
  return {
    type: parsed.type,
    amount: Number(parsed.amount) || 0,
    categoryId: parsed.categoryId || 'other',
    date: parsed.date,
    source: parsed.source || parsed.person || parsed.billName || '',
    person: parsed.person || '',
    dueDate: parsed.dueDate || null,
    pendingDetails: false,
    ...extra,
  };
}

export async function POST(request) {
  try {
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return errorResponse('Session manquante. Reconnecte-toi à Pata.', 401);
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const uid = decoded.uid;
    const body = await request.json();
    const idempotencyKey = String(body.idempotencyKey || '').trim();
    let parsed = null;
    if (typeof body.text === 'string' && body.text.trim()) {
      const today = doualaToday();
      parsed = parseQuickCapture(body.text, new Date(today + 'T12:00:00.000Z'));
      if (parsed.needsReview) {
        return errorResponse(
          'Je n’ai pas reconnu avec assez de certitude les informations indispensables. Rien n’a été enregistré.',
          422,
          { needsReview: true, recognized: parsed }
        );
      }
    }
    const type = parsed?.type || (['income', 'expense', 'loan_given', 'debt_borrowed', 'debt_repayment', 'bill'].includes(body.type) ? body.type : '');
    const amountValue = parsed?.amount ?? body.amount;
    const amount = amountValue == null || amountValue === '' ? null : Number(amountValue);
    const categoryId = String(parsed?.categoryId ?? body.categoryId ?? '').trim();
    const date = String(parsed?.date ?? body.date ?? doualaToday()).trim();
    const note = cleanText(parsed?.note ?? body.note ?? '', 250);
    const dueDate = String(parsed?.dueDate ?? body.dueDate ?? '').trim();
    if (!type) return errorResponse('Je n’ai pas pu déterminer le type de cette opération. Précise s’il s’agit d’une dépense, d’un revenu, d’une dette, d’un prêt ou d’une facture.', 422, { needsReview: true, recognized: parsed });
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(idempotencyKey)) return errorResponse('Identifiant de saisie invalide. Réessaie.', 400);
    if (type !== 'bill' && (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000000)) {
      return errorResponse('Le montant doit être un nombre entier positif en FCFA.', 400);
    }
    if (!validDate(date)) return errorResponse('La date de l’opération est invalide.', 400);
    if (dueDate && !validDate(dueDate)) return errorResponse('La date d’échéance est invalide.', 400);

    const userRef = adminDb.collection('users').doc(uid);
    const profileSnap = await userRef.get();
    if (!profileSnap.exists) return errorResponse('Profil Pata introuvable.', 404);
    if (!isPremium(profileSnap.data() || {})) return errorResponse('Pata Quick Capture est réservé aux abonnés Premium. Aucune opération n’a été enregistrée.', 403);

    if (type === 'bill') {
      const billName = cleanText(parsed?.billName || body.name || 'Facture à préciser', 100);
      const billType = BILL_TYPES.has(parsed?.billType || body.billType) ? (parsed?.billType || body.billType) : 'other';
      const frequencyCandidate = parsed?.frequency || body.frequency || '';
      const frequencyKnown = BILL_FREQUENCIES.has(frequencyCandidate);
      const frequency = frequencyKnown ? frequencyCandidate : 'once';
      const expenseCategory = BILL_CATEGORIES.has(parsed?.expenseCategoryId || body.expenseCategoryId)
        ? (parsed?.expenseCategoryId || body.expenseCategoryId) : 'other';
      const imageUrl = String(body.imageUrl || '').trim();
      if (imageUrl && !isValidBillImageUrl(imageUrl)) return errorResponse('La photo de cette facture n’est pas hébergée sur le service sécurisé de Pata.', 400);
      const isVariable = parsed?.isVariable === true || body.isVariable === true || amount == null;
      const billAmount = amount == null ? 0 : Math.round(amount);
      if (!Number.isSafeInteger(billAmount) || billAmount < 0 || billAmount > 1000000000) return errorResponse('Le montant de la facture est invalide.', 400);
      const actionRef = userRef.collection('quick_capture_actions').doc(idempotencyKey);
      const billRef = userRef.collection('bills').doc();
      const result = await adminDb.runTransaction(async (transaction) => {
        const [latestProfile, existingAction] = await Promise.all([
          transaction.get(userRef), transaction.get(actionRef),
        ]);
        if (!latestProfile.exists) throw new Error('Profil Pata introuvable.');
        const profile = latestProfile.data() || {};
        if (!isPremium(profile)) throw new Error('Ton abonnement Premium n’est plus actif. Aucune opération n’a été enregistrée.');
        if (existingAction.exists) return { ...existingAction.data(), duplicate: true };
        let nextCount;
        if (profile.activeBillCountInitialized === true
          && Number.isInteger(profile.activeBillCount) && profile.activeBillCount >= 0) {
          nextCount = profile.activeBillCount + 1;
        } else {
          const billsSnapshot = await transaction.get(userRef.collection('bills'));
          nextCount = billsSnapshot.docs.filter((document) => document.data()?.active !== false).length + 1;
        }
        const pendingDetails = !dueDate || !frequencyKnown || billName === 'Facture à préciser';
        const saved = {
          success: true,
          billId: billRef.id,
          name: billName,
          amount: billAmount,
          billType,
          dueDate: dueDate || null,
          pendingDetails,
        };
        transaction.create(billRef, {
          name: billName, billType, amount: billAmount, isVariable,
          frequency, nextDueDate: dueDate || '', dueDay: dueDate ? Number(dueDate.slice(8, 10)) : null,
          reminderDaysBefore: 3, expenseCategoryId: expenseCategory,
          frequencyPending: !frequencyKnown,
          ...(pendingDetails ? { lastDetailsReminderAt: FieldValue.serverTimestamp() } : {}),
          providerName: cleanText(parsed?.providerName || body.providerName || '', 100),
          accountReference: cleanText(body.accountReference || '', 100),
          imageUrl,
          note, active: true, pendingDetails,
          quickCaptureId: idempotencyKey,
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.create(actionRef, { ...saved, type: 'bill', createdAt: FieldValue.serverTimestamp() });
        transaction.set(userRef, { activeBillCount: nextCount, activeBillCountInitialized: true }, { merge: true });
        return saved;
      });
      return NextResponse.json({
        success: true, ...result,
        recognized: makeRecognized(parsed || { type, amount: billAmount, categoryId: expenseCategory, date, billName }, {
          type: 'bill', amount: result.amount, categoryId: expenseCategory, source: result.name,
          billId: result.billId, pendingDetails: result.pendingDetails,
        }),
      });
    }

    if (type === 'debt_borrowed') {
      const person = cleanText(parsed?.person || body.person || '', 100);
      if (!person) return errorResponse('Il me manque le nom de la personne auprès de qui tu as contracté cette dette.', 422, { needsReview: true, recognized: parsed });
      const result = await executeAITool(uid, 'add_debt', {
        amount, person, date, dueDate: dueDate || undefined, note,
      }, [], {
        idempotencyKey: 'quick_capture_' + idempotencyKey,
        premiumOnly: true,
      });
      return NextResponse.json({
        success: true, ...result,
        recognized: makeRecognized(parsed || { type, amount, categoryId: 'debt_borrowed', date, person }, {
          type, amount, categoryId: 'debt_borrowed', source: person, person,
          debtId: result.debtId, pendingDetails: !dueDate,
        }),
      });
    }

    if (type === 'debt_repayment') {
      const person = cleanText(parsed?.person || body.person || '', 100);
      const requestedDebtId = cleanText(body.repaymentDebtId || '', 150);
      if (requestedDebtId.includes('/')) return errorResponse('Identifiant de dette invalide.', 400);
      const debtsSnap = await userRef.collection('debts').orderBy('createdAt', 'desc').limit(100).get();
      const activeDebts = debtsSnap.docs
        .map((document) => ({ id: document.id, ...document.data() }))
        .filter((debt) => debt.type === 'i_owe'
          && ['active', 'partial', 'late'].includes(debt.status)
          && Number(debt.remaining) > 0);
      let matchedDebt = requestedDebtId ? activeDebts.find((debt) => debt.id === requestedDebtId) : null;
      if (requestedDebtId && !matchedDebt) {
        return errorResponse('La dette sélectionnée n’est plus active. Actualise la fenêtre puis choisis une autre dette.', 409);
      }
      if (!matchedDebt && person) {
        const normalizedPerson = person.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const matches = activeDebts.filter((debt) => {
          const name = String(debt.person || debt.bankName || '').normalize('NFD')
            .replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
          return name === normalizedPerson;
        });
        if (matches.length > 1) {
          return errorResponse('Plusieurs dettes correspondent à « ' + person + ' ». Choisis précisément celle à rembourser.', 422, {
            needsReview: true,
            debts: matches.map((debt) => ({ id: debt.id, person: debt.person || debt.bankName || '', remaining: Number(debt.remaining) || 0, dueDate: debt.dueDate || '' })),
          });
        }
        matchedDebt = matches[0] || null;
      }
      if (!matchedDebt) {
        return errorResponse(
          person ? 'Je ne trouve pas de dette active enregistrée au nom de « ' + person + ' ». Vérifie le nom ou sélectionne la dette dans la liste.' : 'Choisis la dette à rembourser avant de continuer.',
          422,
          { needsReview: true }
        );
      }
      const selectedIncomeId = cleanText(body.incomeSourceId || 'all', 150) || 'all';
      const selectedIncomeName = cleanText(parsed?.incomeSourceName || body.incomeSourceName || '', 100);
      if (selectedIncomeId.includes('/')) return errorResponse('Source de revenu invalide.', 400);
      const externalFunding = selectedIncomeId === 'external';
      const result = await createExpenseForUser(uid, {
        amount,
        categoryId: 'debt_repayment',
        flowType: 'repayment',
        repaymentDebtId: matchedDebt.id,
        person: matchedDebt.person || matchedDebt.bankName || person,
        note: note || 'Remboursement de dette · ' + (matchedDebt.person || matchedDebt.bankName || person),
        date,
        expenseType: 'consumption',
        incomeSourceId: externalFunding ? 'all' : selectedIncomeId,
        incomeSourceName: externalFunding ? '' : selectedIncomeName,
        externalFundingLabel: 'Fonds externes',
        time: new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Douala', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
      }, {
        idempotencyKey: 'quick_capture_' + idempotencyKey,
        premiumOnly: true,
        externalFunding,
        skipBudgetConfirmation: body.confirmBudgetOverrun === true,
      });
      if (result?.confirmationRequired) {
        return NextResponse.json({ success: false, ...result, recognized: parsed }, { status: 409 });
      }
      return NextResponse.json({
        success: true,
        ...result,
        debtStatus: result.flowType === 'repayment' ? (result.repaymentCompleted ? 'paid' : 'partial') : undefined,
        recognized: makeRecognized(parsed || { type, amount, categoryId: 'debt_repayment', date, person }, {
          type, amount, categoryId: 'debt_repayment', source: matchedDebt.person || matchedDebt.bankName || person,
          person: matchedDebt.person || matchedDebt.bankName || person,
          repaymentDebtId: matchedDebt.id,
          repaymentCompleted: result.repaymentCompleted === true,
          remaining: result.remaining,
        }),
      });
    }

    if (type === 'loan_given') {
      const person = cleanText(parsed?.person || body.person || '', 100);
      if (!person) return errorResponse('Il me manque le nom de la personne à qui tu as prêté cet argent.', 422, { needsReview: true, recognized: parsed });
      const result = await createExpenseForUser(uid, {
        amount, categoryId: 'loan_given', flowType: 'loan_given',
        person, dueDate: dueDate || '', note, date,
        expenseType: 'consumption',
        incomeSourceId: 'all', incomeSourceName: 'Tous les revenus',
      }, {
        idempotencyKey: 'quick_capture_' + idempotencyKey,
        premiumOnly: true,
      });
      return NextResponse.json({
        success: true, ...result,
        recognized: makeRecognized(parsed || { type, amount, categoryId: 'loan_given', date, person }, {
          type, amount, categoryId: 'loan_given', source: person, person,
          debtId: result.debtId, pendingDetails: !dueDate,
        }),
      });
    }

    if (type === 'expense') {
      if (!EXPENSE_CATEGORIES.has(categoryId)) return errorResponse('La catégorie de dépense est invalide. Choisis « Autre » pour cette opération.', 400);
      const selectedIncomeId = cleanText(body.incomeSourceId || 'all', 150) || 'all';
      const selectedIncomeName = cleanText(parsed?.incomeSourceName || body.incomeSourceName || '', 100);
      if (selectedIncomeId.includes('/')) return errorResponse('Source de revenu invalide.', 400);
      const externalFunding = selectedIncomeId === 'external';
      const result = await createExpenseForUser(uid, {
        amount, categoryId, note, date,
        expenseType: ['savings', 'investment'].includes(body.expenseType)
          ? body.expenseType
          : categoryId === 'savings' ? 'savings' : categoryId === 'investment' ? 'investment' : 'consumption',
        incomeSourceId: externalFunding ? 'all' : selectedIncomeId,
        incomeSourceName: externalFunding ? '' : selectedIncomeName,
        externalFundingLabel: 'Fonds externes',
        time: new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Douala', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
      }, {
        idempotencyKey: 'quick_capture_' + idempotencyKey,
        premiumOnly: true,
        externalFunding,
        skipBudgetConfirmation: body.confirmBudgetOverrun === true,
      });
      if (result?.confirmationRequired) {
        return NextResponse.json({ success: false, ...result, recognized: parsed }, { status: 409 });
      }
      return NextResponse.json({ success: true, ...result, recognized: parsed ? makeRecognized(parsed) : null });
    }

    if (type !== 'income') return errorResponse('Type de saisie non pris en charge.', 400);
    const incomeFlowType = ['normal', 'debt_borrowed', 'repayment_received'].includes(body.incomeFlowType)
      ? body.incomeFlowType : 'normal';
    if (incomeFlowType !== 'normal') {
      const person = cleanText(body.incomePerson || body.person || '', 100);
      const counterpartyType = body.incomeCounterpartyType === 'bank' ? 'bank' : 'person';
      const bankName = counterpartyType === 'bank' ? cleanText(body.incomeBankName || person, 100) : '';
      const repaymentDebtId = cleanText(body.repaymentDebtId || '', 150);
      const flowCategory = incomeFlowType === 'debt_borrowed' ? 'debt_borrowed' : 'debt_repayment_received';
      if (incomeFlowType === 'debt_borrowed' && !(counterpartyType === 'bank' ? bankName : person)) {
        return errorResponse(counterpartyType === 'bank'
          ? 'Indique le nom de la banque auprès de qui tu as contracté cette dette.'
          : 'Indique la personne auprès de qui tu as contracté cette dette.', 422, { needsReview: true });
      }
      if (incomeFlowType === 'debt_borrowed' && !validDate(body.incomeDueDate || dueDate)) {
        return errorResponse('Indique la date d’échéance de cette dette.', 422, { needsReview: true });
      }
      if (incomeFlowType === 'repayment_received' && (!repaymentDebtId || repaymentDebtId.includes('/'))) {
        return errorResponse('Choisis la créance qui vient d’être remboursée.', 422, { needsReview: true });
      }
      const incomeResponse = await fetch(new URL('/api/incomes/add', request.url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authorization },
        body: JSON.stringify({
          amount,
          source: incomeFlowType === 'debt_borrowed' ? (bankName || person) : cleanText(parsed?.source || body.source || '', 100),
          categoryId: flowCategory,
          flowType: incomeFlowType,
          person,
          counterpartyType,
          bankName,
          phone: cleanText(body.incomePhone || '', 30),
          dueDate: body.incomeDueDate || dueDate,
          repaymentDebtId,
          date,
          month: date.slice(0, 7),
          note,
          quickCaptureId: idempotencyKey,
        }),
        cache: 'no-store',
      });
      const incomeResult = await incomeResponse.json().catch(() => ({}));
      if (!incomeResponse.ok || !incomeResult.success) {
        return NextResponse.json({
          success: false,
          error: incomeResult.error || 'Impossible d’enregistrer ce mouvement de revenu.',
          needsReview: incomeResponse.status === 400,
          recognized: parsed,
        }, { status: incomeResponse.status || 400 });
      }
      return NextResponse.json({
        success: true,
        ...incomeResult,
        recognized: makeRecognized(parsed || { type, amount, categoryId: flowCategory, date }, {
          type, amount, categoryId: flowCategory,
          source: incomeResult.source || cleanText(parsed?.source || body.source || '', 100) || person || bankName,
          person: person || bankName,
          incomeFlowType,
          debtId: incomeResult.debtId || null,
          repaymentDebtId: incomeResult.repaymentDebtId || null,
          repaymentCompleted: incomeResult.repaymentCompleted === true,
        }),
      });
    }
    if (!INCOME_CATEGORIES.has(categoryId)) return errorResponse('La catégorie de revenu est invalide. Classe ce revenu dans « Autre revenu » si nécessaire.', 400);
    const source = cleanText(parsed?.source || body.source || '', 100);
    if (!source) return errorResponse('Indique la source de ce revenu, par exemple « MTN », « Orange » ou « Salaire ».', 400);
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
      const saved = { incomeId: incomeRef.id, amount, source, categoryId, date, success: true };
      transaction.create(actionRef, { ...saved, type: 'income', createdAt: FieldValue.serverTimestamp() });
      transaction.set(userRef, {
        monthlyStats: stats,
        lifetimeIncomeAmount: FieldValue.increment(amount),
        lifetimeIncomeCount: FieldValue.increment(1),
      }, { merge: true });
      return saved;
    });
    const budgetRecommendation = !result.duplicate
      ? buildIncomeBudgetRecommendation({
        incomeId: result.incomeId,
        amount,
        source,
        categoryId,
        date,
        flowType: 'normal',
      })
      : null;
    return NextResponse.json({
      success: true, ...result,
      ...(budgetRecommendation ? { budgetRecommendation } : {}),
      recognized: parsed ? makeRecognized(parsed, { type, amount, categoryId, date, source }) : null,
    });
  } catch (caught) {
    const message = caught?.message || 'Impossible d’enregistrer cette opération rapide.';
    const status = /session|token|auth/i.test(message) ? 401
      : /premium|abonnement/i.test(message) ? 403
      : /montant|catégorie|date|source|choisis|indique|valide|fonds insuffisants|budget/i.test(message) ? 400 : 500;
    console.error('[PATA QUICK CAPTURE]', message);
    return errorResponse(message, status);
  }
}
