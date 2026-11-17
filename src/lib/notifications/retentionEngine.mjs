export const MAX_DAILY_RETENTION_NOTIFICATIONS = 2;
export const MAX_DAILY_NON_ESSENTIAL_NOTIFICATIONS = 3;
export const MIN_NON_ESSENTIAL_GAP_MS = 90 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

const CATEGORY_ADVICE = Object.freeze({
  food: [
    "Avant de refaire des courses, vérifie ce qu’il reste déjà dans tes placards et prépare une liste précise pour éviter les achats en double.",
    "Regroupe les achats alimentaires lorsque c’est possible : plusieurs petits passages au magasin peuvent coûter plus cher qu’une liste préparée à l’avance.",
    "Compare le prix au kilo ou au litre pour les produits que tu achètes souvent, pas seulement le prix affiché sur l’emballage.",
    "Préparer certains repas à la maison peut aider, mais vérifie aussi le coût des ingrédients et choisis les jours où cela revient réellement moins cher.",
    "Sépare les courses prévues des achats spontanés comme les boissons et les petits snacks : tu verras plus facilement ce qui fait grimper le total.",
    "Définis une enveloppe alimentaire par semaine et fais un point à mi-semaine pour ajuster les prochains achats sans supprimer les repas nécessaires.",
    "Repère les repas ou produits qui coûtent le plus et cherche une alternative moins chère pour quelques jours, sans sacrifier la qualité ni la quantité."
  ],
  transport: [
    "Regroupe, lorsque c’est possible et sûr, plusieurs déplacements dans une même sortie pour éviter de payer plusieurs trajets séparés.",
    "Repère les trajets que tu effectues le plus souvent et estime leur coût sur une semaine : une limite hebdomadaire sera plus facile à suivre.",
    "Avant de sortir, vérifie si certaines courses peuvent être faites sur le même itinéraire afin d’éviter un déplacement supplémentaire.",
    "Compare les options de transport disponibles pour tes trajets habituels en tenant compte du prix, du temps et de la sécurité.",
    "Note les petits déplacements imprévus pendant quelques jours : leur total peut expliquer une partie importante des dépenses de transport.",
    "Lorsque ton programme le permet, prépare tes déplacements à l’avance plutôt que de multiplier les trajets de dernière minute.",
    "Fixe un montant de transport réaliste pour la semaine et vérifie le solde restant avant les déplacements non indispensables."
  ],
  housing: [
    "Sépare les charges fixes du logement (loyer, abonnements) des dépenses variables (eau, électricité, entretien) pour repérer ce qui peut réellement évoluer.",
    "Vérifie les consommations d’eau et d’électricité lorsqu’elles sont facturées séparément : de petites habitudes peuvent réduire les gaspillages.",
    "Anticipe les dépenses d’entretien prévisibles et réserve progressivement une somme plutôt que de subir une grosse sortie imprévue.",
    "Regroupe les achats utiles au logement et compare les prix avant de remplacer un équipement ou un produit courant.",
    "Vérifie les frais récurrents liés au logement et assure-toi qu’aucun service inutilisé ne continue à être payé.",
    "Prévois les dépenses du logement dès le début du mois afin qu’elles ne déséquilibrent pas les autres besoins essentiels.",
    "Lorsque tu compares deux solutions pour le logement, regarde le coût total récurrent et pas uniquement le prix payé au départ."
  ],
  internet: [
    "Compare ton volume de données réellement utilisé au forfait acheté : un forfait mieux adapté peut éviter les recharges répétées.",
    "Vérifie les abonnements Internet ou numériques encore actifs et arrête ceux que tu n’utilises plus.",
    "Repère les applications qui consomment beaucoup de données et utilise le Wi-Fi pour les téléchargements volumineux lorsque c’est possible.",
    "Avant une nouvelle recharge, vérifie le solde de données restant pour éviter de payer deux fois pour un besoin déjà couvert.",
    "Compare le coût par Go et la durée de validité des forfaits : le forfait le moins cher à l’achat n’est pas toujours le plus économique.",
    "Choisis une date de suivi pour tes recharges afin de voir si tes habitudes de consommation correspondent au forfait choisi.",
    "Si plusieurs services numériques sont facturés séparément, fais leur total mensuel et vérifie lesquels sont réellement utiles."
  ],
  health: [
    "Prévois une enveloppe santé pour les dépenses prévisibles, tout en gardant la possibilité de faire face à un besoin urgent.",
    "Conserve les reçus et note les dépenses de santé dès qu’elles arrivent : cela aide à distinguer les soins ponctuels des dépenses récurrentes.",
    "Lorsque plusieurs options de pharmacie ou de prestation sont possibles, compare les prix auprès de professionnels fiables sans retarder un soin nécessaire.",
    "Anticipe les rendez-vous ou traitements déjà prévus afin de préparer leur coût progressivement.",
    "Vérifie si certaines dépenses peuvent être prises en charge ou remboursées par un dispositif auquel tu as déjà droit.",
    "Sépare les dépenses de prévention, les soins ponctuels et les urgences dans ton suivi pour mieux comprendre leur évolution.",
    "Ajuste ton budget santé à partir des dépenses réellement observées, sans réduire les soins nécessaires pour respecter une enveloppe."
  ],
  leisure: [
    "Fixe une enveloppe loisirs pour la semaine et garde une petite marge pour éviter que les sorties prévues ne dépassent ton budget.",
    "Planifie les activités à l’avance : certaines sorties réservées tôt ou organisées en groupe peuvent coûter moins cher.",
    "Alterner les sorties payantes avec des activités gratuites ou moins coûteuses permet de garder du temps de loisir sans augmenter systématiquement les dépenses.",
    "Avant un achat de loisir non urgent, accorde-toi un délai de réflexion et vérifie qu’il reste dans ton enveloppe.",
    "Additionne les petites dépenses de détente sur une semaine : elles sont parfois plus difficiles à remarquer qu’une grosse sortie.",
    "Choisis à l’avance les activités auxquelles tu tiens le plus et donne-leur la priorité plutôt que de multiplier les dépenses improvisées.",
    "Compare le coût total d’une sortie, transport compris, avant de décider du montant que tu souhaites y consacrer."
  ],
  investment: [
    "Avant un nouvel investissement, vérifie les frais, les conditions de retrait et les risques : un rendement annoncé ne garantit jamais le résultat.",
    "Définis à l’avance la somme que tu peux immobiliser sans compromettre tes dépenses essentielles ni ton épargne de précaution.",
    "Note séparément le capital investi, les frais et les éventuels revenus afin de mesurer le résultat réel.",
    "Évite de prendre une décision d’investissement uniquement sous la pression d’une promesse de gain rapide.",
    "Vérifie que tu comprends le fonctionnement et les conditions de sortie d’un placement avant d’y engager de l’argent.",
    "Compare les risques et la durée d’immobilisation avant de répartir une somme entre plusieurs projets.",
    "Fais un point régulier sur tes investissements, mais évite les opérations répétées uniquement pour suivre les fluctuations à court terme."
  ],
  contribution: [
    "Note les prochaines dates de cotisation et prépare progressivement le montant attendu pour éviter une contribution de dernière minute.",
    "Vérifie le montant déjà versé et le reste à contribuer dans chaque groupe avant d’effectuer un nouveau paiement.",
    "Ajoute les cotisations à tes dépenses prévues du mois afin qu’elles ne surprennent pas ton budget quotidien.",
    "Lorsque tu participes à plusieurs groupes, conserve un calendrier séparé avec le montant et la date de chaque échéance.",
    "Prévois une réserve dédiée aux cotisations au lieu de compter sur l’argent nécessaire aux dépenses essentielles.",
    "Après chaque versement confirmé, vérifie que le montant apparaît bien dans l’historique du groupe.",
    "Avant de rejoindre une nouvelle cotisation, vérifie que ses échéances restent compatibles avec tes engagements actuels."
  ],
  savings: [
    "Un versement régulier, même modeste, peut t’aider à garder le rythme : choisis un montant réaliste plutôt qu’un objectif trop difficile à tenir.",
    "Place ton versement d’épargne dans le budget dès que tu reçois un revenu, au lieu d’attendre uniquement ce qui reste à la fin du mois.",
    "Vérifie la progression de ton objectif et ajuste le montant ou le rythme si ton plan ne correspond plus à ta situation.",
    "Diviser un objectif mensuel en plusieurs petits versements peut le rendre plus facile à organiser.",
    "Garde une séparation claire entre l’argent destiné à ton objectif et celui réservé aux dépenses courantes.",
    "Avant de créer un nouvel objectif, vérifie que les objectifs déjà ouverts disposent d’un rythme de versement soutenable.",
    "Fais le point sur la prochaine échéance de ton objectif et prépare le montant progressivement."
  ],
  other: [
    "Prends quelques minutes pour préciser la catégorie de tes dernières dépenses : un suivi mieux classé rend les rapports beaucoup plus utiles.",
    "Regroupe les petits achats similaires sur une semaine pour repérer ceux qui reviennent le plus souvent.",
    "Vérifie si certaines dépenses de cette catégorie sont récurrentes et prévois-les à l’avance dans ton budget.",
    "Avant une dépense non urgente, compare deux options et vérifie qu’elle correspond à tes priorités du mois.",
    "Fais un point sur les achats imprévus : note ce qui aurait pu être planifié et ce qui était réellement nécessaire.",
    "Définis une limite adaptée à cette catégorie et vérifie son évolution au milieu du mois.",
    "Si plusieurs dépenses très différentes sont classées ici, crée ou utilise une catégorie plus précise pour mieux comprendre leur origine."
  ]
});

