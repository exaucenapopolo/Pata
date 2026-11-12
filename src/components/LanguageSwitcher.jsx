'use client';

import { useLanguage } from '@/context/LanguageContext';

export function LanguageSwitcher({ appearance = 'light', className = '' }) {
  const { language, setLanguage, isLanguageSaving } = useLanguage();
  const dark = appearance === 'dark';
  const base = dark
    ? 'border-white/20 bg-black/25 text-white hover:bg-black/45'
    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50';
  const active = dark
    ? 'bg-white text-[#0b5c46] shadow-sm'
    : 'bg-[#0b5c46] text-white shadow-sm';

  return (
    <div
      role="group"
      aria-label="Language / Langue"
      className={'inline-flex items-center gap-1 rounded-full border p-1 backdrop-blur-md ' + base + ' ' + className}
    >
      <button
        type="button"
        aria-pressed={language === 'fr'}
        aria-label="Français"
        disabled={isLanguageSaving}
        onClick={() => { setLanguage('fr').catch((error) => console.error('[PATA LANGUAGE]', error)); }}
        className={'min-w-10 rounded-full px-2.5 py-1.5 text-[11px] font-extrabold transition ' + (language === 'fr' ? active : '')}
      >
        FR
      </button>
      <button
        type="button"
        aria-pressed={language === 'en'}
        aria-label="English"
        disabled={isLanguageSaving}
        onClick={() => { setLanguage('en').catch((error) => console.error('[PATA LANGUAGE]', error)); }}
        className={'min-w-10 rounded-full px-2.5 py-1.5 text-[11px] font-extrabold transition ' + (language === 'en' ? active : '')}
      >
        EN
      </button>
    </div>
  );
}
