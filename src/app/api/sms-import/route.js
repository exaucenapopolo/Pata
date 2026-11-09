import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PREMIUM_PRICE = 2500;
const PROVIDERS = new Set(['mtn_momo', 'orange_money']);
const EVENT_TYPES = new Set(['receive', 'send', 'payment', 'withdrawal']);

function responseError(message, status = 400, extra = {}) {
  return NextResponse.json({ success: false, error: message, ...extra }, { status });
}

async function authenticate(request) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) throw new Error('Session expirée. Reconnecte-toi.');
  return adminAuth.verifyIdToken(header.slice(7));
}

function premiumExpiry(profile = {}) {
  const value = profile.premiumUntil;
  const expiry = value?.toDate ? value.toDate() : new Date(value || 0);
  return Number.isFinite(expiry.getTime()) ? expiry : null;
}

function isPremium(profile) {
  const expiry = premiumExpiry(profile);
  return Boolean(expiry && expiry.getTime() > Date.now());
}

function transactionRef(uid, transactionHash) {
  if (!/^[a-f0-9]{64}$/.test(String(transactionHash || ''))) {
    throw new Error('Identifiant de transaction invalide.');
  }
  return adminDb.collection('users').doc(uid).collection('smsImports').doc(transactionHash);
}

function validateParsedPayload(body = {}) {
  const provider = String(body.provider || '');
  const eventType = String(body.eventType || '');
  const direction = String(body.direction || '');
  const amount = Math.round(Number(body.amount));
  const date = String(body.date || '');
  const time = String(body.time || '');
  if (!PROVIDERS.has(provider)) throw new Error('Opérateur Mobile Money non reconnu.');
  if (!EVENT_TYPES.has(eventType)) throw new Error('Type de transaction non reconnu.');
  const expectedDirection = eventType === 'receive' ? 'income' : eventType === 'withdrawal' ? 'withdrawal' : 'expense';
  if (direction !== expectedDirection) throw new Error('Sens de transaction incohérent.');
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000) throw new Error('Montant SMS invalide.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error('Date ou heure de transaction invalide.');
  }
  return { provider, eventType, direction, amount, date, time };
}

async function getUserAndPremium(uid) {
  const userRef = adminDb.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
  const profile = userSnap.data() || {};
  return { userRef, profile, premium: isPremium(profile), expiry: premiumExpiry(profile) };
}

export async function GET(request) {
  try {
    const { uid } = await authenticate(request);
    const { profile, premium, expiry } = await getUserAndPremium(uid);
    const snapshot = await adminDb.collection('users').doc(uid).collection('smsImports').limit(100).get();
    const pending = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((item) => item.status === 'PENDING')
      .sort((a, b) => {
        const left = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const right = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return right - left;
      })
      .slice(0, 20)
      .map(({ id, provider, eventType, direction, amount, date, time, createdAt }) => ({
        id, provider, eventType, direction, amount, date, time,
        createdAt: createdAt?.toDate ? createdAt.toDate().toISOString() : null,
      }));
    return NextResponse.json({
      success: true, isPremium: premium,
      enabled: premium && profile.smsImportEnabled === true,
      premiumUntil: expiry ? expiry.toISOString() : null,
      premiumPrice: PREMIUM_PRICE, pending,
    });
  } catch (error) {
    return responseError(error.message || 'Impossible de charger les imports SMS.', 401);
  }
}

