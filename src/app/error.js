'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, LifeBuoy, RefreshCw } from 'lucide-react';

export default function ErrorPage({ error, reset }) {
  const [isEnglish, setIsEnglish] = useState(false);

  useEffect(() => {
    setIsEnglish(typeof document !== 'undefined' && document.documentElement.lang === 'en');
  }, []);

  useEffect(() => {
    console.error('[PATA PAGE ERROR]', error);
  }, [error]);

  return (
    <main role="alert" className="grid min-h-[70dvh] place-items-center bg-slate-50 px-4 py-12 text-slate-900">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-700">
          <AlertTriangle size={27} />
        </span>
        <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Pata</p>
        <h1 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">
          {isEnglish ? 'This page encountered a problem' : 'Cette page a rencontré un problème'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {isEnglish
            ? 'Your account data has not been deleted. You can retry this page or contact the support team if the problem continues.'
            : 'Tes données de compte ne sont pas supprimées. Tu peux réessayer d’ouvrir cette page ou contacter l’assistance si le problème continue.'}
        </p>
        {error?.digest && (
          <p className="mt-3 break-all rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            {isEnglish ? 'Technical reference' : 'Référence technique'} : {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#075b43] px-4 text-sm font-semibold text-white transition hover:bg-[#064a37]"
          >
            <RefreshCw size={16} />
            {isEnglish ? 'Try again' : 'Réessayer'}
          </button>
          <a
            href="/support"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <LifeBuoy size={16} />
            {isEnglish ? 'Contact support' : 'Contacter l’assistance'}
          </a>
        </div>
      </section>
    </main>
  );
}
