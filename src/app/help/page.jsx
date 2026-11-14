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

  {
    title: 'Portefeuille et paiements',
    items: [
      { q: 'Comment recharger mon portefeuille Pata ?', a: 'Ouvre Portefeuille, saisis un montant entier d’au moins 100 FCFA, puis appuie sur Recharger. Tu seras dirigé vers le parcours de paiement proposé. Suis les instructions du fournisseur de paiement et reviens dans Pata pour consulter le résultat.' },
      { q: 'Quand l’argent d’une recharge apparaît-il dans mon solde ?', a: 'Le montant est ajouté au solde disponible uniquement après confirmation du paiement. Une recharge encore en attente n’est pas un solde disponible. Consulte l’historique et laisse Pata vérifier la transaction avant de relancer un paiement qui semble bloqué.' },
      { q: 'Où retrouver les opérations de mon portefeuille ?', a: 'Dans Portefeuille, consulte la section Historique pour les recharges et les autres opérations. La zone « Autres opérations » présente notamment certains débits internes, comme l’achat d’un accès à une discussion de cotisation.' },
      { q: 'Le portefeuille prélève-t-il automatiquement de l’argent ?', a: 'Non. Une recharge alimente le portefeuille après confirmation. Pour financer une épargne ou une autre action, tu dois lancer et confirmer l’opération correspondante dans Pata. Vérifie toujours le montant et l’objet avant de valider.' },
    ],
  },
  {
    title: 'Factures et échéances',
    items: [
      { q: 'Comment enregistrer une facture récurrente ?', a: 'Ouvre Factures et échéances, puis Ajouter une facture. Donne-lui un nom, choisis son type, sa fréquence et sa prochaine date d’échéance. Renseigne le montant s’il est connu, la catégorie de dépense et le nombre de jours de rappel. Tu peux également ajouter le fournisseur, une référence de contrat et une note.' },
      { q: 'Comment enregistrer une facture dont le montant change ?', a: 'Dans le formulaire de facture, active le montant variable. Tu peux alors laisser le montant vide si tu ne le connais pas encore. Lors du paiement, saisis le montant réellement payé pour cette échéance.' },
      { q: 'Comment lire une facture avec une photo ?', a: 'Dans le formulaire, utilise la zone Lire une facture depuis une photo et prends une photo ou choisis une image. Pata propose les informations qu’il parvient à reconnaître, comme le fournisseur, le montant ou l’échéance. Relis et corrige les champs détectés avant d’enregistrer : la lecture automatique peut laisser certaines informations manquantes.' },
      { q: 'Comment marquer une facture comme payée ?', a: 'Sur la fiche de la facture, appuie sur Marquer payée. Vérifie le montant, la date et la source de paiement, puis confirme. Pata enregistre une dépense correspondante et prépare la prochaine échéance lorsqu’il s’agit d’une facture récurrente. Si un budget risque d’être dépassé, Pata te demande une confirmation supplémentaire.' },
      { q: 'Pata prélève-t-il automatiquement le montant de mes factures ?', a: 'Non. Pata suit les dates et peut te rappeler une échéance, mais il ne prélève pas et ne déplace pas automatiquement ton argent pour payer une facture. Tu dois enregistrer toi-même le paiement après l’avoir effectué.' },
    ],
  },
  {
    title: 'Dettes, prêts et remboursements',
    items: [
      { q: 'Quelle différence entre une dette et un prêt accordé ?', a: 'Dans Dettes & prêts, « Je dois » représente un montant que tu dois rembourser à une personne ou à une banque. « On me doit » représente un prêt que tu as accordé et que tu dois récupérer. Pour enregistrer une dette reçue, utilise Nouvelle dette ; pour un prêt accordé, utilise Nouveau prêt.' },
      { q: 'Comment enregistrer un remboursement ?', a: 'Ouvre la fiche de la dette ou du prêt. Utilise l’action de remboursement proposée : un remboursement que tu verses est enregistré comme une dépense ; un remboursement que tu reçois est enregistré comme un revenu lié à la dette. Le solde restant et l’historique sont alors mis à jour.' },
      { q: 'Puis-je relier une dette à un autre compte Pata ?', a: 'Lorsqu’une demande de liaison est proposée, envoie-la à l’autre compte et attends sa réponse. Tant qu’elle est en attente, ton suivi personnel reste actif. Si elle est acceptée, les remboursements déclarés par le débiteur doivent encore être confirmés par le créancier. Une demande refusée ne supprime pas ton suivi personnel.' },
      { q: 'Pourquoi ne puis-je plus créer de dette avec le compte gratuit ?', a: 'Le compte gratuit permet de suivre jusqu’à deux dettes ou prêts actifs. Un dossier entièrement remboursé libère une place. Premium permet le suivi d’un nombre illimité de dossiers.' },
    ],
  },
  {
    title: 'Objectifs d’épargne, tirelires et retraits',
    items: [
      { q: 'Quelle différence entre un objectif et une tirelire ?', a: 'Un objectif d’épargne sert à atteindre un montant cible sur une période définie, avec un plan de versements. Une tirelire est plus souple : tu peux y déposer de l’argent quand tu le souhaites, sans date de fin obligatoire. Tu peux aussi lui ajouter une cible facultative.' },
      { q: 'Comment effectuer un versement sur une épargne ?', a: 'Ouvre la fiche de ton objectif ou de ta tirelire, saisis le montant à verser et confirme. Si tu utilises ton portefeuille Pata, vérifie que son solde disponible couvre le montant. Chaque versement confirmé apparaît dans l’historique de l’épargne.' },
      { q: 'Comment demander le retrait de mon épargne ?', a: 'Ouvre la fiche de l’épargne et choisis l’action de retrait ou de clôture proposée. Renseigne ton numéro Mobile Money et sélectionne MTN ou Orange selon le numéro. Vérifie le montant net et les éventuels frais affichés avant d’envoyer la demande. Le retrait reste soumis au traitement et à la confirmation du paiement.' },
      { q: 'Comment fonctionnent les pénalités d’un objectif daté ?', a: 'Si tu as activé les pénalités de retard, l’ajustement de 7 % est calculé sur la somme qui reste réellement impayée à la date prévue, et non sur l’objectif total. La clôture anticipée d’un objectif daté peut appliquer des frais de 10 % sur le montant déjà épargné. Consulte toujours le récapitulatif affiché avant de confirmer.' },
      { q: 'Pourquoi je ne peux pas supprimer une épargne qui contient encore de l’argent ?', a: 'C’est une protection : une épargne qui contient des fonds doit d’abord être retirée ou clôturée depuis sa fiche. Une suppression ne doit pas faire disparaître un solde sans opération correspondante.' },
    ],
  },
  {
    title: 'Cotisations : organiser le groupe et la discussion',
    items: [
      { q: 'Que faut-il préparer avant de lancer une cotisation ?', a: 'Lors de la création, indique le nom du groupe, le montant par membre et par période, le nombre de participants prévu, la fréquence et la date de début. Tu peux aussi préciser le délai de grâce et une majoration de retard fixe ou en pourcentage. Avant le lancement, invite les membres et définis leur ordre de passage.' },
      { q: 'Pourquoi le bouton de lancement du groupe n’est-il pas encore disponible ?', a: 'Le groupe doit réunir le nombre de participants prévu et les positions doivent être définies. Vérifie aussi la date de début et les conditions affichées dans la fiche du groupe. Le chef du groupe peut réorganiser les membres avant le lancement.' },
      { q: 'Comment savoir si un versement de cotisation est réellement payé ?', a: 'Après avoir lancé le paiement, attends le résultat de la vérification. Un paiement encore en attente ou échoué ne doit pas être considéré comme confirmé. Seuls les versements confirmés sont comptabilisés dans le suivi du groupe.' },
      { q: 'Comment demander le retrait de mon tour de cotisation ?', a: 'Lorsque tu es le bénéficiaire du tour, ouvre le groupe et utilise Demander le retrait. Renseigne le numéro Mobile Money et choisis MTN ou Orange. La demande est transmise à l’administration ; son envoi ne signifie pas que le paiement est déjà effectué.' },
      { q: 'Combien de messages puis-je envoyer dans la discussion du groupe ?', a: 'La discussion comprend 10 messages gratuits par jour. Lorsque ce quota est épuisé, tu peux acheter un pack de 10 messages supplémentaires pour 100 FCFA depuis la discussion. Les messages sont conservés pendant une durée limitée de 30 jours.' },
      { q: 'Puis-je modifier ou supprimer un message envoyé ?', a: 'Ouvre les options du message. Tu peux répondre à un message, modifier le tien pendant les 15 minutes qui suivent son envoi, ou supprimer un message lorsque tu en as l’autorisation. Le chef du groupe dispose aussi des droits de modération prévus dans la discussion.' },
    ],
  },
  {
    title: 'Rapports, exports et notifications',
    items: [
      { q: 'Comment choisir la période de mon rapport ?', a: 'Ouvre Rapports financiers et choisis Jour, Semaine, Mois, Année ou Période personnalisée. Pour une période personnalisée, renseigne les deux dates. La date de début doit être antérieure ou égale à la date de fin.' },
      { q: 'Comment télécharger un rapport PDF ou Excel ?', a: 'Dans Rapports financiers, utilise les boutons PDF ou Excel pour exporter la période actuellement sélectionnée. Dans Paramètres → Exporter mes données, tu peux aussi télécharger une copie plus large de tes revenus, dépenses, recharges, budgets, objectifs, prévisions et opérations programmées.' },
      { q: 'Pourquoi le rapport distingue-t-il le revenu d’un emprunt ?', a: 'Un emprunt augmente temporairement l’argent disponible, mais il doit être remboursé : ce n’est pas un revenu gagné. De même, un prêt accordé à une autre personne est une sortie de trésorerie, mais pas une dépense de consommation. Le rapport distingue ces mouvements pour éviter de fausser ton analyse.' },
      { q: 'Comment gérer les notifications de Pata ?', a: 'Ouvre Paramètres → Notifications pour consulter les réglages disponibles sur cet appareil. Vérifie également que les notifications sont autorisées dans les paramètres Android ou du navigateur. La réception d’une notification push dépend des autorisations et de la disponibilité de l’appareil.' },
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

  {
    title: 'Wallet and payments',
    items: [
      { q: 'How do I top up my Pata wallet?', a: 'Open Wallet, enter a whole amount of at least XAF 100, then tap Top up. Follow the payment instructions shown by the payment provider and return to Pata to check the result.' },
      { q: 'When does a top-up appear in my available balance?', a: 'The amount is added to your available balance only after the payment is confirmed. A pending top-up is not available balance. Check the transaction history and let Pata verify the payment before starting another one that appears stuck.' },
      { q: 'Where can I find wallet transactions?', a: 'Open Wallet and review the History section for top-ups and other operations. The Other wallet operations section can show internal debits, including access to a contribution group chat.' },
      { q: 'Does the wallet pay bills or move money automatically?', a: 'No. A top-up adds money only after confirmation. You must start and confirm each separate action in Pata, such as funding a savings goal. Review the amount and purpose before confirming.' },
    ],
  },
  {
    title: 'Bills and due dates',
    items: [
      { q: 'How do I add a recurring bill?', a: 'Open Bills and due dates, then Add a bill. Enter its name, type, frequency and next due date. Add the amount when known, the expense category and how many days before the due date you want a reminder. You can also add the provider, account reference and a note.' },
      { q: 'How do I record a bill whose amount changes?', a: 'Enable the variable amount option in the bill form. You can leave the amount empty when it is not known yet, then enter the actual amount when recording that payment.' },
      { q: 'Can Pata read a bill from a photo?', a: 'In the bill form, choose Read a bill from a photo and take or select an image. Pata suggests information it can recognize, such as the provider, amount or due date. Review and correct the suggested fields before saving; some information may be missing.' },
      { q: 'How do I mark a bill as paid?', a: 'Open the bill and tap Mark paid. Check the amount, payment date and payment source, then confirm. Pata records the corresponding expense and prepares the next due date for a recurring bill. If the payment may exceed a budget, Pata asks for an additional confirmation.' },
      { q: 'Does Pata automatically withdraw money to pay my bills?', a: 'No. Pata tracks due dates and can remind you, but it does not automatically withdraw or move your money to pay a bill. Record the payment yourself after you have made it.' },
    ],
  },
  {
    title: 'Debts, loans and repayments',
    items: [
      { q: 'What is the difference between a debt and a loan I gave someone?', a: 'In Debts & Loans, “I owe” means you must repay a person or a bank. “Owed to me” means you lent money and expect to receive it back. Use New debt to record money you borrowed and New loan to record money you lent.' },
      { q: 'How do I record a repayment?', a: 'Open the debt or loan and use its repayment action. A repayment you make is recorded as an expense; a repayment you receive is recorded as income linked to that debt. Pata updates the remaining balance and repayment history.' },
      { q: 'Can I link a debt to another Pata account?', a: 'When the link request option is available, send the request to the other account and wait for its response. Your own record stays active while the request is pending. If accepted, repayments reported by the borrower still need confirmation from the creditor. A rejected link does not delete your personal record.' },
      { q: 'Why can I no longer create a debt on the Free plan?', a: 'The Free plan allows up to two active debts or loans. A fully repaid record frees a place. Premium allows unlimited tracking.' },
    ],
  },
  {
    title: 'Savings goals, pockets and withdrawals',
    items: [
      { q: 'What is the difference between a savings goal and a pocket?', a: 'A savings goal has a target amount and a defined period, with a suggested payment plan. A savings pocket is more flexible: you can add money when you choose without a required end date. You may also give a pocket an optional target.' },
      { q: 'How do I make a savings deposit?', a: 'Open the goal or pocket, enter the amount and confirm the deposit. If you use your Pata wallet, make sure the available balance covers the amount. Confirmed deposits appear in the savings history.' },
      { q: 'How do I request a savings withdrawal?', a: 'Open the savings record and choose the withdrawal or closure action shown. Enter your Mobile Money number and select MTN or Orange. Review the net amount and any displayed fees before submitting. The request still needs processing and payment confirmation.' },
      { q: 'How do late penalties work on a dated goal?', a: 'When late penalties are enabled, the 7% adjustment is calculated on the amount that is actually unpaid on the due date, not on the full target. Early closure of a dated goal may apply a 10% fee to the amount already saved. Always review the summary before confirming.' },
      { q: 'Why can’t I delete a savings record that still has money in it?', a: 'This protects your balance. Money in a savings record must first be withdrawn or the record closed through its details. Deletion must not make a balance disappear without a matching transaction.' },
    ],
  },
  {
    title: 'Contributions: managing the group and its chat',
    items: [
      { q: 'What should I set up before starting a contribution group?', a: 'When creating the group, enter its name, contribution per member and period, expected participant count, frequency and start date. You can also define a grace period and a fixed or percentage late fee. Before starting, invite the members and set their turn order.' },
      { q: 'Why is the Start group option not available?', a: 'The group must have the expected number of participants and the turn order must be set. Check the start date and the conditions shown on the group details. The group owner can rearrange members before starting.' },
      { q: 'How do I know whether a contribution payment is confirmed?', a: 'After starting a payment, wait for the verification result. A pending or failed payment must not be treated as confirmed. Only confirmed contributions count in the group tracking.' },
      { q: 'How do I request the payout for my contribution turn?', a: 'When you are the beneficiary of a turn, open the group and choose Request withdrawal. Enter your Mobile Money number and select MTN or Orange. The request is sent to the administration; submitting it does not mean the payment has already been made.' },
      { q: 'How many messages can I send in a contribution group chat?', a: 'The chat includes 10 free messages per day. After that, you can buy a pack of 10 additional messages for XAF 100 from the conversation. Messages are kept for a limited period of 30 days.' },
      { q: 'Can I edit or delete a sent message?', a: 'Open the message options. You can reply to a message, edit your own message within 15 minutes of sending it, or delete a message when you have permission. The group owner also has the moderation permissions provided in the chat.' },
    ],
  },
  {
    title: 'Reports, exports and notifications',
    items: [
      { q: 'How do I choose a report period?', a: 'Open Financial reports and choose Day, Week, Month, Year or Custom period. For a custom period, enter both dates. The start date must be on or before the end date.' },
      { q: 'How do I download a PDF or Excel report?', a: 'In Financial reports, use the PDF or Excel buttons to export the currently selected period. In Settings → Export my data, you can also download a broader copy of your income, expenses, wallet top-ups, budgets, goals, forecasts and scheduled operations.' },
      { q: 'Why does the report distinguish a loan from income?', a: 'Borrowed money temporarily increases available cash but must be repaid, so it is not earned income. Money lent to someone else is a cash outflow, but it is not everyday consumption. Reports separate these movements so the analysis is not misleading.' },
      { q: 'How do I manage Pata notifications?', a: 'Open Settings → Notifications to review the options available on this device. Also check that notifications are allowed in Android or browser settings. Push delivery depends on the device permissions and availability.' },
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
