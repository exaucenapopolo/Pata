'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error('[PATA GLOBAL ERROR]', error);
  }, [error]);

  return (
    <html lang="fr">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <main role="alert" className="grid min-h-screen place-items-center px-4 py-12">
          <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-700" aria-hidden="true">
              <span className="text-2xl font-bold">!</span>
            </div>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Pata</p>
            <h1 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">Une erreur inattendue est survenue</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              La page n’a pas pu être affichée correctement. Tes données ne sont pas supprimées.
              Réessaie ou retourne à l’accueil de Pata.
            </p>
            {error?.digest && (
              <p className="mt-3 break-all rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                Référence technique : {error.digest}
              </p>
            )}
            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => reset()}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#075b43] px-4 text-sm font-semibold text-white transition hover:bg-[#064a37]"
              >
                Réessayer
              </button>
              <a
                href="/"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Retour à l’accueil
              </a>
            </div>
            <a href="/support" className="mt-4 inline-flex min-h-10 items-center text-xs font-semibold text-slate-600 underline">
              Contacter l’assistance
            </a>
          </section>
        </main>
      </body>
    </html>
  );
}
