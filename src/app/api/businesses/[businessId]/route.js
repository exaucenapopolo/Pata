import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { BusinessError, deleteBusiness, updateBusinessProfile } from '@/lib/business/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authenticate(request) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) throw new BusinessError('Session expirée. Reconnecte-toi puis réessaie.', 401, 'AUTH_REQUIRED');
  return adminAuth.verifyIdToken(header.slice(7));
}
export async function PATCH(request, context) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json().catch(() => ({}));
    const business = await updateBusinessProfile(uid, context?.params?.businessId, body);
    return NextResponse.json({ success: true, business });
  } catch (error) {
    return NextResponse.json({ success: false, code: error?.code || 'BUSINESS_ERROR', error: error?.message || 'Impossible de modifier cette entreprise.' }, { status: Number(error?.status) || 400 });
  }
}
export async function DELETE(request, context) {
  try {
    const { uid } = await authenticate(request);
    return NextResponse.json(await deleteBusiness(uid, context?.params?.businessId));
  } catch (error) {
    return NextResponse.json({ success: false, code: error?.code || 'BUSINESS_ERROR', error: error?.message || 'Impossible de supprimer cette entreprise.' }, { status: Number(error?.status) || 400 });
  }
}
