'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {ArrowRight,Building2,LoaderCircle,Store} from 'lucide-react';
const money=value=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0}).format(Number(value)||0)+' FCFA';
export default function PublicBusinessStorefront(){
 const params=useParams(),businessId=String(params?.businessId||'');
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{if(!businessId)return;let active=true;fetch('/api/public/business/'+encodeURIComponent(businessId),{cache:'no-store'}).then(async r=>{const x=await r.json().catch(()=>({}));if(!r.ok||!x.success)throw new Error(x.error||'Profil indisponible.');if(active)setData(x);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[businessId]);
 return <main className="min-h-screen bg-[#f4f7f5] px-4 py-8 text-slate-900"><div className="mx-auto max-w-5xl">
  <header className="mb-5 flex items-center justify-center gap-2 text-sm font-extrabold text-[#075b43]"><Store size={18}/> Boutique professionnelle</header>
  {loading?<div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle className="animate-spin"/>Chargement…</div>:error?<section className="rounded-3xl bg-white p-10 text-center"><Building2 className="mx-auto text-slate-400" size={32}/><h1 className="mt-3 font-bold">Profil indisponible</h1><p className="mt-2 text-sm text-slate-500">{error}</p></section>:data&&<>
   <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"><div className="flex items-center gap-4"><span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-slate-50">{data.business.logoUrl?<img src={data.business.logoUrl} alt="" className="h-full w-full object-cover"/>:<Building2 size={26} className="text-slate-400"/>}</span><div className="min-w-0"><h1 className="text-2xl font-extrabold">{data.business.name}</h1>{data.business.slogan&&<p className="mt-1 text-sm text-slate-500">{data.business.slogan}</p>}<p className="mt-1 text-xs text-slate-400">{[data.business.activity,data.business.city].filter(Boolean).join(' · ')}</p>{data.business.ratingCount>0&&<p className="mt-2 text-xs font-semibold text-amber-600">★ {Number(data.business.averageRating||0).toFixed(1)}/5 · {data.business.ratingCount} avis vérifiés</p>}</div></div>
    {data.business.phone&&<p className="mt-4 text-sm text-slate-600">Contact : {data.business.phone}</p>}
   </section>
   <section className="mt-6"><div className="mb-3"><h2 className="text-lg font-extrabold">Nos produits et offres</h2><p className="mt-1 text-xs text-slate-500">Choisis un article pour consulter sa page et payer en toute sécurité.</p></div>
    {data.offers.length?<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.offers.map(item=><article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex h-44 items-center justify-center bg-slate-100">{item.imageUrl?<img src={item.imageUrl} alt={item.title} className="h-full w-full object-contain"/>:<Building2 size={30} className="text-slate-400"/>}</div>{item.galleryImageUrls?.length>0&&<div className="grid grid-cols-4 gap-1 p-2">{item.galleryImageUrls.slice(0,4).map(url=><div key={url} className="aspect-square overflow-hidden rounded-lg bg-slate-50"><img src={url} alt="" className="h-full w-full object-cover"/></div>)}</div>}<div className="p-4"><h3 className="font-bold">{item.title}</h3><p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-500">{item.description}</p>{item.ratingCount>0&&<p className="mt-2 text-[11px] font-semibold text-amber-600">★ {Number(item.averageProductRating||0).toFixed(1)}/5 · {item.ratingCount} avis vérifiés</p>}<div className="mt-3 flex items-center justify-between gap-2"><strong className="text-lg text-[#075b43]">{money(item.amount)}</strong><Link href={'/paiement/'+encodeURIComponent(item.id)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#075b43] px-3 text-xs font-bold text-white">Voir et payer <ArrowRight size={14}/></Link></div></div></article>)}</div>:<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Aucune offre publique pour le moment.</div>}
   </section>
  </>}
  <p className="mt-8 text-center text-[11px] text-slate-400">Boutique créée avec <a href="https://www.pata-yam.site/" className="font-semibold text-[#075b43] underline">Pata</a></p>
 </div></main>;
}
