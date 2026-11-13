'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { X, ChevronLeft, ChevronRight, Check, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useLanguage } from '@/context/LanguageContext';

const TOUR_STEPS = {
  fr: [
    { target: 'dashboard-overview', href: '/dashboard', eyebrow: 'VUE D’ENSEMBLE', title: 'Bienvenue dans ton espace Pata', description: 'Ton tableau de bord rassemble les informations essentielles : ton solde, tes mouvements récents et les accès rapides aux principales fonctions.', tip: 'Tu peux revenir ici à tout moment pour faire le point sur tes finances.' },
    { target: 'expense-create', href: '/expenses', eyebrow: 'DÉPENSES', title: 'Enregistrer une dépense', description: 'Ouvre ce formulaire pour saisir le montant, la catégorie, la date et les détails utiles. Pata tient ensuite ton historique à jour et t’aide à comprendre où part ton argent.', tip: 'Une dépense peut aussi être liée à un revenu ou à un projet lorsque c’est nécessaire.' },
    { target: 'income-create', href: '/income', eyebrow: 'REVENUS', title: 'Ajouter un revenu', description: 'Enregistre ton salaire, tes ventes, tes prestations ou toute autre entrée d’argent. Tu peux préciser sa source et suivre ce qu’il reste disponible.', tip: 'Ajouter tes premiers revenus aide Pata à proposer des budgets plus pertinents.' },
    { target: 'budget-plan', href: '/budgets', eyebrow: 'BUDGETS', title: 'Prévoir avant de dépenser', description: 'Cette rubrique sert à répartir tes revenus entre les catégories de dépenses et à comparer le montant prévu à ce que tu as réellement dépensé.', tip: 'La proposition automatique devient plus utile après l’enregistrement de tes revenus.' },
    { target: 'debt-create', href: '/debts', eyebrow: 'DETTES ET PRÊTS', title: 'Ne perds plus le suivi des remboursements', description: 'Enregistre ici une dette que tu dois ou un prêt que tu as accordé. Pata suit les montants restants, les échéances et les remboursements.', tip: 'Les deux situations sont distinctes : « Nouvelle dette » et « Nouveau prêt ».' },
    { target: 'goal-create', href: '/goals', eyebrow: 'ÉPARGNE', title: 'Préparer tes projets', description: 'Crée un objectif avec un montant à atteindre ou une tirelire libre. Ajoute tes versements et observe ta progression.', tip: 'Tu peux suivre une épargne même sans fixer de date de fin.' },
    { target: 'cotisation-create', href: '/cotisations', eyebrow: 'COTISATIONS ET TONTINES', title: 'Organiser un groupe', description: 'Crée un groupe, définis les règles, invite les participants et suis les versements, les échéances ainsi que les tours de bénéficiaires.', tip: 'Les paiements et les confirmations restent consultables dans l’espace du groupe.' },
    { target: 'reports-overview', href: '/reports', eyebrow: 'RAPPORTS', title: 'Comprendre l’évolution de tes finances', description: 'Les rapports regroupent les analyses de tes revenus, dépenses, budgets et épargnes. Tu peux choisir une période et exporter tes bilans.', tip: 'Compare plusieurs périodes pour mieux repérer les changements.' },
    { target: 'notifications-settings', href: '/settings', eyebrow: 'NOTIFICATIONS', title: 'Recevoir les rappels utiles', description: 'Dans Paramètres, ouvre Notifications pour gérer les alertes sur cet appareil et les rappels concernant tes opérations et échéances.', tip: 'Les autorisations du téléphone restent sous ton contrôle.' },
    { target: 'sms-import-settings', href: '/settings', eyebrow: 'IMPORT SMS MOBILE MONEY', title: 'Gagner du temps avec la détection des SMS', description: 'Sur Android, Pata peut reconnaître les SMS de transaction MTN MoMo et Orange Money pour t’aider à importer les opérations, après autorisation.', tip: 'Cette fonction est facultative : tu peux continuer à saisir tes opérations manuellement.' },
    { target: 'assistant-entry', href: '/dashboard', eyebrow: 'ASSISTANTE FINANCIÈRE', title: 'Tu peux aussi poser tes questions à Mč', description: 'Ouvre l’assistante depuis ce bouton pour demander une explication de tes chiffres, des pistes d’amélioration ou de l’aide pour utiliser Pata.', tip: 'Plus tes opérations sont bien renseignées, plus les conseils peuvent tenir compte de ta situation.' },
  ],
  en: [
    { target: 'dashboard-overview', href: '/dashboard', eyebrow: 'OVERVIEW', title: 'Welcome to your Pata space', description: 'Your dashboard brings together the essentials: your balance, recent activity and shortcuts to the main features.', tip: 'Come back here anytime to review your finances.' },
    { target: 'expense-create', href: '/expenses', eyebrow: 'EXPENSES', title: 'Record an expense', description: 'Open this form to enter the amount, category, date and useful details. Pata keeps your history up to date and helps you understand where your money goes.', tip: 'An expense can also be linked to an income source or a project when needed.' },
    { target: 'income-create', href: '/income', eyebrow: 'INCOME', title: 'Add an income', description: 'Record your salary, sales, services or any other incoming money. You can specify its source and track what remains available.', tip: 'Adding your first income entries helps Pata suggest more relevant budgets.' },
    { target: 'budget-plan', href: '/budgets', eyebrow: 'BUDGETS', title: 'Plan before you spend', description: 'Use this area to allocate income across spending categories and compare planned amounts with actual expenses.', tip: 'Automatic suggestions become more useful after you have recorded income.' },
    { target: 'debt-create', href: '/debts', eyebrow: 'DEBTS AND LOANS', title: 'Keep track of repayments', description: 'Record money you owe or a loan you have given. Pata tracks remaining balances, due dates and repayments.', tip: 'These are separate actions: “New debt” and “New loan”.' },
    { target: 'goal-create', href: '/goals', eyebrow: 'SAVINGS', title: 'Plan for your goals', description: 'Create a savings target or a flexible savings pot. Add deposits and follow your progress.', tip: 'You can track savings without setting an end date.' },
    { target: 'cotisation-create', href: '/cotisations', eyebrow: 'GROUP CONTRIBUTIONS', title: 'Organise a savings group', description: 'Create a group, set its rules, invite participants and follow contributions, due dates and payout turns.', tip: 'Payments and confirmations remain available in the group space.' },
    { target: 'reports-overview', href: '/reports', eyebrow: 'REPORTS', title: 'Understand your financial progress', description: 'Reports bring together analyses of your income, expenses, budgets and savings. Choose a period and export your summaries.', tip: 'Compare periods to spot meaningful changes.' },
    { target: 'notifications-settings', href: '/settings', eyebrow: 'NOTIFICATIONS', title: 'Get useful reminders', description: 'In Settings, open Notifications to manage alerts on this device and reminders about transactions and due dates.', tip: 'Phone permissions always remain under your control.' },
    { target: 'sms-import-settings', href: '/settings', eyebrow: 'MOBILE MONEY SMS IMPORT', title: 'Save time by detecting transaction messages', description: 'On Android, Pata can recognise MTN MoMo and Orange Money transaction SMS messages to help import activity, after you grant permission.', tip: 'This feature is optional: you can keep entering transactions manually.' },
    { target: 'assistant-entry', href: '/dashboard', eyebrow: 'FINANCIAL ASSISTANT', title: 'You can also ask Mč questions', description: 'Open the assistant from this button to ask about your figures, get ideas for improvement or learn how to use Pata.', tip: 'The more accurately you record transactions, the more relevant its guidance can be.' },
  ],
};

