export const HELP_FR = [
  {
    title: 'Saisie rapide : mode d’emploi',
    items: [
      { q: 'À quoi sert la saisie rapide et comment l’ouvrir ?', a: "La saisie rapide te permet de décrire une opération avec tes propres mots. Sur Android, repère la notification permanente « Pata · Saisie rapide » et touche « Saisir » pour écrire une phrase comme « 500 transport » ou « salaire 100 000 FCFA ». Tu peux aussi ouvrir Quick Capture depuis Pata pour vérifier les informations reconnues. Cette fonction nécessite Premium et l’autorisation des notifications Android. Dans le formulaire, vérifie le type, le montant, la catégorie et la date, corrige ce qui doit l’être, puis enregistre. Une saisie envoyée directement depuis la notification est traitée automatiquement ; si une information indispensable manque ou reste incertaine, Pata te demande de la vérifier dans l’application." },
      { q: 'Comment écrire une dépense ?', a: "Écris le montant et le motif dans l’ordre qui te vient : « 500 transport », « transport 500 », « 1 500 FCFA taxi », « nourriture 2 000 » ou « essence 5 000 ». Tu peux séparer les milliers par un espace et ajouter FCFA, XAF, CFA ou francs ; la devise peut être omise. Pata reconnaît notamment : transport (transport, taxi, moto, mototaxi, bus, essence, carburant, Yango, Uber, trajet, parking, péage, billet, voyage, déplacement, course) ; alimentation (repas, nourriture, manger, bouffe, restaurant, resto, pain, marché, courses, alimentation, cuisine, boisson, déjeuner, dîner, petit-déjeuner, goûter, collation, provisions, épicerie, snack, viande, poisson, légumes, fruits) ; logement (loyer, maison, logement, eau, électricité, ENEO, SONEL, CAMWATER, ménage, réparation, gaz, plomberie, peinture, construction) ; téléphone et Internet (internet, Wi-Fi, forfait, téléphone, crédit, data, connexion, MTN, Orange Money, méga, appel, communication) ; santé (santé, pharmacie, médicament, hôpital, médecin, soin, clinique, consultation, ordonnance, laboratoire) ; loisirs (loisir, cinéma, jeu, sortie, fête, musique, sport, divertissement, bar, spectacle, détente, football) ; cotisations (cotisation, tontine, association, mutuelle, offrande, participation, contribution) ; épargne (épargne, économiser, mettre de côté, argent de côté) ; investissement (investissement, placement, crypto, bourse, trading, investir, affaire, capital) ; cadeaux et dons (cadeau, don, charité, aumône, présent). Si aucun mot ne correspond, Pata peut proposer « Autre ». Vérifie la catégorie avant de confirmer." },
      { q: 'Comment enregistrer une dépense faite un autre jour ?', a: "Ajoute la date à ta phrase. Pata comprend « aujourd’hui », « hier », « avant-hier », « demain » et « après-demain ». Il comprend aussi les jours de la semaine : « jeudi 500 transport » désigne le jeudi passé ; précise « jeudi dernier » ou « jeudi prochain » pour lever le doute. Tu peux écrire une date complète : « 17/11/2026 », « 17-11-2026 », « 17.11.2026 », « 2026-11-17 », « 17 novembre 2026 » ou « novembre 17 2026 ». « Le 17 transport 500 » désigne le 17 du mois en cours. Exemples : « hier 500 transport », « avant-hier nourriture 500 », « jeudi 500 transport » et « le 17 transport 500 ». Relis la date reconnue dans le formulaire avant l’enregistrement." },
      { q: 'Comment enregistrer un revenu qui n’est pas un salaire ?', a: "Tu n’as pas besoin d’écrire « salaire ». Commence par « revenu », « revenus », « revenue », « revenues », « recette », « recettes », « rentrée d’argent », « argent reçu » ou « entrée d’argent ». Ajoute le montant et le nom de la source : « revenu 5 000 Diane », « revenue 5 000 Diane », « revenus 5 000 Diane » ou « revnue 5 000 Diane ». Pata reconnaît ici un revenu de 5 000 FCFA dont la source est « Diane ». Certaines petites fautes de frappe proches peuvent aussi être reconnues, mais vérifie toujours le résultat. Autres mots de nature de revenu connus : salaire, paie, rémunération, appointement, traitement ; business, bénéfice, profit, prestation, freelance, service vendu, honoraire, chiffre d’affaires, activité, mission payée ; vente, vendu, vendre, article ou produit vendu ; commission, prime, bonus, gratification, indemnité ; loyer reçu, location reçue, locataire, revenu locatif ; pension, allocation, retraite, bourse scolaire, aide sociale ; cadeau reçu, don reçu, offert, argent offert. Avec le mot général « revenu », la catégorie « Autre revenu » est utilisée par défaut ; tu peux choisir une catégorie plus précise dans le formulaire." },
      { q: 'Comment indiquer une catégorie que j’ai créée moi-même ?', a: "Si tu as déjà créé une catégorie personnelle dans ton compte, écris son nom près du montant : par exemple « bière 500 » ou « 500 bière » si « Bière » existe déjà comme catégorie de dépense. Quick Capture charge les catégories enregistrées dans ton compte et peut sélectionner automatiquement celle qui correspond. La catégorie doit exister et être du bon type (dépense ou revenu). Si Pata ne la reconnaît pas, il peut proposer « Autre » : ouvre le formulaire, choisis la bonne catégorie dans la liste, puis vérifie avant d’enregistrer." },
      { q: 'Comment déclarer un emprunt, un prêt accordé ou un remboursement ?', a: "Pour l’argent que tu empruntes, écris « j’ai emprunté 5 000 chez Paul », « Paul m’a prêté 5 000 » ou « j’ai pris 5 000 chez Paul » : Pata reconnaît une dette contractée. Pour l’argent que tu prêtes à quelqu’un, écris « j’ai prêté 5 000 à Paul » : Pata reconnaît un prêt accordé. Pour l’argent que tu rembourses, écris « j’ai remboursé 500 de dette à Paul ». Vérifie la personne et le type d’opération, puis choisis le dossier concerné lorsque le formulaire le demande. Si quelqu’un te rembourse une somme qu’il te devait, choisis « Revenu », puis « Remboursement reçu » dans le formulaire et sélectionne la créance correspondante : ce n’est pas une dépense de remboursement." },
      { q: 'Comment faire reconnaître une facture ?', a: "Utilise « facture », « quittance », « avis d’échéance » ou « note d’échéance », puis ajoute le nom, le montant et, si tu la connais, la date limite. Exemples : « facture internet 5 000 », « quittance loyer 50 000 » ou « facture électricité échéance 20/11/2026 ». Pata peut proposer le type de facture et sa catégorie. Vérifie le nom, le montant, la fréquence et l’échéance. Une facture enregistrée ne signifie pas qu’elle est déjà payée : enregistre le paiement séparément après l’avoir réellement réglée." },
      { q: 'Comment utiliser Mč depuis la notification Pata ?', a: "Sur Android, ouvre les notifications et repère « Pata · Saisie rapide ». Deux actions sont proposées : « Saisir » pour envoyer une dépense ou un revenu, et « Parler avec Mč » pour poser une question directement depuis la notification. Touche « Parler avec Mč », écris ta question dans le champ de réponse, puis envoie-la. Mč affiche sa réponse dans une nouvelle notification Pata ; touche « Répondre » pour continuer sans ouvrir la conversation complète. Tu peux aussi ouvrir le raccourci vocal Pata et choisir « Causer avec Mč ». Cette conversation depuis les notifications nécessite Premium, une session Pata active et l’autorisation des notifications Android. Si la notification permanente n’apparaît pas, vérifie les autorisations de Pata dans les réglages Android." },
    ],
  },
  {
    title: 'Compte, profil et sécurité',
    items: [
      { q: "Où trouver les paramètres sur mon téléphone ou mon ordinateur ?", a: "Sur téléphone, appuie sur Plus dans la barre de navigation en bas de l’écran, puis sur Paramètres. Sur ordinateur, clique sur Paramètres dans le menu situé à gauche. Les réglages sont rangés dans trois parties : Compte et abonnement, Sécurité et notifications, puis Préférences et données." },
      { q: 'Comment modifier mon profil et ma photo ?', a: "Sur téléphone : appuie sur Plus en bas, puis Paramètres. Sur ordinateur : clique sur Paramètres dans le menu de gauche. Dans Compte et abonnement, ouvre Informations personnelles. Tu peux y modifier ton nom et changer ta photo : choisis un avatar ou une image sur ton appareil. Cette photo sera utilisée dans ton espace Pata." },
      { q: 'Comment activer ou changer mon mot de passe ?', a: "Le mot de passe te permet de te connecter à ton compte Pata. Pour en ajouter un à un compte créé avec Google, ou pour changer celui que tu utilises déjà : ouvre Plus → Paramètres sur téléphone, ou Paramètres dans le menu de gauche sur ordinateur. Dans Sécurité et notifications, choisis Mot de passe et suis les champs affichés. Pata peut demander ton mot de passe actuel avant le changement. Ne transmets jamais ton mot de passe à quelqu’un, même à l’assistance." },
      { q: 'À quoi sert le code secret à 4 chiffres ?', a: "Il sert à empêcher une autre personne qui utilise ton téléphone d’ouvrir facilement ton espace Pata lorsque tu as déjà une session ouverte. C’est une protection supplémentaire sur cet appareil, différente du mot de passe de connexion. Pour l’activer, ouvre Plus → Paramètres sur téléphone, ou Paramètres dans le menu de gauche sur ordinateur. Dans Sécurité et notifications, appuie sur Code secret, saisis 4 chiffres, puis confirme-les. Si un code est déjà actif, Pata te demandera l’ancien. En cas d’oubli, utilise Code oublié ? pour recevoir un code de réinitialisation par e-mail." },
      { q: 'Comment passer du mode clair au mode sombre ?', a: "Sur téléphone, ouvre Plus → Paramètres. Sur ordinateur, clique sur Paramètres dans le menu de gauche. Dans Préférences et données, ouvre Apparence de Pata, puis choisis Clair ou Sombre. Le changement s’applique à l’application." },
      { q: 'Comment changer la langue ?', a: "Sur téléphone, ouvre Plus → Paramètres. Sur ordinateur, clique sur Paramètres dans le menu de gauche. Dans Compte et abonnement, ouvre Informations personnelles, puis repère le champ Langue. Choisis Français ou English. Pata enregistre ce choix et adapte les textes de l’application." },
    ],
  },
  {
    title: 'Revenus et dépenses',
    items: [
      { q: 'Comment ajouter un revenu ?', a: "Sur téléphone, appuie sur le bouton + au milieu de la barre du bas, puis choisis Nouveau revenu. Tu peux aussi ouvrir l’onglet Revenus en bas et appuyer sur Ajouter dans la partie Toutes mes sources de revenus. Sur ordinateur, clique sur Revenus dans le menu de gauche, puis sur Ajouter. Indique le montant reçu, le nom précis de la source (par exemple « Salaire de novembre » ou « Vente de mon ordinateur »), la date et la catégorie. Tu peux aussi ajouter une photo ou une note. Vérifie le montant et la date avant d’enregistrer." },
      { q: 'Quelle est la différence entre le nom et la catégorie d’un revenu ?', a: 'Le nom indique d’où vient précisément l’argent. La catégorie indique sa nature (salaire, vente, activité, loyer, cadeau…). Ces deux informations sont indépendantes. Changer la catégorie ne doit pas renommer ta source.' },
      { q: 'Comment savoir ce que j’ai dépensé à partir d’un revenu ?', a: "Ouvre Revenus et sélectionne la source que tu veux examiner. Sa fiche indique combien a été utilisé, ce qu’il reste et les dépenses rattachées à ce revenu. Tu peux consulter la date, le jour de la semaine, la catégorie, la nature et le montant de chaque sortie. Appuie sur Voir plus de dépenses pour parcourir la suite de l’historique, ou ouvre la page Dépenses pour retrouver toutes tes opérations." },
      { q: 'Pourquoi le montant d’un revenu est-il parfois verrouillé ?', a: "Le montant d’origine est bloqué dès qu’une dépense a été rattachée à ce revenu. Cela évite de modifier après coup la somme réellement reçue et de fausser l’historique. Tu peux toutefois ouvrir la fiche du revenu, appuyer sur Modifier et changer les informations encore autorisées, notamment la photo, le nom, la catégorie ou la note. Le montant utilisé pour les calculs reste protégé." },
      { q: 'Comment ajouter une dépense ?', a: "Sur téléphone, appuie sur le bouton + au milieu de la barre du bas, puis choisis Nouvelle dépense. Tu peux aussi ouvrir Dépenses dans la barre du bas et appuyer sur Nouvelle dépense en haut de la page. Sur ordinateur, clique sur Dépenses dans le menu de gauche, puis sur Nouvelle dépense en haut à droite. Saisis le montant, la catégorie, la date et le motif. Choisis le revenu qui finance cette sortie, puis ajoute une note ou une photo si nécessaire. Vérifie les informations avant d’enregistrer." },
      { q: 'Pourquoi associer une dépense à une source de revenu ?', a: "En choisissant le revenu qui finance une dépense, tu peux retrouver ce que tu as fait avec chaque somme reçue : combien est parti, pour quelle raison, dans quelle catégorie et ce qu’il reste. Pata peut aussi comparer ces dépenses au budget prévu pour cette source. Choisir la mauvaise source peut fausser le solde restant de tes revenus et leur historique." },
    ],
  },
  {
    title: 'Budgets, épargne et organisation',
    items: [
      { q: 'Comment créer un budget ?', a: "Sur téléphone, appuie sur Plus en bas, puis Budgets. Sur ordinateur, clique sur Budgets dans le menu de gauche. Choisis d’abord le mois, puis la source de revenu dans la liste Tous les revenus (Global). Pour préparer un nouveau budget, appuie sur Proposer un budget, vérifie les catégories et les montants suggérés, puis enregistre et applique la répartition. Pour modifier une enveloppe existante, appuie sur le crayon à côté de sa catégorie, change le montant et enregistre. Tu peux préparer un budget différent pour chaque revenu." },
      { q: 'Comment créer un objectif d’épargne ?', a: "Sur téléphone, appuie sur Plus en bas, puis Objectifs. Sur ordinateur, clique sur Objectifs dans le menu de gauche. Appuie sur le bouton de création, donne un nom à ton objectif, indique la somme que tu veux atteindre et renseigne les dates ainsi que la fréquence demandées. Relis le plan proposé, puis enregistre. Pour suivre ta progression ou verser de l’argent, ouvre ensuite la fiche de cet objectif." },
      { q: 'À quoi sert une tirelire ?', a: "Une tirelire te permet de mettre de l’argent de côté sans obligation de date de fin ni de somme à atteindre. C’est pratique pour constituer une réserve petit à petit. Ouvre Plus → Objectifs sur téléphone, ou Objectifs dans le menu de gauche sur ordinateur, puis crée une tirelire. Tu pourras la rouvrir à tout moment pour voir le total déposé et ajouter de l’argent." },
      { q: 'Comment créer un projet ?', a: "Les projets servent à suivre séparément l’argent prévu pour un achat ou une réalisation précise. Ouvre Dépenses, puis repère la partie Projets et financements en haut de la page. Appuie sur Créer un projet, indique son nom et les informations demandées, puis enregistre. Tu pourras ensuite affecter des revenus et des sorties à ce projet. La création et le suivi des projets nécessitent Pata Premium." },
      { q: 'Comment suivre une dette, un prêt ou un remboursement ?', a: "Sur téléphone, ouvre Plus en bas, puis Dettes & prêts. Sur ordinateur, clique sur Dettes & prêts dans le menu de gauche. Si tu as emprunté de l’argent, appuie sur Nouvelle dette. Si tu prêtes ton argent à quelqu’un, appuie sur Nouveau prêt. Renseigne la personne, le montant et la date d’échéance. Ouvre ensuite la fiche du dossier pour enregistrer les remboursements et voir ce qu’il reste à payer ou à récupérer." },
      { q: 'Comment créer une cotisation ou une tontine ?', a: "Sur téléphone, appuie sur Plus en bas, puis Cotisations. Sur ordinateur, clique sur Cotisations dans le menu de gauche. Appuie sur Créer un groupe, indique le nom, le montant par personne, la fréquence, le nombre de membres prévu et la date de début. Enregistre, puis ouvre le groupe pour inviter les participants et définir l’ordre de passage. Vérifie que les membres et les positions sont prêts avant de lancer la cotisation." },
      { q: 'Comment communiquer avec les membres d’une cotisation ?', a: "Dans Cotisations, ouvre le groupe concerné, puis appuie sur Discussion pour consulter les messages ou écrire aux membres. Sur téléphone, fais défiler la conversation et touche un message pour afficher les actions disponibles. Vérifie le nom du groupe en haut avant d’envoyer une information. Les messages gratuits et les éventuels packs supplémentaires sont indiqués dans la discussion." },
      { q: 'Comment programmer une dépense récurrente ?', a: "Enregistre d’abord la dépense dans Dépenses. Ouvre ensuite la dépense concernée et utilise l’action qui permet de la rendre récurrente, lorsqu’elle est proposée. Indique la fréquence et vérifie la prochaine date avant de confirmer. Tu pourras ensuite retrouver cette programmation dans les automatismes pour la consulter, la mettre en pause ou la reprendre." },
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
      { q: 'Où consulter mes rapports financiers ?', a: "Sur téléphone, appuie sur Plus en bas, puis Rapports. Sur ordinateur, clique sur Rapports dans le menu de gauche. En haut de la page, dans Période du rapport, choisis Jour, Semaine, Mois, Année ou Période personnalisée. Pour une période personnalisée, saisis les deux dates. Les chiffres et les graphiques se mettent à jour selon la période choisie." },
      { q: 'Comment exporter mes données ?', a: "Sur téléphone, ouvre Plus → Paramètres. Sur ordinateur, clique sur Paramètres dans le menu de gauche. Dans Préférences et données, choisis Exporter mes données. Appuie sur Télécharger en PDF pour obtenir une copie lisible, ou sur Exporter pour Excel pour trier et examiner les opérations dans un tableur. Garde le fichier dans un endroit sûr : il peut contenir des informations financières personnelles." },
      { q: 'Comment installer l’application Android ?', a: "Sur téléphone Android, ouvre Plus → Paramètres, puis Télécharger l’application Android dans Préférences et données. Tu peux aussi ouvrir la page Télécharger de Pata. Télécharge le fichier proposé, retrouve-le dans l’application Téléchargements de ton téléphone et touche-le pour commencer l’installation. Si Android demande l’autorisation d’installer cette application, vérifie que le fichier vient bien de Pata avant de continuer. Après l’installation, connecte-toi avec le même compte que sur le site." },
      { q: 'À quoi sert l’import SMS Mobile Money ?', a: "Cette fonction aide Pata à repérer les SMS de confirmation MTN MoMo et Orange Money reçus sur ton téléphone Android, pour faciliter le suivi de tes opérations. Sur téléphone, ouvre Plus → Paramètres ; sur ordinateur, clique sur Paramètres à gauche. Dans Sécurité et notifications, choisis Import SMS Mobile Money. Active la fonction sur ton Android et autorise l’accès demandé par le téléphone. L’enregistrement automatique nécessite Pata Premium." },
      { q: 'Quelle est la différence entre le compte gratuit et Premium ?', a: 'Le compte gratuit permet de découvrir les fonctions de base avec des limites mensuelles sur certaines créations et prévisions. Premium augmente ces capacités et débloque notamment le suivi automatique des confirmations Mobile Money sur Android. Consulte la page Abonnement pour les conditions à jour.' },
    ],
  },

  {
    title: 'Portefeuille et paiements',
    items: [
      { q: 'Comment recharger mon portefeuille Pata ?', a: "Sur téléphone, appuie sur Plus en bas, puis Portefeuille. Sur ordinateur, clique sur Portefeuille dans le menu de gauche. Dans Recharger mon solde, saisis un montant entier d’au moins 100 FCFA ou choisis l’un des montants rapides, puis appuie sur Recharger. Suis les instructions de paiement affichées. Reviens dans Pata et vérifie le résultat : le solde augmente uniquement après confirmation du paiement." },
      { q: 'Quand l’argent d’une recharge apparaît-il dans mon solde ?', a: 'Le montant est ajouté au solde disponible uniquement après confirmation du paiement. Une recharge encore en attente n’est pas un solde disponible. Consulte l’historique et laisse Pata vérifier la transaction avant de relancer un paiement qui semble bloqué.' },
      { q: 'Où retrouver les opérations de mon portefeuille ?', a: "Sur téléphone, ouvre Plus → Portefeuille. Sur ordinateur, clique sur Portefeuille dans le menu de gauche. Descends sous le solde et le formulaire de recharge pour consulter les opérations affichées. Les autres opérations du portefeuille apparaissent dans leur propre section, avec leur description, leur date et leur montant. Une recharge encore en attente n’est pas un paiement confirmé." },
      { q: 'Le portefeuille prélève-t-il automatiquement de l’argent ?', a: 'Non. Une recharge alimente le portefeuille après confirmation. Pour financer une épargne ou une autre action, tu dois lancer et confirmer l’opération correspondante dans Pata. Vérifie toujours le montant et l’objet avant de valider.' },
    ],
  },
  {
    title: 'Factures et échéances',
    items: [
      { q: 'Comment enregistrer une facture récurrente ?', a: "Sur téléphone, appuie sur Plus en bas, puis Factures. Sur ordinateur, clique sur Factures dans le menu de gauche. Appuie sur Ajouter une facture. Donne-lui un nom, choisis son type et sa fréquence, puis indique la prochaine date d’échéance. Ajoute le montant si tu le connais, la catégorie de dépense et le délai de rappel. Tu peux aussi saisir le fournisseur et une note." },
      { q: 'Comment enregistrer une facture dont le montant change ?', a: "Ouvre Plus → Factures sur téléphone, ou Factures dans le menu de gauche sur ordinateur. Appuie sur Ajouter une facture. Dans le formulaire, active l’option Montant variable si la somme change d’une échéance à l’autre. Tu peux laisser le montant vide au départ. Lorsque tu as payé la facture, ouvre-la, appuie sur Marquer payée et saisis le montant réellement réglé pour cette échéance." },
      { q: 'Comment lire une facture avec une photo ?', a: "Ouvre Plus → Factures sur téléphone, ou Factures dans le menu de gauche sur ordinateur. Appuie sur Ajouter une facture, puis choisis Lire une facture depuis une photo. Prends une photo ou sélectionne une image déjà enregistrée sur ton téléphone ou ton ordinateur. Pata peut proposer le fournisseur, le montant et la date d’échéance. Relis chaque champ, corrige les erreurs et complète les informations manquantes avant d’enregistrer." },
      { q: 'Comment marquer une facture comme payée ?', a: "Ouvre la facture dans Factures, puis appuie sur Marquer payée. Vérifie le montant réellement réglé, la date et le revenu qui a financé le paiement. Confirme ensuite. Pata ajoute la dépense correspondante à ton historique et prépare la prochaine échéance si la facture est récurrente. Pata n’envoie pas le paiement à ta place : tu dois d’abord avoir payé la facture." },
      { q: 'Pata prélève-t-il automatiquement le montant de mes factures ?', a: 'Non. Pata suit les dates et peut te rappeler une échéance, mais il ne prélève pas et ne déplace pas automatiquement ton argent pour payer une facture. Tu dois enregistrer toi-même le paiement après l’avoir effectué.' },
    ],
  },
  {
    title: 'Dettes, prêts et remboursements',
    items: [
      { q: 'Quelle différence entre une dette et un prêt accordé ?', a: 'Dans Dettes & prêts, « Je dois » représente un montant que tu dois rembourser à une personne ou à une banque. « On me doit » représente un prêt que tu as accordé et que tu dois récupérer. Pour enregistrer une dette reçue, utilise Nouvelle dette ; pour un prêt accordé, utilise Nouveau prêt.' },
      { q: 'Comment enregistrer un remboursement ?', a: "Sur téléphone, appuie sur Plus, puis Dettes & prêts. Sur ordinateur, ouvre Dettes & prêts dans le menu de gauche. Sélectionne la dette ou le prêt concerné. Si tu rembourses l’argent que tu as emprunté, utilise l’action de remboursement pour enregistrer une dépense. Si quelqu’un te rembourse l’argent que tu lui avais prêté, utilise l’action de remboursement reçu : Pata l’enregistre comme une entrée liée à cette créance. Vérifie le montant et la personne avant de confirmer." },
      { q: 'Puis-je relier une dette à un autre compte Pata ?', a: 'Lorsqu’une demande de liaison est proposée, envoie-la à l’autre compte et attends sa réponse. Tant qu’elle est en attente, ton suivi personnel reste actif. Si elle est acceptée, les remboursements déclarés par le débiteur doivent encore être confirmés par le créancier. Une demande refusée ne supprime pas ton suivi personnel.' },
      { q: 'Pourquoi ne puis-je plus créer de dette avec le compte gratuit ?', a: 'Le compte gratuit permet de suivre jusqu’à deux dettes ou prêts actifs. Un dossier entièrement remboursé libère une place. Premium permet le suivi d’un nombre illimité de dossiers.' },
    ],
  },
  {
    title: 'Objectifs d’épargne, tirelires et retraits',
    items: [
      { q: 'Quelle différence entre un objectif et une tirelire ?', a: 'Un objectif d’épargne sert à atteindre un montant cible sur une période définie, avec un plan de versements. Une tirelire est plus souple : tu peux y déposer de l’argent quand tu le souhaites, sans date de fin obligatoire. Tu peux aussi lui ajouter une cible facultative.' },
      { q: 'Comment effectuer un versement sur une épargne ?', a: "Sur téléphone, appuie sur Plus, puis Objectifs. Sur ordinateur, ouvre Objectifs dans le menu de gauche. Sélectionne ton objectif ou ta tirelire. Dans la fiche, repère la partie de versement, saisis le montant dans Montant à verser depuis ton portefeuille Pata, puis appuie sur Verser. Vérifie que ton portefeuille dispose de la somme nécessaire. Le versement confirmé apparaîtra dans l’historique de cette épargne." },
      { q: 'Comment demander le retrait de mon épargne ?', a: "Sur téléphone, ouvre Plus → Objectifs. Sur ordinateur, clique sur Objectifs dans le menu de gauche. Ouvre la fiche de l’épargne concernée et choisis l’action de retrait ou de clôture proposée. Renseigne ton numéro Mobile Money, sélectionne MTN ou Orange, puis vérifie le montant net et les frais affichés avant d’envoyer la demande. Une demande envoyée n’est pas encore un paiement reçu : attends la confirmation du traitement." },
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
      { q: 'Combien de messages puis-je envoyer dans la discussion du groupe ?', a: "Tu peux envoyer 10 messages gratuits par jour dans la discussion d’un groupe. Lorsque cette limite est atteinte, tu peux toujours lire les anciens messages, mais il faut acheter un pack de 10 messages supplémentaires à 100 FCFA pour écrire à nouveau ce jour-là. Le bouton d’achat apparaît directement dans la discussion. Les messages restent disponibles pendant 30 jours." },
      { q: 'Puis-je modifier ou supprimer un message envoyé ?', a: 'Ouvre les options du message. Tu peux répondre à un message, modifier le tien pendant les 15 minutes qui suivent son envoi, ou supprimer un message lorsque tu en as l’autorisation. Le chef du groupe dispose aussi des droits de modération prévus dans la discussion.' },
    ],
  },
  {
    title: 'Rapports, exports et notifications',
    items: [
      { q: 'Comment choisir la période de mon rapport ?', a: 'Ouvre Rapports financiers et choisis Jour, Semaine, Mois, Année ou Période personnalisée. Pour une période personnalisée, renseigne les deux dates. La date de début doit être antérieure ou égale à la date de fin.' },
      { q: 'Comment télécharger un rapport PDF ou Excel ?', a: "Sur téléphone, appuie sur Plus en bas, puis Rapports. Sur ordinateur, clique sur Rapports dans le menu de gauche. Choisis d’abord la période en haut de la page : jour, semaine, mois, année ou période personnalisée. Une fois les chiffres affichés, utilise les boutons PDF ou Excel en haut à droite pour télécharger ce rapport. Pour une copie plus large de tes données, ouvre plutôt Plus → Paramètres → Préférences et données → Exporter mes données." },
      { q: 'Pourquoi le rapport distingue-t-il le revenu d’un emprunt ?', a: 'Un emprunt augmente temporairement l’argent disponible, mais il doit être remboursé : ce n’est pas un revenu gagné. De même, un prêt accordé à une autre personne est une sortie de trésorerie, mais pas une dépense de consommation. Le rapport distingue ces mouvements pour éviter de fausser ton analyse.' },
      { q: 'Comment gérer les notifications de Pata ?', a: "Pour gérer les alertes de Pata, ouvre Plus → Paramètres sur téléphone, ou Paramètres dans le menu de gauche sur ordinateur. Dans Sécurité et notifications, appuie sur Notifications. Active les alertes que tu souhaites recevoir. Sur Android, vérifie aussi les réglages du téléphone : ouvre Paramètres du téléphone, va dans Applications, choisis Pata, puis Notifications et autorise-les. Sur ordinateur, vérifie que ton navigateur autorise les notifications du site Pata." },
    ],
  },
];