export async function POST(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json();
    const action = String(body.action || '');

    if (action === 'configure') {
      const enabled = body.enabled === true;
      const { userRef, premium, expiry } = await getUserAndPremium(uid);
      if (enabled && !premium) {
        return responseError('L’import SMS est réservé à Pata Premium (2 500 FCFA/mois).', 403, { code: 'PREMIUM_REQUIRED' });
      }
      await userRef.set({ smsImportEnabled: enabled, smsImportUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return NextResponse.json({ success: true, enabled, premiumUntil: expiry ? expiry.toISOString() : null });
    }

    if (action === 'stage') {
      const parsed = validateParsedPayload(body);
      const sourceMode = body.source === 'sharesheet' ? 'sharesheet' : 'automatic';
      const ref = transactionRef(uid, body.transactionHash);
      const { userRef } = await getUserAndPremium(uid);
      const result = await adminDb.runTransaction(async (transaction) => {
        const [userSnap, existingSnap] = await Promise.all([transaction.get(userRef), transaction.get(ref)]);
        if (!userSnap.exists) throw new Error('Profil utilisateur introuvable.');
        const profile = userSnap.data() || {};
        if (!isPremium(profile)) throw new Error('L’import SMS est réservé à Pata Premium.');
        if (sourceMode === 'automatic' && profile.smsImportEnabled !== true) throw new Error('Active d’abord l’import SMS dans les paramètres de Pata.');
        if (existingSnap.exists) return { duplicate: true, status: existingSnap.data()?.status || 'PENDING' };
        transaction.create(ref, { ...parsed, status: 'PENDING', createdAt: FieldValue.serverTimestamp(), source: sourceMode });
        return { duplicate: false, status: 'PENDING' };
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'refuse') {
      const ref = transactionRef(uid, body.id);
      const snap = await ref.get();
      if (!snap.exists) return responseError('Import introuvable.', 404);
      if (snap.data()?.status === 'PENDING') {
        await ref.update({ status: 'REJECTED', rejectedAt: FieldValue.serverTimestamp() });
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'confirm') {
      const ref = transactionRef(uid, body.id);
      const operationType = String(body.operationType || '');
      const categoryId = String(body.categoryId || '').trim().slice(0, 80);
      const incomeSourceId = String(body.incomeSourceId || 'all').trim().slice(0, 150);
      const confirmBudgetOverrun = body.confirmBudgetOverrun === true;
      if (!['income', 'expense'].includes(operationType)) return responseError('Type d’opération invalide.', 400);
      if (!categoryId) return responseError('Choisis une catégorie avant de confirmer.', 400);

      const { userRef } = await getUserAndPremium(uid);
      const claim = await adminDb.runTransaction(async (transaction) => {
        const [userSnap, importSnap] = await Promise.all([transaction.get(userRef), transaction.get(ref)]);
        if (!userSnap.exists || !importSnap.exists) throw new Error('Import SMS introuvable.');
        const profile = userSnap.data() || {};
        const automaticImport = importSnap.data()?.source !== 'sharesheet';
        if (!isPremium(profile) || (automaticImport && profile.smsImportEnabled !== true)) throw new Error('Un abonnement Premium actif est nécessaire ; active la détection automatique pour les SMS reçus en arrière-plan.
        const item = importSnap.data() || {};
        if (item.status === 'CONFIRMED') return { duplicate: true, item };
        if (item.status === 'REJECTED') throw new Error('Cette opération a été refusée.');
        if (item.status === 'PROCESSING') {
          const processingAt = item.processingAt?.toDate ? item.processingAt.toDate().getTime() : new Date(item.processingAt || 0).getTime();
          if (Number.isFinite(processingAt) && Date.now() - processingAt < 120000) {
            throw new Error('Cette opération est déjà en cours de confirmation. Réactualise la liste dans quelques instants.');
          }
        } else if (item.status !== 'PENDING') {
          throw new Error('Cette opération ne peut plus être confirmée.');
        }
        if (item.direction === 'income' && operationType !== 'income') throw new Error('Cette transaction est une réception : elle doit être enregistrée comme revenu.');
        if (item.direction === 'expense' && operationType !== 'expense') throw new Error('Cette transaction est une sortie : elle doit être enregistrée comme dépense.');
        if (item.direction === 'withdrawal' && operationType !== 'expense') throw new Error('Un retrait doit être explicitement classé comme dépense ou refusé.');
        transaction.update(ref, { status: 'PROCESSING', categoryId, operationType, processingAt: FieldValue.serverTimestamp() });
        return { duplicate: false, item };
      });

      if (claim.duplicate) return NextResponse.json({ success: true, duplicate: true, operationId: claim.item.operationId || null });

      const item = claim.item;
      const smsImportId = 'sms_' + ref.id;
      const providerName = item.provider === 'mtn_momo' ? 'MTN Mobile Money' : 'Orange Money';
      const note = (item.eventType === 'receive' ? 'Réception ' : item.eventType === 'withdrawal' ? 'Retrait ' : item.eventType === 'payment' ? 'Paiement ' : 'Envoi ') + providerName;
      const endpoint = operationType === 'expense' ? '/api/expenses/add' : '/api/incomes/add';
      const payload = operationType === 'expense'
        ? {
            amount: item.amount, categoryId, date: item.date, time: item.time, note,
            paymentMethod: item.provider, expenseType: 'consumption',
            incomeSourceId, incomeSourceName: incomeSourceId === 'all' ? 'Tous les revenus' : '',
            confirmBudgetOverrun, smsImportId,
          }
        : {
            amount: item.amount, categoryId, date: item.date, month: item.date.slice(0, 7),
            time: item.time, source: providerName, note, paymentMethod: item.provider, smsImportId,
          };

      let operationResponse;
      let operationResult;
      try {
        operationResponse = await fetch(new URL(endpoint, request.url), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: request.headers.get('authorization') || '' },
          body: JSON.stringify(payload), cache: 'no-store',
        });
        operationResult = await operationResponse.json().catch(() => ({}));
      } catch (error) {
        await ref.update({ status: 'PENDING', lastError: 'NETWORK', processingAt: FieldValue.delete() });
        return responseError('Connexion interrompue. Réessaie : la clé anti-doublon protégera cette opération.', 503);
      }

      if (operationResult.confirmationRequired) {
        await ref.update({ status: 'PENDING', processingAt: FieldValue.delete() });
        return NextResponse.json({
          success: false, confirmationRequired: true,
          message: operationResult.message || 'Cette dépense dépasse un budget. Confirme une seconde fois pour continuer.',
          warnings: operationResult.warnings || [],
        });
      }

      if (!operationResponse.ok || operationResult.success === false) {
        await ref.update({ status: 'PENDING', processingAt: FieldValue.delete(), lastError: String(operationResult.error || 'WRITE_FAILED').slice(0, 180) });
        return responseError(operationResult.error || 'Impossible d’enregistrer cette opération.', operationResponse.status || 500);
      }

      const operationId = operationResult.id || null;
      await ref.update({
        status: 'CONFIRMED', operationType, categoryId, operationId,
        confirmedAt: FieldValue.serverTimestamp(), lastError: FieldValue.delete(),
      });
      return NextResponse.json({ success: true, operationId });
    }

    return responseError('Action d’import SMS inconnue.', 400);
  } catch (error) {
    const message = error.message || 'Import SMS impossible.';
    const status = /Premium|abonnement/i.test(message) ? 403
      : /introuvable/i.test(message) ? 404
        : /Session|token/i.test(message) ? 401 : 400;
    return responseError(message, status);
  }
}
