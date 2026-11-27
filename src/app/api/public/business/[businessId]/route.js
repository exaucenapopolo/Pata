import { NextResponse } from 'next/server';
import { getPublicBusinessProfile } from '@/lib/business/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request,context){
 try{return NextResponse.json({success:true,...await getPublicBusinessProfile(context?.params?.businessId)},{headers:{'Cache-Control':'no-store, max-age=0'}});}
 catch(error){return NextResponse.json({success:false,error:error?.message||'Profil indisponible.'},{status:Number(error?.status)||404,headers:{'Cache-Control':'no-store, max-age=0'}});}
}