export function AppFeatureTour() {
  const { user } = useAuth();
  const { profile, loading: profileLoading, save } = useProfile();
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const steps = isEnglish ? TOUR_STEPS.en : TOUR_STEPS.fr;
  const pathname = usePathname();
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const targetElementRef = useRef(null);
  const autoStartCheckedRef = useRef(false);
  const storageKey = user?.uid ? 'pata-feature-tour-completed:' + user.uid : '';

  const startTour = useCallback(() => {
    autoStartCheckedRef.current = true;
    setStepIndex(0);
    setTargetRect(null);
    setActive(true);
    if (pathname !== '/dashboard') router.push('/dashboard');
  }, [pathname, router]);

  useEffect(() => {
    if (profileLoading || !user || !profile || pathname !== '/dashboard' || autoStartCheckedRef.current) return;
    autoStartCheckedRef.current = true;
    let locallyCompleted = false;
    try { locallyCompleted = localStorage.getItem(storageKey) === '1'; } catch { /* Le profil reste prioritaire. */ }
    if (profile.appTourCompleted === false && !locallyCompleted) {
      setStepIndex(0);
      setTargetRect(null);
      setActive(true);
    }
  }, [profile, profileLoading, pathname, user, storageKey]);

  useEffect(() => {
    window.addEventListener('pata:app-tour-start', startTour);
    return () => window.removeEventListener('pata:app-tour-start', startTour);
  }, [startTour]);

  const currentStep = steps[stepIndex];

  useEffect(() => {
    if (!active || !currentStep) return undefined;
    let cancelled = false;
    let timer = null;
    let attempts = 0;
    targetElementRef.current = null;
    setTargetRect(null);
    const measure = (element) => {
      if (cancelled || !element) return;
      const rect = element.getBoundingClientRect();
      setViewport({ width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) });
      setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    };
    const locate = () => {
      if (cancelled) return;
      const selector = '[data-pata-tour="' + currentStep.target + '"]';
      const element = Array.from(document.querySelectorAll(selector)).find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && window.getComputedStyle(candidate).visibility !== 'hidden';
      });
      if (element) {
        targetElementRef.current = element;
        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        timer = window.setTimeout(() => measure(element), 360);
        return;
      }
      attempts += 1;
      if (attempts < 24) { timer = window.setTimeout(locate, 100); return; }
      const fallback = document.querySelector('main h1, main header, main section');
      if (fallback) {
        targetElementRef.current = fallback;
        fallback.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        timer = window.setTimeout(() => measure(fallback), 360);
      } else {
        setViewport({ width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) });
      }
    };
    timer = window.setTimeout(locate, 80);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [active, currentStep, pathname]);

  useEffect(() => {
    if (!active || !targetElementRef.current) return undefined;
    const measure = () => {
      const element = targetElementRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      setViewport({ width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) });
      setTargetRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    };
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, targetRect, stepIndex, pathname]);

  const finishTour = async (reason) => {
    if (storageKey) {
      try { localStorage.setItem(storageKey, '1'); } catch { /* Le profil conserve l’état entre appareils. */ }
    }
    try {
      await save({ appTourCompleted: true, appTourCompletedAt: new Date().toISOString(), appTourCompletionReason: reason });
    } catch (error) {
      console.warn('[PATA APP TOUR]', error?.message || error);
    } finally {
      setActive(false);
      setTargetRect(null);
      targetElementRef.current = null;
    }
  };

  const goToStep = (nextIndex) => {
    const bounded = Math.max(0, Math.min(steps.length - 1, nextIndex));
    setTargetRect(null);
    setStepIndex(bounded);
    if (steps[bounded].href !== pathname) router.push(steps[bounded].href);
  };

  if (!active || !currentStep) return null;

  const left = targetRect ? Math.max(0, targetRect.left - 8) : 0;
  const top = targetRect ? Math.max(0, targetRect.top - 8) : 0;
  const width = targetRect ? Math.min(viewport.width - left, targetRect.width + 16) : 0;
  const height = targetRect ? Math.min(viewport.height - top, targetRect.height + 16) : 0;
  const panelAtTop = targetRect ? targetRect.top + targetRect.height > viewport.height * 0.68 : false;
  const panelStyle = {
    position: 'fixed',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'min(520px, calc(100vw - 24px))',
    maxHeight: 'min(70dvh, 430px)',
    overflowY: 'auto',
    top: panelAtTop ? 'max(12px, env(safe-area-inset-top))' : 'auto',
    bottom: panelAtTop ? 'auto' : 'max(12px, env(safe-area-inset-bottom))',
  };

  return (
    <>
      <svg className="fixed inset-0 z-[90] h-full w-full" viewBox={'0 0 ' + viewport.width + ' ' + viewport.height} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <mask id="pata-feature-tour-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={viewport.width} height={viewport.height}>
            <rect x="0" y="0" width={viewport.width} height={viewport.height} fill="white"/>
            {targetRect && <rect x={left} y={top} width={Math.max(0, width)} height={Math.max(0, height)} rx="18" fill="black"/>}
          </mask>
        </defs>
        <rect x="0" y="0" width={viewport.width} height={viewport.height} fill="rgba(2, 8, 23, 0.76)" mask="url(#pata-feature-tour-mask)"/>
      </svg>
      <div className="fixed inset-0 z-[91]" aria-hidden="true"/>
      {targetRect && <div className="pointer-events-none fixed z-[92] rounded-[18px] border-2 border-white bg-white/10 shadow-[0_0_0_5px_rgba(255,255,255,0.16)]" style={{ top, left, width, height, transition: 'top 260ms ease, left 260ms ease, width 260ms ease, height 260ms ease' }}/>}
      <section role="dialog" aria-modal="true" aria-labelledby="pata-feature-tour-title" aria-describedby="pata-feature-tour-description" className="fixed z-[93] rounded-[24px] border border-slate-200 bg-white p-4 text-slate-900 shadow-[0_24px_90px_rgba(2,8,23,0.35)] sm:p-5 animate-in fade-in slide-in-from-bottom-3 duration-300" style={panelStyle}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Sparkles size={16}/></span>
            <div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[0.15em] text-emerald-700">{isEnglish ? 'PATA QUICK TOUR' : 'DÉCOUVERTE DE PATA'}</p><p className="mt-0.5 text-[10px] font-semibold text-slate-400">{isEnglish ? 'Step ' : 'Étape '}{stepIndex + 1} {isEnglish ? 'of' : 'sur'} {steps.length}</p></div>
          </div>
          <button type="button" onClick={() => finishTour('skipped')} aria-label={isEnglish ? 'Close the guide' : 'Fermer le guide'} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X size={18}/></button>
        </div>
        <div className="mb-3 flex gap-1.5" aria-hidden="true">{steps.map((step, index) => <span key={step.target} className={'h-1.5 flex-1 rounded-full transition-colors ' + (index <= stepIndex ? 'bg-emerald-600' : 'bg-slate-100')}/>)}</div>
        <p className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-slate-400">{currentStep.eyebrow}</p>
        <h2 id="pata-feature-tour-title" className="mt-1.5 text-lg font-bold leading-6 tracking-tight text-slate-950 sm:text-xl">{currentStep.title}</h2>
        <p id="pata-feature-tour-description" className="mt-2 text-[13px] leading-5 text-slate-600">{currentStep.description}</p>
        <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-[11px] leading-4 text-emerald-900">{currentStep.tip}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => finishTour('skipped')} className="min-h-10 rounded-xl px-3 text-xs font-semibold text-slate-500 transition hover:bg-slate-100">{isEnglish ? 'Skip guide' : 'Passer le guide'}</button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && <button type="button" onClick={() => goToStep(stepIndex - 1)} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"><ChevronLeft size={14}/>{isEnglish ? 'Back' : 'Précédent'}</button>}
            {stepIndex < steps.length - 1 ? (
              <button type="button" onClick={() => goToStep(stepIndex + 1)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#075b43] px-4 text-xs font-bold text-white shadow-sm transition hover:bg-[#064b38]">{isEnglish ? 'Next' : 'Suivant'} <ChevronRight size={14}/></button>
            ) : (
              <button type="button" onClick={() => finishTour('completed')} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#075b43] px-4 text-xs font-bold text-white shadow-sm transition hover:bg-[#064b38]"><Check size={14}/>{isEnglish ? 'Finish' : 'Terminer'}</button>
            )}
          </div>
        </div>
        <p className="mt-3 text-center text-[10px] leading-4 text-slate-400">{isEnglish ? 'You can replay this tour anytime from Settings.' : 'Tu peux revoir ce guide à tout moment depuis les Paramètres.'}</p>
      </section>
    </>
  );
}
