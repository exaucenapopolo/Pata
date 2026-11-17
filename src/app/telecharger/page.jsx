import { AndroidDownloadCard } from '@/components/AndroidDownloadCard';
import Link from 'next/link';

export const metadata = {
  title: 'Télécharger l’application Android',
  description: 'Télécharge l’application officielle Pata pour profiter de l’import automatique des SMS Mobile Money, de la notification permanente et des fonctions Android Premium.',
  alternates: { canonical: '/telecharger' },
};

export default function AndroidDownloadPage() {
  return (
    <main className="min-h-screen bg-[#f5f8f6] px-4 py-8 text-slate-900 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center gap-3">
          <img src="/android-chrome-192x192.png" alt="Pata" className="h-12 w-12 rounded-2xl" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#075b43]">Pata · Application officielle</p>
            <p className="text-xs text-slate-500">Téléchargement Android</p>
          </div>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#075b43]">Ton abonnement Premium</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Profite pleinement de Pata sur ton téléphone.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            L’application Android officielle donne accès aux fonctions qui doivent travailler directement avec ton téléphone. Connecte-toi ensuite avec le même compte Pata pour retrouver ton abonnement et tes données.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <article className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <h2 className="text-sm font-bold text-slate-900">Import automatique des SMS</h2>
              <p className="mt-2 text-xs leading-5 text-slate-600">Repère les opérations Mobile Money dans les SMS autorisés et prépare leur suivi dans Pata.</p>
            </article>
            <article className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <h2 className="text-sm font-bold text-slate-900">Notification permanente Pata</h2>
              <p className="mt-2 text-xs leading-5 text-slate-600">Retrouve rapidement les outils de saisie et les raccourcis financiers depuis la zone de notifications Android.</p>
            </article>
            <article className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <h2 className="text-sm font-bold text-slate-900">Widget financier Android</h2>
              <p className="mt-2 text-xs leading-5 text-slate-600">Consulte les informations essentielles de ton suivi directement depuis l’écran d’accueil.</p>
            </article>
            <article className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <h2 className="text-sm font-bold text-slate-900">Ton compte reste le même</h2>
              <p className="mt-2 text-xs leading-5 text-slate-600">Après installation, reconnecte-toi avec le même compte pour retrouver tes opérations et ton statut Premium.</p>
            </article>
          </div>

          <AndroidDownloadCard />
          <p className="mt-3 text-[11px] leading-5 text-slate-500">L’import des SMS nécessite l’autorisation Android correspondante. Les fonctions propres à Android ne sont disponibles qu’après installation et ouverture de l’application officielle.</p>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <Link href="/premium" className="font-semibold text-[#075b43] hover:underline">Consulter Premium</Link>
          <Link href="/login" className="text-slate-500 hover:underline">Se connecter à Pata</Link>
        </div>
      </div>
    </main>
  );
}
