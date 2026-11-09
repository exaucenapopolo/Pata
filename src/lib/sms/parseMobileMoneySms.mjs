/**
 * Parseur local tolérant des SMS MTN MoMo et Orange Money au Cameroun.
 * Le SMS brut, le numéro de l'expéditeur et le solde restent sur l'appareil.
 */
const FAILURE_RE = /(?:\b[eé]chec\b|\bfailed\b|\brefus[eé]\b|\bannul[eé]\b|\bnot\s+completed\b|\btransaction\s+rejet[eé]e\b|\bop[eé]ration\s+non\s+aboutie\b)/i;
const PENDING_RE = /(?:en\s+cours\s+de\s+traitement|transaction\s+en\s+cours|op[eé]ration\s+en\s+cours|pending|processing|transaction\s+initiated|en\s+attente\s+de\s+confirmation)/i;
const CURRENCY = '(?:FCFA|F\\s*\\.?\\s*CFA|XAF|CFA)';

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
  if (/(mtn|momo|mobile\s*money|yello\s*money|yel'lo)/i.test(source)) return 'mtn_momo';
  return null;
}

function parseTransactionId(text) {
  const patterns = [
    /(?:transaction\s*(?:id|n[°o]|no\.?|num[eé]ro|number)|id\s*(?:de\s*)?(?:transaction|op[eé]ration)?|r[eé]f[eé]rence|reference|ref\.?|code\s*(?:de\s*)?(?:transaction|op[eé]ration)|n[°o]\s*(?:transaction|op[eé]ration))\s*[:#\-]?\s*([A-Z0-9][A-Z0-9._\/-]{3,58})/i,
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
  if (/(vous\s+avez\s+envoye|transfert\s+(effectue|envoye|confirme)|effectue\s+(un\s+)?transfert|envoye\s+(a|au|vers)|compte.{0,25}debite|debite.{0,20}compte|debit|debited|sent\s+to|you\s+sent|outgoing\s+transfer)/.test(value)) return 'send';
  return null;
}

function parseMoney(value) {
  if (value == null) return null;
  const compact = String(value).replace(/[\s\u00a0']/g, '').replace(/[.,]00$/, '');
  const amount = Number(compact.replace(/\D/g, ''));
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 1000000000 ? amount : null;
}

function parseAmount(text) {
  const withoutBalance = text.replace(
    /(?:nouveau\s+)?solde(?:\s+disponible)?\s*[:\-]?\s*[0-9][0-9\s\u00a0.,']{0,22}\s*(?:FCFA|F\s*\.?\s*CFA|XAF|CFA)?/ig,
    ' '
  );
  const number = "([0-9][0-9\\s\\u00a0.,']{0,22})";
  const labeled = new RegExp(
    '(?:montant(?:\\s+(?:de\\s+la\\s+)?transaction)?|somme|amount|valeur)\\s*[:#\\-]?\\s*(?:de\\s*)?(?:' + CURRENCY + '\\s*)?' + number + '\\s*(?:' + CURRENCY + ')?',
    'i'
  );
  const verb = new RegExp(
    '(?:recu|envoye|envoyer|paye|payee|debite|credite|credited|received|sent|effectue)\\s+(?:la\\s+somme\\s+de\\s+|un montant de\\s+|de\\s+)?(?:' + CURRENCY + '\\s*)?' + number + '\\s*(?:' + CURRENCY + ')?',
    'i'
  );
  const currencyFirst = new RegExp(CURRENCY + '\\s*[:\\-]?\\s*' + number, 'i');
  const currencyLast = new RegExp(number + '\\s*' + CURRENCY + '\\b', 'i');
  for (const pattern of [labeled, verb, currencyFirst, currencyLast]) {
    const match = withoutBalance.match(pattern);
    const amount = parseMoney(match && match[1]);
    if (amount != null) return amount;
  }
  return null;
}

function parseDateAndTime(text, receivedAt) {
  const dateMatch = text.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b|\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
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
  }
  const timeMatch = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/);
  const fallback = receivedAt instanceof Date ? receivedAt : new Date(receivedAt || Date.now());
  const safeFallback = Number.isNaN(fallback.getTime()) ? new Date() : fallback;
  if (!date) date = safeFallback.getFullYear() + '-' + String(safeFallback.getMonth() + 1).padStart(2, '0') + '-' + String(safeFallback.getDate()).padStart(2, '0');
  const time = timeMatch
    ? String(timeMatch[1]).padStart(2, '0') + ':' + timeMatch[2]
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
    /(?:paiement\s*(?:r[eé]ussi|effectu[eé])|payment\s*(?:successful|completed))[.!,:-]\s*([\p{L}][\p{L}'’ .-]{1,50})[.!,:-]\s*(?:montant|transaction|somme)/iu,
    /(?:r[eé]cu|received)\s+(?:de|from)\s+([\p{L}][\p{L}'’ .-]{1,50})(?=[,.;]|$)/iu,
    /(?:envoy[eé]?\s+(?:[àa]|au|vers)|transfert\s+vers|pay[eé]?\s+(?:[àa]|au)|auprès\s+de|chez|sent\s+to)\s+([\p{L}][\p{L}'’ .-]{1,50})(?=[,.;]|$)/iu,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = sanitizeCounterparty(match && match[1]);
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
