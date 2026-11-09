/**
 * Parseur local tolérant des SMS MTN MoMo et Orange Money au Cameroun.
 * Le SMS brut, le numéro de l'expéditeur et le solde restent sur l'appareil.
 */
const FAILURE_RE = /(?:\b[eé]chec\b|\bfailed\b|\brefus[eé]\b|\bannul[eé]\b|\bnot\s+completed\b|\btransaction\s+rejet[eé]e\b|\bop[eé]ration\s+non\s+aboutie\b)/i;
const PENDING_RE = /(?:en\s+cours\s+de\s+traitement|transaction\s+en\s+cours|op[eé]ration\s+en\s+cours|pending|processing|transaction\s+initiated|en\s+attente\s+de\s+confirmation)/i;
const CURRENCY = '(?:FCFA|F\\s*\\.?\\s*CFA|XAF|CFA|F)';

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}

function stableFallbackId(text, timestamp) {
  const input = normalize(text) + '|' + String(timestamp || '');
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 'AUTO-' + String(timestamp || Date.now()) + '-' + (hash >>> 0).toString(16);
}

function parseProvider(text, sender) {
  const source = normalize(String(sender || '') + ' ' + text);
  if (/(orange\s*(?:money|cash)|orange\s*cm|orange-money|omcm|\bom\b)/i.test(source)) return 'orange_money';
  if (/(mtn|momo|mobile\s*money|yello\s*money|yel'lo)/i.test(source)
    || (/fapshi\s*inc/i.test(source) && /compte d'argent mobile/i.test(source))) return 'mtn_momo';
  return null;
}

function parseTransactionId(text) {
  const patterns = [
    /\b(?:identifiant\s+de\s+transaction(?:\s+financi[eè]re)?|transaction\s*(?:id|n[°o]|no\.?|num[eé]ro|number)|id\s*(?:de\s*)?(?:transaction|op[eé]ration)?|r[eé]f[eé]rence|reference|ref\.?|code\s*(?:de\s*)?(?:transaction|op[eé]ration)|n[°o]\s*(?:transaction|op[eé]ration))\s*[:#\-]?\s*([A-Z0-9][A-Z0-9._\/-]{3,58})/i,
    /\b((?:MP|BP|TX|OM|MTN)[A-Z0-9]{5,}(?:[.-][A-Z0-9]+){0,5})\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = String(match && match[1] || '').trim().replace(/[.,;:)]+$/g, '');
    if (value.length >= 5) return value;
  }
  return null;
}

function parseEventType(text) {
  const value = normalize(text);
  if (/\b(retrait|retirer|withdrawal|withdraw|cash\s*out|cashout)\b/.test(value)) return 'withdrawal';
  if (/(paiement|payment|marchand|merchant|achat\s+(reussi|effectue)|bill\s+paid|facture\s+payee)/.test(value)) return 'payment';
  if (/(vous\s+(avez\s+recu|venez\s+de\s+recevoir)|transfert\s+recu|recu\s+de|reception\s+de|compte.{0,25}credite|credit.{0,20}compte|depot\s+(recu|effectue|confirme)|cash\s*in|cashin|received|credited|incoming\s+transfer)/.test(value)) return 'receive';
  if (/(vous\s+avez\s+envoye|transfert\s+(?:de.{0,100}vers|effectue|envoye|confirme)|effectue\s+(un\s+)?transfert|envoye\s+(a|au|vers)|compte.{0,25}debite|debite.{0,20}compte|debit|debited|sent\s+to|paid\s+to|you\s+sent|outgoing\s+transfer|transaction\s+de.{0,80}effectuee?\s+par)/.test(value)) return 'send';
  return null;
}

function parseMoney(value) {
  if (value == null) return null;
  let compact = String(value).replace(/[\s\u00a0']/g, '');
  if (!compact) return null;
  if (/^[0-9]+[.,][0-9]{1,2}$/.test(compact)) {
    if (/[.,]00$/.test(compact)) compact = compact.replace(/[.,]00$/, '');
    else return null;
  }
  if (/^[0-9]{1,3}(?:[.,][0-9]{3})+$/.test(compact)) compact = compact.replace(/[.,]/g, '');
  else if (/[.,]/.test(compact)) return null;
  const amount = Number(compact);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 1000000000 ? amount : null;
}

function firstPositiveAmount(source, pattern, amountGroup = 1) {
  const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
  const matcher = new RegExp(pattern.source, flags);
  let match;
  while ((match = matcher.exec(source)) !== null) {
    const amount = parseMoney(match[amountGroup]);
    if (amount != null) return amount;
    if (match[0].length === 0) matcher.lastIndex += 1;
  }
  return null;
}

function parseAmount(text) {
  const number = "([0-9]+(?:(?:[\\s\\u00a0][0-9]{3})|(?:[.,][0-9]{3}))*(?:[.,]00)?)";
  const currency = CURRENCY;
  // Le solde peut être écrit « 758 XAF » ou « XAF 758 ».
  // On l'écarte avant toute recherche de montant transactionnel.
  const balancePattern = new RegExp(
    '(?:nouveau\\s+)?solde(?:\\s+disponible)?\\s*[:\\-]?\\s*(?:' + currency + '\\s*)?' + number + '\\s*(?:' + currency + ')?',
    'ig'
  );
  const withoutBalance = text.replace(balancePattern, ' ');

  const authoritative = [
    new RegExp('\\b(?:une\\s+)?transaction\\s+de\\s+' + number + '\\s*' + currency + '\\b', 'ig'),
    new RegExp('\\bmontant\\s+(?:(?:de\\s+)?(?:la\\s+)?)?transaction\\s*[:#\\-]?\\s*' + number + '\\s*' + currency + '\\b', 'ig'),
    new RegExp('\\b(?:votre\\s+)?paiement\\s+(?:de\\s+)?' + number + '\\s*' + currency + '\\b', 'ig'),
    new RegExp('\\b(?:vous\\s+avez\\s+(?:recu|envoye)|recu|envoye|retrait\\s+(?:reussi|effectue))\\s+(?:de\\s+)?' + number + '\\s*' + currency + '\\b', 'ig'),
  ];
  for (const pattern of authoritative) {
    const amount = firstPositiveAmount(withoutBalance, pattern);
    if (amount != null) return amount;
  }
  const labeled = new RegExp(
    '\\b(?:montant|amount|somme|paiement|payment)\\s*(?:[:#\\-])?\\s*(?:de\\s+)?' + number + '\\s*' + currency + '\\b',
    'ig'
  );
  const labeledAmount = firstPositiveAmount(withoutBalance, labeled);
  if (labeledAmount != null) return labeledAmount;
  const currencyLast = new RegExp(number + '\\s*' + currency + '\\b', 'ig');
  const currencyFirst = new RegExp(currency + '\\s*[:#\\-]?\\s*' + number, 'ig');
  for (const [pattern, group] of [[currencyLast, 1], [currencyFirst, 1]]) {
    let match;
    while ((match = pattern.exec(withoutBalance)) !== null) {
      const amountContext = withoutBalance.slice(Math.max(0, match.index - 55), match.index);
      if (/(?:frais|fees?|remise|reduction|réduction|commission|recompense|récompense|reward|discount|bonus|solde|balance)/i.test(amountContext)) continue;
      const amount = parseMoney(match[group]);
      if (amount != null) return amount;
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
  }
  return null;
}

function parseDateAndTime(text, receivedAt) {
  const dateMatch = text.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b|\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  const transactionStamp = text.match(/\b[A-Z]{2}(\d{2})(\d{2})(\d{2})[.](\d{2})(\d{2})[.][A-Z0-9]+\b/i);
  let date = null;
  if (dateMatch) {
    let year; let month; let day;
    if (dateMatch[1]) {
      year = Number(dateMatch[1]); month = Number(dateMatch[2]); day = Number(dateMatch[3]);
    } else {
      day = Number(dateMatch[4]); month = Number(dateMatch[5]); year = Number(dateMatch[6]);
      if (year < 100) year += year >= 70 ? 1900 : 2000;
    }
    const candidate = new Date(year, month - 1, day);
    if (candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day) {
      date = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    }
  } else if (transactionStamp) {
    const year = 2000 + Number(transactionStamp[1]);
    const month = Number(transactionStamp[2]);
    const day = Number(transactionStamp[3]);
    const candidate = new Date(year, month - 1, day);
    if (candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day) {
      date = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    }
  }
  const timeMatch = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/);
  const fallback = receivedAt instanceof Date ? receivedAt : new Date(receivedAt || Date.now());
  const safeFallback = Number.isNaN(fallback.getTime()) ? new Date() : fallback;
  if (!date) date = safeFallback.getFullYear() + '-' + String(safeFallback.getMonth() + 1).padStart(2, '0') + '-' + String(safeFallback.getDate()).padStart(2, '0');
  const time = timeMatch
    ? String(timeMatch[1]).padStart(2, '0') + ':' + timeMatch[2]
    : transactionStamp
      ? transactionStamp[4] + ':' + transactionStamp[5]
      : String(safeFallback.getHours()).padStart(2, '0') + ':' + String(safeFallback.getMinutes()).padStart(2, '0');
  return { date, time };
}

function sanitizeCounterparty(candidate) {
  const value = String(candidate || '').replace(/\s+/g, ' ').replace(/^[\s:,-]+|[\s.;,:-]+$/g, '').trim();
  if (!value || value.length > 60 || !/^\p{L}[\p{L}'’ .-]{0,59}$/u.test(value)) return null;
  const compact = normalize(value);
  if (/^(?:la somme|le montant|votre compte|votre solde|la transaction|un client|un marchand|numero|reference)$/.test(compact)) return null;
  if (/^[0-9x+* .-]+$/i.test(value)) return null;
  return value;
}

function parseCounterparty(text) {
  const patterns = [
    /(?:paiement\s*(?:réussi|reussi|effectué|effectue)|payment\s*(?:successful|completed))[.!,:-]\s*([\p{L}][\p{L}'’ .-]{1,50})[.!,:-]\s*(?:montant|transaction|somme)/iu,
    /(?:paid\s+to|pay[eé]?\s+(?:[àa]|au)|sent\s+to)\s+([\p{L}][\p{L}'’ _.-]{1,50}?)(?=\s+via\b|[,.;]|$)/iu,
    /transfert\s+de\s+\d{8,15}\s+[\p{L}][\p{L}'’ .-]{1,40}\s+vers\s+\d{8,15}\s+([\p{L}][\p{L}'’ .-]{1,50}?)(?=\s+reussi|[,.;]|$)/iu,
    /depot\s+effectu[eé]\s+par\s+\d{8,15}\s+([\p{L}][\p{L}'’ .-]{1,50}?)(?=\s+to\b|[,.;]|$)/iu,
    /paiement\s+([\p{L}][\p{L}'’ .-]{1,40}?)\s+reussi\s+par\b/iu,
    /paiement\s+de\s+[0-9][0-9\s.,]*\s*(?:fcfa|xaf|cfa)\s+a\s+([\p{L}][\p{L}'’ .-]{1,40}?)\s+a\s+ete\s+effectue/iu,
    /(?:vous\s+(?:avez\s+)?recu|recu|received)\s+[0-9][0-9\s.,]*\s*(?:fcfa|xaf|cfa|f)\s+(?:de|from)\s+([\p{L}][\p{L}'’ .-]{1,50}?)(?=\s*\(|[,.;]|$)/iu,
    /(?:recu|received)\s+(?:de|from)\s+([\p{L}][\p{L}'’ .-]{1,50}?)(?=\s*\(|[,.;]|$)/iu,
    /effectu[eé]e?\s+par\s+([\p{L}][\p{L}'’ _.-]{1,50}?)(?=\s*\(|[,.;]|$)/iu,
    /(?:envoy[eé]?\s+(?:[àa]|au|vers)|transfert\s+vers|auprès\s+de|chez)\s+([\p{L}][\p{L}'’ .-]{1,50}?)(?=[,.;]|$)/iu,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = sanitizeCounterparty(String(match && match[1] || '').replace(/_/g, ' '));
    if (value) return value;
  }
  return null;
}

function parseBalance(text) {
  const match = text.match(/(?:nouveau\s+)?solde(?:\s+disponible)?\s*[:\-]?\s*([0-9][0-9\s\u00a0.,']{0,22})\s*(?:FCFA|F\s*\.?\s*CFA|XAF|CFA)\b/i);
  return match ? parseMoney(match[1]) : null;
}

export function parseMobileMoneySms(rawText, options = {}) {
  if (typeof rawText !== 'string') return null;
  const sender = options.sender || '';
  const receivedAt = options.receivedAt || new Date();
  const text = rawText.replace(/\s+/g, ' ').trim();
  const normalized = normalize(text);
  if (!text || FAILURE_RE.test(normalized) || PENDING_RE.test(normalized)) return null;

  const provider = parseProvider(text, sender);
  const eventType = parseEventType(text);
  const amount = parseAmount(text);
  if (!provider || !eventType || amount == null) return null;

  const dateTime = parseDateAndTime(text, receivedAt);
  const timestamp = receivedAt instanceof Date ? receivedAt.getTime() : new Date(receivedAt).getTime();
  const transactionId = parseTransactionId(text) || stableFallbackId(text, Number.isFinite(timestamp) ? timestamp : Date.now());
  const direction = eventType === 'receive' ? 'income' : eventType === 'withdrawal' ? 'withdrawal' : 'expense';
  return {
    provider, transactionId, amount, eventType, direction,
    date: dateTime.date, time: dateTime.time,
    counterparty: parseCounterparty(text), balance: parseBalance(text),
  };
}