export const HELP_EN = [
  {
    title: 'Quick Capture: how to use it',
    items: [
      { q: 'What is Quick Capture and how do I open it?', a: "Quick Capture lets you describe an operation in your own words. On Android, find the persistent “Pata · Saisie rapide” notification and tap “Saisir” to enter a phrase such as “500 transport” or “salaire 100 000 FCFA”. You can also open Quick Capture in Pata to review the recognized details. This feature requires Premium and Android notification permission. Check the operation type, amount, category and date in the form, correct anything that needs changing, then save. Text sent directly from the notification is processed automatically; if a required detail is missing or uncertain, Pata asks you to review it in the app." },
      { q: 'How do I enter an expense?', a: "Write the amount and description in either order. Examples in the currently supported French phrasing include “500 transport”, “transport 500”, “1 500 FCFA taxi”, “nourriture 2 000” and “essence 5 000”. You can separate thousands with a space and add FCFA, XAF, CFA or francs; the currency can also be omitted. Recognized expense groups include transport (transport, taxi, moto, mototaxi, bus, essence, carburant, Yango, Uber, trajet, parking, péage, billet, voyage); food (repas, nourriture, manger, restaurant, pain, marché, courses, boisson, déjeuner, dîner, goûter, snack, viande, poisson, légumes, fruits); housing (loyer, maison, logement, eau, électricité, ENEO, SONEL, CAMWATER, réparation, gaz); phone and Internet (internet, Wi-Fi, forfait, téléphone, crédit, data, connexion, MTN, Orange Money, appel); health (santé, pharmacie, médicament, hôpital, médecin, clinique, consultation); leisure (loisir, cinéma, jeu, sortie, fête, musique, sport, bar); contributions (cotisation, tontine, association, mutuelle, offrande); savings (épargne, économiser, mettre de côté); investments (investissement, placement, crypto, bourse, trading); gifts and donations (cadeau, don, charité, aumône). If no word matches, Pata may suggest “Autre”. Check the proposed category before saving." },
      { q: 'How do I record an expense from a different date?', a: "Add the date to your sentence. The currently supported date phrases are in French: “aujourd’hui”, “hier”, “avant-hier”, “demain” and “après-demain”. Weekdays are also supported: “jeudi 500 transport” means the most recent Thursday; add “jeudi dernier” or “jeudi prochain” to clarify. Full dates can be entered as “17/11/2026”, “17-11-2026”, “17.11.2026”, “2026-11-17” or “17 novembre 2026”. “Le 17 transport 500” means the 17th day of the current month. Check the recognized date in the form before saving." },
      { q: 'How do I record income that is not a salary?', a: "You do not have to use the word “salaire”. The currently supported general income markers include “revenu”, “revenus”, “revenue”, “revenues”, “recette”, “recettes”, “rentrée d’argent”, “argent reçu” and “entrée d’argent”. Add the amount and source name: “revenu 5 000 Diane”, “revenue 5 000 Diane”, “revenus 5 000 Diane” or “revnue 5 000 Diane”. Pata recognizes 5,000 FCFA as income from “Diane”. Some close one-letter spelling mistakes may also be recognized, but always review the result. Other recognized income-type words include salaire, paie, rémunération, traitement, appointement; business, bénéfice, profit, prestation, freelance, service vendu, honoraire, chiffre d’affaires, activité; vente, vendu, vendre, article vendu; commission, prime, bonus; loyer reçu, location reçue, locataire, revenu locatif; pension, allocation, retraite, bourse scolaire; cadeau reçu, don reçu and argent offert. The general word “revenu” uses “Autre revenu” by default; select a more specific category in the form when needed." },
      { q: 'How do I use a category I created myself?', a: "If you have already created a personal category in your account, include its name near the amount. For example, use “bière 500” or “500 bière” when “Bière” already exists as an expense category. Quick Capture loads categories saved in your account and can select a matching one automatically. The category must already exist and have the correct type (expense or income). If it is not recognized, Pata may suggest “Autre”; open the form, choose the right category from the list and check it before saving." },
      { q: 'How do I record borrowed money, a loan I gave or a repayment?', a: "For money you borrow, use phrases such as “j’ai emprunté 5 000 chez Paul”, “Paul m’a prêté 5 000” or “j’ai pris 5 000 chez Paul”. For money you lend to someone, use “j’ai prêté 5 000 à Paul”. To record money you repay, use “j’ai remboursé 500 de dette à Paul”. These examples are in the currently supported French phrasing. Check the person and operation type, then select the matching debt record when the form asks for it. When someone pays back money they owed you, choose “Revenu”, then “Remboursement reçu” in the form and select the receivable; do not record it as an expense repayment." },
      { q: 'How do I make Quick Capture recognize a bill?', a: "Use a French word such as “facture”, “quittance”, “avis d’échéance” or “note d’échéance”, then add the name, amount and due date when known. Examples: “facture internet 5 000”, “quittance loyer 50 000” or “facture électricité échéance 20/11/2026”. Pata can suggest a bill type and category. Check the name, amount, frequency and due date. A saved bill does not mean it has already been paid; record the payment separately after you have actually paid it." },
      { q: 'How do I use Mč from the Pata notification?', a: "On Android, open the notification shade and find the persistent “Pata · Saisie rapide” notification. It offers two actions: “Saisir” to enter an expense or income, and “Parler avec Mč” to ask a question directly from the notification. Tap “Parler avec Mč”, type your question in the reply field and send it. Mč returns an answer in a new Pata notification; tap “Répondre” to continue without opening the full chat. You can also open Pata’s voice shortcut and choose “Causer avec Mč”. This notification conversation requires Premium, an active Pata session and Android notification permission. If the persistent notification is missing, check Pata’s notification permissions in Android settings." },
    ],
  },
  {
    title: 'Account, profile and security',
    items: [
      { q: "Where can I find Settings on my phone or computer?", a: "On a phone, tap Plus in the bottom navigation bar, then tap Settings. On a computer, select Settings in the left-hand menu. Options are grouped under Account and subscription, Security and notifications, and Preferences and data." },
      { q: 'How do I update my profile photo?', a: "On a phone, tap Plus in the bottom navigation bar, then Settings. On a computer, select Settings in the left-hand menu. Under Account and subscription, open Personal information. Choose an avatar or upload a photo from your device. This is the profile picture shown in your Pata account." },
      { q: 'How do I add or change my password?', a: "Your password is used to sign in to your Pata account. To add one to a Google-linked account or change your current password, open Plus → Settings on a phone, or Settings in the left-hand menu on a computer. Under Security and notifications, choose Password and follow the fields shown. Pata may ask for your current password before changing it. Never send your password to anyone, including support." },
      { q: 'What is the four-digit security PIN for?', a: "It helps stop someone using your phone from opening your Pata space while you are already signed in. It is an extra lock for this device, not your account sign-in password. On a phone, tap Plus → Settings. On a computer, select Settings in the left-hand menu. Under Security and notifications, choose Code secret, enter four digits and confirm them. If a PIN is already active, Pata asks for the current PIN. If you forget it, use Code oublié ? to receive a reset code by email." },
      { q: 'How do I switch between light and dark mode?', a: "On a phone, tap Plus → Settings. On a computer, select Settings in the left-hand menu. Under Preferences and data, open Pata appearance and choose Light or Dark. The change applies across the app." },
      { q: 'How do I change the language?', a: "On a phone, tap Plus → Settings. On a computer, select Settings in the left-hand menu. Under Account and subscription, open Personal information and find Language. Choose French or English. Pata saves your choice and updates the app labels." },
    ],
  },
  {
    title: 'Income and expenses',
    items: [
      { q: 'How do I add income?', a: "On a phone, tap the + button in the middle of the bottom bar and choose New income. You can also open the Income tab at the bottom and tap Add in the All my income sources section. On a computer, choose Income in the left-hand menu, then tap Add. Enter the amount received, a clear source name (for example, “November salary” or “Computer sale”), the date and category. You may also add a photo or note. Check the amount and date before saving." },
      { q: 'What is the difference between an income name and category?', a: 'The name identifies where the money came from. The category describes its type, such as salary, sales, business, rent or gift. They are separate fields.' },
      { q: 'How can I see what I spent from an income source?', a: "Open Income and select the source you want to review. Its details show how much has been used, what remains and the expenses linked to that income. You can review each date, weekday, category, type and amount. Tap See more expenses to continue through the history, or open the Expenses page to review all your transactions." },
      { q: 'Why is an income amount sometimes locked?', a: "The original amount is locked as soon as an expense is linked to that income. This protects the amount you actually received and prevents your earlier spending history from changing. You can still open the income details, choose Edit and update the information that remains editable, such as its photo, name, category or note. The amount used for calculations stays protected." },
      { q: 'How do I add an expense?', a: "On a phone, tap the + button in the middle of the bottom bar and choose New expense. You can also open Expenses in the bottom bar and tap New expense at the top of the page. On a computer, choose Expenses in the left-hand menu, then tap New expense at the top right. Enter the amount, category, date and reason. Select the income source that paid for it, and add a note or photo when useful. Review the details before saving." },
      { q: 'Why link an expense to an income source?', a: "Linking an expense to its source lets you see what happened to each amount you received: how much was spent, why it was spent, which category it belongs to and what remains. Pata can also compare expenses with the budget planned for that income. Choosing the wrong source can make your remaining balances and history inaccurate." },
    ],
  },
  {
    title: 'Budgets, savings and planning',
    items: [
      { q: 'How do I create a budget?', a: "On a phone, tap Plus in the bottom bar, then Budgets. On a computer, choose Budgets in the left-hand menu. First select the month, then choose an income source from the list that says All income (Global). To prepare a new budget, choose Suggest a budget, review the categories and amounts, then save and apply the plan. To change an existing category limit, select the pencil beside that category, change the amount and save. You can prepare a different budget for each income source." },
      { q: 'How do I create a savings goal?', a: "On a phone, tap Plus in the bottom bar, then Goals. On a computer, choose Goals in the left-hand menu. Start a new goal, enter its name and target amount, then fill in the requested dates and payment frequency. Review the suggested plan and save. Open the goal later to add deposits and follow its progress." },
      { q: 'What is a savings pocket?', a: "A savings pocket lets you put money aside without a required end date or target amount. It is useful for building a reserve gradually. On a phone, tap Plus → Goals. On a computer, choose Goals in the left-hand menu. Create a savings pocket, then open it whenever you want to review the saved amount or add money." },
      { q: 'How do I create a project?', a: "Projects help you track money set aside for a specific purchase or plan. Open Expenses and find the Projects and funding section near the top of the page. Choose Create a project, enter its name and details, then save. You can then assign income and outflows to that project. Creating and tracking projects requires Pata Premium." },
      { q: 'How do I track a debt, loan or repayment?', a: "On a phone, tap Plus in the bottom bar, then Debts & Loans. On a computer, choose Debts & Loans in the left-hand menu. If you borrowed money, choose New debt. If you lend money to someone, choose New loan. Enter the person, amount and due date. Open the record later to add repayments and see what is still owed or due to you." },
      { q: 'How do I create a contribution or rotating savings group?', a: "On a phone, tap Plus in the bottom bar, then Contributions. On a computer, choose Contributions in the left-hand menu. Tap Create a group, enter its name, contribution amount, frequency, expected number of members and start date. Save the group, invite the members and arrange their turn order. Check that the participants and positions are ready before starting the contribution cycle." },
      { q: 'How do I chat with contribution group members?', a: "In Contributions, open the group you want and tap Discussion to view messages or write to the members. On a phone, scroll through the conversation and tap a message to see the available actions. Check the group name at the top before sending anything. Any free-message allowance or extra message packs are explained inside the conversation." },
      { q: 'How do I schedule a recurring expense?', a: "First record the expense in Expenses. Then open that expense and use the option to make it recurring when it is available. Choose the frequency and check the next date before confirming. You can later find the scheduled operation in Automations and pause or resume it." },
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
      { q: 'Where can I find financial reports?', a: "On a phone, tap Plus in the bottom bar, then Reports. On a computer, choose Reports in the left-hand menu. At the top, under Report period, choose Day, Week, Month, Year or Custom period. For a custom period, enter both dates. The figures and charts update to match the selected period." },
      { q: 'How do I export my data?', a: "On a phone, tap Plus → Settings. On a computer, choose Settings in the left-hand menu. Under Preferences and data, choose Export my data. Select Download as PDF for a readable copy, or Export to Excel to sort and review your transactions in a spreadsheet. Keep the file somewhere safe because it may contain personal financial information." },
      { q: 'How do I install the Android app?', a: "On your Android phone, tap Plus → Settings, then Download Android app under Preferences and data. You can also open Pata’s Download page directly. Download the file, find it in your phone’s Downloads app and tap it to start installation. If Android asks you to allow installation, check that the file came from Pata before continuing. After installation, sign in with the same account you use on the website." },
      { q: 'What does Mobile Money SMS import do?', a: "This feature helps Pata recognize MTN MoMo and Orange Money confirmation messages received on your Android phone. On a phone, tap Plus → Settings. On a computer, choose Settings in the left-hand menu. Under Security and notifications, open Mobile Money SMS import. Turn it on from your Android phone and allow the requested access. Automatic recording requires Pata Premium." },
      { q: 'What is the difference between Free and Premium?', a: 'The Free plan includes core features with monthly limits on selected creations and forecasts. Premium increases those limits and unlocks automatic Mobile Money confirmation tracking on Android. Check the Subscription page for current terms.' },
    ],
  },

  {
    title: 'Wallet and payments',
    items: [
      { q: 'How do I top up my Pata wallet?', a: "On a phone, tap Plus in the bottom bar, then Wallet. On a computer, choose Wallet in the left-hand menu. Under Top up my balance, enter a whole amount of at least XAF 100 or choose one of the suggested amounts, then tap Top up. Follow the payment instructions. Return to Pata and check the result: your balance increases only after the payment is confirmed." },
      { q: 'When does a top-up appear in my available balance?', a: 'The amount is added to your available balance only after the payment is confirmed. A pending top-up is not available balance. Check the transaction history and let Pata verify the payment before starting another one that appears stuck.' },
      { q: 'Where can I find wallet transactions?', a: "On a phone, tap Plus → Wallet. On a computer, choose Wallet in the left-hand menu. Scroll below the balance and top-up form to review the operations shown. Other wallet operations appear in their own section with a description, date and amount. A top-up that is still pending is not a confirmed payment." },
      { q: 'Does the wallet pay bills or move money automatically?', a: 'No. A top-up adds money only after confirmation. You must start and confirm each separate action in Pata, such as funding a savings goal. Review the amount and purpose before confirming.' },
    ],
  },
  {
    title: 'Bills and due dates',
    items: [
      { q: 'How do I add a recurring bill?', a: "On a phone, tap Plus in the bottom bar, then Bills. On a computer, choose Bills in the left-hand menu. Tap Add a bill. Enter its name, type, frequency and next due date. Add the amount when you know it, choose an expense category and set how many days before the due date you want a reminder. You can also enter the provider and a note." },
      { q: 'How do I record a bill whose amount changes?', a: "On a phone, tap Plus, then Bills. On a computer, choose Bills in the left-hand menu. Tap Add a bill. In the form, turn on the Variable amount option if the amount changes from one due date to the next. You can leave the amount blank at first. After paying the bill, open it, tap Mark paid and enter the amount you actually paid for that due date." },
      { q: 'Can Pata read a bill from a photo?', a: "On a phone, tap Plus, then Bills. On a computer, choose Bills in the left-hand menu. Tap Add a bill, then choose Read a bill from a photo. Take a photo or select an image from your device. Pata may suggest the provider, amount and due date. Review each field, correct mistakes and fill in anything missing before saving." },
      { q: 'How do I mark a bill as paid?', a: "Open the bill in Bills and tap Mark paid. Check the amount actually paid, the date and the income source that funded it, then confirm. Pata adds the related expense to your history and prepares the next due date for a recurring bill. Pata does not send the payment for you: you should first pay the bill yourself." },
      { q: 'Does Pata automatically withdraw money to pay my bills?', a: 'No. Pata tracks due dates and can remind you, but it does not automatically withdraw or move your money to pay a bill. Record the payment yourself after you have made it.' },
    ],
  },
  {
    title: 'Debts, loans and repayments',
    items: [
      { q: 'What is the difference between a debt and a loan I gave someone?', a: 'In Debts & Loans, “I owe” means you must repay a person or a bank. “Owed to me” means you lent money and expect to receive it back. Use New debt to record money you borrowed and New loan to record money you lent.' },
      { q: 'How do I record a repayment?', a: "On a phone, tap Plus, then Debts & Loans. On a computer, choose Debts & Loans in the left-hand menu. Open the debt or loan. If you are repaying money you borrowed, use the repayment action to record an expense. If someone is repaying money you lent, use the received-repayment action; Pata records it as money received and links it to that debt. Check the amount and person before confirming." },
      { q: 'Can I link a debt to another Pata account?', a: 'When the link request option is available, send the request to the other account and wait for its response. Your own record stays active while the request is pending. If accepted, repayments reported by the borrower still need confirmation from the creditor. A rejected link does not delete your personal record.' },
      { q: 'Why can I no longer create a debt on the Free plan?', a: 'The Free plan allows up to two active debts or loans. A fully repaid record frees a place. Premium allows unlimited tracking.' },
    ],
  },
  {
    title: 'Savings goals, pockets and withdrawals',
    items: [
      { q: 'What is the difference between a savings goal and a pocket?', a: 'A savings goal has a target amount and a defined period, with a suggested payment plan. A savings pocket is more flexible: you can add money when you choose without a required end date. You may also give a pocket an optional target.' },
      { q: 'How do I make a savings deposit?', a: "On a phone, tap Plus, then Goals. On a computer, choose Goals in the left-hand menu. Open the goal or savings pocket. In the deposit area, enter the amount in the field for money from your Pata wallet, then tap Deposit or Verser. Check that your wallet has enough available balance. A confirmed deposit appears in the savings history." },
      { q: 'How do I request a savings withdrawal?', a: "On a phone, tap Plus, then Goals. On a computer, choose Goals in the left-hand menu. Open the savings record and choose the withdrawal or closure action shown. Enter your Mobile Money number and select MTN or Orange. Review the net amount and any fees before submitting. A submitted request is not yet a completed payment; wait for processing and confirmation." },
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
      { q: 'How many messages can I send in a contribution group chat?', a: "You can send 10 free messages per day in a group conversation. After reaching that limit, you can still read older messages, but you need to buy a pack of 10 extra messages for XAF 100 to send more that day. The purchase option appears inside the conversation. Messages remain available for 30 days." },
      { q: 'Can I edit or delete a sent message?', a: 'Open the message options. You can reply to a message, edit your own message within 15 minutes of sending it, or delete a message when you have permission. The group owner also has the moderation permissions provided in the chat.' },
    ],
  },
  {
    title: 'Reports, exports and notifications',
    items: [
      { q: 'How do I choose a report period?', a: "On a phone, tap Plus in the bottom bar, then Reports. On a computer, choose Reports in the left-hand menu. At the top of the page, select Day, Week, Month, Year or Custom period. For a custom period, enter both the start and end dates. Check the period label before reading or exporting the figures." },
      { q: 'How do I download a PDF or Excel report?', a: "On a phone, tap Plus, then Reports. On a computer, choose Reports in the left-hand menu. Select the period at the top of the page first. When the report is displayed, use the PDF or Excel buttons at the top right to download that report. To export a broader copy of your account data, open Plus → Settings → Preferences and data → Export my data." },
      { q: 'Why does the report distinguish a loan from income?', a: 'Borrowed money temporarily increases available cash but must be repaid, so it is not earned income. Money lent to someone else is a cash outflow, but it is not everyday consumption. Reports separate these movements so the analysis is not misleading.' },
      { q: 'How do I manage Pata notifications?', a: "To manage Pata alerts, tap Plus → Settings on a phone, or choose Settings from the left-hand menu on a computer. Under Security and notifications, open Notifications and enable the alerts you want. On Android, also open your phone settings, go to Apps, choose Pata, then Notifications and allow them. On a computer, check that your browser allows notifications from the Pata website." },
    ],
  },
];