const CATEGORY_LABELS = Object.freeze({
  food: 'alimentation',
  transport: 'transport',
  housing: 'logement',
  internet: 'Internet',
  health: 'santé',
  leisure: 'loisirs',
  investment: 'investissement',
  contribution: 'cotisations',
  savings: 'épargne',
  other: 'autres dépenses'
});

export function getDoualaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Douala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  return pick('year') + '-' + pick('month') + '-' + pick('day');
}

export function isWithinDoualaEveningWindow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Douala',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  const minutes = hour * 60 + minute;
  return Number.isFinite(minutes) && minutes >= (17 * 60 + 30) && minutes <= (22 * 60 + 30);
}

function dayNumber(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return 0;
  const [year, month, day] = dateKey.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / DAY_MS) : 0;
}

export function getCategoryAdvice(categoryId, dateKey) {
  const normalized = String(categoryId || 'other').trim().toLowerCase();
  const tips = CATEGORY_ADVICE[normalized] || CATEGORY_ADVICE.other;
  return tips[dayNumber(dateKey) % tips.length];
}

function formatFCFA(value) {
  return Math.max(0, Number(value) || 0).toLocaleString('fr-FR') + ' FCFA';
}

export function buildCategoryAdviceNotification({
  categoryId,
  categoryLabel,
  monthlyAmount,
  todayAmount,
  dateKey
} = {}) {
  const normalized = String(categoryId || 'other').trim().toLowerCase();
  const label = String(categoryLabel || CATEGORY_LABELS[normalized] || CATEGORY_LABELS.other).trim();
  const monthTotal = Math.max(0, Number(monthlyAmount) || 0);
  const dayTotal = Math.max(0, Number(todayAmount) || 0);
  if (!dateKey || !monthTotal || !dayTotal) return null;

  return {
    title: 'Un conseil pour tes dépenses en ' + label.toLocaleLowerCase('fr-FR'),
    body: 'Depuis le début du mois : ' + formatFCFA(monthTotal) + ' en ' + label.toLocaleLowerCase('fr-FR') +
      '. Aujourd’hui : ' + formatFCFA(dayTotal) + '. ' + getCategoryAdvice(normalized, dateKey),
    target: '/reports',
    source: 'assistant_category_advice',
    categoryId: normalized,
    personalize: false
  };
}

