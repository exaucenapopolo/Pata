'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { getDateLocale, getLocalizedMonthNames } from '@/lib/i18n/dateLocale';
import { formatIsoDate, parseIsoDate, isDateInBounds, normalizeIsoDateRange } from '@/lib/date/appCalendar';

function formatDateLabel(value, language) {
  const date = parseIsoDate(value);
  if (!date) return language === 'en' ? 'Choose a date' : 'Choisir une date';
  return new Intl.DateTimeFormat(getDateLocale(language), { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function CalendarSurface({ language, cursor, setCursor, selectedDate = '', startDate = '', endDate = '', minDate = '', maxDate = '', onSelect, rangeMode = false }) {
  const locale = getDateLocale(language);
  const monthNames = getLocalizedMonthNames(language);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, index) => new Date(year, month, index - offset + 1));
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, index + 1)).replace('.', ''));
  const years = Array.from(new Set([...Array.from({ length: 201 }, (_, index) => 1900 + index), year])).sort((a, b) => a - b);
  const today = formatIsoDate(new Date());

  return (
    <div className="pata-calendar-surface">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label={language === 'en' ? 'Previous month' : 'Mois précédent'} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 active:scale-95"><ChevronLeft size={18}/></button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <select aria-label={language === 'en' ? 'Month' : 'Mois'} value={String(month)} onChange={(event) => setCursor(new Date(year, Number(event.target.value), 1))} className="min-w-0 max-w-[58%] rounded-lg border border-transparent bg-transparent px-1 py-2 text-sm font-bold capitalize text-slate-800 outline-none">
            {monthNames.map((name, index) => <option key={name} value={index}>{name}</option>)}
          </select>
          <select aria-label={language === 'en' ? 'Year' : 'Année'} value={String(year)} onChange={(event) => setCursor(new Date(Number(event.target.value), month, 1))} className="w-[82px] rounded-lg border border-transparent bg-transparent px-1 py-2 text-sm font-bold text-slate-800 outline-none">
            {years.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label={language === 'en' ? 'Next month' : 'Mois suivant'} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 active:scale-95"><ChevronRight size={18}/></button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weekdayLabels.map((label, index) => <div key={index} className="flex h-7 items-center justify-center text-[10px] font-bold uppercase text-slate-400">{label.slice(0, 2)}</div>)}
        {days.map((date) => {
          const value = formatIsoDate(date);
          const currentMonth = date.getMonth() === month;
          const disabled = !isDateInBounds(value, minDate, maxDate);
          const active = rangeMode ? value === startDate || value === endDate : value === selectedDate;
          const within = rangeMode && startDate && endDate && value > startDate && value < endDate;
          const isToday = value === today;
          return (
            <button key={value} type="button" disabled={disabled} onClick={() => onSelect(value)} aria-pressed={Boolean(active)} aria-label={formatDateLabel(value, language)}
              className={['relative flex h-10 min-w-0 items-center justify-center rounded-xl text-[13px] font-semibold transition active:scale-95',
                currentMonth ? 'text-slate-800' : 'text-slate-300',
                within ? 'bg-emerald-50 text-emerald-900' : '',
                active ? 'bg-[#075b43] text-white shadow-sm' : 'hover:bg-emerald-50',
                isToday && !active ? 'ring-1 ring-inset ring-emerald-600' : '',
                disabled ? 'cursor-not-allowed opacity-25' : ''].join(' ')}>
              {date.getDate()}
              {isToday && !active && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-emerald-600"/>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function NativeDatePicker() {
  const { language } = useLanguage();
  const [active, setActive] = useState(null);
  const [cursor, setCursor] = useState(() => new Date());
  const inputRef = useRef(null);
  const originalRef = useRef(null);

  const close = useCallback(() => {
    const input = inputRef.current;
    const original = originalRef.current;
    if (input && original) {
      input.readOnly = original.readOnly;
      if (original.inputMode == null) input.removeAttribute('inputmode');
      else input.setAttribute('inputmode', original.inputMode);
      input.blur();
    }
    inputRef.current = null;
    originalRef.current = null;
    setActive(null);
  }, []);

  const openForInput = useCallback((input) => {
    if (!(input instanceof HTMLInputElement) || input.disabled || input.dataset.pataCalendar === 'off') return;
    if (inputRef.current === input) return;
    if (inputRef.current) close();
    const value = input.value || input.min || formatIsoDate(new Date());
    inputRef.current = input;
    originalRef.current = { readOnly: input.readOnly, inputMode: input.getAttribute('inputmode') };
    input.readOnly = true;
    input.setAttribute('inputmode', 'none');
    const label = input.closest('label')?.textContent?.trim()
      || input.parentElement?.querySelector('label')?.textContent?.trim()
      || input.getAttribute('aria-label')
      || input.placeholder
      || (language === 'en' ? 'Choose a date' : 'Choisir une date');
    setCursor(parseIsoDate(value) || new Date());
    setActive({ label, value, min: input.min || '', max: input.max || '' });
    input.focus({ preventScroll: true });
  }, [close, language]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      const input = target?.closest?.('input[type="date"]');
      if (!input) return;
      event.preventDefault();
      event.stopPropagation();
      openForInput(input);
    };
    const handleFocus = (event) => {
      const input = event.target;
      if (input instanceof HTMLInputElement && input.type === 'date') openForInput(input);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && inputRef.current) close();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('focusin', handleFocus, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('focusin', handleFocus, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [close, openForInput]);

  const commit = (value) => {
    const input = inputRef.current;
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    close();
  };

  return active ? (
    <div className="pata-calendar-backdrop fixed inset-0 z-[125] flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-4" onPointerDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="pata-date-title" className="pata-calendar-panel w-full max-w-md rounded-t-[28px] border border-white/70 bg-[#fbfdfb] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[28px]">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden"/>
        <div className="mb-3 flex items-center justify-between">
          <div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-emerald-700">PATA</p><h2 id="pata-date-title" className="mt-0.5 text-lg font-extrabold text-slate-900">{active.label}</h2><p className="mt-0.5 text-xs text-slate-500">{formatDateLabel(active.value, language)}</p></div>
          <button type="button" onClick={close} aria-label={language === 'en' ? 'Close calendar' : 'Fermer le calendrier'} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm"><X size={18}/></button>
        </div>
        <CalendarSurface language={language} cursor={cursor} setCursor={setCursor} selectedDate={active.value} minDate={active.min} maxDate={active.max} onSelect={commit}/>
        <button type="button" onClick={() => commit(formatIsoDate(new Date()))} disabled={!isDateInBounds(formatIsoDate(new Date()), active.min, active.max)} className="mt-3 h-11 w-full rounded-xl bg-emerald-50 text-sm font-bold text-emerald-800 disabled:opacity-40">{language === 'en' ? 'Today' : 'Aujourd’hui'}</button>
      </section>
    </div>
  ) : null;
}

export function DateRangePicker({ startDate, endDate, onChange, language = 'fr' }) {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(startDate || '');
  const [draftEnd, setDraftEnd] = useState(endDate || '');
  const [cursor, setCursor] = useState(() => parseIsoDate(startDate) || new Date());
  const [choosingEnd, setChoosingEnd] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      setDraftStart(startDate || '');
      setDraftEnd(endDate || '');
      setChoosingEnd(false);
      setOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, startDate, endDate]);

  useEffect(() => {
    if (!open) {
      setDraftStart(startDate || '');
      setDraftEnd(endDate || '');
      setChoosingEnd(false);
    }
  }, [startDate, endDate, open]);

  const selectDate = (value) => {
    if (!draftStart || (draftStart && draftEnd) || !choosingEnd) {
      setDraftStart(value);
      setDraftEnd('');
      setChoosingEnd(true);
      return;
    }
    const normalized = normalizeIsoDateRange(draftStart, value);
    setDraftStart(normalized.startDate);
    setDraftEnd(normalized.endDate);
    setChoosingEnd(false);
  };

  const cancel = () => {
    setOpen(false);
    setDraftStart(startDate || '');
    setDraftEnd(endDate || '');
    setChoosingEnd(false);
  };

  const confirm = () => {
    if (!draftStart || !draftEnd) return;
    onChange?.({ startDate: draftStart, endDate: draftEnd });
    setOpen(false);
  };

  const openPicker = () => {
    setDraftStart(startDate || '');
    setDraftEnd(endDate || '');
    setChoosingEnd(false);
    setCursor(parseIsoDate(startDate) || new Date());
    setOpen(true);
  };

  return (
    <>
      <button type="button" onClick={openPicker} aria-expanded={open} className="pata-date-range-trigger flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-left shadow-sm active:scale-[.99]">
        <span className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800"><CalendarDays size={18}/></span><span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">{language === 'en' ? 'Selected period' : 'Période sélectionnée'}</span><span className="mt-0.5 block truncate text-sm font-bold text-slate-800">{startDate && endDate ? formatDateLabel(startDate, language) + ' – ' + formatDateLabel(endDate, language) : (language === 'en' ? 'Choose a period' : 'Choisir une période')}</span></span></span>
        <ChevronRight size={17} className="shrink-0 text-slate-400"/>
      </button>
      {open && (
        <div className="pata-calendar-backdrop fixed inset-0 z-[125] flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-4" onPointerDown={(event) => { if (event.target === event.currentTarget) cancel(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="pata-range-title" className="pata-calendar-panel w-full max-w-md rounded-t-[28px] border border-white/70 bg-[#fbfdfb] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[28px]">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden"/>
            <div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-emerald-700">PATA</p><h2 id="pata-range-title" className="mt-0.5 text-lg font-extrabold text-slate-900">{language === 'en' ? 'Choose a period' : 'Choisir une période'}</h2></div><button type="button" onClick={cancel} aria-label={language === 'en' ? 'Close calendar' : 'Fermer le calendrier'} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm"><X size={18}/></button></div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-emerald-50 p-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">{language === 'en' ? 'Start date' : 'Date de début'}</p><p className="mt-1 text-xs font-bold text-emerald-950">{draftStart ? formatDateLabel(draftStart, language) : '—'}</p></div>
              <div className="rounded-xl bg-slate-100 p-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{language === 'en' ? 'End date' : 'Date de fin'}</p><p className="mt-1 text-xs font-bold text-slate-800">{draftEnd ? formatDateLabel(draftEnd, language) : (language === 'en' ? 'Tap a second day' : 'Choisis le second jour')}</p></div>
            </div>
            <p className="mb-2 text-center text-xs font-medium text-slate-500">{draftStart && !draftEnd ? (language === 'en' ? 'Now choose the end date' : 'Choisis maintenant la date de fin') : (language === 'en' ? 'Tap the start date, then the end date' : 'Appuie sur le début, puis sur la fin de la période')}</p>
            <CalendarSurface language={language} cursor={cursor} setCursor={setCursor} startDate={draftStart} endDate={draftEnd} rangeMode onSelect={selectDate}/>
            <div className="mt-3 grid grid-cols-[auto_1fr] gap-2"><button type="button" onClick={cancel} className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600">{language === 'en' ? 'Cancel' : 'Annuler'}</button><button type="button" onClick={confirm} disabled={!draftStart || !draftEnd} className="h-11 rounded-xl bg-[#075b43] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{language === 'en' ? 'Apply this period' : 'Valider cette période'}</button></div>
          </section>
        </div>
      )}
    </>
  );
}
