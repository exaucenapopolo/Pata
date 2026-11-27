import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import {
  BusinessError, createBusinessAccount, createBusinessTransaction,
  deleteBusinessResource, getBusinessOverview, listBusinessAccounts, listBusinessPeople, saveBusinessPerson, deleteBusinessPerson,
  listBusinessResource, listBusinessTransactions, recordBusinessDocumentPayment,
  saveBusinessResource, transferPersonalIncomeToBusiness, listBusinessJoinRequests, reviewBusinessJoinRequest, createBusinessInvitation, requestBusinessJoin,
} from '@/lib/business/server';

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
function segments(context) {
  const raw = context?.params?.resource;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

async function dispatch(request, context) {
  try {
    const { uid } = await authenticate(request);
    const businessId = String(context?.params?.businessId || '');
    const parts = segments(context);
    const action = parts[0] || '';
    const second = parts[1] || '';
    const third = parts[2] || '';
    const fourth = parts[3] || '';
    const method = request.method;

    if (method === 'GET' && action === 'join-requests' && parts.length === 1) return NextResponse.json({success:true,...(await listBusinessJoinRequests(uid,businessId))});
    if (method === 'POST' && action === 'join-requests' && second && parts.length === 2) return NextResponse.json(await reviewBusinessJoinRequest(uid,businessId,second,await request.json().catch(()=>({}))));
    if (method === 'POST' && action === 'invitations' && parts.length === 1) return NextResponse.json(await createBusinessInvitation(uid,businessId,await request.json().catch(()=>({}))),{status:201});
    if (method === 'POST' && action === 'join' && parts.length === 1) return NextResponse.json(await requestBusinessJoin(uid,businessId,await request.json().catch(()=>({}))),{status:201});
    if (method === 'GET' && action === 'people' && parts.length === 1) return NextResponse.json({success:true,...(await listBusinessPeople(uid,businessId))});
    if (method === 'POST' && action === 'people' && parts.length === 1) return NextResponse.json(await saveBusinessPerson(uid,businessId,await request.json().catch(()=>({}))),{status:201});
    if (method === 'PATCH' && action === 'people' && second && parts.length === 2) return NextResponse.json(await saveBusinessPerson(uid,businessId,await request.json().catch(()=>({})),second));
    if (method === 'DELETE' && action === 'people' && second && parts.length === 2) return NextResponse.json(await deleteBusinessPerson(uid,businessId,second));
    if (method === 'GET' && action === 'overview' && parts.length === 1) {
      return NextResponse.json({ success: true, ...(await getBusinessOverview(uid, businessId)) });
    }
    if (method === 'GET' && action === 'transactions' && parts.length === 1) {
      const url = new URL(request.url);
      return NextResponse.json({ success: true, ...(await listBusinessTransactions(uid, businessId, {
        limit: url.searchParams.get('limit'), type: url.searchParams.get('type') || '',
      })) });
    }
    if (method === 'POST' && action === 'transactions' && parts.length === 1) {
      const body = await request.json().catch(() => ({}));
      return NextResponse.json({ success: true, ...(await createBusinessTransaction(uid, businessId, body)) }, { status: 201 });
    }
    if (method === 'GET' && action === 'accounts' && parts.length === 1) {
      return NextResponse.json({ success: true, ...(await listBusinessAccounts(uid, businessId)) });
    }
    if (method === 'POST' && action === 'accounts' && parts.length === 1) {
      const body = await request.json().catch(() => ({}));
      return NextResponse.json(await createBusinessAccount(uid, businessId, body), { status: 201 });
    }
    if (method === 'POST' && action === 'transfer' && second === 'from-personal' && parts.length === 2) {
      const body = await request.json().catch(() => ({}));
      return NextResponse.json(await transferPersonalIncomeToBusiness(uid, businessId, body), { status: 201 });
    }
    if (action === 'resources' && second) {
      const resource = second;
      if (parts.length === 2 && method === 'GET') {
        return NextResponse.json({ success: true, ...(await listBusinessResource(uid, businessId, resource)) });
      }
      if (parts.length === 2 && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        return NextResponse.json(await saveBusinessResource(uid, businessId, resource, body), { status: 201 });
      }
      if (parts.length === 3 && method === 'PATCH') {
        const body = await request.json().catch(() => ({}));
        return NextResponse.json(await saveBusinessResource(uid, businessId, resource, body, third));
      }
      if (parts.length === 3 && method === 'DELETE') {
        return NextResponse.json(await deleteBusinessResource(uid, businessId, resource, third));
      }
      if (parts.length === 4 && third && fourth === 'pay' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        return NextResponse.json(await recordBusinessDocumentPayment(uid, businessId, resource, third, body));
      }
    }
    return NextResponse.json({ success: false, error: 'Route professionnelle introuvable.' }, { status: 404 });
  } catch (error) {
    return respondError(error);
  }
}

export { dispatch as GET, dispatch as POST, dispatch as PATCH, dispatch as DELETE };
