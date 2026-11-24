/**
 * Convert copied currency text into a numeric expression accepted by Pata's
 * amount calculator. Handles French spaces, currency suffixes and separators.
 */
export function normalizeClipboardAmount(rawValue) {
  if (rawValue == null) return null;
  let value = String(rawValue).trim();
  if (!value || value.includes('-')) return null;

  value = value
    .replace(/(?:FCFA|XAF|CFA|EUR|USD|CAD|GBP|CHF|NGN|€|\$|£|¥|₦)/gi, '')
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(/^\+/, '');

  if (!value || !/^\d[\d.,]*$/.test(value)) return null;

  const lastDot = value.lastIndexOf('.');
  const lastComma = value.lastIndexOf(',');
  const hasDot = lastDot >= 0;
  const hasComma = lastComma >= 0;
  let normalized = value;

  if (hasDot && hasComma) {
    const decimalSeparator = lastDot > lastComma ? '.' : ',';
    const separatorIndex = value.lastIndexOf(decimalSeparator);
    const fraction = value.slice(separatorIndex + 1);
    const integer = value.slice(0, separatorIndex).replace(/[.,]/g, '');
    if (!fraction || fraction.length > 2) return null;
    normalized = integer + '.' + fraction;
  } else if (hasDot || hasComma) {
    const separator = hasDot ? '.' : ',';
    const groups = value.split(separator);
    const fraction = groups[groups.length - 1];
    if (groups.length > 2) {
      if (groups.slice(1).every((group) => group.length === 3)) normalized = groups.join('');
      else if (fraction.length >= 1 && fraction.length <= 2) normalized = groups.slice(0, -1).join('') + '.' + fraction;
      else return null;
    } else if (fraction.length === 1 || fraction.length === 2) {
      normalized = groups[0] + '.' + fraction;
    } else if (fraction.length === 3) {
      normalized = groups.join('');
    } else {
      return null;
    }
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? normalized : null;
}
