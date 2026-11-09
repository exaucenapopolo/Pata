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
      year = Number(dateMatch[1]); month = Number(dateMatch[2]); ]k