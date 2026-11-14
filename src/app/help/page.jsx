'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, ChevronDown, Mail, MessageCircle, Phone, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

const HELP_FR = [
  {
    title: 'Compte, profil et sécurité',
    items: [
      { q: 'Comment modifier mon profil et ma photo ?', a: 'Ouvre Paramètres, puis Informations personnelles pour modifier les informations de ton compte. Pour la photo, appuie sur Modifier et choisis un avatar ou téléverse une image. Tu peux changer cette photo plus tard.' },
      { q: 'Comment activer ou changer mon mot de passe ?', a: 'Dans Paramètres → Mot de passe, tu peux ajouter un mot de passe à un compte créé avec Google, ou remplacer celui qui existe déjà. Pour un changement, Pata te demandera ton ancien mot de passe. Ne communique jamais ton mot de passe à l’assistance.' },
      { q: 'À quoi sert le code secret à 4 chiffres ?', a: 'Le code secret ajoute un verrou à l’ouverture de ton espace Pata sur l’appareil. Configure-le dans Paramètres → Code secret. Il est distinct du mot de passe utilisé pour te connecter à ton compte.' },
      { q: 'Comment passer du mode clair au mode sombre ?', a: 'Va dans Paramètres → Apparence de Pata, puis sélectionne Clair ou Sombre. Ton choix est enregistré sur ton profil et sera repris lors de tes prochaines connexions.' },
      { q: 'Comment changer la langue ?', a: 'Ouvre Paramètres et utilise le réglage de langue pour choisir Français ou English. Les libellés de l’application s’adaptent à ton choix.' },
    ],
  },
  {
    title: 'Revenus et dépenses',
    items: [
      { q: 'Comment ajouter un revenu ?', a: 'Ouvre Revenus, puis Ajouter. Saisis le montant, choisis une catégorie et indique le nom réel de la source : par exemple « Salaire novembre », « Vente ordinateur » ou « Mission client A ». La catégorie classe le revenu ; elle ne remplace pas son nom. Tu peux aussi ajouter une photo facultative.' },
      { q: 'Quelle est la différence entre le nom et la catégorie d’un revenu ?', a: 'Le nom indique d’où vient précisément l’argent. La catégorie indique sa nature (salaire, vente, activité, loyer, cadeau…). Ces deux informations sont indépendantes. Changer la catégorie ne doit pas renommer ta source.' },
      { q: 'Comment savoir ce que j’ai dépensé à partir d’un revenu ?', a: 'Dans Revenus, appuie sur la source concernée. La fiche affiche le total dépensé, le montant restant estimé et les dépenses associées, avec leur date, leur catégorie et leur montant. Pour limiter les lectures, le détail montre au maximum 50 opérations ; le total, lui, couvre toutes les dépenses liées.' },
      { q: 'Pourquoi le montant d’un revenu est-il parfois verrouillé ?', a: 'Dès qu’au moins une dépense est rattachée à ce revenu, même de 1 FCFA, son montant d’origine ne peut plus être modifié. Cela protège l’historique et évite de changer rétroactivement l’argent réellement reçu. Tu peux toujours modifier son nom, sa catégorie, sa photo et ses autres informations.' },
      { q: 'Comment ajouter une dépense ?', a: 'Ouvre Dépenses, puis Ajouter. Renseigne le montant, le motif ou le nom de l’achat, la catégorie et la date. Sélectionne la source de revenu qui finance cette dépense lorsque l’option est proposée. Ajoute une note pour préciser ce que tu as acheté ou payé.' },
      { q: 'Pourquoi associer une dépense à une source de revenu ?', a: 'Cette association permet à Pata de calculer combien de cette source a été utilisé, ce qui reste et les postes qui ont consommé l’argent. Choisis la bonne source au moment de l’enregistrement pour conserver un suivi cohérent.' },
    ],
  },
  {
    title: 'Budgets, épargne et organisation',
    items: [
      { q: 'Comment créer un budget ?', a: 'Ouvre Budgets, choisis le mois et sélectionne une catégorie de dépense. Indique le montant maximal que tu souhaites consacrer à cette catégorie, puis enregistre. Tu peux créer plusieurs enveloppes et consulter les montants consommés au fil du mois.' },
      { q: 'Comment créer un objectif d’épargne ?', a: 'Va dans Épargnes, puis crée un objectif. Donne-lui un nom, un montant cible et les dates ou la fréquence proposées. Une fois créé, ouvre l’objectif pour ajouter des versements et suivre sa progression.' },
      { q: 'À quoi sert une tirelire ?', a: 'La tirelire sert à mettre de l’argent de côté de manière flexible, sans forcément fixer une échéance comme pour un objectif. Tu peux consulter son solde et son historique depuis la rubrique Épargnes.' },
      { q: 'Comment créer un projet ?', a: 'Ouvre la rubrique Projets et ajoute un projet avec son nom et ses informations. Tu peux ensuite associer certaines opérations ou certains revenus au projet afin de suivre séparément les fonds qui lui sont destinés.' },
      { q: 'Comment suivre une dette, un prêt ou un remboursement ?', a: 'Ouvre Dettes & prêts. Enregistre une somme que tu dois ou qu’on te doit, renseigne la personne, le montant et l’échéance. Utilise ensuite l’action de remboursement correspondante pour garder le montant restant et l’historique à jour.' },
      { q: 'Comment créer une cotisation ou une tontine ?', a: 'Ouvre Cotisations, puis Nouveau groupe. Ajoute le nom et les informations du groupe, définis le montant, la fréquence et la date de départ. Enregistre le groupe, partage le lien d’invitation avec les membres, organise leur ordre de passage, puis lance la cotisation lorsque tout est prêt.' },
      { q: 'Comment communiquer avec les membres d’une cotisation ?', a: 'Ouvre le groupe concerné dans Cotisations et accède à sa conversation. Tu peux y consulter les messages et échanger avec les membres. Vérifie que tu es dans le bon groupe avant d’envoyer un message ou de partager une information.' },
      { q: 'Comment programmer une dépense récurrente ?', a: 'Ouvre Dépenses et utilise la fonction de programmation lorsqu’elle est disponible. Définis le montant, la catégorie et la fréquence. Tu pourras retrouver l’opération dans les automatismes pour la mettre en pause ou la reprendre.' },
    ],
  },
  {
    title: 'Mč, l’assistante intelligente',
    items: [
      { q: 'Qui est Mč et à quoi sert-elle ?', a: 'Mč est l’assistante intelligente de Pata. Elle peut t’aider à comprendre tes revenus et tes dépenses, analyser ton équilibre financier, expliquer des fonctions et préparer des actions à partir de tes demandes. Elle s’appuie sur les informations disponibles dans ton compte ; vérifie toujours les montants et les opérations proposés.' },
      { q: 'Comment lancer une conversation avec Mč ?', a: 'Appuie sur le bouton de l’assistante dans Pata. Écris ta question comme tu la poserais à une personne : « Où est-ce que je dépense le plus ? », « Aide-moi à préparer un budget » ou « Ajoute une dépense de 2 000 FCFA pour le transport ». Donne les détails nécessaires et vérifie les informations avant de confirmer une opération.' },
      { q: 'À quoi servent les commandes @Audio, @Image et @Vision ?', a: 'Dans la conversation, saisis le symbole @ pour afficher les commandes. @Audio demande une réponse vocale. @Image sert à demander la création d’une image : décris précisément ce que tu souhaites. @Vision sert à analyser une image : joins d’abord la photo ou le document, puis pose ta question.' },
      { q: 'Mč peut-elle modifier mes données sans mon accord ?', a: 'Ne valide jamais une action si son montant, sa catégorie ou sa destination ne correspond pas à ce que tu souhaites. Relis les détails de la proposition et confirme uniquement l’opération correcte. Pour une simple analyse, précise à Mč de ne modifier aucune donnée.' },
    ],
  },
  {
    title: 'Rapports, Android et abonnement',
    items: [
      { q: 'Où consulter mes rapports financiers ?', a: 'Ouvre Rapports pour retrouver les synthèses de tes revenus et dépenses et observer leur évolution selon les périodes disponibles. Utilise les filtres de dates proposés pour examiner une période précise.' },
      { q: 'Comment exporter mes données ?', a: 'Va dans Paramètres → Exporter mes données. Choisis le type d’export disponible et la période souhaitée, puis télécharge le fichier généré. Conserve ces documents dans un endroit sûr.' },
      { q: 'Comment installer l’application Android ?', a: 'Ouvre Paramètres → Télécharger l’application Android ou visite la page Télécharger. Télécharge le fichier officiel, ouvre-le depuis les téléchargements, puis suis les étapes affichées par Android. Connecte-toi avec le même compte que sur le site.' },
      { q: 'À quoi sert l’import SMS Mobile Money ?', a: 'Sur Android, cette fonction peut détecter les confirmations MTN MoMo et Orange Money sur ton téléphone pour faciliter le suivi des opérations. Active-la dans Paramètres → Import SMS Mobile Money et accorde les autorisations demandées. L’enregistrement automatique des opérations nécessite Pata Premium.' },
      { q: 'Quelle est la différence entre le compte gratuit et Premium ?', a: 'Le compte gratuit permet de découvrir les fonctions de base avec des limites mensuelles sur certaines créations et prévisions. Premium augmente ces capacités et débloque notamment le suivi automatique des confirmations Mobile Money sur Android. Consulte la page Abonnement pour les conditions à jour.' },
    ],
  },
];

