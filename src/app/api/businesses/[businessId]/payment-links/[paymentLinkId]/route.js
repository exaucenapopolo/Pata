import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { BusinessError, getBusinessPaymentLinkDetails, updateBusinessPaymentLink, deleteBusinessPaymentLink } from '@/lib/business/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request,context){
 try{
  const header=request.headers.get('authorization')||'';
  if(!header.startsWith('Bearer '))throw new BusinessError('Session expirée. Reconnecte-toi puis réessaie.',401,'AUTH_REQUIRED');
  const {uid}=await adminAuth.verifyIdToken(header.slice(7));
  return NextResponse.json({success:true,...await getBusinessPaymentLinkDetails(uid,context?.params?.businessId,context?.params?.paymentLinkId)});
 }catch(error){return NextResponse.json({success:false,code:error?.code||'BUSINESS_ERROR',error:error?.message||'Impossible de charger les statistiques.'},{status:Number(error?.status)||400});}
}

export async function PATCH(request,context){
 try{
  const header=request.headers.get('authorization')||'';
  if(!header.startsWith('Bearer '))throw new BusinessError('Session expirée. Reconnecte-toi puis réessaie.',401,'AUTH_REQUIRED');
  const {uid}=await adminAuth.verifyIdToken(header.slice(7));
  const body=await request.json().catch(()=>({}));
  return NextResponse.json({success:true,...await updateBusinessPaymentLink(uid,context?.params?.businessId,context?.params?.paymentLinkId,body)});
 }catch(error){return NextResponse.json({success:false,code:error?.code||'BUSINESS_ERROR',error:error?.message||'Impossible de modifier ce lien.'},{status:Number(error?.status)||400});}
}
export async function DELETE(request,context){
 try{
  const header=request.headers.get('authorization')||'';
  if(!header.startsWith('Bearer '))throw new BusinessError('Session expirée. Reconnecte-toi puis réessaie.',401,'AUTH_REQUIRED');
  const {uid}=await adminAuth.verifyIdToken(header.slice(7));
  const body=await request.json().catch(()=>({}));
  return NextResponse.json({success:true,...await deleteBusinessPaymentLink(uid,context?.params?.businessId,context?.params?.paymentLinkId,body)});
 }catch(error){return NextResponse.json({success:false,code:error?.code||'BUSINESS_ERROR',error:error?.message||'Impossible de supprimer ce lien.'},{status:Number(error?.status)||400});}
}
