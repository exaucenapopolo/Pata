# Pata Android — import Mobile Money par SMS

## Fichiers et architecture

Le dépôt contient désormais la configuration Capacitor, le plugin Java natif, le récepteur SMS, l'intégration Android Sharesheet, les routes API d'import, les interfaces Premium et de confirmation, la page de téléchargement et le vérificateur de mise à jour.

Le projet Android est généré par Capacitor pendant le workflow CI, puis les classes Java et les déclarations de manifeste conservées sous native/android sont injectées. Cela évite de committer les fichiers Android générés et les caches Gradle.

## Flux automatique

1. Le récepteur Android reçoit SMS_RECEIVED uniquement lorsque RECEIVE_SMS a été accordée et que l'appareil possède une configuration Premium encore valide.
2. Le texte SMS est analysé localement ; il n'est pas sauvegardé dans la file et n'est jamais transmis au serveur.
3. Le serveur reçoit le fournisseur, le montant, le type, la direction, la date, l'heure et une empreinte SHA-256 de fournisseur + numéro de transaction.
4. Le serveur vérifie le jeton Firebase, le profil Premium et l'activation de la fonction.
5. À la reprise de Pata ou lorsque l'utilisateur ouvre la notification locale, le navigateur intégré synchronise la file avec la route /api/sms-import.
6. L'utilisateur choisit la catégorie, la source de revenus si nécessaire, puis confirme ou refuse.
7. La confirmation délègue aux routes /api/expenses/add ou /api/incomes/add. Les deux routes disposent d'une clé d'idempotence propre aux imports SMS.

La file native est liée à l'UID Pata actif au moment de la détection, afin qu'un changement de compte ne rattache pas les anciens SMS à un autre utilisateur. La file et les opérations serveur ne contiennent que les données nécessaires à l'identification et à la confirmation. Le SMS brut et le numéro de téléphone de l'expéditeur ne quittent pas le téléphone.

La contrepartie (uniquement un nom affichable qui ne ressemble pas à un numéro) et le solde restent dans une table de préférences locales indexée par l'empreinte de transaction. Ils sont affichés dans la fiche de confirmation puis effacés après confirmation ou refus. Ces deux informations ne sont ni envoyées à l'API, ni écrites dans Firestore.

## Retraits

Un retrait est distingué d'un paiement ou d'un envoi. Il est proposé à l'utilisateur, mais ne devient une dépense que s'il choisit explicitement de le comptabiliser comme tel.

## Android Sharesheet

L'application déclare ACTION_SEND avec text/plain. L'utilisateur peut partager un SMS depuis son application Messages vers Pata. Le texte est analysé par le parseur JavaScript local puis effacé de la mémoire de partage après traitement. La route serveur reçoit les champs parsés nécessaires et la même empreinte. La contrepartie et le solde restent dans le stockage local, comme pour la détection automatique. Le partage manuel fonctionne pour un compte Premium même si le récepteur automatique est désactivé ou indisponible.

## Permission RECEIVE_SMS et installation depuis le site

Android classe RECEIVE_SMS comme une permission dangereuse fortement restreinte (hard restricted). La documentation Android précise qu'elle ne peut être détenue que si l'installateur du paquet l'autorise. En plus, Google Play Protect indique que les applications installées depuis une source Internet et déclarant RECEIVE_SMS ou READ_SMS peuvent être bloquées à l'installation.

Il faut donc tester le comportement sur les versions Android et les installateurs réellement ciblés. La demande runtime est intégrée, mais elle ne peut pas lever à elle seule une restriction de l'installateur. Le partage manuel reste le mode de repli.

Références officielles :
- https://developer.android.com/reference/android/Manifest.permission#RECEIVE_SMS
- https://developers.google.com/android/play-protect/warning-dev-guidance

## Batterie et arrière-plan

L'écran Paramètres propose d'ouvrir les paramètres d'optimisation de batterie. Sur les appareils Tecno, Infinix et Xiaomi, l'utilisateur doit aussi autoriser Pata à fonctionner sans restriction dans les paramètres du fabricant, lorsque cette option est disponible.

Le BroadcastReceiver ne tente pas de lancer une activité en arrière-plan ni d'envoyer des requêtes réseau sans jeton utilisateur. Il stocke localement les champs parsés et affiche une notification ; la synchronisation serveur a lieu lorsque l'application est au premier plan.

## Build et tests

Prérequis : Node.js 20+, Java 17 et Android SDK.

- npm install
- npm run test:sms
- npx cap add android
- node native/android/prepare-android.mjs
- npx cap sync android
- cd android && ./gradlew assembleDebug

Le workflow .github/workflows/android-apk.yml compile automatiquement une APK debug de vérification et l'archive comme artefact GitHub Actions.

## Signature de distribution

Une APK de distribution exige une clé privée stable. Ne jamais mettre cette clé dans le dépôt public. Configure les secrets GitHub suivants :
- ANDROID_KEYSTORE_BASE64
- ANDROID_KEYSTORE_PASSWORD
- ANDROID_KEY_ALIAS
- ANDROID_KEY_PASSWORD

Puis lance le workflow Android avec publish_release=true. Il compile l'APK release signée, crée la release GitHub et active le lien de téléchargement dans public/android-version.json. Sans ces secrets, seule l'APK debug de vérification est produite et la page /telecharger reste désactivée.