const HELP_EN = [
  {
    title: 'Account, profile and security',
    items: [
      { q: 'How do I update my profile photo?', a: 'Open Settings → Personal information. Choose Edit, then select an avatar or upload your own image. You can change it again later.' },
      { q: 'How do I add or change my password?', a: 'Open Settings → Password. You can add a password to a Google-linked account or change an existing one. Pata asks for your current password before changing it. Never share your password with support.' },
      { q: 'What is the four-digit security PIN for?', a: 'The PIN adds a lock when opening your personal Pata space on this device. Set it in Settings → Security PIN. It is separate from the password used to sign in.' },
      { q: 'How do I switch between light and dark mode?', a: 'Go to Settings → Pata appearance and choose Light or Dark. Your preference is saved to your profile.' },
      { q: 'How do I change the language?', a: 'Open Settings and choose French or English in the language setting. App labels will adapt to your choice.' },
    ],
  },
  {
    title: 'Income and expenses',
    items: [
      { q: 'How do I add income?', a: 'Open Income, then Add. Enter the amount, choose a category and provide the actual source name, such as “November salary” or “Computer sale”. The category classifies the entry; it does not replace its name. You may also add an optional photo.' },
      { q: 'What is the difference between an income name and category?', a: 'The name identifies where the money came from. The category describes its type, such as salary, sales, business, rent or gift. They are separate fields.' },
      { q: 'How can I see what I spent from an income source?', a: 'In Income, tap the source. Its details show total spending, estimated remaining money and linked expenses, with dates, categories and amounts. To keep reads low, up to 50 individual expenses are shown; the total includes all linked expenses.' },
      { q: 'Why is an income amount sometimes locked?', a: 'As soon as at least one expense is linked to an income source, even 1 XAF, its original amount cannot be changed. This protects the financial history. You can still edit its name, category, photo and other details.' },
      { q: 'How do I add an expense?', a: 'Open Expenses, then Add. Enter the amount, purchase or payment description, category and date. Select the income source funding the expense when prompted. Add a note to clarify what you paid for.' },
      { q: 'Why link an expense to an income source?', a: 'This lets Pata calculate how much of that income has been used, what remains and which spending categories consumed it. Choose the correct source when recording the expense.' },
    ],
  },
  {
    title: 'Budgets, savings and planning',
    items: [
      { q: 'How do I create a budget?', a: 'Open Budgets, choose a month and select an expense category. Enter the maximum amount for that category and save. You can create several envelopes and monitor spending during the month.' },
      { q: 'How do I create a savings goal?', a: 'Open Savings and create a goal. Give it a name, target amount and the dates or frequency requested. Open the goal later to add contributions and track progress.' },
      { q: 'What is a savings pocket?', a: 'A savings pocket lets you set money aside flexibly, without necessarily setting a deadline like a goal. Its balance and history are available in Savings.' },
      { q: 'How do I create a project?', a: 'Open Projects and add a project with its name and details. You can associate selected transactions or income sources with it to track the money assigned to that project.' },
      { q: 'How do I track a debt, loan or repayment?', a: 'Open Debts & Loans. Record what you owe or what someone owes you, including the person, amount and due date. Use the relevant repayment action to keep the remaining balance and history up to date.' },
      { q: 'How do I create a contribution or rotating savings group?', a: 'Open Contributions, then New group. Enter the group information, amount, frequency and start date. Save the group, share its invitation link, arrange members’ order and start the contribution cycle when ready.' },
      { q: 'How do I chat with contribution group members?', a: 'Open the group in Contributions and access its conversation. You can review messages and communicate with members. Check that you are in the correct group before sending.' },
      { q: 'How do I schedule a recurring expense?', a: 'Open Expenses and use the scheduling feature when available. Set the amount, category and frequency. You can later find the operation in Automations and pause or resume it.' },
    ],
  },
  {
    title: 'Mč, the intelligent assistant',
    items: [
      { q: 'Who is Mč and what can it do?', a: 'Mč is Pata’s intelligent assistant. It can help you understand income and expenses, analyze your financial balance, explain features and prepare actions from your requests. Always verify amounts and suggested transactions.' },
      { q: 'How do I start a conversation with Mč?', a: 'Tap the assistant button in Pata. Ask a question naturally, for example “Where do I spend the most?” or “Help me prepare a budget”. Include useful details and review any proposed action before confirming.' },
      { q: 'What do @Audio, @Image and @Vision do?', a: 'Type @ in the conversation to see the commands. @Audio requests a spoken response. @Image requests a generated image; describe what you want. @Vision analyzes an image: attach the photo or document first, then ask your question.' },
      { q: 'Can Mč change my data without my approval?', a: 'Do not approve an action unless its amount, category and destination are correct. Review the proposed details and confirm only the transaction you intended. For analysis only, tell Mč not to change any data.' },
    ],
  },
  {
    title: 'Reports, Android and subscription',
    items: [
      { q: 'Where can I find financial reports?', a: 'Open Reports to review income and expense summaries and compare activity across available periods. Use the date filters to examine a specific period.' },
      { q: 'How do I export my data?', a: 'Go to Settings → Export my data. Choose an available export type and period, then download the generated file. Keep the file somewhere safe.' },
      { q: 'How do I install the Android app?', a: 'Open Settings → Download Android app or visit the Download page. Download the official file, open it from your downloads and follow Android’s installation steps. Sign in with the same account you use on the website.' },
      { q: 'What does Mobile Money SMS import do?', a: 'On Android, this feature can detect MTN MoMo and Orange Money confirmations on your phone to make transaction tracking easier. Enable it in Settings → Mobile Money SMS import and grant the requested permissions. Automatic transaction recording requires Pata Premium.' },
      { q: 'What is the difference between Free and Premium?', a: 'The Free plan includes core features with monthly limits on selected creations and forecasts. Premium increases those limits and unlocks automatic Mobile Money confirmation tracking on Android. Check the Subscription page for current terms.' },
    ],
  },
];

