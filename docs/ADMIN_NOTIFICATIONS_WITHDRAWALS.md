# Administration, notifications et retraits Pata

Ce document concerne l'équipe qui exploite Pata. Les détails de configuration ne sont pas affichés aux utilisateurs.

## 1. Accès administrateur

- Ouvrir `/admin` après s'être connecté à un compte Pata.
- Le code est lu exclusivement depuis la variable serveur `CODE_ADMIN`.
- Ne jamais créer de variable `NEXT_PUBLIC_CODE_ADMIN` et ne jamais placer le code dans le dépôt.
- Utiliser une valeur aléatoire d'au moins 24 caractères. La session admin est liée au compte connecté, signée avec le code, limitée à quatre heures et stockée dans un cookie HttpOnly/SameSite strict.
- Après modification de `CODE_ADMIN` dans l'hébergeur, redéployer l'application. Les anciennes sessions ne seront plus valides.
- Après cinq codes incorrects, les tentatives depuis la même adresse sont bloquées pendant quinze minutes.

Le tableau de bord affiche des agrégats et des listes bornées. Il ne charge les conversations et les opérations détaillées que lorsqu'une fiche utilisateur est ouverte. L'onglet Questions IA traite un échantillon récent limité, et non l'ensemble des conversations. Les classements de dépenses et de revenus par utilisateur sont exacts à partir du moment où le suivi des compteurs a été activé; ils ne reconstruisent pas les anciennes opérations supprimées.

## 2. Notifications Web

### Variables

- `NEXT_PUBLIC_FIREBASE_VAPID_KEY` : clé publique Web Push du projet Firebase.
- `FIREBASE_SERVICE_ACCOUNT_KEY` : compte de service Firebase Admin autorisé à envoyer des messages Cloud Messaging.
- `CRON_SECRET` : secret aléatoire long utilisé par les tâches planifiées.

### Mise en place

1. Dans Firebase Console, ouvrir **Paramètres du projet** puis **Cloud Messaging**.
2. Dans **Certificats Web Push**, générer une paire de clés et copier la clé publique.
3. Renseigner cette clé dans `NEXT_PUBLIC_FIREBASE_VAPID_KEY` sur Vercel, pour les environnements nécessaires.
4. Vérifier que Cloud Messaging est activé pour le projet et que le compte de service Admin peut envoyer des messages FCM.
5. Déployer, ouvrir Pata en HTTPS, autoriser les notifications dans le navigateur et appuyer sur **Tester** dans Paramètres.
6. Le test réussi signifie que Firebase a accepté le message. Vérifier visuellement sa réception sur l'appareil, navigateur au premier plan et en arrière-plan.

Le test d'envoi réel est disponible dans Paramètres. Les nouveaux appareils sont inscrits au groupe `pata_all_users`. Dans Administration > Notifications, utiliser **Synchroniser les anciens appareils** après déploiement pour inscrire les jetons des utilisateurs qui avaient activé les notifications avant l'ajout du groupe. La synchronisation se fait par lots de 300 profils environ (maximum 400); lancer le lot suivant jusqu'à la fin. Chaque profil est lu au plus une fois par lot et aucun historique financier n'est chargé.

Les notifications générales sont envoyées au groupe FCM, sans parcourir les profils un par un au moment de chaque diffusion. Les rappels quotidiens restent personnalisés et lisent les informations de comptes abonnés aux notifications ainsi que leurs opérations récentes. À titre d'ordre de grandeur, cette tâche effectue quelques lectures par compte activé; surveiller les métriques Firestore lorsque le nombre d'utilisateurs augmente et adapter le lotissement si nécessaire.

### Heure des rappels

`vercel.json` programme le rappel quotidien à 19:30 UTC, soit 20:30 au Cameroun en UTC+1. L'exécution réelle dépend de la disponibilité du planificateur et du plan Vercel. Les tâches doivent être déployées en production et la variable `CRON_SECRET` doit être présente.

## 3. Retraits Fapshi

