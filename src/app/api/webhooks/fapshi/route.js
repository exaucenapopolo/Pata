import {NextResponse} from 'next/server';
import {processFapshiBusinessPayment} from '@/lib/business/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request){
 try{
  const expected=String(process.env.FAPSHI_WEBHOOK_SECRET||'');
  if(expected&&request.headers.get('x-wh-secret')!==expected)return NextResponse.json({success:false,error:'Webhook non autorisé.'},{status:401});
  const body=await request.json().catch(()=>({}));
  const transId=String(body?.transId||body?.trans_id||body?.data?.transId||body?.data?.trans_id||'').trim();
  if(!transId||transId.includes('/'))return NextResponse.json({success:false,error:'Identifiant de transaction absent.'},{status:400});
  // Never trust the webhook body as proof of payment. Query Fapshi using server credentials.
  const result=await processFapshiBusinessPayment(transId);
  if(!result?.handled)return NextResponse.json({success:false,status:'NOT_FOUND'},{status:404});
  return NextResponse.json({success:true,status:result.status});
 }catch(error){
  console.error('[PATA FAPSHI WEBHOOK]',String(error?.message||error).slice(0,300));
  return NextResponse.json({success:false,error:'Traitement du webhook impossible.'},{status:500});
 }
}