export default function HelpPage() {
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const [search, setSearch] = useState('');
  const sections = isEnglish ? HELP_EN : HELP_FR;
  const filteredSections = useMemo(() => {
    const value = search.trim().toLocaleLowerCase();
    if (!value) return sections;
    return sections.map((section) => ({
      ...section,
      items: section.items.filter((item) => (item.q + ' ' + item.a).toLocaleLowerCase().includes(value)),
    })).filter((section) => section.items.length > 0);
  }, [sections, search]);

  return (
    <main className="min-h-[100dvh] bg-[#f5f8f6] px-3 py-5 text-slate-900 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <Link href="/settings" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950"><ArrowLeft size={16}/> {isEnglish ? 'Back to settings' : 'Retour aux paramètres'}</Link>
        <header className="overflow-hidden rounded-3xl bg-[#0b5c46] p-5 text-white sm:p-7">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10"><BookOpen size={21}/></span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-100">Pata · {isEnglish ? 'Help Center' : 'Centre d’aide'}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{isEnglish ? 'Find your answer' : 'Trouve la réponse à ta question'}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50">{isEnglish ? 'Step-by-step instructions for using Pata. Check here before contacting the support team.' : 'Des explications simples et des étapes concrètes pour utiliser Pata. Consulte ces réponses avant de contacter l’assistance.'}</p>
            </div>
          </div>
          <label className="mt-5 flex min-h-11 items-center gap-2 rounded-xl bg-white px-3 text-slate-500">
            <Search size={17}/>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isEnglish ? 'Search a question or feature…' : 'Rechercher une question ou une fonctionnalité…'} className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"/>
          </label>
        </header>

        <div className="space-y-5">
          {filteredSections.map((section) => (
            <section key={section.title} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-bold text-slate-900">{section.title}</h2>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <details key={item.q} className="group rounded-xl border border-slate-100 bg-slate-50/70">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-left text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                      <span>{item.q}</span>
                      <ChevronDown size={16} className="shrink-0 text-slate-400 transition group-open:rotate-180"/>
                    </summary>
                    <p className="border-t border-slate-100 px-3 py-3 text-xs leading-6 text-slate-600">{item.a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
          {!filteredSections.length && <div className="rounded-2xl border border-slate-200 bg-white p-7 text-center"><p className="text-sm font-semibold text-slate-800">{isEnglish ? 'No matching answer' : 'Aucune réponse trouvée'}</p><p className="mt-1 text-xs text-slate-500">{isEnglish ? 'Try another word or contact support below.' : 'Essaie un autre mot ou contacte l’assistance ci-dessous.'}</p></div>}
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-[#0b5c46]"><ShieldCheck size={19}/></span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">{isEnglish ? 'Still need help?' : 'Tu n’as pas trouvé ta réponse ?'}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">{isEnglish ? 'Contact the Pata team for a technical issue, account access problem or a question not covered above. Choose the channel that suits you.' : 'Pour un problème technique, un souci d’accès au compte ou une question qui n’est pas traitée ci-dessus, contacte directement l’équipe Pata par le canal qui te convient.'}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <a href="https://wa.me/14236752034" target="_blank" rel="noreferrer" className="flex min-h-14 items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-left hover:bg-emerald-100">
              <MessageCircle size={19} className="shrink-0 text-emerald-700"/>
              <span><strong className="block text-xs text-emerald-900">WhatsApp</strong><span className="text-[11px] text-emerald-800">+1 (423) 675-2034</span></span>
            </a>
            <a href="tel:+237681144638" className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left hover:bg-slate-50">
              <Phone size={19} className="shrink-0 text-slate-600"/>
              <span><strong className="block text-xs text-slate-900">{isEnglish ? 'Phone call' : 'Appel direct'}</strong><span className="text-[11px] text-slate-600">+237 681 14 46 38</span></span>
            </a>
            <a href="mailto:support@pata-yam.site" className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left hover:bg-slate-50">
              <Mail size={19} className="shrink-0 text-slate-600"/>
              <span><strong className="block text-xs text-slate-900">E-mail</strong><span className="break-all text-[11px] text-slate-600">support@pata-yam.site</span></span>
            </a>
          </div>
          <Link href="/support" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-[#0b5c46] hover:bg-emerald-50"><Sparkles size={15}/>{isEnglish ? 'Describe a specific problem to support' : 'Décrire un problème précis à l’assistance'} →</Link>
        </section>
      </div>
    </main>
  );
}
