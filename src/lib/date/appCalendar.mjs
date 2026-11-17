const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value) {
  const match = String(value || '').match(ISO_DATE_PATTERN);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function formatIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new TypeError('A valid date is required.');
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function isDateInBounds(value, minDate = '', maxDate = '') {
  if (!parseIsoDate(value)) return false;
  if (minDate && value < minDate) return false;
  if (maxDate && value > maxDate) return false;
  return true;
}

export function normalizeIsoDateRange(startDate, endDate) {
  const start = parseIsoDate(startDate) ? startDate : '';
  const end = parseIsoDate(endDate) ? endDate : '';
  if (!start || !end) return { startDate: start, endDate: end };
  return start <= end
    ? { startDate: start, endDate: end }
    : { startDate: end, endDate: start };
}
