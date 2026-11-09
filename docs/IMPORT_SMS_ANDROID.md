# Import Mobile Money depuis les SMS — état technique et stratégie Android

## Ce que le parseur fait aujourd'hui

`src/lib/sms/parseMobileMoneySms.mjs` analyse localement les SMS MTN MoMo et Orange Money et retourne uniquement des champs structurés : opérateur, identifiant de transaction, montant, nature de l'opération, sens, date, heure et solde. Le texte brut n'est pas inclus dans le résultat et ne doit jamais être envoyé à une API.

Les opérations prises en charge sont : réception, envoi, paiement et retrait. Un retrait est volontairement distingué d'une dépense : retirer de l'argent liquide n'est pas nécessairement une consommation. Les messages en échec, les fournisseurs non reconnus et les messages sans identifiant de transaction sont ignorés.

Tests unitaires : `node --test tests/parseMobileMoneySms.test.mjs`.

## Blocage avant l'APK avec réception SMS automatique

Le manifeste Android `RECEIVE_SMS` est une permission *hard restricted*. La documentation Android précise qu'elle doit être explicitement autorisée par l'installateur du paquet. Une installation APK ordinaire depuis un navigateur/site web ne permet pas de garantir cette autorisation. Play Protect classe également les APK installés depuis des sources Internet qui déclarent des permissions sensibles SMS parmi les applications à haut risque et peut bloquer leur installation.

En conséquence, ajouter simplement `RECEIVE_SMS` à un APK distribué sur `pata-yam.site` ne permet pas de promettre que la réception en arrière-plan fonctionnera sur les téléphones des utilisateurs. Ce dépôt ne doit pas publier un APK qui prétend offrir cette fonction sans canal d'installation capable d'autoriser réellement la permission.

Références officielles :

- Android `Manifest.permission.RECEIVE_SMS` : https://developer.android.com/reference/android/Manifest.permission#RECEIVE_SMS
- Google Play Protect — protections pour les applications installées depuis Internet : https://developers.google.com/android/play-protect/client-protections

## Parcours compatible avec un APK téléchargé depuis le site

La solution de repli techniquement réaliste est un import volontaire par partage : dans l'application Messages, l'utilisateur partage un SMS de confirmation vers Pata. Pata analyse le texte sur l'appareil, ne transmet que les champs parsés, puis demande confirmation avant l'écriture. Cette approche ne nécessite ni `READ_SMS` ni `RECEIVE_SMS` et laisse le contrôle à l'utilisateur, mais elle n'est pas une détection automatique en arrière-plan.

Pour une véritable réception automatique, il faut d'abord choisir un canal de distribution/installation qui peut légalement et techniquement autoriser la permission restreinte, ou transformer Pata en application SMS par défaut (ce qui implique une application de messagerie complète et un périmètre fonctionnel beaucoup plus large).

## Règles d'intégration serveur à respecter

- Chaque endpoint doit vérifier le jeton Firebase Admin côté serveur et vérifier `premiumUntil` côté serveur.
- L'identifiant de transaction doit être haché avant de servir de clé de déduplication ; ne pas le conserver en clair si ce n'est pas indispensable.
- Ne jamais stocker ni transmettre le SMS brut, le numéro de téléphone de l'expéditeur ou le solde du portefeuille pour l'import.
- Une dépense confirmée doit passer par `createExpenseForUser` pour conserver les règles d'allocation des revenus, les contrôles de solde et les budgets.
- Un revenu confirmé doit passer par la logique serveur existante, avec une clé d'idempotence propre à l'import.
- Un import doit rester en attente tant que l'utilisateur n'a pas choisi sa catégorie et confirmé. Un doublon doit retourner l'import existant, jamais créer une seconde opération.
- Les retraits doivent rester en attente de classification ; ils ne doivent pas être comptabilisés automatiquement comme une consommation.

## Limite des modèles SMS

Les textes des opérateurs changent selon le type de transaction, le canal marchand et les versions de service. Les exemples de test sont des cas de référence, pas une garantie d'exhaustivité. Avant d'activer un import en production, ajouter des exemples réels anonymisés pour les reçus, envois, paiements et retraits des deux opérateurs, puis étendre les tests correspondants.
