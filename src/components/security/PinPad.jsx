'use client';

import { Delete } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { translateText } from '@/lib/i18n/translations';

const KEYS = ['1','2','3','4','5','6','7','8','9','clear','0','delete'];

export function PinPad({ value = '', onChange, length = 4, label = 'Code secret', disabled = false }) {
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const current = String(value || '').slice(0, length);
  const displayLabel = translateText(label, language);
  const press = (key) => {
    if (disabled) return;
    if (key === 'delete') onChange(current.slice(0, -1));
    else if (key === 'clear') onChange('');
    else if (current.length < length) onChange(current + key);
  };

  return (
    <div className="mx-auto w-full max-w-[350px] select-none">
      <p className="mb-4 text-center text-sm font-semibold text-slate-600 dark:text-slate-300">{displayLabel}</p>
      <div className="mb-6 flex min-h-8 items-center justify-center gap-5" role="img" aria-label={isEnglish ? `${current.length} of ${length} digits entered` : `${current.length} chiffre(s) sur ${length} saisi(s)`}>
        {Array.from({ length }, (_, index) => (
          <span key={index} className={`h-3.5 w-3.5 rounded-full border transition-all duration-150 ${index < current.length ? 'scale-110 border-[#075b43] bg-[#075b43] shadow-[0_0_0_5px_rgba(7,91,67,0.08)]' : 'border-slate-300 bg-transparent dark:border-slate-600'}`}/>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((key) => {
          if (key === 'clear') return <button key={key} type="button" disabled={disabled || !current} onClick={() => press(key)} aria-label={isEnglish ? "Clear code" : "Effacer le code"} className="flex h-[66px] items-center justify-center rounded-[20px] text-xs font-semibold text-slate-500 transition hover:bg-slate-100 active:scale-[0.97] disabled:opacity-25 dark:text-slate-400 dark:hover:bg-slate-700/60">{isEnglish ? "Clear" : "Effacer"}</button>;
          if (key === 'delete') return <button key={key} type="button" disabled={disabled || !current} onClick={() => press(key)} aria-label={isEnglish ? "Delete last digit" : "Supprimer le dernier chiffre"} className="flex h-[66px] items-center justify-center rounded-[20px] text-slate-600 transition hover:bg-slate-100 active:scale-[0.97] disabled:opacity-25 dark:text-slate-300 dark:hover:bg-slate-700/60"><Delete size={22}/></button>;
          return <button key={key} type="button" disabled={disabled || current.length >= length} onClick={() => press(key)} aria-label={isEnglish ? `Digit ${key}` : `Chiffre ${key}`} className="flex h-[66px] items-center justify-center rounded-[20px] border border-slate-200/90 bg-white text-[25px] font-semibold text-slate-800 shadow-[0_3px_10px_rgba(15,23,42,0.05)] transition hover:border-brand-300 hover:bg-brand-50 active:scale-[0.97] disabled:opacity-30 dark:border-slate-700 dark:bg-[#1e3028] dark:text-slate-100 dark:hover:bg-[#294237]">{key}</button>;
        })}
      </div>
      <p className="mt-3 text-center text-[11px] text-slate-400 dark:text-slate-500">{isEnglish ? "Enter all four digits to unlock automatically." : "Saisis les quatre chiffres pour déverrouiller automatiquement."}</p>
    </div>
  );
}
