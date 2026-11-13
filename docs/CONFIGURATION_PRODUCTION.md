# Configuration de production de Pata

Ce document complète les paramètres déjà utilisés par Pata. Il ne remplace aucune clé existante et ne contient aucune clé secrète.

## 1. Variables à conserver

Conserve toutes les variables déjà configurées dans ton projet Vercel : Firebase (client et compte de service), Fapshi, Groq, Gemini et les autres fournisseurs réellement utilisés par ton installation.

Ajoute ou vérifie également les variables suivantes :

- `NEXT_PUBLIC_FIREBASE_VAPID_KEY` : clé Web Push publique créée dans les paramètres Cloud Messaging du projet Firebase. Elle permet au navigateur de s'abonner aux notifications web.
- `CRON_SECRET` : secret aléatoire long et privé. Vercel l'utilise pour autoriser les appels aux planificateurs de Pata.
- `RESEND_API_KEY` : clé serveur Resend pour les e-mails transactionnels et les rappels.
- `RESEND_FROM_EMAIL` : adresse d'expédition Pata dont le domaine doit être vérifié chez Resend.
- `NEXT_PUBLIC_APP_URL` : URL publique de Pata utilisée dans les liens des e-mails.

Les variables `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` et `NEXT_PUBLIC_FIREBASE_APP_ID` doivent déjà correspondre au même projet Firebase que le compte de service Admin.

## 2. Notifications web

1. Dans Firebase Console, ouvre le projet utilisé par Pata.
2. Vérifie que Firebase Cloud Messaging est disponible et que les paramètres Web Push contiennent une paire de clés VAPID.
3. Renseigne la clé publique dans `NEXT_PUBLIC_FIREBASE_VAPID_KEY` sur Vercel.
4. Vérifie que le compte de service Firebase Admin possède les autorisations nécessaires pour envoyer des messages Firebase Cloud Messaging.
5. Déploie Pata, connecte-toi à l'application, puis active les notifications dans Paramètres.
6. Autorise les notifications dans le navigateur ou sur l'appareil.

Le service worker PWA principal (`/sw.js`) et le service worker Firebase (`/firebase-messaging-sw.js`) utilisent maintenant des portées distinctes pour ne pas se remplacer.

## 3. Planificateurs

`vercel.json` déclare deux tâches planifiées :

- `/api/automations/scheduler` à 00:00 UTC, soit environ 01:00 au Cameroun (UTC+1). Il vérifie les opérations récurrentes dues et génère le bilan hebdomadaire lorsqu'il est disponible.
- `/api/notifications/scheduler` à 19:30 UTC, soit 20:30 au Cameroun (UTC+1). Il gère les rappels de dettes et de factures, le résumé quotidien et appelle aussi le planificateur des cotisations. Les rappels de cotisation sont donc exécutés sans ajouter un troisième Cron.

Les deux routes exigent `CRON_SECRET`. Configure cette variable dans Vercel pour les environnements de production, puis redéploie. Vérifie ensuite l'historique des Cron Jobs et les journaux de fonctions Vercel.

Les canaux sont indépendants :
- Les notifications push sont envoyées uniquement aux appareils qui ont accepté l'autorisation et possèdent un jeton valide.
- Les rappels d'échéance par e-mail (dettes, factures et cotisations) sont activés par défaut si le compte possède une adresse e-mail. L'utilisateur peut les désactiver dans Paramètres → Notifications.
- Le résumé financier quotidien par e-mail est facultatif et désactivé par défaut. Il s'active séparément dans Paramètres → Notifications.
- Les confirmations transactionnelles (création de groupe, paiement confirmé, réinitialisation du code secret, etc.) restent distinctes des préférences de rappel.

Les e-mails de dette et de facture qui échouent sont retentés lors de l'exécution quotidienne suivante sans renvoyer inutilement la notification push. Pour une meilleure délivrabilité, vérifie le domaine expéditeur dans Resend. Le domaine `pata-yam.site` peut être utilisé comme expéditeur après validation de ses enregistrements DNS dans Resend ; ne remplace pas l'adresse actuellement configurée avant cette validation.

L'heure d'exécution dépend du planificateur et du plan Vercel du projet.

## 4. Confidentialité et déploiement

- Ne copie jamais de fichier `.env`, `.env.local` ou de clé privée dans GitHub.
- Le fichier `.env.example` ne contient que les noms des variables à configurer.
- Les pages « Confidentialité » et « Conditions d'utilisation » sont des textes de départ à faire relire et adapter avant une mise en service commerciale selon les pays visés.

## 5. Accès administrateur et retraits

Consulte `docs/ADMIN_NOTIFICATIONS_WITHDRAWALS.md` pour le détail de l'accès administrateur, la configuration Web Push, la synchronisation des anciens appareils et les retraits Fapshi. La variable `CODE_ADMIN` doit rester une variable serveur privée, sans préfixe `NEXT_PUBLIC_`. Pour les retraits, configure un service Fapshi Payout distinct et commence en sandbox.
