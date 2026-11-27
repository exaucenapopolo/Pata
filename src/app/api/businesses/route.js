import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { BusinessError, createBusiness, listUserBusinesses, searchBusinessesForJoin, listMyBusinessInvitations, acceptBusinessInvitation } from '@/lib/business/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authenticate(request) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) throw new BusinessError('Session expirée. Reconnecte-toi puis réessaie.', 401, 'AUTH_REQUIRED');
  return adminAuth.verifyIdToken(header.slice(7));
}
function respondError(error) {
  const status = Number(error?.status) || (error?.code === 'auth/id-token-expired' ? 401 : 400);
  return NextResponse.json({ success: false, code: error?.code || 'BUSINESS_ERROR', error: error?.message || 'Opération professionnelle impossible.' }, { status });
}
export async function GET(request) {
  try {
    const { uid } = await authenticate(request);
    const url = new URL(request.url);
    if (url.searchParams.has('search')) return NextResponse.json({ success: true, ...(await searchBusinessesForJoin(uid, url.searchParams.get('search'))) });
    if (url.searchParams.get('invitations') === '1') return NextResponse.json({ success: true, ...(await listMyBusinessInvitations(uid)) });
    return NextResponse.json({ success: true, ...(await listUserBusinesses(uid)) });
  } catch (error) {
    return respondError(error);
  }
}
export async function POST(request) {
  try {
    const { uid } = await authenticate(request);
    const body = await request.json().catch(() => ({}));
    if (body.action === 'acceptInvitation') return NextResponse.json({ success: true, ...(await acceptBusinessInvitation(uid, body.invitationId)) });
    const business = await createBusiness(uid, body);
    return NextResponse.json({ success: true, business }, { status: 201 });
  } catch (error) {
    return respondError(error);
  }
}
