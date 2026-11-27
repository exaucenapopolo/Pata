import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { extractBillDataWithGroqVision } from '@/lib/ai/groqVision';
import { isValidCloudinaryAvatarUrl } from '@/lib/profile/cloudinaryAvatar.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BILL_TYPES = new Set(['electricity', 'water', 'rent', 'television', 'internet', 'telephone', 'taxes', 'insurance', 'school', 'subscription', 'other']);
const BILL_EXPENSE_CATEGORIES = new Set(['food', 'transport', 'housing', 'internet', 'health', 'leisure', 'gift_donation', 'contribution', 'other']);

function errorResponse(message, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

async function authenticate(request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw new Error('Session expirée. Reconnecte-toi puis réessaie.');
  return adminAuth.verifyIdToken(authorization.slice(7));
}

async function getImageDataUrl(body) {
  const legacyData = String(body.imageData || '');
  if (legacyData.startsWith('data:image/') && legacyData.length <= 6_500_000) return legacyData;

  const imageUrl = String(body.imageUrl || '');
  if (!isValidCloudinaryAvatarUrl(imageUrl)) {
    throw new Error('Photo invalide. Choisis une image prise en charge de moins de 5 Mo.');
  }
  const source = new URL(imageUrl);
  if (source.protocol !== 'https:' || source.hostname !== 'res.cloudinary.com' || source.username || source.password) {
    throw new Error('Adresse de photo non autorisée.');
  }
  const marker = '/image/upload/';
  if (!source.pathname.includes(marker)) throw new Error('Adresse de photo invalide.');
  source.pathname = source.pathname.replace(marker, marker + 'f_jpg,q_auto:good,w_1600,h_1600,c_limit/');
  source.search = '';
  source.hash = '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(source.toString(), { signal: controller.signal, cache: 'no-store' });
  } catch {
    throw new Error('Impossible de préparer cette photo. Réessaie dans un instant.');
  } finally {
    clearTimeout(timeout);
  }
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!response.ok || !contentType.startsWith('image/')) {
    throw new Error('Ce format de photo ne peut pas être converti. Essaie une autre image.');
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 4_500_000) {
    throw new Error('La photo convertie dépasse la taille autorisée pour son analyse.');
  }
  return 'data:image/jpeg;base64,' + bytes.toString('base64');
}

export async function POST(request) {
  try {
    await authenticate(request);
    const body = await request.json().catch(() => ({}));
    const imageData = await getImageDataUrl(body);
    const language = body.language === 'en' ? 'en' : 'fr';
    const raw = await extractBillDataWithGroqVision(imageData, language);
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) {
      throw new Error('L’image a été lue, mais les informations n’ont pas pu être structurées. Essaie une photo plus nette.');
    }
    let parsed;
    try { parsed = JSON.parse(raw.slice(start, end + 1)); }
    catch { throw new Error('Les informations lues sur la facture sont incomplètes. Essaie une photo plus nette.'); }

    const clean = (value, max = 120) => String(value || '').trim().slice(0, max);
    const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null;
    const amount = parsed.totalAmount == null || parsed.totalAmount === '' ? null : Number(parsed.totalAmount);
    return NextResponse.json({ success: true, extracted: {
      documentType: clean(parsed.documentType, 30) || 'other',
      merchantName: clean(parsed.merchantName, 100) || null,
      customerName: clean(parsed.customerName, 100) || null,
      invoiceNumber: clean(parsed.invoiceNumber, 100) || null,
      accountReference: clean(parsed.accountReference, 100) || null,
      invoiceDate: validDate(parsed.invoiceDate),
      dueDate: validDate(parsed.dueDate),
      totalAmount: Number.isFinite(amount) && amount > 0 && amount <= 1000000000 ? Math.round(amount) : null,
      currency: clean(parsed.currency, 12) || null,
      subtotal: parsed.subtotal != null && parsed.subtotal !== '' && Number.isFinite(Number(parsed.subtotal)) ? Math.round(Number(parsed.subtotal)) : null,
      taxAmount: parsed.taxAmount != null && parsed.taxAmount !== '' && Number.isFinite(Number(parsed.taxAmount)) ? Math.round(Number(parsed.taxAmount)) : null,
      suggestedBillType: BILL_TYPES.has(String(parsed.suggestedBillType || '')) ? String(parsed.suggestedBillType) : 'other',
      suggestedCategory: BILL_EXPENSE_CATEGORIES.has(String(parsed.suggestedCategory || '')) ? String(parsed.suggestedCategory) : 'other',
      description: clean(parsed.description, 250) || null,
      uncertainFields: Array.isArray(parsed.uncertainFields) ? parsed.uncertainFields.map((value) => clean(value, 50)).filter(Boolean).slice(0, 10) : [],
    } });
  } catch (error) {
    const status = /Session expirée|auth|token/i.test(String(error?.message || '')) ? 401 : 502;
    console.error('[PATA BILL SCAN]', error?.message || error);
    return errorResponse(error?.message || 'Impossible de lire cette facture.', status);
  }
}
