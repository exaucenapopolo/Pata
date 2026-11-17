'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { Crown, Sparkles, X, ArrowRight, Check, Smartphone, BellRing } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { isPremiumActive, shouldShowPremiumReminder } from '@/lib/premiumReminderPolicy';

const DISPLAY_DELAY_MS = 12000;

export function PremiumReminder() {
  const { user } = useAuth();
  const { profile, loading } = useProfile();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [reminderType, setReminderType] = useState('premium');

  useEffect(() => {
    if (loading || !user?.uid || !profile) {
      setOpen(false);
      return undefined;
    }

    if (pathname === '/premium' || pathname.startsWith('/premium/')) {
      setOpen(false);
      return undefined;
    }

    const premiumActive = isPremiumActive(profile.premiumUntil);
    let nextReminderType = 'premium';

    if (premiumActive) {
      const androidBrowser = typeof window !== 'undefined' && /android/i.test(window.navigator.userAgent || '');
      if (Capacitor.isNativePlatform() || !androidBrowser) {
        setOpen(false);
        return undefined;
      }
      nextReminderType = 'install';
    }

    const storageKey = (nextReminderType === 'install'
      ? 'pata-premium-app-reminder-last-shown:'
      : 'pata-premium-reminder-last-shown:') + user.uid;
    let lastShown = null;
    try {
      lastShown = window.localStorage.getItem(storageKey);
    } catch {
      // Si le stockage est indisponible, le rappel reste limité à cette session.
    }

    if (!shouldShowPremiumReminder(lastShown)) {
      setOpen(false);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, String(Date.now()));
      } catch {
        // Ne pas bloquer l'application si le stockage local est désactivé.
      }
      setReminderType(nextReminderType);
      setOpen(true);
    }, DISPLAY_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [loading, user?.uid, profile, pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  if (!open) return null;

  const installReminder = reminderType === 'install';

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/45 p-4">
      <button
        type="button"
        aria-label="Fermer le rappel Pata"
        onClick={() => setOpen(false)}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pata-premium-reminder-title"
        className="relative z-[1] w-full max-w-md overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 bg-[#075b43] px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
              {installReminder ? <Smartphone size={21} /> : <Crown size={21} />}
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-100">Pata Premium</p>
              <h2 id="pata-premium-reminder-title" className="mt-0.5 text-lg font-bold">
                {installReminder ? 'Profite pleinement de ton abonnement' : 'Va plus loin avec tes finances'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fermer"
            className="rounded-lg p-1.5 text-white/85 transition hover:bg-white/10 hover:text-white"
          >
            <X size={19} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {installReminder ? (
            <>
              <p className="text-sm leading-6 text-slate-600">
                Ton accès Premium est actif. Télécharge l’application Android Pata pour profiter des fonctions qui travaillent directement avec ton téléphone.
              </p>
              <div className="space-y-3 rounded-xl bg-emerald-50/70 p-3.5">
                <div className="flex items-start gap-2.5">
                  <Check size={16} className="mt-0.5 shrink-0 text-emerald-700" />
                  <p className="text-xs leading-5 text-slate-700"><strong>Import automatique des SMS Mobile Money</strong> pour préparer le suivi de tes opérations après autorisation.</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <BellRing size={16} className="mt-0.5 shrink-0 text-emerald-700" />
                  <p className="text-xs leading-5 text-slate-700"><strong>Notification permanente Pata</strong> pour retrouver rapidement la saisie et les outils financiers depuis ton téléphone.</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check size={16} className="mt-0.5 shrink-0 text-emerald-700" />
                  <p className="text-xs leading-5 text-slate-700">Le widget financier et les fonctions Android conçues pour ton usage quotidien.</p>
                </div>
              </div>
              <p className="text-[11px] leading-5 text-slate-500">Ton abonnement reste actif sur ton compte. Les fonctions qui nécessitent l’accès au téléphone sont disponibles dans l’application Android officielle.</p>
            </>
          ) : (
            <>
              <p className="text-sm leading-6 text-slate-600">
                Tu utilises actuellement Pata gratuitement. Premium t’offre plus de capacité pour suivre tes opérations et profiter des outils avancés.
              </p>
              <div className="space-y-3 rounded-xl bg-emerald-50/70 p-3.5">
                <div className="flex items-start gap-2.5">
                  <Check size={16} className="mt-0.5 shrink-0 text-emerald-700" />
                  <p className="text-xs leading-5 text-slate-700">Des limites plus larges pour tes dépenses, revenus, budgets et objectifs.</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check size={16} className="mt-0.5 shrink-0 text-emerald-700" />
                  <p className="text-xs leading-5 text-slate-700">Une utilisation élargie de l’assistante Mč pour tes analyses.</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <Check size={16} className="mt-0.5 shrink-0 text-emerald-700" />
                  <p className="text-xs leading-5 text-slate-700">Le suivi automatique Mobile Money sur l’application Android.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">À partir de 2 500 FCFA / mois</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">Consulte les avantages et les conditions avant d’activer.</p>
                </div>
                <Sparkles size={20} className="text-emerald-700" />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Plus tard
            </button>
            <Link
              href={installReminder ? '/telecharger' : '/premium'}
              onClick={() => setOpen(false)}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#075b43] px-3 text-sm font-semibold text-white transition hover:bg-[#064a37]"
            >
              {installReminder ? 'Télécharger l’application' : 'Découvrir Premium'} <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
