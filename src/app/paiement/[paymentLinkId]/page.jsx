'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowRight, Building2, CheckCircle2, LoaderCircle, ShieldCheck } from 'lucide-react';

const money = (value) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(value) || 0) + ' FCFA';

export default function PublicBusinessPaymentPage() {
  const params = useParams();
  const paymentLinkId = String(params?.paymentLinkId || '');
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!paymentLinkId) return;
    let active = true;
    fetch('/api/public/business-payment/' + encodeURIComponent(paymentLinkId), { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.error || 'Cette offre est indisponible.');
        if (active) setPayment(result.payment || null);
      })
      .catch((loadError) => { if (active) setError(loadError.message || 'Impossible de charger cette offre.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [paymentLinkId]);

  const unavailable = payment && payment.status !== 'PENDING';
  const discounted = payment && Number(payment.originalAmount) > Number(payment.amount);

  return (
    <main className="min-h-screen bg-[#f4f7f5] px-4 py-8 text-slate-900 sm:py-12">
      <div className="mx-auto max-w-xl">
        <header className="mb-6 flex items-center justify-center gap-2 text-sm font-extrabold tracking-tight text-[#075b43]"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white shadow-sm"><Building2 size={17}/></span><span>Paiement professionnel</span></header>
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {loading ? <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={24}/>Chargement de l’offre…</div> : error ? <div className="px-6 py-14 text-center"><p className="font-semibold text-slate-900">Offre indisponible</p><p className="mt-2 text-sm text-slate-500">{error}</p></div> : unavailable ? <div className="px-6 py-14 text-center"><CheckCircle2 className="mx-auto text-slate-400" size={32}/><h1 className="mt-3 text-lg font-bold">Cette offre n’est plus disponible</h1><p className="mt-2 text-sm text-slate-500">Le lien a déjà été réglé, a expiré ou n’est plus actif. Contactez directement l’entreprise si nécessaire.</p></div> : payment ? <>
            {payment.imageUrl ? <img src={payment.imageUrl} alt={payment.title} className="max-h-[360px] w-full bg-slate-100 object-contain"/> : <div className="flex h-36 items-center justify-center bg-[#eaf3ee] text-[#075b43]"><Building2 size={42}/></div>}
            <div className="space-y-5 p-5 sm:p-7">
              <div className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50">{payment.businessLogoUrl ? <img src={payment.businessLogoUrl} alt="" className="h-full w-full object-cover"/> : <Building2 size={20} className="text-slate-400"/>}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{payment.businessName || 'Entreprise'}</p>{payment.businessActivity && <p className="mt-0.5 text-xs text-slate-500">{payment.businessActivity}</p>}</div></div>
              <div><h1 className="text-2xl font-extrabold tracking-tight">{payment.title}</h1><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{payment.description}</p></div>
              <div className="rounded-2xl bg-[#f6f8f6] p-4">{discounted && <div className="flex items-center gap-2 text-xs text-slate-500"><span className="line-through">{money(payment.originalAmount)}</span><span className="rounded-full bg-emerald-100 px-2 py-1 font-bold text-emerald-800">Économie de {money(payment.discountAmount)}</span></div>}<p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Montant à payer</p><p className="mt-1 text-3xl font-extrabold tabular-nums text-[#075b43]">{money(payment.amount)}</p></div>
              {payment.checkoutUrl ? <a href={payment.checkoutUrl} rel="noopener noreferrer" className="flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#075b43] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#064b38]">Payer maintenant <ArrowRight size={17}/></a> : <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Le paiement n’est pas disponible pour le moment. Contactez l’entreprise.</p>}
              <p className="flex items-start gap-2 text-[11px] leading-5 text-slate-500"><ShieldCheck size={15} className="mt-0.5 shrink-0"/>Le paiement est traité de manière sécurisée. Ne communiquez jamais votre code secret Mobile Money à qui que ce soit.</p>
            </div>
          </> : null}
        </section>
        <p className="mt-5 text-center text-[11px] text-slate-400">Page de paiement créée par l’entreprise avec Pata</p>
      </div>
    </main>
  );
}
