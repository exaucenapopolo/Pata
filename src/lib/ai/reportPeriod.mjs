const normalizePeriodText = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const isValidIsoDay = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const monthStart = (year, monthIndex) =>
  new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 10);

const monthEnd = (year, monthIndex) =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10);

export function resolveAIReportPeriod(message = '', todayValue) {
  const today = isValidIsoDay(String(todayValue || '')) ? String(todayValue) : new Date().toISOString().slice(0, 10);
  const currentYear = Number(today.slice(0, 4));
  const currentMonthIndex = Number(today.slice(5, 7)) - 1;
  const text = normalizePeriodText(message);

  // A specific range always wins (e.g. the dates sent by the dashboard).
  const dates = text.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
  if (dates.length >= 2 && isValidIsoDay(dates[0]) && isValidIsoDay(dates[1]) && dates[0] <= dates[1]) {
    return { startDate: dates[0], endDate: dates[1], source: 'explicit-range' };
  }
  if (dates.length === 1 && isValidIsoDay(dates[0])) {
    return { startDate: dates[0], endDate: dates[0], source: 'explicit-day' };
  }

  if (/\b(ce mois|ce mois ci|mois en cours|this month|month to date)\b/.test(text)) {
    return { startDate: monthStart(currentYear, currentMonthIndex), endDate: today, source: 'current-month' };
  }

  if (/\b(mois dernier|mois passe|le mois precedent|previous month|last month)\b/.test(text)) {
    const date = new Date(Date.UTC(currentYear, currentMonthIndex - 1, 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    return { startDate: monthStart(year, month), endDate: monthEnd(year, month), source: 'previous-month' };
  }

  const monthAliases = {
    janvier: 0, january: 0, jan: 0,
    fevrier: 1, february: 1, fev: 1, feb: 1,
    mars: 2, march: 2, mar: 2,
    avril: 3, april: 3, avr: 3, apr: 3,
    mai: 4, may: 4,
    juin: 5, june: 5, jun: 5,
    juillet: 6, july: 6, juil: 6, jul: 6,
    aout: 7, august: 7, aug: 7,
    septembre: 8, september: 8, sept: 8, sep: 8,
    octobre: 9, october: 9, oct: 9,
    novembre: 10, november: 10, nov: 10,
    decembre: 11, december: 11, dec: 11,
  };
  const monthPattern = new RegExp('\\b(' + Object.keys(monthAliases).join('|') + ')\\b(?:\\s+(20\\d{2}))?');
  const monthMatch = text.match(monthPattern);
  if (monthMatch) {
    const month = monthAliases[monthMatch[1]];
    const year = Number(monthMatch[2] || currentYear);
    const startDate = monthStart(year, month);
    const endDate = year === currentYear && month === currentMonthIndex
      ? today
      : monthEnd(year, month);
    return { startDate, endDate, source: 'named-month' };
  }

  const numericMonth = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (numericMonth) {
    const year = Number(numericMonth[1]);
    const month = Number(numericMonth[2]) - 1;
    return {
      startDate: monthStart(year, month),
      endDate: year === currentYear && month === currentMonthIndex ? today : monthEnd(year, month),
      source: 'numeric-month',
    };
  }

  if (/\b(cette annee|cette annee ci|this year|year to date)\b/.test(text)) {
    return { startDate: currentYear + '-01-01', endDate: today, source: 'current-year' };
  }

  if (/\b(l annee derniere|annee derniere|last year|previous year)\b/.test(text)) {
    const year = currentYear - 1;
    return { startDate: year + '-01-01', endDate: year + '-12-31', source: 'previous-year' };
  }

  // Safe default for financial questions: current month, through today only.
  return { startDate: monthStart(currentYear, currentMonthIndex), endDate: today, source: 'current-month-default' };
}