/**
 * Selects distinct, high-priority candidates. A candidate needs a stable key.
 * The same topic is selected at most once in one batch.
 */
export function selectRetentionCandidates(candidates = [], limit = MAX_DAILY_RETENTION_NOTIFICATIONS) {
  const safeLimit = Math.max(0, Math.min(MAX_DAILY_RETENTION_NOTIFICATIONS, Math.floor(Number(limit) || 0)));
  if (safeLimit === 0) return [];
  const selected = [];
  const seenKeys = new Set();
  const seenTopics = new Set();

  for (const candidate of [...candidates].filter((item) => item && item.key && item.title && item.body)
    .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0) || String(a.key).localeCompare(String(b.key)))) {
    const key = String(candidate.key);
    const topic = String(candidate.topic || key);
    if (seenKeys.has(key) || seenTopics.has(topic)) continue;
    seenKeys.add(key);
    seenTopics.add(topic);
    selected.push(candidate);
    if (selected.length >= safeLimit) break;
  }
  return selected;
}

/**
 * Pure state transition used inside a Firestore transaction by the scheduler.
 * Different scheduled modules share the same per-user date/count/key state.
 */
export function claimDailyRetentionSlot(state = {}, dateKey, notificationKey, limit = MAX_DAILY_RETENTION_NOTIFICATIONS) {
  const key = String(notificationKey || '').trim();
  const safeLimit = Math.max(0, Math.min(MAX_DAILY_RETENTION_NOTIFICATIONS, Math.floor(Number(limit) || 0)));
  const sameDay = state.date === dateKey;
  const count = sameDay ? Math.max(0, Number(state.count) || 0) : 0;
  const keys = sameDay && Array.isArray(state.keys) ? state.keys.map(String) : [];

  if (!dateKey || !key) return { allowed: false, reason: 'invalid', state: { date: dateKey || '', count, keys } };
  if (keys.includes(key)) return { allowed: false, reason: 'duplicate', state: { date: dateKey, count, keys } };
  if (count >= safeLimit) return { allowed: false, reason: 'daily_limit', state: { date: dateKey, count, keys } };

  const nextState = { date: dateKey, count: count + 1, keys: [...keys, key].slice(-safeLimit) };
  return { allowed: true, reason: 'reserved', state: nextState, remaining: Math.max(0, safeLimit - nextState.count) };
}


