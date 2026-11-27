import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getPublicBusinessPaymentLink, createPublicBusinessPaymentCheckout } from '@/lib/business/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;
const visitorFor = (request) => request.cookies.get('pata_offer_visitor')?.value || randomUUID().replace(/-/g, '');
function responseWithVisitor(request, visitor, payload) {
 const response=NextResponse.json(payload,{headers:{'Cache-Control':'no-store, max-age=0'}});
 if(!request.cookies.get('pata_offer_visitor'))response.cookies.set('pata_offer_visitor',visitor,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:31536000});
 return response;
}
export async function GET(request,context){
 try{const visitor=visitorFor(request);return responseWithVisitor(request,visitor,{success:true,...await getPublicBusinessPaymentLink(context?.params?.paymentLinkId,visitor)});}
 catch(error){return NextResponse.json({success:false,code:error?.code||'PAYMENT_PAGE_ERROR',error:error?.message||'Impossible de charger cette offre.'},{status:Number(error?.status)||400,headers:{'Cache-Control':'no-store, max-age=0'}});}
}
export async function POST(request,context){
 try{const visitor=visitorFor(request),buyer=await request.json().catch(()=>({}));return responseWithVisitor(request,visitor,{success:true,...await createPublicBusinessPaymentCheckout(context?.params?.paymentLinkId,visitor,buyer)});}
 catch(error){return NextResponse.json({success:false,code:error?.code||'PAYMENT_CHECKOUT_ERROR',error:error?.message||'Impossible de préparer le paiement.'},{status:Number(error?.status)||400,headers:{'Cache-Control':'no-store, max-age=0'}});}
}
