import Link from 'next/link';

export const metadata = {
  title: 'Abonnement Pata Premium : fonctionnalités et prix',
  description: 'Compare Pata gratuit et Pata Premium. Découvre les capacités supplémentaires pour le budget, l’épargne, l’assistante Mč et le suivi Mobile Money, à 2 500 FCFA par mois.',
  alternates: { canonical: '/abonnement' },
  openGraph: {
    title: 'Pata Premium — abonnement à 2 500 FCFA par mois',
    description: 'Découvre les fonctions supplémentaires de Pata Premium et choisis le forfait adapté à ton suivi financier.',
    url: '/abonnement',
    images: ['/android-chrome-512x512.png'],
  },
};

const benefits = [
  ['Opérations financières', 'Enregistre davantage de revenus, dépenses et mouvements selon les limites du forfait.'],
  ['Budgets et objectifs', 'Organise plus de budgets et d’objectifs d’épargne pour suivre tes différents projets.'],
  ['Assistante Mč', 'Utilise davantage l’assistante financière pour comprendre tes données et préparer tes décisions.'],
  ['Suivi Mobile Money sur Android', 'Active le suivi des confirmations MTN MoMo et Orange Money lorsque ton appareil et ses autorisations le permettent.'],
  ['Dettes et prêts', 'Suis un nombre plus important de dettes et de créances actives.'],
  ['Rapports et organisation', 'Retrouve tes analyses, tes bilans et tes outils de planification dans un espace unique.'],
];

const offerStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Abonnement Pata Premium',
  description: 'Abonnement mensuel donnant accès aux capacités supplémentaires de Pata Premium.',
  brand: { '@type': 'Brand', name: 'Pata' },
  offers: {
    '@type': 'Offer',
    price: '2500',
    priceCurrency: 'XAF',
    availability: 'https://schema.org/InStock',
    url: 'https://www.pata-yam.site/abonnement',
  },
};

export default function SubscriptionPage() {
  const jsonLd = JSON.stringify(offerStructuredData).replace(/</g, '\\u003c');
  return (
    <main className="min-h-screen bg-[#f5f8f6] text-slate-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 font-extrabold text-[#075b43]"><img src="/android-chrome-192x192.png" alt="" className="h-9 w-9 rounded-xl"/> Pata</Link>
          <Link href="/fonctionnalites" className="text-sm font-semibold text-slate-600 hover:text-[#075b43]">Fonctionnalités</Link>
        </nav>
      </header>
      <section className="bg-gradient-to-br from-[#063d2e] to-[#0b7657] px-4 py-16 text-white sm:px-6 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-100">Offre Pata</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">Pata Premium pour aller plus loin dans ta gestion financière.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-emerald-50">Le compte gratuit permet de commencer ton suivi. Premium augmente les capacités disponibles et ouvre des outils avancés pour gérer tes opérations, ton épargne et ton suivi Mobile Money sur Android.</p>
          <div className="mt-8 inline-flex items-end gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 py-4">
            <span className="text-4xl font-extrabold">2 500</span><span className="pb-1 text-sm font-semibold text-emerald-50">FCFA / mois</span>
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/register" className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#075b43] hover:bg-emerald-50">Créer mon compte</Link>
            <Link href="/telecharger" className="rounded-xl border border-white/35 px-5 py-3 text-sm font-bold text-white hover:bg-white/10">Pata pour Android</Link>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ce que Premium apporte à ton suivi</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">Les capacités supplémentaires sont utiles lorsque tes opérations, tes objectifs et tes engagements deviennent plus nombreux.</p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          {benefits.map(([title, description]) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="border-y border-slate-200 bg-white px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-bold">Tu peux commencer gratuitement</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">Crée ton compte, découvre les rubriques essentielles puis active Premium lorsque tu as besoin de capacités supplémentaires. L’abonnement est proposé à 2 500 FCFA par mois.</p>
          <Link href="/register" className="mt-5 inline-flex rounded-xl bg-[#075b43] px-5 py-3 text-sm font-bold text-white hover:bg-[#064b38]">Commencer sur Pata</Link>
        </div>
      </section>
      <footer className="mx-auto flex max-w-5xl flex-wrap justify-between gap-3 px-4 py-8 text-xs text-slate-500 sm:px-6">
        <span>© {new Date().getFullYear()} Pata</span>
        <div className="flex gap-4"><Link href="/fonctionnalites">Fonctionnalités</Link><Link href="/conditions">Conditions</Link><Link href="/confidentialite">Confidentialité</Link></div>
      </footer>
    </main>
  );
}
