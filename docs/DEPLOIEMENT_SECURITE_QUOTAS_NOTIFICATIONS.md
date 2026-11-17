# Déploiement des protections, quotas et notifications

## 1. Variables d’environnement

Conserver les variables déjà utilisées par Pata dans Vercel. Pour le client Firebase, vérifier les variables `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` et `NEXT_PUBLIC_FIREBASE_APP_ID`. Pour les notifications Web Push, définir `NEXT_PUBLIC_FIREBASE_VAPID_KEY` avec la clé publique VAPID du projet Firebase.

Les secrets serveur Firebase Admin et les clés des prestataires restent des variables privées côté Vercel. Ne pas les ajouter à `.env.example`, au dépôt public ni au code client.

## 2. Code administrateur

Définir `CODE_ADMIN` dans les variables privées Vercel. Choisir un secret long et aléatoire. Il est vérifié côté serveur et ne doit jamais être envoyé au navigateur.

## 3. Règles Firestore

Le fichier `firestore.rules` protège les compteurs mensuels, les soldes, les créations de revenus, budgets, dépenses et objectifs contre les écritures directes du navigateur. Les écritures métier passent par les routes serveur utilisant Firebase Admin.

Déployer les règles avec Firebase CLI :

```powershell
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules --project TON_FIREBASE_PROJECT_ID
```

Remplacer `TON_FIREBASE_PROJECT_ID` par la valeur de `NEXT_PUBLIC_FIREBASE_PROJECT_ID` configurée dans Vercel. Vérifier ensuite dans Firebase Console que les règles publiées correspondent au fichier du dépôt.

## 4. Notifications Web Push

Dans Firebase Console → Paramètres du projet → Cloud Messaging, générer une paire de clés Web Push et copier la clé publique dans `NEXT_PUBLIC_FIREBASE_VAPID_KEY`. Vérifier que Firebase Cloud Messaging est activé et que les identifiants de service Firebase Admin utilisés par le serveur appartiennent au même projet.

Les notifications nécessitent HTTPS, une autorisation explicite de l’utilisateur et un navigateur/appareil compatible. Le bouton de test confirme que Firebase a accepté le message ; seule la réception sur un appareil réel confirme l’affichage. Tester application ouverte, en arrière-plan et fermée.

## 5. Quotas et fenêtres d’envoi des notifications

Les rappels financiers du soir sont répartis en deux passages quotidiens dans la plage **17 h 30–22 h 30, heure du Cameroun** (`Africa/Douala`) :
- Premier passage : Cron à 16:30 UTC, exécution possible entre 17 h 30 et 18 h 29 au Cameroun.
- Second passage : Cron à 19:30 UTC, exécution possible entre 20 h 30 et 21 h 29 au Cameroun.

Sur Vercel Hobby, chaque tâche Cron peut tourner une fois par jour et son démarrage peut se produire à n'importe quel moment de l'heure planifiée (±59 min). Les 100 tâches Cron autorisées par projet permettent ces deux passages séparés ; ils ne garantissent toutefois pas une minute précise et Vercel ne relance pas automatiquement une tâche en échec. Les rappels du week-end restent planifiés vendredi/dimanche à 17:00 UTC (18:00) et samedi à 16:30 UTC (17:30).

Les quotas sont indépendants : **deux rappels financiers maximum le soir**, un seul réservé par passage (dettes, factures, dépenses récurrentes reconnues et point financier), et **trois messages maximum en journée** (rétention, découverte et week-end), avec un intervalle minimal de 90 minutes entre les messages de journée. Les alertes de cotisation et les autres notifications opérationnelles/transactionnelles ne réservent aucun de ces quotas. Chaque passage possède son identifiant de notification et sa clé d'e-mail afin que le second message ne remplace pas le premier et ne soit pas bloqué par son idempotence.

Le relais e-mail des notifications automatiques est limité à 100 e-mails par jour UTC et utilise une clé d’idempotence pour éviter les doublons lors des nouvelles tentatives. Les e-mails transactionnels envoyés directement par `sendPataEmail` restent séparés de ce plafond. Les e-mails de secours pour les rappels de cotisation utilisent le plafond e-mail de 100/jour, mais pas le quota de deux notifications.

## 6. Validation des quotas

Les limites sont appliquées côté serveur dans des transactions Firestore. La suppression d’un élément ne décrémente pas le compteur mensuel. Les règles Firestore empêchent le navigateur de modifier directement les compteurs ou de créer directement les revenus, budgets, dépenses et objectifs.
