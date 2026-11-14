# Tests de production Pata (lecture seule)

Ce contrôle utilise les vraies routes Pata et, lorsque les secrets sont fournis, les vraies données Firestore d'un compte de test. Il ne crée, ne modifie et ne supprime aucune donnée financière.

## Lancer les contrôles d'accès

Depuis la racine du dépôt, avec Node.js 18 ou plus récent :

```bash
npm run test:e2e:production
```

Les trois routes sensibles doivent refuser les requêtes sans jeton Firebase.

## Activer les vérifications sur un compte réel

Utilise un **compte de test** qui possède au moins un revenu. L'identifiant du revenu doit appartenir à ce compte. Pour tester la console administrateur, utilise un compte administrateur de test et une session administrateur encore valide.

Définis les variables uniquement dans ton terminal ou dans les secrets du système CI. Ne les ajoute jamais à un fichier du dépôt et ne les envoie pas dans une conversation.

```bash
export PATA_E2E_BASE_URL="https://www.pata-yam.site"
export PATA_E2E_ID_TOKEN="JETON_FIREBASE_TEMPORAIRE_DU_COMPTE_DE_TEST"
export PATA_E2E_INCOME_ID="IDENTIFIANT_D_UN_REVENU_DU_COMPTE_DE_TEST"
# Facultatif : nécessaire uniquement pour les contrôles admin
export PATA_E2E_ADMIN_COOKIE="pata_admin_session=VALEUR_DE_SESSION_ADMIN"
npm run test:e2e:production
```

Le jeton Firebase doit être frais et appartenir au même compte que le revenu testé. Le cookie admin doit correspondre à ce même utilisateur et à une session déverrouillée dans Pata. Les tests vérifient le résumé des dépenses liées à un revenu (agrégats et pages de 50 maximum), puis la vue générale et la liste des comptes si les droits administrateur sont disponibles.

## Ce que le test ne fait volontairement pas

Aucun paiement, recharge, dépense, revenu, remboursement, cotisation, retrait ou changement de profil n'est déclenché. Pour ne pas risquer de modifier un compte réel, les actions d'écriture ne sont pas exécutées dans ce contrôle de production. Les tests d'écriture nécessitent un environnement Firebase dédié avec des données de test jetables.
