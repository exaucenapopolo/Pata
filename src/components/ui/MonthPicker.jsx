'use client';

import { useLanguage } from '@/context/LanguageContext';
import { getLocalizedMonthNames } from '@/lib/i18n/dateLocale';

const pad = (value) => String(value).padStart(2, '0');

export function MonthPicker({ value, onChange, className = '' }) {
  const { language } = useLanguage();
  const now = new Date();
  const [rawYear, rawMonth] = String(value || '').split('-');
  const year = /^\d{4}$/.test(rawYear) ? Number(rawYear) : now.getFullYear();
  const month = /^\d{2}$/.test(rawMonth) && Number(rawMonth) >= 1 && Number(rawMonth) <= 12
    ? Number(rawMonth) : now.getMonth() + 1;
  const years = Array.from({ length: 41 }, (_, index) => now.getFullYear() - 20 + index);
  if (!years.includes(year)) years.push(year);
  years.sort((a, b) => a - b);
  const monthNames = getLocalizedMonthNames(language);
  const selectClass = 'h-10 min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

  const update = (nextYear, nextMonth) => onChange?.(String(nextYear) + '-' + pad(nextMonth));

  return (
    <div className={'flex min-w-0 items-center gap-2 ' + className}>
      <select
        aria-label={language === 'en' ? 'Month' : 'Mois'}
        value={String(month)}
        onChange={(event) => update(year, Number(event.target.value))}
        className={selectClass + ' flex-1'}
      >
        {monthNames.map((name, index) => (
          <option key={index + 1} value={String(index + 1)}>{name}</option>
        ))}
      </select>
      <select
        aria-label={language === 'en' ? 'Year' : 'Année'}
        value={String(year)}
        onChange={(event) => update(Number(event.target.value), month)}
        className={selectClass + ' w-[104px] shrink-0'}
      >
        {years.map((item) => <option key={item} value={String(item)}>{item}</option>)}
      </select>
    </div>
  );
}
