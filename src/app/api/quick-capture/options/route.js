import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

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
    const [incomesSnap, debtsSnap] = await Promise.all([
      userRef.collection('incomes').orderBy('date', 'desc').limit(100).get(),
      userRef.collection('debts').orderBy('createdAt', 'desc').limit(100).get(),
    ]);
    const incomes = incomesSnap.docs
      .filter((doc) => {
        const data = doc.data() || {};
        return data.neutralFlow !== true && data.cashPocket !== true
          && data.balanceAvailable !== false && Number(data.amount) > 0;
      })
      .map((doc) => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          source: String(data.source || 'Revenu sans nom').slice(0, 100),
          date: String(data.date || '').slice(0, 10),
          amount: Math.max(0, Number(data.amount) || 0),
        };
      });
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
    return NextResponse.json({ success: true, incomes, debts, receivables });
  } catch (error) {
    console.error('[PATA QUICK CAPTURE OPTIONS]', error.message || error);
    return NextResponse.json({ success: false, error: 'Impossible de charger les sources et dettes disponibles.' }, { status: 500 });
  }
}
