import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { AggregateField } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isPremium(profile = {}) {
  const raw = profile.premiumUntil;
  const expiry = raw?.toDate ? raw.toDate() : new Date(raw || 0);
  return Number.isFinite(expiry.getTime()) && expiry.getTime() > Date.now();
}

export async function GET(request) {
  try {
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Session manquante.' }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const userRef = adminDb.collection('users').doc(decoded.uid);
    const profile = await userRef.get();
    if (!profile.exists || !isPremium(profile.data() || {})) {
      return NextResponse.json({ success: false, error: 'Cette fonction est réservée à Pata Premium.' }, { status: 403 });
    }

    // Cette lecture n'est exécutée qu'à l'ouverture de Quick Capture, jamais à l'installation.
    const [incomesSnap, debtsSnap, categoriesSnap] = await Promise.all([
      userRef.collection('incomes').orderBy('date', 'desc').limit(100).get(),
      userRef.collection('debts').orderBy('createdAt', 'desc').limit(100).get(),
      userRef.collection('categories').orderBy('createdAt', 'asc').get(),
    ]);
    const eligibleIncomeDocs = incomesSnap.docs.filter((doc) => {
      const data = doc.data() || {};
      return (data.neutralFlow !== true || (data.flowType === 'debt_borrowed' && data.availableAsFunding === true))
        && data.cashPocket !== true
        && Number(data.amount) > 0;
    });
    const profileData = profile.data() || {};
    let spentTotals = profileData.incomeSpentTotalsVersion === 1
      ? (profileData.incomeSpentTotals || {})
      : null;
    if (!spentTotals && eligibleIncomeDocs.length) {
      const expensesRef = userRef.collection('expenses');
      try {
        const totals = await Promise.all(eligibleIncomeDocs.map(async (doc) => {
          const snapshot = await expensesRef.where('incomeSourceId', '==', doc.id)
            .aggregate({ total: AggregateField.sum('amount') }).get();
          return [doc.id, Math.max(0, Number(snapshot.data()?.total) || 0)];
        }));
        spentTotals = Object.fromEntries(totals);
      } catch (aggregateError) {
        const message = String(aggregateError?.message || aggregateError);
        const missingIndex = aggregateError?.code === 9
          || String(aggregateError?.code || '').toLowerCase().includes('failed-precondition')
          || /requires an index|index is currently building/i.test(message);
        if (!missingIndex) throw aggregateError;
        const matchingExpenses = [];
        for (let offset = 0; offset < eligibleIncomeDocs.length; offset += 30) {
          const ids = eligibleIncomeDocs.slice(offset, offset + 30).map((doc) => doc.id);
          const snapshot = await expensesRef.where('incomeSourceId', 'in', ids).get();
          matchingExpenses.push(...snapshot.docs.map((doc) => doc.data() || {}));
        }
        spentTotals = {};
        matchingExpenses.forEach((expense) => {
          const incomeId = String(expense.incomeSourceId || '');
          if (incomeId && !incomeId.includes('/')) spentTotals[incomeId] = (Number(spentTotals[incomeId]) || 0) + Math.max(0, Number(expense.amount) || 0);
        });
      }

      // Persist the legacy balance summary once, just like the income balance
      // endpoint. Future Quick Capture openings then need only the profile read.
      spentTotals = await adminDb.runTransaction(async (transaction) => {
        const latestProfile = await transaction.get(userRef);
        const latestData = latestProfile.exists ? latestProfile.data() || {} : {};
        if (latestData.incomeSpentTotalsVersion === 1) {
          return latestData.incomeSpentTotals || {};
        }
        transaction.set(userRef, {
          incomeSpentTotals: spentTotals,
          incomeSpentTotalsVersion: 1,
          incomeSpentTotalsUpdatedAt: new Date(),
        }, { merge: true });
        return spentTotals;
      });
    }
    const incomes = eligibleIncomeDocs.map((doc) => {
      const data = doc.data() || {};
      const amount = Math.max(0, Number(data.amount) || 0);
      const spent = Math.max(0, Number(spentTotals?.[doc.id]) || 0);
      return {
        id: doc.id,
        source: String(data.source || 'Revenu sans nom').slice(0, 100),
        date: String(data.date || '').slice(0, 10),
        amount,
        spent,
        remaining: Math.max(0, amount - spent),
        balanceAvailable: true,
        availableAsFunding: data.flowType === 'debt_borrowed' && data.availableAsFunding === true,
      };
    }).filter((income) => income.remaining > 0);
    const mapDebt = (doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        type: data.type,
        person: String(data.person || data.bankName || '').slice(0, 100),
        remaining: Math.max(0, Number(data.remaining) || 0),
        status: data.status,
        dueDate: String(data.dueDate || '').slice(0, 10),
      };
    };
    const debts = debtsSnap.docs
      .filter((doc) => {
        const data = doc.data() || {};
        return data.type === 'i_owe'
          && ['active', 'partial', 'late'].includes(data.status)
          && Number(data.remaining) > 0;
      })
      .map(mapDebt);
    const receivables = debtsSnap.docs
      .filter((doc) => {
        const data = doc.data() || {};
        return data.type === 'owed_to_me'
          && ['active', 'partial', 'late'].includes(data.status)
          && Number(data.remaining) > 0;
      })
      .map(mapDebt);
    const categories = categoriesSnap.docs
      .map((doc) => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          name: String(data.name || data.label || '').trim().slice(0, 100),
          type: String(data.type || ''),
        };
      })
      .filter((category) => category.name && ['expense', 'income'].includes(category.type));
    return NextResponse.json({ success: true, incomes, debts, receivables, categories });
  } catch (error) {
    console.error('[PATA QUICK CAPTURE OPTIONS]', error.message || error);
    return NextResponse.json({ success: false, error: 'Impossible de charger les sources et dettes disponibles.' }, { status: 500 });
  }
}
