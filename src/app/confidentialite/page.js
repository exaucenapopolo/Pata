import Link from 'next/link';

export const metadata = {
  title: 'Politique de confidentialité — Pata',
  description: 'Comment Pata utilise et protège les données personnelles de ses utilisateurs.',
};

const sections = [
  ['donnees', 'Données traitées'],
  ['finalites', 'Pourquoi les données sont utilisées'],
  ['localisation', 'Position et données facultatives'],
  ['assistant', 'Assistante intelligente et prestataires'],
  ['partage', 'Partage et transferts'],
  ['conservation', 'Conservation et sécurité'],
  ['droits', 'Choix et droits des utilisateurs'],
  ['mineurs', 'Mineurs et évolution de la politique'],
  ['responsable', 'Responsable du traitement'],
];

function Section({ id, number, title, children }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xs font-bold text-brand-800">{number}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">{title}</h2>
          <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600">{children}</div>
        </div>
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f5f8f6] px-3 py-5 text-slate-800 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="overflow-hidden rounded-[28px] bg-gradient-to-br from-[#075b43] to-[#0b7657] p-5 text-white shadow-lg shadow-emerald-950/10 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15">
              <img src="/android-chrome-192x192.png" alt="" className="h-6 w-6 rounded-lg bg-white object-contain"/> Retour à Pata
            </Link>
            <span className="rounded-full bg-white/15 px-3 py-1.5 text-[10px] font-semibold tracking-wide text-emerald-50">VIE PRIVÉE</span>
          </div>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">Tes informations personnelles</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Politique de confidentialité</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50">Cette page explique quelles informations Pata utilise, pourquoi elles sont nécessaires et les choix que tu gardes sur tes données.</p>
          <div className="mt-6 flex flex-wrap items-center gap-2 text-[11px] text-emerald-100">
            <span className="rounded-full border border-white/20 px-3 py-1.5">Mis à jour le 8 novembre 2026</span>
            <span className="rounded-full border border-white/20 px-3 py-1.5">Responsable : NAPOPOLO EXAUCE</span>
          </div>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-5">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Dans ce document</p>
            <nav className="space-y-1">
              {sections.map(([id, label], index) => (
                <a key={id} href={'#' + id} className="flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs font-medium text-slate-600 transition hover:bg-brand-50 hover:text-brand-800">
                  <span className="w-5 text-[10px] font-bold text-slate-400">{String(index + 1).padStart(2, '0')}</span>{label}
                </a>
              ))}
              <Link href="/conditions" className="mt-3 flex min-h-10 items-center justify-between rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-brand-800 hover:bg-brand-50">Conditions d’utilisation <span>→</span></Link>
            </nav>
          </aside>

          <div className="space-y-3">
            <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4 text-xs leading-6 text-brand-900">
              Pata n’utilise pas la géolocalisation en continu. La position n’est demandée que lorsque tu lances volontairement la détection dans une opération. Tu peux refuser cette autorisation et continuer à utiliser les fonctions principales de l’application.
            </div>

            <Section id="donnees" number="01" title="Données traitées">
              <p>Selon les fonctions que tu utilises, Pata peut traiter les catégories d’informations suivantes :</p>
              <ul className="list-disc space-y-1 pl-5">
                <li><strong>Compte et profil :</strong> adresse e-mail, nom affiché, identifiant de compte, préférences et informations nécessaires à la connexion.</li>
                <li><strong>Informations financières :</strong> revenus, dépenses, dates, catégories, budgets, objectifs, versements, opérations du portefeuille et données d’abonnement.</li>
                <li><strong>Détails facultatifs :</strong> notes, moyen de paiement, client ou bénéficiaire, heure et lieu associés à une opération.</li>
                <li><strong>Localisation :</strong> coordonnées GPS et précision estimée, uniquement lorsque tu demandes explicitement la détection de ta position.</li>
                <li><strong>Utilisation du service :</strong> notifications, paramètres de l’application, demandes à l’assistante et informations techniques nécessaires à la sécurité et au diagnostic.</li>
              </ul>
            </Section>

            <Section id="finalites" number="02" title="Pourquoi les données sont utilisées">
              <p>Les informations servent à créer et sécuriser ton compte, enregistrer les opérations, calculer les soldes, afficher les budgets et objectifs, produire les rapports, gérer les abonnements, traiter les paiements, envoyer les notifications autorisées et répondre aux demandes adressées à l’assistante.</p>
              <p>Certaines données techniques peuvent aussi être utilisées pour détecter des erreurs, prévenir les abus, protéger les comptes et maintenir la disponibilité du service. Pata ne vend pas les données personnelles de ses utilisateurs.</p>
            </Section>

            <Section id="localisation" number="03" title="Position et données facultatives">
              <p>La localisation est facultative. Lorsque tu appuies sur « Détecter automatiquement ma position », le navigateur ou le système du téléphone peut demander ton autorisation. Si tu l’accordes, Pata reçoit les coordonnées disponibles et peut les enregistrer avec la dépense ou le revenu concerné.</p>
              <p>La position n’est pas suivie en arrière-plan par cette fonctionnalité. Tu peux refuser ou retirer la position d’une opération avant de l’enregistrer. Tu peux également désactiver l’autorisation de localisation dans les réglages du navigateur ou du téléphone.</p>
              <p>La précision dépend du GPS, du réseau, de l’appareil et de l’environnement. Une position peut être approximative ou indisponible ; elle ne doit pas être considérée comme une preuve de présence ou de paiement.</p>
            </Section>

            <Section id="assistant" number="04" title="Assistante intelligente et prestataires">
              <p>Lorsque tu sollicites l’assistante, ton message et les informations financières strictement utiles à la demande peuvent être transmis aux fournisseurs d’intelligence artificielle configurés par Pata afin de produire une réponse ou d’exécuter une action demandée.</p>
              <p>Les conversations peuvent être conservées dans ton compte pour te permettre de retrouver ton historique. Dans le cadre de l’assistance, de la sécurité et de la prévention des abus, le responsable de Pata et les personnes expressément autorisées peuvent consulter certaines informations lorsque cela est nécessaire.</p>
              <p>N’envoie jamais de code PIN Mobile Money, de mot de passe, de code à usage unique ou de secret bancaire à l’assistante. Les fournisseurs externes appliquent également leurs propres conditions et politiques, qui peuvent être consultées auprès d’eux.</p>
            </Section>

            <Section id="partage" number="05" title="Partage et transferts">
              <p>Les informations peuvent être traitées par les prestataires nécessaires au fonctionnement de Pata, notamment pour l’hébergement, la base de données, l’authentification, les paiements, les notifications et l’intelligence artificielle. Ces prestataires n’interviennent que dans le cadre des services techniques concernés.</p>
              <p>Les données peuvent également être communiquées lorsqu’une obligation légale l’exige ou lorsqu’une communication limitée est nécessaire pour protéger les utilisateurs, les comptes ou le service.</p>
              <p>Certains prestataires peuvent traiter des données depuis d’autres pays. Les conditions de protection et de transfert dépendent des services utilisés et des règles applicables. Les noms des prestataires et leurs politiques peuvent évoluer avec l’architecture de Pata.</p>
            </Section>

            <Section id="conservation" number="06" title="Conservation et sécurité">
              <p>Les données sont conservées tant que le compte fonctionne ou aussi longtemps que nécessaire pour fournir le service, conserver l’historique demandé, traiter les paiements, prévenir les abus et respecter les obligations applicables.</p>
              <p>Pata utilise des contrôles d’accès et des communications sécurisées adaptés à son fonctionnement. Aucun service connecté à Internet ne peut toutefois garantir un risque nul. Il est recommandé de protéger l’accès à ton appareil et à ton compte.</p>
            </Section>

            <Section id="droits" number="07" title="Choix et droits des utilisateurs">
              <p>Tu peux modifier le nom affiché, la devise et certaines préférences dans Paramètres. Tu peux refuser la géolocalisation, retirer une position associée à une opération avant son enregistrement et désactiver les notifications depuis ton appareil ou les paramètres de Pata.</p>
              <p>Pour demander l’accès à tes informations, leur rectification ou des renseignements sur leur suppression, utilise le canal d’assistance disponible dans l’application. Des vérifications peuvent être nécessaires pour confirmer que la demande provient bien du titulaire du compte.</p>
              <p>La suppression de certaines informations peut être limitée lorsqu’elles sont nécessaires au traitement d’un paiement, à la sécurité ou à une obligation légale applicable.</p>
            </Section>

            <Section id="mineurs" number="08" title="Mineurs et évolution de la politique">
              <p>Pata est conçu pour des personnes capables de gérer un compte personnel et de comprendre les conséquences de l’enregistrement d’opérations financières. Un parent ou représentant légal doit accompagner toute utilisation lorsque la loi applicable l’exige.</p>
              <p>Cette politique peut évoluer lorsque les fonctionnalités, les prestataires ou les règles applicables changent. La date de mise à jour affichée en haut de page indique la dernière révision publiée.</p>
            </Section>

            <Section id="responsable" number="09" title="Responsable du traitement">
              <p>Pata est créé et exploité sous la responsabilité de NAPOPOLO EXAUCE. Pour toute question sur les données ou pour exercer une demande, utilise le canal d’assistance affiché dans l’application.</p>
              <p>Cette politique est une information destinée aux utilisateurs. Elle doit être revue par un professionnel du droit et de la protection des données afin de confirmer son adéquation aux pays dans lesquels Pata est proposé.</p>
            </Section>

            <footer className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-6 text-slate-500">
              Pata ne vend pas tes informations personnelles. Les données nécessaires à une fonctionnalité ne sont utilisées que pour fournir, sécuriser ou améliorer le service décrit dans cette politique.
              <div className="mt-3 flex flex-wrap gap-3 font-semibold text-brand-800"><Link href="/conditions">Lire les conditions d’utilisation</Link><Link href="/settings">Retour aux paramètres</Link></div>
            </footer>
          </div>
        </div>
      </div>
    </main>
  );
}
