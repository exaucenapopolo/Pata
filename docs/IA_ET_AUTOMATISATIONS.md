# Pata — IA financière et automatisations

## Ce qui a été renforcé

- Les appels d'outils Groq sont exécutés sur le serveur, et non plus interprétés puis réexécutés dans le navigateur.
- Après chaque action, le résultat réel est renvoyé au modèle pour qu'il puisse expliquer ce qui a été fait ou refusé.
- Plusieurs appels d'outils peuvent être traités au cours d'une même demande, avec une limite de tours pour éviter une boucle.
- L'historique transmis au modèle peut contenir jusqu'à 24 messages récents, avec une limite de taille par message. Les lectures de contexte financier sont plafonnées (100 revenus, 200 dépenses, 20 objectifs et 50 budgets/automatisations/catégories) pour limiter la consommation Firestore.
- Une mémoire persistante est stockée dans `users/{uid}/ai_memory/profile`. Elle ne doit contenir que des objectifs, préférences, contraintes et corrections financières explicitement déclarés. Une citation exacte du message utilisateur est requise avant l'enregistrement.
- Les dépenses sont validées et enregistrées dans une transaction Firestore. La source de revenu est résolue par identifiant, puis son nom réel est enregistré dans `incomeSourceName`. Le nom de la source n'est jamais utilisé comme simple note.
- La modification et la suppression des dépenses passent désormais par des routes serveur authentifiées. Une modification recalcule les disponibilités avant d'enregistrer la nouvelle répartition. L'assistante dispose également d'actions de modification/suppression qui exigent l'identifiant exact d'une dépense.
- La répartition « Tous les revenus » consomme d'abord les sources ayant le plus petit solde disponible, conformément à la logique prévue.
- Un budget ne crée plus un revenu artificiel : les enveloppes budgétaires sont enregistrées séparément et peuvent être reliées à une source existante.
- Les automatisations sont vérifiées côté serveur, limitées aux sources de revenus auxquelles elles sont rattachées, protégées contre les doubles exécutions du même créneau et mises à jour avec leur statut de dernière exécution.
- La vérification du quota IA intervient après validation du contenu; une réservation de quota est restituée lorsqu'une erreur technique interrompt la requête avant une action réussie.

## Configuration requise pour les automatisations autonomes

1. Déployer le projet sur Vercel en production.
2. Ajouter les variables d'environnement indiquées dans `.env.example`, sans mettre les valeurs secrètes dans le dépôt.
3. Définir `CRON_SECRET` dans les variables d'environnement Vercel. Vercel transmet ce secret au chemin planifié sous la forme `Authorization: Bearer ...`.
4. Le fichier `vercel.json` déclare un contrôle quotidien à minuit UTC sur `/api/automations/scheduler`.
5. Les automatisations dues sont également vérifiées à l'ouverture de l'application via `/api/automations/run`, ce qui permet un rattrapage lorsque l'application est ouverte.

Les nouvelles échéances sans date de départ sont alignées sur minuit UTC, heure du contrôle quotidien. Le contrôle planifié quotidien permet ainsi aux automatisations quotidiennes, hebdomadaires et mensuelles de se déclencher sans que l'utilisateur ouvre Pata. Il ne garantit pas une exécution à la minute près : le moment exact dépend de la précision du plan Vercel et de l'exécution effective de la fonction. Les occurrences manquées sont volontairement regroupées : une occurrence arrivée à échéance est traitée, puis la prochaine date est avancée au prochain créneau futur, afin d'éviter de créer une série de dépenses historiques en rafale après une interruption.

Sur le plan Vercel Hobby, les Cron Jobs sont limités à une exécution planifiée par jour, avec une précision annoncée d'environ ±59 minutes; les plans Pro et Enterprise prennent en charge une précision à la minute. Voir la documentation Vercel avant de promettre une heure précise à l'utilisateur : https://vercel.com/docs/cron-jobs/usage-and-pricing.

## Routes utilisées

- `POST /api/ai/chat` : conversation et outils financiers côté serveur.
- `POST /api/expenses/add` : création de dépense par le formulaire existant, avec la même validation financière et quota mensuel.
- `POST /api/expenses/update` : modification contrôlée d'une dépense.
- `POST /api/expenses/delete` : suppression contrôlée d'une dépense.
- `POST /api/automations/run` : exécution des automatisations d'un utilisateur connecté.
- `GET /api/automations/scheduler` : déclenchement planifié protégé par `CRON_SECRET`, vérification des tâches récurrentes et génération des bilans hebdomadaires.

## Notes de compatibilité

Les intégrations Fapshi, Firebase, Groq, Gemini et Pollinations, leurs noms de variables d'environnement et leurs appels existants ont été conservés. Aucune clé réelle n'est incluse dans cette archive. Les documents d'automatisation déjà présents restent compatibles : en l'absence du champ `active`, ils sont considérés comme actifs.

Cette archive ne contient pas de règles Firestore (`firestore.rules`) ni de configuration d'émulateur; les règles de sécurité déjà configurées sur le projet Firebase ne sont donc pas remplacées par ce travail.