/**
 * Separate daytime quota: up to three retention/discovery/weekend messages.
 * The two financial evening reminders use claimDailyRetentionSlot instead.
 * Transactional/operational alerts and cotisation messages must not call this.
 */
/**
 * Reserves one of the two evening financial passes. Each pass may deliver at
 * most one reminder, while the shared daily retention limit remains two.
 * This prevents the early run from consuming both evening opportunities.
 */
export function claimDailyRetentionPassSlot(state = {}, dateKey, notificationKey, passNumber = 1) {
  const pass = Number(passNumber) === 2 ? 2 : 1;
  const passDateKey = 'pass' + pass + 'Date';
  const passCountKey = 'pass' + pass + 'Count';
  const passKeysKey = 'pass' + pass + 'Keys';
  const samePassDay = state[passDateKey] === dateKey;
  const passCount = samePassDay ? Math.max(0, Number(state[passCountKey]) || 0) : 0;
  const passKeys = samePassDay && Array.isArray(state[passKeysKey]) ? state[passKeysKey].map(String) : [];

  if (!dateKey || !String(notificationKey || '').trim()) {
    return { allowed: false, reason: 'invalid', state: { ...state } };
  }
  if (passKeys.includes(String(notificationKey))) {
    return { allowed: false, reason: 'duplicate', state: { ...state } };
  }
  if (passCount >= 1) {
    return { allowed: false, reason: 'pass_limit', state: { ...state } };
  }

  const dailyClaim = claimDailyRetentionSlot({
    date: state.date,
    count: state.count,
    keys: state.keys,
  }, dateKey, notificationKey);
  if (!dailyClaim.allowed) return dailyClaim;

  const otherPass = pass === 1 ? 2 : 1;
  const otherDateKey = 'pass' + otherPass + 'Date';
  const otherCountKey = 'pass' + otherPass + 'Count';
  const otherKeysKey = 'pass' + otherPass + 'Keys';
  const otherSameDay = state[otherDateKey] === dateKey;

  return {
    ...dailyClaim,
    state: {
      ...dailyClaim.state,
      [passDateKey]: dateKey,
      [passCountKey]: passCount + 1,
      [passKeysKey]: [...passKeys, String(notificationKey)].slice(-1),
      [otherDateKey]: dateKey,
      [otherCountKey]: otherSameDay ? Math.max(0, Number(state[otherCountKey]) || 0) : 0,
      [otherKeysKey]: otherSameDay && Array.isArray(state[otherKeysKey]) ? state[otherKeysKey].map(String) : [],
      pass,
    },
  };
}

export function claimDailyNonEssentialSlot(
  state = {},
  dateKey,
  notificationKey,
  limit = MAX_DAILY_NON_ESSENTIAL_NOTIFICATIONS,
  nowMs = Date.now(),
  minimumGapMs = MIN_NON_ESSENTIAL_GAP_MS
) {
  const key = String(notificationKey || '').trim();
  const safeLimit = Math.max(0, Math.min(MAX_DAILY_NON_ESSENTIAL_NOTIFICATIONS, Math.floor(Number(limit) || 0)));
  const sameDay = state.date === dateKey;
  const count = sameDay ? Math.max(0, Number(state.count) || 0) : 0;
  const keys = sameDay && Array.isArray(state.keys) ? state.keys.map(String) : [];
  const lastAt = sameDay ? Math.max(0, Number(state.lastAt) || 0) : 0;

  if (!dateKey || !key) return { allowed: false, reason: 'invalid', state: { date: dateKey || '', count, keys, lastAt } };
  if (keys.includes(key)) return { allowed: false, reason: 'duplicate', state: { date: dateKey, count, keys, lastAt } };
  if (count >= safeLimit) return { allowed: false, reason: 'daily_limit', state: { date: dateKey, count, keys, lastAt } };
  if (lastAt && Number.isFinite(Number(nowMs)) && Number(nowMs) - lastAt < Math.max(0, Number(minimumGapMs) || 0)) {
    return { allowed: false, reason: 'minimum_gap', state: { date: dateKey, count, keys, lastAt } };
  }

  const nextState = {
    date: dateKey,
    count: count + 1,
    keys: [...keys, key].slice(-safeLimit),
    lastAt: Number(nowMs) || Date.now()
  };
  return {
    allowed: true,
    reason: 'reserved',
    state: nextState,
    remaining: Math.max(0, safeLimit - nextState.count)
  };
}
