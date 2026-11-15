import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { extractBillDataWithGroqVision } from '@/lib/ai/groqVision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BILL_TYPES = new Set(['electricity', 'water', 'internet', 'rent', 'school', 'insurance', 'subscription', 'other']);
const EXPENSE_CATEGORIES = new Set(['food', 'transport', 'housing', 'internet', 'gift_donation', 'health', 'leisure', 'investment', 'contribution', 'savings', 'other']);

function responseError(message, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}
function isPremium(profile = {}) {
  const raw = profile.premiumUntil;
  const expiry = raw?.toDate ? raw.toDate() : new Date(raw || 0);
  return Number.isFinite(expiry.getTime()) && expiry.getTime() > Date.now();
}

export async function POST(request) {
  try {
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return responseError('Session manquante. Reconnecte-toi à Pata.', 401);
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const userRef = adminDb.collection('users').doc(decoded.uid);
    const [profileSnap, body] = await Promise.all([userRef.get(), request.json()]);
    if (!profileSnap.exists) return responseError('Profil Pata introuvable.', 404);
    if (!isPremium(profileSnap.data() || {})) return responseError('L’analyse des justificatifs est réservée à Pata Premium.', 403);

    const imageData = String(body.imageData || '');
    if (!imageData.startsWith('data:image/') || imageData.length > 6500000) {
      return responseError('Image invalide ou trop volumineuse. Choisis une image de moins de 4,5 Mo.', 400);
    }
    const language = body.language === 'en' ? 'en' : 'fr';
    const raw = await extractBillDataWithGroqVision(imageData, language);
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('Le justificatif a été lu, mais les informations n’ont pas pu être structurées. Essaie une image plus nette.');
    let parsed;
    try { parsed = JSON.parse(raw.slice(start, end + 1)); }
    catch { throw new Error('Les informations lues sur le justificatif sont incomplètes. Essaie une image plus nette.'); }

    const clean = (value, max = 120) => String(value || '').trim().slice(0, max);
    const validDate = (value) => {
      const text = String(value || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
      const date = new Date(text + 'T00:00:00.000Z');
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : null;
    };
    const amount = parsed.totalAmount == null || parsed.totalAmount === '' ? null : Number(parsed.totalAmount);
    const suggestedCategory = EXPENSE_CATEGORIES.has(String(parsed.suggestedCategory || ''))
      ? String(parsed.suggestedCategory) : 'other';
    return NextResponse.json({
      success: true,
      extracted: {
        documentType: clean(parsed.documentType, 30) || 'other',
        merchantName: clean(parsed.merchantName, 100) || null,
        customerName: clean(parsed.customerName, 100) || null,
        invoiceNumber: clean(parsed.invoiceNumber, 100) || null,
        accountReference: clean(parsed.accountReference, 100) || null,
        invoiceDate: validDate(parsed.invoiceDate),
        dueDate: validDate(parsed.dueDate),
        totalAmount: Number.isFinite(amount) && amount > 0 && amount <= 1000000000 ? Math.round(amount) : null,
        currency: clean(parsed.currency, 12).toUpperCase() || null,
        subtotal: parsed.subtotal != null && parsed.subtotal !== '' && Number.isFinite(Number(parsed.subtotal)) ? Math.round(Number(parsed.subtotal)) : null,
        taxAmount: parsed.taxAmount != null && parsed.taxAmount !== '' && Number.isFinite(Number(parsed.taxAmount)) ? Math.round(Number(parsed.taxAmount)) : null,
        suggestedBillType: BILL_TYPES.has(String(parsed.suggestedBillType || '')) ? String(parsed.suggestedBillType) : 'other',
        suggestedCategory,
        description: clean(parsed.description, 250) || null,
        uncertainFields: Array.isArray(parsed.uncertainFields) ? parsed.uncertainFields.map((value) => clean(value, 50)).filter(Boolean).slice(0, 10) : [],
      },
    });
  } catch (caught) {
    const message = caught?.message || 'Impossible de lire ce justificatif.';
    const status = /token|auth|session/i.test(message) ? 401
      : /premium|abonnement/i.test(message) ? 403
        : /volumineuse|image invalide/i.test(message) ? 400 : 502;
    console.error('[PATA QUICK CAPTURE ANALYSIS]', message);
    return responseError(message, status);
  }
}
