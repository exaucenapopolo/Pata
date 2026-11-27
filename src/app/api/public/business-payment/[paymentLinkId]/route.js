import { NextResponse } from 'next/server';
import { getPublicBusinessPaymentLink } from '@/lib/business/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, context) {
  try {
    const paymentLinkId = String(context?.params?.paymentLinkId || '');
    return NextResponse.json({ success: true, ...(await getPublicBusinessPaymentLink(paymentLinkId)) }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    return NextResponse.json({ success: false, code: error?.code || 'PAYMENT_PAGE_ERROR', error: error?.message || 'Impossible de charger cette offre.' }, {
      status: Number(error?.status) || 400, headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  }
}
