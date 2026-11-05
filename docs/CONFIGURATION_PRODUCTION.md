# Configuration de production de Pata

Ce document complète les paramètres déjà utilisés par Pata. Il ne remplace aucune clé existante et ne contient aucune clé secrète.

## 1. Variables à conserver

Conserve toutes les variables déjà configurées dans ton projet Vercel : Firebase (client et compte de service), Fapshi, Groq, Gemini et les autres fournisseurs réellement utilisés par ton installation.

Ajoute ou vérifie également les variables suivantes :

- `NEXT_PUBLIC_FIREBASE_VAPID_KEY` : clé Web Push publique créée dans les paramètres Cloud Messaging du projet Firebase. Elle permet au navigateur de s'abonner aux notifications web.
- `CRON_SECRET` : secret aléatoire long et privé. Vercel l'utilise pour autoriser les appels aux planificateurs de Pata.

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
- `/api/notifications/scheduler` à 19:30 UTC, soit 20:30 au Cameroun (UTC+1). Il choisit un rappel quotidien selon les données réelles du compte et évite d'envoyer plus d'un rappel journalier au même compte.

Les deux routes exigent `CRON_SECRET`. Configure cette variable dans Vercel pour les environnements de production, puis redéploie. Vérifie ensuite l'historique des Cron Jobs et les journaux de fonctions Vercel.

Les notifications ne sont envoyées qu'aux utilisateurs qui ont activé les notifications et dont un appareil possède un jeton valide. L'heure d'exécution dépend du planificateur et du plan Vercel du projet.

## 4. Confidentialité et déploiement

- Ne copie jamais de fichier `.env`, `.env.local` ou de clé privée dans GitHub.
- Le fichier `.env.example` ne contient que les noms des variables à configurer.
- Les pages « Confidentialité » et « Conditions d'utilisation » sont des textes de départ à faire relire et adapter avant une mise en service commerciale selon les pays visés.

## 5. Accès administrateur et retraits

Consulte `docs/ADMIN_NOTIFICATIONS_WITHDRAWALS.md` pour le détail de l'accès administrateur, la configuration Web Push, la synchronisation des anciens appareils et les retraits Fapshi. La variable `CODE_ADMIN` doit rester une variable serveur privée, sans préfixe `NEXT_PUBLIC_`. Pour les retraits, configure un service Fapshi Payout distinct et commence en sandbox.
