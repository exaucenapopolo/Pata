export function sanitizeNotificationReply(value, maxLength = 420) {
  const text = String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\x60{3}[\s\S]*?\x60{3}/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
    .replace(/<[^>]*>/g, ' ');
  const lines = text.split('\n').map((line) => line
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '')
  ).filter((line) => {
    const clean = line.trim();
    if (!clean) return false;
    if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(clean)) return false;
    if ((clean.match(/\|/g) || []).length >= 2) return false;
    return true;
  });
  const plain = lines.join(' ')
    .replace(/[*_~>#|\x60]/g, ' ')
    .replace(/[\u2022\u2023\u25E6\u2043\u2219\u2192\u2190\u2713\u2714\u2726\u2605]/g, ' ')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/([,.!?;:])(?=\S)/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return '';
  return plain.length <= maxLength ? plain : plain.slice(0, maxLength - 1).replace(/\s+\S*$/, '') + '…';
}
