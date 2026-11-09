/**
 * Parseur local des SMS Mobile Money du Cameroun.
 * Important : le texte original reste sur l'appareil. Cette fonction retourne
 * uniquement des champs structurés ; ne jamais transmettre le SMS brut à l'API.
 */

const CURRENCY_RE = /(?:FCFA|XAF|F\s*\.\s*CFA|F\s*CFA|CFA)\b/i;
const FAILURE_RE = /(?:\b[eé]chec\b|\bfailed\b|\brefus[eé]\b|\bannul[eé]\b|\bnot\s+completed\b|\btransaction\s+rejet[eé]e\b)/i;

function cleanId(value) {
  return String(value || '').trim().replace(/[.,;:)]+$/g, '');
}

function parseAmount(text) {
  const patterns = [
    /(?:montant(?:\s+de\s+la)?\s+transaction|montant|somme)\s*[:\-]?\s*(?:de\s*)?([0-9][0-9\s.,]{0,20})\s*(?:FCFA|XAF|F\s*\.\s*CFA|F\s*CFA|CFA)\b/i,
    /(?:vous\s+avez\s+)?(?:re[cç]u|envoy[eé]|pay[eé]|retir[eé])\s+(?:la\s+somme\s+de\s+)?([0-9][0-9\s.,]{0,20})\s*(?:FCFA|XAF|F\s*\.\s*CFA|F\s*CFA|CFA)\b/i,
    /([0-9][0-9\s.,]{0,20})\s*(?:FCFA|XAF|F\s*\.\s*CFA|F\s*CFA|CFA)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const digits = match[1].replace(/\D/g, '');
    const amount = Number(digits);
    if (Number.isSafeInteger(amount) && amount > 0 && amount <= 1_000_000_000) return amount;
  }
  return null;
}

function parseTransactionId(text) {
  const patterns = [
    /(?:transaction\s*(?:id|n[°o]|num[eé]ro)|id\s*(?:de\s*)?(?:transaction|op[eé]ration)?|r[eé]f[eé]rence|reference)\s*[:#\-]?\s*([A-Z0-9][A-Z0-9._\/-]{4,48})/i,
    /\b(MP\d{6,}(?:[.-][A-Z0-9]+){1,4})\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = cleanId(match?.[1]);
    if (value && value.length >= 5) return value;
  }
  return null;
}

function parseProvider(text, sender = '') {
  const source = `${sender} ${text}`.toLowerCase();
  if (/orange\s*(?:money|cash)|\bom\b/.test(source)) return 'orange_money';
  if (/\bmtn\b|momo|mobile\s*money/.test(source)) return 'mtn_momo';
  return null;
}

function parseEventType(text) {
  if (/\b(retrait|retir[eé]|withdrawal|cash\s*out)\b/i.test(text)) return 'withdrawal';
  if (/(paiement\s+r[eé]ussi|paiement\s+de|payment\s+successful|marchand|merchant|achat\s+r[eé]ussi)/i.test(text)) return 'payment';
  if (/(vous\s+avez\s+re[cç]u|transfert\s+re[cç]u|re[cç]u\s+de|cr[eé]dit[eé]|cash\s*in|received)/i.test(text)) return 'receive';
  if (/(vous\s+avez\s+envoy[eé]|transfert\s+(?:effectu[eé]|envoy[eé])|envoy[eé]\s+[àa]|transfert\s+vers|debit|sent\s+to)/i.test(text)) return 'send';
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
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day) {
      date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const timeMatch = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/);
  const fallback = receivedAt instanceof Date ? receivedAt : new Date(receivedAt || Date.now());
  const safeFallback = Number.isNaN(fallback.getTime()) ? new Date() : fallback;
  if (!date) date = `${safeFallback.getFullYear()}-${String(safeFallback.getMonth() + 1).padStart(2, '0')}-${String(safeFallback.getDate()).padStart(2, '0')}`;
  const time = timeMatch ? `${String(timeMatch[1]).padStart(2, '0')}:${timeMatch[2]}` : `${String(safeFallback.getHours()).padStart(2, '0')}:${String(safeFallback.getMinutes()).padStart(2, '0')}`;
  return { date, time };
}

function sanitizeCounterparty(candidate) {
  const value = String(candidate || '').replace(/\s+/g, ' ').replace(/^[\s:,-]+|[\s.;,:-]+$/g, '').trim();
  if (!value || value.length > 60 || !/^\p{L}[\p{L}'’ .-]{0,59}$/u.test(value)) return null;
  const normalized = value.toLowerCase();
  if (/^(?:la somme|le montant|votre compte|votre solde|la transaction|un client|un marchand)$/.test(normalized)) return null;
  return value;
}

function parseCounterparty(text) {
  const patterns = [
    /(?:paiement\s+r[eé]ussi|payment\s+successful)[.!,:-]\s*([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÿ'’ .-]{1,50})[.!,:-]\s*(?:montant|transaction|somme)/i,
    /(?:re[cç]u|received)\s+(?:de|from)\s+([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÿ'’ .-]{1,50})(?=[,.;]|$)/i,
    /(?:envoy[eé]\s+(?:[àa]|vers)|transfert\s+vers|pay[eé]\s+[àa]|auprès\s+de|chez|sent\s+to)\s+([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÿ'’ .-]{1,50})(?=[,.;]|$)/i,
    /\bde\s+([A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÿ'’ .-]{1,50})(?=[,.;]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = sanitizeCounterparty(match?.[1]);
    if (value) return value;
  }
  return null;
}

function parseBalance(text) {
  const match = text.match(/(?:nouveau\s+)?solde(?:\s+disponible)?\s*[:\-]?\s*([0-9][0-9\s.,]{0,20})\s*(?:FCFA|XAF|F\s*\.\s*CFA|F\s*CFA|CFA)\b/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/\D/g, ''));
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

/**
 * @returns {null | {
 *  provider: 'mtn_momo'|'orange_money', transactionId: string, amount: number,
 *  eventType: 'receive'|'send'|'payment'|'withdrawal', direction: 'income'|'expense'|'withdrawal',
 *  date: string, time: string, balance: number|null
 * }}
 */
export function parseMobileMoneySms(rawText, { sender = '', receivedAt = new Date() } = {}) {
  if (typeof rawText !== 'string') return null;
  const text = rawText.replace(/\s+/g, ' ').trim();
  if (!text || FAILURE_RE.test(text)) return null;

  const provider = parseProvider(text, sender);
  const transactionId = parseTransactionId(text);
  const amount = parseAmount(text);
  const eventType = parseEventType(text);
  if (!provider || !transactionId || !amount || !eventType) return null;

  const direction = eventType === 'receive' ? 'income'
    : eventType === 'withdrawal' ? 'withdrawal' : 'expense';
  const { date, time } = parseDateAndTime(text, receivedAt);

  return {
    provider,
    transactionId,
    amount,
    eventType,
    direction,
    date,
    time,
    counterparty: parseCounterparty(text),\n    balance: parseBalance(text),
  };
}