Les retraits Fapshi utilisent un service distinct des clés de collecte des dépôts. Ne pas mettre les clés de dépôt dans les variables de retrait.

Variables dédiées :

- `FAPSHI_PAYOUT_API_USER`
- `FAPSHI_PAYOUT_SECRET_KEY`
- `FAPSHI_PAYOUT_BASE_URL` : commencer par `https://sandbox.fapshi.com`; ne passer à `https://live.fapshi.com` qu'après activation officielle du service de retrait en production.
- `FAPSHI_PAYOUT_WEBHOOK_SECRET`
- `PATA_WITHDRAWAL_FEE_XAF` : frais Pata facultatifs configurés en XAF; la valeur par défaut est `0`. Ne pas y inclure un frais Fapshi non confirmé.

Déroulement :

1. L'utilisateur demande le retrait depuis un objectif ou sa tirelire. Pata calcule le montant brut, les éventuelles déductions, pénalités et frais Pata, puis crée une demande **À vérifier**.
2. Aucun paiement n'est transmis automatiquement à Fapshi à cette étape. Le montant reste réservé et l'objectif est verrouillé pour éviter une double demande.
3. L'administrateur vérifie le numéro, le montant et l'historique, puis choisit **Valider et payer** ou **Refuser**.
4. À la validation, le serveur transmet la demande au service Fapshi Payout. Le statut reste en traitement jusqu'au webhook de confirmation.
5. En cas de réponse réseau ambiguë ou d'erreur serveur, le statut devient **Vérification nécessaire**. Ne jamais cliquer à nouveau pour renvoyer le paiement avant d'avoir rapproché la demande avec le tableau de bord Fapshi.

Fapshi indique une fourchette de 100 à 500 000 XAF par retrait. Pata refuse donc une demande dont le montant net dépasse 500 000 FCFA en une seule opération; le retrait partiel ou fractionné n’est pas activé dans cette version. Son service de retrait est distinct du service de collecte et doit être activé pour la production par Fapshi. Le compte de retrait doit également disposer de fonds. Les fonds de collecte peuvent être transférés vers le service de retrait depuis le tableau de bord Fapshi selon les modalités proposées par le prestataire.

**Activation en production :** commence par des essais avec les identifiants de sandbox. Lorsque les essais de bout en bout et le webhook sont validés, contacte le support développeur Fapshi pour demander l’activation du service Payout LIVE. Communique uniquement l’identifiant utilisateur API LIVE demandé par Fapshi; ne transmets jamais la clé API secrète dans un message de support. Après confirmation de l’activation, configure `FAPSHI_PAYOUT_API_USER`, `FAPSHI_PAYOUT_SECRET_KEY` et `FAPSHI_PAYOUT_BASE_URL=https://live.fapshi.com` dans les variables privées de Vercel, puis redéploie. Vérifie aussi que le solde du service Payout est suffisamment approvisionné. Le solde du service de collecte et celui du service Payout sont distincts; consulte les frais et délais de transfert directement dans ton espace Fapshi avant tout retrait réel.

Pata n'effectue pas de paiement fractionné dans cette version. Pour une épargne dont le montant net dépasse le plafond par retrait, la demande est refusée avec une explication et doit être traitée avec le support avant d'autoriser l'utilisateur à soumettre une demande adaptée.

## 4. Déploiement prudent

- Configurer les variables ci-dessus dans les paramètres privés de l'hébergeur, jamais dans Git.
- Commencer par les retraits sandbox; ne pas activer l'URL live avant accord écrit/activation de Fapshi.
- Vérifier l'URL du webhook de retrait configurée chez Fapshi : `/api/fapshi/payout-webhook` et le secret partagé correspondant.
- Tester un retrait bout en bout, y compris le retour du webhook, avant de permettre les retraits réels aux utilisateurs.
- Surveiller les erreurs d'envoi et les états **Vérification nécessaire** dans l'espace Administration.
- Le tableau de bord admin contient des informations personnelles et des conversations privées. Réserver le code à l'administrateur et protéger aussi le compte Pata utilisé pour ouvrir `/admin`.
