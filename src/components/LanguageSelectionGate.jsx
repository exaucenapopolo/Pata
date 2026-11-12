'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/context/LanguageContext';

function LoadingScreen() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#f5f8f6]">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#0b5c46] border-t-transparent" />
    </main>
  );
}

export function LanguageSelectionGate({ children }) {
  const { user, loading: authLoading } = useAuth();
  const { setLanguage, languageReady, isLanguageSaving } = useLanguage();
  const [checked, setChecked] = useState(false);
  const [hasPreference, setHasPreference] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading || !languageReady) return;
    if (user) {
      setHasPreference(true);
      setChecked(true);
      return;
    }

    let saved = false;
    try {
      const value = window.localStorage.getItem('pata-language');
      saved = value === 'fr' || value === 'en';
    } catch {
      saved = false;
    }
    setHasPreference(saved);
    setChecked(true);
  }, [authLoading, user, languageReady]);

  const chooseLanguage = async (value) => {
    setError('');
    try {
      await setLanguage(value);
      setHasPreference(true);
    } catch {
      setError(value === 'en'
        ? 'The language could not be saved. Please try again.'
        : 'La langue n’a pas pu être enregistrée. Réessaie.');
    }
  };

  if (authLoading || !languageReady || !checked) return <LoadingScreen />;

  if (!user && !hasPreference) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[radial-gradient(circle_at_top,#e4f2e9_0%,#f7faf8_45%,#edf3ef_100%)] px-5 py-10">
        <section className="w-full max-w-md rounded-[28px] border border-white bg-white p-6 text-center shadow-[0_24px_70px_-30px_rgba(10,60,35,.28)] sm:p-8">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0b5c46] text-2xl font-black text-white shadow-lg shadow-emerald-950/15">
            P<span className="text-[#91dfb1]">.</span>
          </div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#0b7655]">Pata</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Bienvenue sur Pata
          </h1>
          <p className="mt-1 text-lg font-semibold text-slate-700">Welcome to Pata</p>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-slate-600">
            Choisis la langue de ton application pour continuer.
            <span className="mt-1 block">Choose the language for your app to continue.</span>
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={isLanguageSaving}
              onClick={() => chooseLanguage('fr')}
              className="flex min-h-16 items-center justify-center gap-3 rounded-2xl border border-[#b9d8c5] bg-[#f1f8f3] px-4 py-4 text-left transition hover:border-[#0b7655] hover:bg-[#e7f3eb] disabled:opacity-60"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0b5c46] text-xs font-black text-white">FR</span>
              <span><strong className="block text-sm text-slate-900">Français</strong><span className="text-xs text-slate-500">Continuer en français</span></span>
            </button>
            <button
              type="button"
              disabled={isLanguageSaving}
              onClick={() => chooseLanguage('en')}
              className="flex min-h-16 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-[#0b7655] hover:bg-[#e7f3eb] disabled:opacity-60"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-xs font-black text-white">EN</span>
              <span><strong className="block text-sm text-slate-900">English</strong><span className="text-xs text-slate-500">Continue in English</span></span>
            </button>
          </div>

          <p className="mt-6 text-[11px] leading-5 text-slate-500">
            Tu pourras modifier ce choix à tout moment dans les paramètres.
            <span className="mt-0.5 block">You can change this choice at any time in Settings.</span>
          </p>
          {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
        </section>
      </main>
    );
  }

  return children;
}
