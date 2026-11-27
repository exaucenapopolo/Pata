import {NextResponse} from 'next/server';
import {BusinessError,submitPublicBusinessPaymentReview} from '@/lib/business/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request,context){
 try{
  const body=await request.json().catch(()=>({}));
  const result=await submitPublicBusinessPaymentReview(context?.params?.paymentLinkId,body);
  return NextResponse.json({success:true,...result});
 }catch(error){
  return NextResponse.json({success:false,code:error?.code||'BUSINESS_REVIEW_ERROR',error:error?.message||'Impossible d’enregistrer cet avis.'},{status:Number(error?.status)||400});
 }
}
