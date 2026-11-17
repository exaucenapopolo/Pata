'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Lightbulb, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/context/LanguageContext';

const GLOBAL_DISABLED_PREFIX = 'pata-next-actions-disabled:';
const ACTION_HIDDEN_PREFIX = 'pata-next-action-hidden:';
function globalKey(uid) { return GLOBAL_DISABLED_PREFIX + uid; }
function actionStorageKey(uid, key) { return ACTION_HIDDEN_PREFIX + uid + ':' + key; }

export function NextBestAction({ actionKey, title, description, href, cta }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [dontShow, setDontShow] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false);

  useEffect(() => {
    let shouldShow = true;
    try {
      if (user?.uid) {
        shouldShow = localStorage.getItem(globalKey(user.uid)) !== '1'
          && localStorage.getItem(actionStorageKey(user.uid, actionKey)) !== '1';
      }
    } catch {
      // Sans stockage local, la suggestion reste disponible pour cette session.
    }
    setVisible(shouldShow);
    setReady(true);
  }, [user?.uid, actionKey]);

  const savePreference = (scope) => {
    if (!user?.uid || savingPreference) return;
    setSavingPreference(true);
    try {
      if (scope === 'all') localStorage.setItem(globalKey(user.uid), '1');
      else localStorage.setItem(actionStorageKey(user.uid, actionKey), '1');
    } catch {
      // La suggestion est masquée pour la session même si le stockage est bloqué.
    }
    setVisible(false);
    setSavingPreference(false);
  };

  if (!ready || !visible) return null;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-[#f0f8f1] to-white p-4 shadow-[0_5px_18px_rgba(7,91,67,.06)]" aria-live="polite">
      <button type="button" onClick={() => setVisible(false)} aria-label={isEnglish ? 'Dismiss this suggestion' : 'Masquer cette suggestion'} className="absolute right-3 top-3 rounded-full p-1.5 text-slate-400 transition hover:bg-white hover:text-slate-700">
        <X size={16}/>
      </button>
      <div className="flex items-start gap-3 pr-7">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-800 shadow-sm"><Lightbulb size={18}/></span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-extrabold uppercase tracking-[.15em] text-emerald-800">{isEnglish ? 'A useful next step' : 'La suite logique'}</p>
          <h2 className="mt-1 text-sm font-extrabold tracking-tight text-slate-900">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
          <Link href={href} className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[#075b43] px-3.5 text-xs font-bold text-white transition hover:bg-[#064b38]">
            {cta} <ArrowRight size={14}/>
          </Link>
        </div>
      </div>
      <div className="mt-3 border-t border-emerald-100/90 pt-3">
        <label className="flex cursor-pointer items-center gap-2 text-[11px] font-medium text-slate-600">
          <input type="checkbox" checked={dontShow} onChange={(event) => setDontShow(event.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-[#075b43]"/>
          {isEnglish ? 'Don’t show this again' : 'Ne plus afficher cette suggestion'}
        </label>
        {dontShow && (
          <div className="mt-2 flex flex-wrap gap-2 pl-6">
            <button type="button" disabled={savingPreference} onClick={() => savePreference('action')} className="min-h-8 rounded-lg border border-emerald-200 bg-white px-2.5 text-[10px] font-bold text-emerald-800 transition hover:bg-emerald-50">
              {isEnglish ? 'Only this action' : 'Seulement cette action'}
            </button>
            <button type="button" disabled={savingPreference} onClick={() => savePreference('all')} className="min-h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50">
              {isEnglish ? 'All future suggestions' : 'Toutes les suggestions'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export function NextBestActionPreferences() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    try {
      setEnabled(!user?.uid || localStorage.getItem(globalKey(user.uid)) !== '1');
    } catch {
      setEnabled(true);
    }
  }, [user?.uid]);

  const resetAll = () => {
    if (!user?.uid) return;
    try {
      localStorage.removeItem(globalKey(user.uid));
      const prefix = ACTION_HIDDEN_PREFIX + user.uid + ':';
      const keys = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const storageKey = localStorage.key(index);
        if (storageKey && storageKey.startsWith(prefix)) keys.push(storageKey);
      }
      keys.forEach((storageKey) => localStorage.removeItem(storageKey));
    } catch {
      // Les préférences redeviennent actives pour la session.
    }
    setEnabled(true);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">{isEnglish ? 'Suggestions after actions' : 'Suggestions après une action'}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {isEnglish ? 'Pata can suggest a useful next step after you save something. You can hide one suggestion or turn them all off.' : 'Pata peut proposer une suite utile après un enregistrement. Tu peux masquer une suggestion précise ou toutes les désactiver.'}
          </p>
        </div>
        <span className={'rounded-full px-2.5 py-1 text-[10px] font-bold ' + (enabled ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600')}>
          {enabled ? (isEnglish ? 'Enabled' : 'Activées') : (isEnglish ? 'Disabled' : 'Désactivées')}
        </span>
      </div>
      <button type="button" onClick={resetAll} className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[#075b43] px-3 text-xs font-bold text-white">
        <Check size={14}/> {enabled ? (isEnglish ? 'Reset hidden suggestions' : 'Réinitialiser les suggestions masquées') : (isEnglish ? 'Re-enable all suggestions' : 'Réactiver toutes les suggestions')}
      </button>
    </div>
  );
}