const HELP_STOP_WORDS = new Set([
  'a','au','aux','avec','ce','ces','comment','dans','de','des','du','elle','en','est','et','etre',
  'faire','il','ils','je','la','le','les','leur','lui','ma','mais','me','mes','mon','ne','nos','notre',
  'ou','par','pas','peut','pour','pourquoi','quand','que','quel','quelle','quelles','qui','quoi','sa',
  'se','son','sur','ta','te','tes','ton','tu','un','une','vos','votre','y','the','an','and','are',
  'can','do','for','from','how','i','in','is','it','my','of','on','or','to','what','when','where',
  'which','who','why','with','you','your'
]);

const helpNormalize = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const helpTokens = (value) => helpNormalize(value)
  .split(/\s+/)
  .filter((token) => token.length > 1 && !HELP_STOP_WORDS.has(token));

export function buildHelpKnowledgeContext(question, language = 'fr', maxItems = 5) {
  const query = helpNormalize(question);
  const queryTokens = [...new Set(helpTokens(question))];
  if (!query || !queryTokens.length) return '';

  const sections = language === 'en' ? HELP_EN : HELP_FR;
  const ranked = [];
  for (const section of sections) {
    for (const item of section.items || []) {
      const normalizedQuestion = helpNormalize(item.q);
      const normalizedAnswer = helpNormalize(item.a);
      const questionWords = new Set(normalizedQuestion.split(' '));
      let score = 0;
      for (const token of queryTokens) {
        if (questionWords.has(token)) score += 3;
        else if (normalizedQuestion.includes(token)) score += 2;
        else if (normalizedAnswer.includes(token)) score += 0.5;
      }
      if (normalizedQuestion && query.includes(normalizedQuestion)) score += 8;
      if (score > 0) ranked.push({ section: section.title, question: item.q, answer: item.a, score });
    }
  }

  ranked.sort((a, b) => b.score - a.score);
  const selected = ranked.slice(0, Math.max(1, Math.min(8, Number(maxItems) || 5)));
  if (!selected.length || selected[0].score < 2.5) return '';

  let remaining = 6500;
  const lines = [];
  for (const item of selected) {
    const block = 'Rubrique : ' + item.section
      + '\nQuestion : ' + item.question
      + '\nRéponse officielle : ' + item.answer;
    if (block.length > remaining) continue;
    lines.push(block);
    remaining -= block.length;
  }
  return lines.join('\n\n');
}

export function getHelpQuestionCount(language = 'fr') {
  const sections = language === 'en' ? HELP_EN : HELP_FR;
  return sections.reduce((sum, section) => sum + (section.items?.length || 0), 0);
}
