import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminMessaging } from '@/lib/firebase/admin';
import { createExpenseForUser } from '@/lib/ai/financialTools';
import { addScheduledFrequency, dateKeyInTimeZone, getScheduledOccurrenceId, isValidDateKey } from '@/lib/scheduling/scheduledTransactions.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value, max = 180) => String(value ?? '').trim().slice(0, max);
const appUrl = () => String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://pata.app').replace(/\/$/, '');
const safeId = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 90);

async function sendScheduledNotification(userRef, profile, notification) {
  const id = clean(notification.id, 150);
  const notificationRef = userRef.collection('notifications').doc(id);
  const existing = await notificationRef.get();
  if (existing.exists) return false;
  await notificationRef.create({
    title: clean(notification.title, 80),
    body: clean(notification.body, 220),
    target: clean(notification.target || '/dashboard', 300),
    source: 'scheduled_transaction',
    scheduledTransactionId: clean(notification.scheduleId, 120),
    read: false,
    readAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  const tokens = Array.isArray(profile?.pushTokens) ? [...new Set(profile.pushTokens.filter((token) => typeof token === 'string' && token.length > 20))] : [];
  if (tokens.length) {
    const path = clean(notification.target || '/dashboard', 300);
    const tag = ('pata-scheduled-' + safeId(notification.scheduleId) + '-' + String(notification.date || '').replace(/-/g, '')).slice(0, 32);
    const results = await Promise.allSettled(tokens.map((token) => adminMessaging.send({
      token,
      notification: { title: clean(notification.title, 80), body: clean(notification.body, 220) },
      data: { title: clean(notification.title, 80), body: clean(notification.body, 220), url: path, tag, source: 'scheduled_transaction' },
      android: { priority: 'high', notification: { channelId: 'pata_general', icon: 'ic_stat_pata', color: '#0b5c46' } },
      webpush: { headers: { TTL: '86400', Urgency: 'high' }, notification: { title: clean(notification.title, 80), body: clean(notification.body, 220), icon: appUrl() + '/pata-notification.svg', badge: appUrl() + '/pata-notification-badge.svg', tag }, fcmOptions: { link: new URL(path, appUrl()).toString() } },
    })));
    const badTokens = results.flatMap((item, index) => item.status === 'rejected'
      && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(String(item.reason?.code || '')) ? [tokens[index]] : []);
    if (badTokens.length) await userRef.set({ pushTokens: FieldValue.arrayRemove(...badTokens) }, { merge: true }).catch(() => {});
  }
  return true;
}

async function createUnlinkedExpense(userRef, schedule, occurrenceDate, occurrenceId) {
  const expenseRef = userRef.collection('expenses').doc(occurrenceId);
  await adminDb.runTransaction(async (transaction) => {
    const [existing, userSnap] = await Promise.all([transaction.get(expenseRef), transaction.get(userRef)]);
    if (existing.exists) return;
    if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
    const profile = userSnap.data() || {};
    const amount = Math.round(Number(schedule.amount));
    const month = occurrenceDate.slice(0, 7);
    const statsBefore = profile.monthlyStats || {};
    const stats = statsBefore.lastResetMonth === month
      ? { ...statsBefore }
      : { ...statsBefore, expenses: 0, incomes: 0, budgets: 0, goals: 0, lastResetMonth: month };
    stats.expenses = (Number(stats.expenses) || 0) + 1;
    stats.lastResetMonth = month;
    transaction.create(expenseRef, {
      amount,
      categoryId: clean(schedule.categoryId, 80) || 'other',
      note: clean(schedule.note, 250),
      date: occurrenceDate,
      time: clean(schedule.time, 5),
      expenseType: clean(schedule.expenseType || 'consumption', 30),
      flowType: 'normal',
      neutralFlow: false,
      incomeSourceId: 'pending_source_' + safeId(schedule.id),
      incomeSourceName: 'Source à relier : ' + clean(schedule.futureIncomeSourceName, 100),
      pendingIncomeSourceName: clean(schedule.futureIncomeSourceName, 100),
      awaitingIncomeSource: true,
      scheduledTransactionId: schedule.id,
      scheduledOccurrenceDate: occurrenceDate,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.set(userRef, {
      monthlyStats: stats,
      lifetimeExpenseAmount: FieldValue.increment(amount),
      lifetimeExpenseCount: FieldValue.increment(1),
    }, { merge: true });
  });
  return { expenseId: occurrenceId, requiresSourceLink: true };
}

async function createScheduledIncome(userRef, schedule, occurrenceDate, occurrenceId) {
  const incomeRef = userRef.collection('incomes').doc(occurrenceId);
  const isBorrowed = schedule.kind === 'debt_borrowed';
  const isRepayment = schedule.kind === 'repayment_received';
  const debtId = isBorrowed ? occurrenceId + '_debt' : clean(schedule.repaymentDebtId, 150);
  const debtRef = debtId ? userRef.collection('debts').doc(debtId) : null;
  await adminDb.runTransaction(async (transaction) => {
    const reads = [transaction.get(incomeRef), transaction.get(userRef)];
    if (debtRef) reads.push(transaction.get(debtRef));
    const snapshots = await Promise.all(reads);
    const incomeSnap = snapshots[0];
    const userSnap = snapshots[1];
    const debtSnap = debtRef ? snapshots[2] : null;
    if (incomeSnap.exists) return;
    if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
    const profile = userSnap.data() || {};
    const amount = Math.round(Number(schedule.amount));
    const categoryId = clean(schedule.categoryId, 80);
    const month = occurrenceDate.slice(0, 7);
    let repaymentDebt = null;
    let repaymentRemaining = null;
    let repaymentCompleted = false;
    if (isRepayment) {
      if (!debtSnap?.exists) throw new Error('La créance programmée n’existe plus.');
      repaymentDebt = debtSnap.data() || {};
      if (repaymentDebt.type !== 'owed_to_me' || !['active', 'partial', 'late'].includes(repaymentDebt.status)) throw new Error('La créance choisie ne peut plus recevoir de remboursement.');
      if (amount > (Number(repaymentDebt.remaining) || 0)) throw new Error('Le montant programmé dépasse le solde de la créance.');
      repaymentRemaining = Math.max(0, (Number(repaymentDebt.remaining) || 0) - amount);
      repaymentCompleted = repaymentRemaining <= 0;
    }
    const source = isBorrowed ? clean(schedule.person || schedule.source, 100)
      : isRepayment ? 'Remboursement reçu · ' + clean(repaymentDebt.person || 'Créance', 100)
        : clean(schedule.source, 100);
    if (!source) throw new Error('La source du revenu programmé est vide.');
    const neutralFlow = isBorrowed;
    const statsBefore = profile.monthlyStats || {};
    const currentMonth = dateKeyInTimeZone(new Date()).slice(0, 7);
    const stats = statsBefore.lastResetMonth === currentMonth
      ? { ...statsBefore }
      : { ...statsBefore, expenses: 0, incomes: 0, budgets: 0, goals: 0, lastResetMonth: currentMonth };
    transaction.create(incomeRef, {
      amount, source, categoryId, month, date: occurrenceDate, note: clean(schedule.note, 250),
      flowType: isBorrowed ? 'debt_borrowed' : isRepayment ? 'repayment_received' : 'normal',
      neutralFlow,
      ...(schedule.image ? { image: clean(schedule.image, 2048) } : {}),
      ...(isBorrowed ? {
        person: clean(schedule.person || schedule.source, 100),
        counterpartyType: schedule.counterpartyType === 'bank' ? 'bank' : 'person',
        ...(schedule.bankName ? { bankName: clean(schedule.bankName, 100) } : {}),
        phone: clean(schedule.phone, 30) || null,
        dueDate: clean(schedule.dueDate, 10),
        debtId,
      } : {}),
      ...(isRepayment ? { repaymentDebtId: debtId, repaymentCompleted, remaining: repaymentRemaining } : {}),
      ...(schedule.projectId ? { projectId: clean(schedule.projectId, 150) } : {}),
      time: clean(schedule.time, 5),
      locationLabel: clean(schedule.locationLabel, 160),
      paymentMethod: clean(schedule.paymentMethod, 30),
      details: clean(schedule.details, 160),
      scheduledTransactionId: schedule.id,
      scheduledOccurrenceDate: occurrenceDate,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (isBorrowed) {
      transaction.create(debtRef, {
        type: 'i_owe', person: clean(schedule.person || schedule.source, 100),
        counterpartyType: schedule.counterpartyType === 'bank' ? 'bank' : 'person',
        ...(schedule.bankName ? { bankName: clean(schedule.bankName, 100) } : {}),
        phone: clean(schedule.phone, 30) || null, amount, remaining: amount,
        createdAt: FieldValue.serverTimestamp(), dueDate: clean(schedule.dueDate, 10),
        status: schedule.dueDate < dateKeyInTimeZone(new Date()) ? 'late' : 'active',
        note: clean(schedule.note, 250), transactionId: incomeRef.id,
      });
      transaction.set(userRef, { activeDebtCount: FieldValue.increment(1) }, { merge: true });
    } else if (isRepayment) {
      const status = repaymentCompleted ? 'paid' : repaymentDebt.dueDate && repaymentDebt.dueDate < dateKeyInTimeZone(new Date()) ? 'late' : 'partial';
      const repaymentRef = debtRef.collection('repayments').doc(occurrenceId);
      transaction.create(repaymentRef, { date: occurrenceDate, amount, transactionId: incomeRef.id, source: 'scheduled' });
      transaction.update(debtRef, { remaining: repaymentRemaining, status, updatedAt: FieldValue.serverTimestamp() });
      if (repaymentCompleted) transaction.set(userRef, { activeDebtCount: FieldValue.increment(-1) }, { merge: true });
    } else {
      stats.incomes = (Number(stats.incomes) || 0) + 1;
      stats.lastResetMonth = currentMonth;
      transaction.set(userRef, {
        monthlyStats: stats,
        lifetimeIncomeAmount: FieldValue.increment(amount),
        lifetimeIncomeCount: FieldValue.increment(1),
      }, { merge: true });
    }
  });
  return { incomeId: incomeRef.id, debtId: isBorrowed ? debtId : null };
}

async function createScheduledExpense(userRef, uid, schedule, occurrenceDate) {
  const occurrenceId = getScheduledOccurrenceId(schedule.id, occurrenceDate);
  if (schedule.kind === 'expense' && schedule.incomeSourceId === 'future') {
    return createUnlinkedExpense(userRef, schedule, occurrenceDate, occurrenceId);
  }
  const flowType = schedule.kind === 'loan_given' ? 'loan_given' : schedule.kind === 'debt_repayment' ? 'repayment' : 'normal';
  const result = await createExpenseForUser(uid, {
    amount: schedule.amount,
    categoryId: schedule.categoryId,
    flowType,
    expenseType: schedule.expenseType || 'consumption',
    projectId: schedule.projectId || '',
    note: schedule.note || '',
    date: occurrenceDate,
    incomeSourceId: schedule.incomeSourceId || 'all',
    incomeSourceName: schedule.incomeSourceName || '',
    person: schedule.person || '',
    phone: schedule.phone || '',
    dueDate: schedule.dueDate || '',
    counterpartyUid: schedule.counterpartyUid || '',
    repaymentDebtId: schedule.repaymentDebtId || '',
    time: schedule.time || '',
    locationLabel: schedule.locationLabel || '',
    paymentMethod: schedule.paymentMethod || '',
    details: schedule.details || '',
    scheduledTransactionId: schedule.id,
  }, {
    countQuota: false,
    idempotencyKey: getScheduledOccurrenceId(schedule.id, occurrenceDate),
    skipBudgetConfirmation: true,
  });
  return { expenseId: result.expenseId || result.expenseIds?.[0] || null, debtId: result.debtId || null };
}

async function processOccurrence(userRef, uid, scheduleRef, schedule, occurrenceDate, profile) {
  const occurrenceId = getScheduledOccurrenceId(scheduleRef.id, occurrenceDate);
  const runsRef = userRef.collection('scheduledTransactionRuns').doc(occurrenceId);
  const claimed = await adminDb.runTransaction(async (transaction) => {
    const [scheduleSnap, runSnap] = await Promise.all([transaction.get(scheduleRef), transaction.get(runsRef)]);
    if (!scheduleSnap.exists || scheduleSnap.data()?.status !== 'scheduled' || scheduleSnap.data()?.active === false) return false;
    if (runSnap.exists && runSnap.data()?.status === 'completed') return false;
    if (runSnap.exists && runSnap.data()?.status === 'processing') {
      const started = new Date(runSnap.data()?.startedAt || 0).getTime();
      if (Number.isFinite(started) && Date.now() - started < 15 * 60 * 1000) return false;
    }
    transaction.set(runsRef, { status: 'processing', scheduledTransactionId: scheduleRef.id, occurrenceDate, startedAt: new Date().toISOString(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
  if (!claimed) return { skipped: true };

  try {
    let entity = {};
    if (['expense', 'loan_given', 'debt_repayment'].includes(schedule.kind)) {
      entity = await createScheduledExpense(userRef, uid, schedule, occurrenceDate);
    } else {
      entity = await createScheduledIncome(userRef, schedule, occurrenceDate, occurrenceId);
    }
    const needsSource = entity.requiresSourceLink === true;
    const recurring = schedule.recurrenceEnabled === true;
    const nextRunDate = recurring ? addScheduledFrequency(occurrenceDate, schedule.frequency, schedule.anchorDay) : null;
    await adminDb.runTransaction(async (transaction) => {
      const [freshSchedule, freshRun] = await Promise.all([transaction.get(scheduleRef), transaction.get(runsRef)]);
      if (!freshSchedule.exists || freshRun.data()?.status === 'completed') return;
      transaction.set(runsRef, { status: 'completed', ...entity, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.update(scheduleRef, {
        status: 'scheduled',
        active: recurring,
        nextRunDate,
        lastRunDate: occurrenceDate,
        lastRunStatus: needsSource ? 'NEEDS_SOURCE' : 'SUCCESS',
        lastEntityId: entity.expenseId || entity.incomeId || null,
        updatedAt: FieldValue.serverTimestamp(),
        ...(recurring ? {} : { completedAt: FieldValue.serverTimestamp() }),
      });
    });
    const amount = Math.round(Number(schedule.amount) || 0).toLocaleString('fr-FR');
    const isExpense = ['expense', 'loan_given', 'debt_repayment'].includes(schedule.kind);
    const title = needsSource ? 'Dépense programmée à relier' : isExpense ? 'Dépense programmée enregistrée' : 'Opération programmée enregistrée';
    const body = needsSource
      ? amount + ' FCFA ont été enregistrés dans tes dépenses. Relie maintenant cette opération à une source de revenu.'
      : amount + ' FCFA · ' + clean(schedule.note || schedule.source || schedule.person || 'Opération programmée', 90) + '. Ton opération a été enregistrée à la date prévue.';
    const target = needsSource ? '/expenses?linkSource=' + encodeURIComponent(entity.expenseId) : isExpense ? '/expenses' : schedule.kind === 'debt_borrowed' || schedule.kind === 'repayment_received' ? '/debts' : '/income';
    await sendScheduledNotification(userRef, profile, {
      id: 'scheduled-' + safeId(scheduleRef.id) + '-' + occurrenceDate,
      scheduleId: scheduleRef.id,
      date: occurrenceDate,
      title,
      body,
      target,
    }).catch((error) => console.warn('[PATA SCHEDULE NOTIFICATION]', uid, error.message || error));
    return { executed: true, needsSource, entity };
  } catch (error) {
    await adminDb.runTransaction(async (transaction) => {
      const [freshSchedule, freshRun] = await Promise.all([transaction.get(scheduleRef), transaction.get(runsRef)]);
      if (freshRun.exists && freshRun.data()?.status === 'completed') return;
      transaction.set(runsRef, { status: 'failed', error: clean(error.message || 'Échec de la programmation.', 240), failedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (freshSchedule.exists) transaction.update(scheduleRef, { status: 'failed', active: false, lastRunDate: occurrenceDate, lastRunStatus: 'FAILED', lastError: clean(error.message || '', 240), updatedAt: FieldValue.serverTimestamp() });
    });
    await sendScheduledNotification(userRef, profile, {
      id: 'scheduled-failed-' + safeId(scheduleRef.id) + '-' + occurrenceDate,
      scheduleId: scheduleRef.id,
      date: occurrenceDate,
      title: 'Une opération programmée nécessite ton attention',
      body: 'Pata n’a pas pu enregistrer ' + clean(schedule.note || schedule.source || schedule.person || 'cette opération', 70) + ' : ' + clean(error.message || 'vérifie les informations et les fonds disponibles.', 110),
      target: '/scheduled',
    }).catch((notificationError) => console.warn('[PATA SCHEDULE FAILURE NOTIFICATION]', notificationError.message || notificationError));
    return { failed: true, error: error.message || 'Échec inconnu.' };
  }
}

export async function GET(request) {
  const expectedSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization') || '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : request.headers.get('x-cron-secret');
  if (!expectedSecret || supplied !== expectedSecret) return NextResponse.json({ success: false, error: 'Accès au planificateur refusé.' }, { status: 401 });
  const today = dateKeyInTimeZone(new Date());
  let checkedUsers = 0;
  let executed = 0;
  let failed = 0;
  let skipped = 0;
  try {
    const users = await adminDb.collection('users').get();
    for (const userDoc of users.docs) {
      checkedUsers += 1;
      const userRef = userDoc.ref;
      const profile = userDoc.data() || {};
      const schedules = await userRef.collection('scheduledTransactions').get();
      const due = schedules.docs
        .filter((doc) => {
          const data = doc.data() || {};
          return data.status === 'scheduled' && data.active !== false && isValidDateKey(data.nextRunDate || data.scheduleDate) && String(data.nextRunDate || data.scheduleDate) <= today;
        })
        .sort((a, b) => String(a.data().nextRunDate || a.data().scheduleDate).localeCompare(String(b.data().nextRunDate || b.data().scheduleDate)));
      for (const scheduleDoc of due) {
        let schedule = { id: scheduleDoc.id, ...scheduleDoc.data() };
        let guard = 0;
        while (schedule.active !== false && schedule.status === 'scheduled' && String(schedule.nextRunDate || schedule.scheduleDate) <= today && guard < 31) {
          const occurrenceDate = String(schedule.nextRunDate || schedule.scheduleDate);
          const result = await processOccurrence(userRef, userDoc.id, scheduleDoc.ref, schedule, occurrenceDate, profile);
          if (result.skipped) { skipped += 1; break; }
          if (result.failed) { failed += 1; break; }
          if (result.executed) executed += 1;
          guard += 1;
          const refreshed = await scheduleDoc.ref.get();
          schedule = { id: scheduleDoc.id, ...(refreshed.data() || {}) };
          if (schedule.active === false || schedule.status !== 'scheduled') break;
        }
      }
    }
    return NextResponse.json({ success: true, date: today, checkedUsers, executed, failed, skipped });
  } catch (error) {
    console.error('[PATA SCHEDULED TRANSACTIONS CRON]', error.message || error);
    return NextResponse.json({ success: false, error: 'Le traitement des opérations programmées a échoué.' }, { status: 500 });
  }
}
