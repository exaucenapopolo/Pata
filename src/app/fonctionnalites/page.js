import Link from 'next/link';

const SITE_URL = 'https://www.pata-yam.site';
const features = [
  { title: 'Suivi des revenus et des dépenses', description: 'Enregistre les entrées et sorties d’argent, classe les opérations et retrouve les mouvements qui expliquent l’évolution de ton solde.' },
  { title: 'Budgets par catégorie', description: 'Prépare des montants pour l’alimentation, le transport, le logement ou d’autres postes. Compare ensuite les dépenses réelles à ce que tu avais prévu.' },
  { title: 'Épargne et objectifs', description: 'Crée un objectif avec un montant à atteindre ou utilise une épargne libre. Ajoute tes versements et observe la progression.' },
  { title: 'Dettes, prêts et remboursements', description: 'Distingue les sommes que tu dois de celles que l’on doit te rembourser. Conserve les échéances, les paiements reçus et les soldes restants.' },
  { title: 'Factures et échéances', description: 'Centralise les dates de paiement du loyer, de l’électricité, de l’eau, d’Internet, de la scolarité et des autres factures.' },
  { title: 'Cotisations et tontines', description: 'Crée un groupe, invite les participants, fixe les règles, organise l’ordre de passage et suis les versements de chaque période.' },
  { title: 'Suivi Mobile Money sur Android', description: 'Avec Pata Premium sur Android, certaines confirmations MTN MoMo et Orange Money peuvent être détectées pour faciliter le suivi des opérations. La disponibilité dépend des autorisations et des réglages du téléphone.' },
  { title: 'Assistante financière Mč', description: 'Pose des questions sur tes opérations et demande des explications ou des pistes d’action à partir des informations enregistrées dans ton espace.' },
  { title: 'Rapports et analyses', description: 'Consulte des bilans, compare différentes périodes et repère les catégories qui pèsent le plus dans tes dépenses.' },
];

export const metadata = {
  title: 'Fonctionnalités de Pata : budget, épargne et cotisations',
  description: 'Découvre Pata, l’application de gestion financière au Cameroun pour suivre revenus, dépenses, budgets, épargne, dettes, factures, tontines et Mobile Money.',
  alternates: { canonical: '/fonctionnalites' },
  openGraph: {
    title: 'Les fonctionnalités de Pata',
    description: 'Une seule application pour suivre ton argent, organiser tes projets et gérer tes cotisations.',
    url: '/fonctionnalites',
    images: ['/android-chrome-512x512.png'],
  },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Pata',
  url: SITE_URL,
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web, Android',
  description: 'Application de gestion de budget personnel : revenus, dépenses, épargne, dettes, factures et cotisations.',
  isAccessibleForFree: true,
  offers: {
    '@type': 'Offer',
    name: 'Pata Premium',
    price: '2500',
    priceCurrency: 'XAF',
    url: SITE_URL + '/abonnement',
    description: 'Abonnement mensuel Pata Premium.',
  },
};

export default function FeaturesPage() {
  const jsonLd = JSON.stringify(structuredData).replace(/</g, '\\u003c');
  return (
    <main className="min-h-screen bg-[#f5f8f6] text-slate-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <header className="border-b border-emerald-950/10 bg-white">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 font-extrabold tracking-tight text-[#075b43]">
            <img src="/android-chrome-192x192.png" alt="" className="h-9 w-9 rounded-xl" /> Pata
          </Link>
          <div className="flex items-center gap-3 text-sm font-semibold">
            <Link href="/abonnement" className="hidden text-slate-600 hover:text-[#075b43] sm:inline">Abonnement</Link>
            <Link href="/register" className="rounded-xl bg-[#075b43] px-4 py-2.5 text-white hover:bg-[#064b38]">Créer un compte</Link>
          </div>
        </nav>
      </header>
      <section className="bg-gradient-to-br from-[#063d2e] via-[#075b43] to-[#0b7657] px-4 py-16 text-white sm:px-6 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-100">Gestion financière personnelle</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight sm:text-5xl">Une application de gestion de budget pour mieux organiser ton argent.</h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-emerald-50 sm:text-lg">
            Pata t’aide à comprendre ce que tu gagnes, ce que tu dépenses et ce que tu souhaites préparer. Depuis un seul espace, tu peux suivre tes opérations en FCFA, planifier ton épargne, anticiper tes échéances et organiser tes cotisations.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#075b43] transition hover:bg-emerald-50">Commencer gratuitement</Link>
            <Link href="/abonnement" className="rounded-xl border border-white/35 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10">Découvrir Premium</Link>
          </div>
          <p className="mt-5 text-xs text-emerald-100">Pata est accessible sur le Web. Le suivi automatique de certaines confirmations Mobile Money est proposé sur Android avec Premium.</p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#0b7657]">Les outils de Pata</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Un suivi clair, de l’opération quotidienne aux projets à long terme.</h2>
          <p className="mt-4 text-sm leading-7 text-slate-600">L’objectif n’est pas de compliquer la gestion de ton argent. Pata regroupe les informations utiles pour t’aider à prendre des décisions plus réfléchies, avec des rubriques que tu peux utiliser progressivement.</p>
        </div>
        <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <article key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold text-[#0b7657]">0{index + 1}</p>
              <h3 className="mt-3 text-lg font-bold tracking-tight">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="border-y border-slate-200 bg-white px-4 py-14 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1.2fr_.8fr] md:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#0b7657]">Pensé pour un usage concret</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">Garde une vue d’ensemble sans confondre ton argent et tes engagements.</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">Un remboursement de dette, un emprunt, une dépense courante, une cotisation ou un transfert vers une épargne ne racontent pas la même chose. Pata sépare ces mouvements afin de rendre tes rapports et tes soldes plus compréhensibles.</p>
          </div>
          <div className="rounded-2xl bg-[#f1f7f3] p-6">
            <p className="text-sm font-bold text-[#075b43]">Découvre les possibilités de Pata</p>
            <div className="mt-4 grid gap-2">
              <Link href="/abonnement" className="rounded-xl bg-[#075b43] px-4 py-3 text-center text-sm font-bold text-white">Voir les offres Pata</Link>
              <Link href="/telecharger" className="rounded-xl border border-[#075b43]/20 bg-white px-4 py-3 text-center text-sm font-semibold text-[#075b43]">Télécharger pour Android</Link>
              <Link href="/support" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-700">Contacter l’assistance</Link>
            </div>
          </div>
        </div>
      </section>
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-xs text-slate-500 sm:px-6">
        <span>© {new Date().getFullYear()} Pata. Tous droits réservés.</span>
        <div className="flex flex-wrap gap-4"><Link href="/conditions">Conditions</Link><Link href="/confidentialite">Confidentialité</Link><Link href="/support">Assistance</Link></div>
      </footer>
    </main>
  );
}
