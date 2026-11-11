export function getDateLocale(language = 'fr') {
  return language === 'en' ? 'en-GB' : 'fr-CM';
}

export function getLocalizedMonthNames(language = 'fr') {
  const locale = getDateLocale(language);
  return Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2024, index, 1))
  );
}
