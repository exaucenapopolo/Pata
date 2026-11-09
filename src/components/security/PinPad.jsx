'use client';

import { Delete } from 'lucide-react';

const KEYS = ['1','2','3','4','5','6','7','8','9','clear','0','delete'];

export function PinPad({ value = '', onChange, length = 4, label = 'Code secret', disabled = false }) {
  const current = String(value || '').slice(0, length);
  const press = (key) => {
    if (disabled) return;
    if (key === 'delete') onChange(current.slice(0, -1));
    else if (key === 'clear') onChange('');
    else if (current.length < length) onChange(current + key);
  };

  return (
    <div className="mx-auto w-full max-w-[292px] select-none">
      <p className="mb-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</p>
      <div className="mb-5 flex min-h-7 items-center justify-center gap-4" role="img" aria-label={`${current.length} chiffre(s) sur ${length} saisi(s)`}>
        {Array.from({ length }, (_, index) => (
          <span key={index} className={`h-3.5 w-3.5 rounded-full border transition-all duration-150 ${index < current.length ? 'scale-110 border-[#075b43] bg-[#075b43]' : 'border-slate-300 bg-transparent'}`}/>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => {
          if (key === 'clear') return <button key={key} type="button" disabled={disabled || !current} onClick={() => press(key)} aria-label="Effacer le code" className="flex h-[54px] items-center justify-center rounded-xl text-[11px] font-semibold text-slate-400 dark:text-slate-500 transition hover:bg-slate-100 disabled:opacity-25">Effacer</button>;
          if (key === 'delete') return <button key={key} type="button" disabled={disabled || !current} onClick={() => press(key)} aria-label="Supprimer le dernier chiffre" className="flex h-[54px] items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 disabled:opacity-25"><Delete size={19}/></button>;
          return <button key={key} type="button" disabled={disabled || current.length >= length} onClick={() => press(key)} aria-label={`Chiffre ${key}`} className="flex h-[54px] items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-semibold text-slate-800 dark:border-slate-700 dark:bg-[#1e3028] dark:text-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-brand-300 hover:bg-brand-50 active:scale-[0.97] disabled:opacity-30">{key}</button>;
        })}
      </div>
      <p className="mt-2 text-center text-[10px] text-slate-400 dark:text-slate-500">Saisis chaque chiffre séparément.</p>
    </div>
  );
}
