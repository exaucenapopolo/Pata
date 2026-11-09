import Link from 'next/link';
import { LegalSummaryButton } from '@/components/legal/LegalSummaryButton';

export const metadata = {
  title: 'Conditions d’utilisation — Pata',
  description: 'Conditions d’utilisation de l’application Pata.',
};

const sections = [
  ['service', 'Objet et fonctionnement du service'],
  ['compte', 'Compte utilisateur et sécurité'],
  ['donnees', 'Données et exactitude des opérations'],
  ['outils', 'Analyses et assistante intelligente'],
  ['epargne', 'Budgets, objectifs et épargne'],
  ['paiements', 'Portefeuille, paiements et Premium'],
  ['usage', 'Utilisation acceptable'],
  ['disponibilite', 'Disponibilité et évolutions'],
  ['responsabilite', 'Responsabilité et limites'],
  ['propriete', 'Propriété intellectuelle'],
  ['fin', 'Fermeture du compte et contact'],
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

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f5f8f6] px-3 py-5 text-slate-800 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="overflow-hidden rounded-[28px] bg-gradient-to-br from-[#075b43] to-[#0b7657] p-5 text-white shadow-lg shadow-emerald-950/10 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/15">
              <img src="/android-chrome-192x192.png" alt="" className="h-6 w-6 rounded-lg bg-white object-contain"/> Retour à Pata
            </Link>
          </div>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">Cadre d’utilisation</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Conditions d’utilisation</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50">Les règles essentielles pour utiliser Pata, gérer tes informations financières et comprendre le fonctionnement du service.</p>
          <p className="mt-5 text-[11px] text-emerald-100">Mis à jour le 8 novembre 2026 · Éditeur : NAPOPOLO EXAUCE</p>
          <div className="mt-4"><LegalSummaryButton documentTitle="les conditions d’utilisation de Pata"/></div>
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
              <Link href="/confidentialite" className="mt-3 flex min-h-10 items-center justify-between rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-brand-800 hover:bg-brand-50">Politique de confidentialité <span>→</span></Link>
            </nav>
          </aside>

          <div className="space-y-3" data-legal-document>
            <Section id="service" number="01" title="Objet et fonctionnement du service">
              <p>Pata est une application de gestion financière personnelle. Elle permet notamment d’enregistrer les revenus et les dépenses, de préparer des budgets, de suivre des objectifs d’épargne, de consulter des rapports, d’utiliser un portefeuille intégré et de solliciter une assistante intelligente.</p>
              <p>Pata aide l’utilisateur à organiser les informations qu’il saisit. Sauf mention explicite dans une fonctionnalité, l’application ne se connecte pas automatiquement aux comptes bancaires externes et ne vérifie pas à elle seule les opérations réalisées en dehors de Pata.</p>
            </Section>

            <Section id="compte" number="02" title="Compte utilisateur et sécurité">
              <p>Un compte personnel est nécessaire pour accéder aux espaces privés. L’utilisateur doit fournir des informations exactes, conserver la confidentialité de ses identifiants et protéger les appareils sur lesquels sa session reste ouverte.</p>
              <p>Une activité inhabituelle ou une tentative d’accès non autorisé doit être signalée par le canal d’assistance disponible dans l’application. L’utilisateur ne doit jamais transmettre son code PIN Mobile Money, un mot de passe ou un code de validation à un tiers.</p>
            </Section>

            <Section id="donnees" number="03" title="Données et exactitude des opérations">
              <p>L’utilisateur reste responsable des montants, dates, catégories, sources de revenus, notes et informations complémentaires qu’il enregistre. Il doit vérifier les données avant de confirmer une opération et conserver ses justificatifs importants.</p>
              <p>Les soldes, bilans et statistiques sont calculés à partir des informations disponibles dans le compte. Une opération oubliée, saisie en double, mal catégorisée ou incorrecte peut modifier les résultats affichés.</p>
              <p>La saisie d’un lieu ou l’utilisation de la position GPS est facultative. Lorsque l’utilisateur demande la détection GPS, la position obtenue peut être associée à l’opération concernée. Pata ne doit pas être utilisé comme un service de suivi permanent des déplacements.</p>
            </Section>

            <Section id="outils" number="04" title="Analyses et assistante intelligente">
              <p>Les analyses, recommandations et réponses de l’assistante sont des outils d’information et d’organisation. Elles ne constituent pas un conseil financier, fiscal, juridique, comptable ou d’investissement réglementé et ne remplacent pas l’avis d’un professionnel.</p>
              <p>Les réponses automatiques peuvent être incomplètes ou nécessiter une vérification. L’utilisateur doit relire toute action proposée et confirmer les opérations qui modifient ses données ou son argent. Les outils connectés à l’assistante ne doivent pas être utilisés pour contourner une confirmation requise.</p>
              <p>Les messages et les informations strictement utiles à une demande peuvent être traités par les fournisseurs techniques d’intelligence artificielle configurés pour Pata. Il ne faut pas y saisir de codes secrets, de mots de passe ou d’informations de paiement confidentielles.</p>
            </Section>

            <Section id="epargne" number="05" title="Budgets, objectifs et épargne">
              <p>Les budgets et objectifs sont des outils de planification. Ils ne garantissent pas qu’un montant sera effectivement disponible ou épargné. L’utilisateur doit tenir compte de ses revenus, de ses dépenses, de ses engagements et de ses besoins essentiels avant de définir une contribution.</p>
              <p>Pour un objectif daté, un ajustement de retard de 7 % peut être calculé uniquement sur le montant qui reste réellement impayé à la date de chaque échéance manquée, à compter du 9 novembre 2026. Il n’est pas calculé sur le montant cible total. Le montant cumulé, lorsqu’il existe, est affiché dans le récapitulatif de l’objectif et déduit lors du retrait ou de la clôture. Les caisses et tirelires libres ne sont soumises à aucun ajustement lié aux échéances.</p>
              <p>Pata ne propose plus de micro-prêt pour financer les versements d’un objectif. Les avances historiques déjà enregistrées peuvent rester visibles dans l’historique du compte et être déduites ou remboursées selon leur solde restant ; aucune nouvelle avance ne peut être demandée.</p>
              <p>Les projections reposent sur les données disponibles et des hypothèses de calcul. Elles peuvent différer de la situation réelle et ne constituent pas une promesse de résultat.</p>
            </Section>

            <Section id="paiements" number="06" title="Portefeuille, paiements et Premium">
              <p>Le portefeuille Pata est une fonctionnalité interne de l’application. Les recharges, paiements et mouvements dépendent de la confirmation des prestataires concernés. Une demande initiée ne signifie pas nécessairement que le paiement est finalisé.</p>
              <p>Avant de confirmer une recharge, un paiement ou un retrait, l’utilisateur doit vérifier le montant, le numéro Mobile Money, le bénéficiaire et les éventuels frais indiqués. En cas de statut incertain, il convient de vérifier l’historique et de contacter l’assistance avant de répéter l’opération.</p>
              <p>L’offre Premium est proposée au tarif affiché dans l’application, actuellement 2 500 FCFA pour 30 jours. Les fonctions, quotas et conditions sont ceux présentés sur la page Premium au moment de l’achat. Le paiement n’est confirmé qu’après validation par le service concerné. Le renouvellement n’est pas automatique, sauf indication explicite contraire dans l’application.</p>
            </Section>

            <Section id="usage" number="07" title="Utilisation acceptable">
              <p>L’utilisateur s’engage à ne pas accéder au compte d’une autre personne, contourner les limites, perturber le service, exploiter une vulnérabilité, transmettre un contenu illicite ou utiliser Pata pour commettre une fraude.</p>
              <p>Une mesure temporaire de protection peut être appliquée lorsqu’une activité présente un risque pour les comptes, les paiements ou la sécurité du service. Les mesures prises doivent rester proportionnées au risque identifié.</p>
            </Section>

            <Section id="disponibilite" number="08" title="Disponibilité et évolutions">
              <p>Pata peut être mis à jour, maintenu ou temporairement indisponible pour des raisons techniques, de sécurité ou d’évolution du service. Certaines fonctions peuvent dépendre d’une connexion Internet, des autorisations de l’appareil ou de prestataires externes.</p>
              <p>Les notifications dépendent des autorisations accordées par l’utilisateur et de la disponibilité du système de notification. La détection de la position dépend du GPS, du navigateur, du système d’exploitation et des réglages de confidentialité de l’appareil.</p>
            </Section>

            <Section id="responsabilite" number="09" title="Responsabilité et limites">
              <p>L’utilisateur doit conserver les justificatifs et vérifier les résultats importants. Pata met en œuvre des mesures raisonnables pour assurer le fonctionnement du service, sans pouvoir garantir l’absence d’interruption, d’erreur de saisie, de panne d’un prestataire ou de perte liée à un incident extérieur.</p>
              <p>Dans les limites permises par la loi applicable, Pata ne peut être tenu responsable des décisions prises uniquement sur la base d’une projection ou d’une recommandation automatique non vérifiée, ni des conséquences d’informations incorrectes fournies par l’utilisateur.</p>
            </Section>

            <Section id="propriete" number="10" title="Propriété intellectuelle">
              <p>Les éléments de marque, interfaces, textes, illustrations, logiciels et contenus propres à Pata restent protégés par les droits applicables. L’accès à l’application n’accorde pas à l’utilisateur un droit de reproduire, revendre ou distribuer ces éléments en dehors des usages autorisés.</p>
            </Section>

            <Section id="fin" number="11" title="Fermeture du compte et contact">
              <p>L’utilisateur peut demander de l’aide pour la gestion ou la fermeture de son compte par le canal d’assistance intégré à Pata. Certaines informations peuvent devoir être conservées pendant une durée limitée pour traiter un paiement, prévenir une fraude ou satisfaire une obligation légale applicable.</p>
              <p>Pata est créé et exploité sous la responsabilité de NAPOPOLO EXAUCE. Les demandes relatives au service doivent être adressées au canal d’assistance affiché dans l’application.</p>
            </Section>

            <footer className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-6 text-slate-500">
              En utilisant Pata, l’utilisateur reconnaît avoir pu consulter ces conditions. Cette page doit être mise à jour lorsqu’une fonction, un tarif ou une règle importante du service change.
              <div className="mt-3 flex flex-wrap gap-3 font-semibold text-brand-800"><Link href="/confidentialite">Lire la politique de confidentialité</Link><Link href="/settings">Retour aux paramètres</Link></div>
            </footer>
          </div>
        </div>
      </div>
    </main>
  );
}
