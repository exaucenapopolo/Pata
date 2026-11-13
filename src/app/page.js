import Link from 'next/link';
import OnboardingHome from '@/components/OnboardingHome';

export const metadata = {
  title: 'Gestion de budget personnel au Cameroun',
  description: 'Pata est une application de gestion financière pour suivre tes revenus, dépenses, budgets, épargne, dettes, factures et cotisations, avec une assistante intelligente et un suivi Mobile Money sur Android.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Pata — gestion de budget et finances personnelles',
    description: 'Suis tes revenus, dépenses, budgets, épargne et cotisations dans une application conçue pour organiser ton argent au quotidien.',
    url: '/',
    images: ['/android-chrome-512x512.png'],
  },
};

export default function HomePage() {
  return (
    <>
      <OnboardingHome />
      <main className="bg-[#f5f8f6] text-slate-900">
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#0b7657]">Pata · Finances personnelles</p>
          <h1 className="mt-3 max-w-4xl text-3xl font-extrabold tracking-tight sm:text-5xl">
            Gère ton budget, tes revenus et ton épargne dans une seule application.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600">
            Pata t’aide à suivre ce que tu gagnes, ce que tu dépenses et les engagements que tu prépares. Tu peux organiser tes budgets, suivre tes objectifs d’épargne, gérer tes dettes et tes factures, et retrouver tes cotisations au même endroit.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/register" className="rounded-xl bg-[#075b43] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#064b38]">Créer mon compte</Link>
            <Link href="/fonctionnalites" className="rounded-xl border border-[#075b43]/20 bg-white px-5 py-3 text-sm font-semibold text-[#075b43] transition hover:bg-emerald-50">Voir toutes les fonctionnalités</Link>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-2">
            <article>
              <h2 className="text-xl font-bold tracking-tight">Suivre ses revenus et ses dépenses</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">Enregistre tes entrées et sorties d’argent, classe les opérations et repère les catégories qui pèsent le plus sur ton budget.</p>
              <Link href="/fonctionnalites" className="mt-3 inline-flex text-sm font-semibold text-[#075b43]">Découvrir le suivi financier</Link>
            </article>
            <article>
              <h2 className="text-xl font-bold tracking-tight">Préparer un budget et atteindre ses objectifs</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">Définis des montants réalistes, observe les dépenses réelles et suis la progression de tes projets d’épargne.</p>
              <Link href="/fonctionnalites" className="mt-3 inline-flex text-sm font-semibold text-[#075b43]">Voir les outils de budget</Link>
            </article>
            <article>
              <h2 className="text-xl font-bold tracking-tight">Anticiper les dettes et les factures</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">Garde une trace des remboursements à faire ou à recevoir, et retrouve les dates de paiement de tes factures récurrentes.</p>
              <Link href="/fonctionnalites" className="mt-3 inline-flex text-sm font-semibold text-[#075b43]">Explorer les échéances</Link>
            </article>
            <article>
              <h2 className="text-xl font-bold tracking-tight">Organiser les tontines et cotisations</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">Crée des groupes, invite les membres, fixe l’ordre de passage et suis les versements de chaque période.</p>
              <Link href="/fonctionnalites" className="mt-3 inline-flex text-sm font-semibold text-[#075b43]">Découvrir les cotisations</Link>
            </article>
          </div>
        </section>

        <section className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-4 py-14 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight">Commence gratuitement, puis choisis les capacités dont tu as besoin.</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">Pata propose un compte gratuit pour débuter et un abonnement Premium à 2 500 FCFA par mois pour augmenter les capacités et accéder au suivi Mobile Money sur Android.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/abonnement" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Comparer les abonnements</Link>
            <Link href="/telecharger" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Télécharger Android</Link>
            <Link href="/support" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Assistance</Link>
          </div>
        </section>
        <footer className="border-t border-slate-200 bg-white px-4 py-6 text-xs text-slate-500 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3">
            <span>© {new Date().getFullYear()} Pata · Gestion financière personnelle</span>
            <div className="flex flex-wrap gap-4"><Link href="/conditions">Conditions d’utilisation</Link><Link href="/confidentialite">Confidentialité</Link><Link href="/support">Support</Link></div>
          </div>
        </footer>
      </main>
    </>
  );
}
