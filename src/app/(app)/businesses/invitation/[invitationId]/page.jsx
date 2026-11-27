'use client';
import {useState} from 'react';
import {useParams,useRouter} from 'next/navigation';
import {Building2,CheckCircle2,LoaderCircle} from 'lucide-react';
import {acceptBusinessInvitation} from '@/lib/business/client';
export default function BusinessInvitationPage(){
 const {invitationId=''}=useParams(),router=useRouter();
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[accepted,setAccepted]=useState(false);
 const accept=async()=>{setLoading(true);setError('');try{const result=await acceptBusinessInvitation(invitationId);setAccepted(true);router.replace('/businesses/'+result.businessId);}catch(e){setError(e.message||'Impossible d’accepter cette invitation.');}finally{setLoading(false);}};
 return <main className="mx-auto flex min-h-[70vh] max-w-lg items-center justify-center px-4 py-10"><section className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-[#075b43]"><Building2 size={26}/></span><h1 className="mt-4 text-xl font-extrabold text-slate-900">Invitation à rejoindre une entreprise</h1><p className="mt-2 text-sm leading-6 text-slate-500">Connecte-toi avec l’adresse e-mail qui a reçu cette invitation, puis accepte pour rejoindre l’espace professionnel et recevoir les droits définis par le fondateur.</p>{error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}{accepted?<p className="mt-4 text-sm font-semibold text-emerald-700"><CheckCircle2 className="mr-1 inline" size={16}/>Invitation acceptée.</p>:<button type="button" disabled={loading} onClick={accept} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#075b43] px-4 text-sm font-semibold text-white disabled:opacity-60">{loading?<><LoaderCircle className="animate-spin" size={17}/>Validation…</>:'Accepter l’invitation'}</button>}</section></main>;
}
