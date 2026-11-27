'use client';

import Link from 'next/link';
import { CheckCircle2, ShieldCheck } from 'lucide-react';

export default function BusinessPaymentReturnPage() {
  return (
    <main className="flex min-h-[75vh] items-center justify-center px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <CheckCircle2 size={28}/>
        </span>
        <h1 className="mt-4 text-xl font-bold text-slate-900">Merci pour votre paiement</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Votre paiement est en cours de confirmation auprès de Fapshi. L’entreprise pourra vérifier le règlement dans son espace professionnel dès que Fapshi aura confirmé la transaction.
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck size={14}/> Ne partagez jamais votre code secret Mobile Money.
        </p>
        <Link href="/" className="mt-6 inline-flex min-h-10 items-center justify-center rounded-xl bg-[#075b43] px-5 text-sm font-semibold text-white">
          Retourner sur Pata
        </Link>
      </section>
    </main>
  );
}
