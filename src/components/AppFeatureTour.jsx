'use client';

import { Component, useCallback, useEffect, useRef, useState } from 'react';
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

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

function AppFeatureTourContent() {
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
  const [calloutPosition, setCalloutPosition] = useState(null);
  const targetElementRef = useRef(null);
  const calloutRef = useRef(null);
  const autoStartCheckedRef = useRef(false);
  const storageKey = user?.uid ? 'pata-feature-tour-completed:' + user.uid : '';

  const startTour = useCallback(() => {
    autoStartCheckedRef.current = true;
    setStepIndex(0);
    setTargetRect(null);
    setCalloutPosition(null);
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
      setCalloutPosition(null);
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
    setCalloutPosition(null);

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
    if (!active) return undefined;
    const measure = () => {
      const element = targetElementRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const nextViewport = {
        width: Math.max(1, window.innerWidth),
        height: Math.max(1, window.innerHeight),
      };
      const nextRect = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
      setViewport((previous) => (
        previous.width === nextViewport.width && previous.height === nextViewport.height
          ? previous
          : nextViewport
      ));
      setTargetRect((previous) => (
        previous
        && Math.abs(previous.top - nextRect.top) < 0.5
        && Math.abs(previous.left - nextRect.left) < 0.5
        && Math.abs(previous.width - nextRect.width) < 0.5
        && Math.abs(previous.height - nextRect.height) < 0.5
          ? previous
          : nextRect
      ));
    };
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, stepIndex, pathname]);

  // Place la bulle au plus près de l'élément, sans le recouvrir.
  useEffect(() => {
    if (!active || !targetRect || !calloutRef.current) return;
    const panel = calloutRef.current.getBoundingClientRect();
    const margin = 12;
    const gap = 13;
    const width = Math.min(360, Math.max(260, viewport.width - margin * 2));
    const panelHeight = Math.min(panel.height, viewport.height - margin * 2);
    const rightSpace = viewport.width - (targetRect.left + targetRect.width) - gap - margin;
    const leftSpace = targetRect.left - gap - margin;
    const sideSpace = Math.max(rightSpace, leftSpace);

    // Sur grand écran, une bulle latérale libère complètement le dessus et le dessous.
    if (viewport.width >= 900 && sideSpace >= width) {
      const placement = rightSpace >= leftSpace ? 'right' : 'left';
      const left = placement === 'right'
        ? targetRect.left + targetRect.width + gap
        : targetRect.left - width - gap;
      const top = clamp(
        targetRect.top + targetRect.height / 2 - panelHeight / 2,
        margin,
        viewport.height - panelHeight - margin
      );
      const arrowOffset = clamp(
        targetRect.top + targetRect.height / 2 - top - 7,
        24,
        panelHeight - 24
      );
      setCalloutPosition({ left, top, width, maxHeight: Math.min(390, viewport.height * 0.58), placement, arrowOffset });
      return;
    }

    const belowSpace = viewport.height - (targetRect.top + targetRect.height) - gap - margin;
    const aboveSpace = targetRect.top - gap - margin;
    const placement = belowSpace >= panelHeight || belowSpace >= aboveSpace ? 'bottom' : 'top';
    const available = Math.max(140, placement === 'bottom' ? belowSpace : aboveSpace);
    const maxHeight = Math.max(140, Math.min(390, viewport.height * 0.56, available));
    const fittedHeight = Math.min(panelHeight, maxHeight);
    const left = clamp(
      targetRect.left + targetRect.width / 2 - width / 2,
      margin,
      viewport.width - width - margin
    );
    const top = placement === 'bottom'
      ? clamp(targetRect.top + targetRect.height + gap, margin, viewport.height - fittedHeight - margin)
      : clamp(targetRect.top - gap - fittedHeight, margin, viewport.height - fittedHeight - margin);
    const arrowOffset = clamp(
      targetRect.left + targetRect.width / 2 - left - 7,
      24,
      width - 24
    );
    setCalloutPosition({ left, top, width, maxHeight, placement, arrowOffset });
  }, [active, targetRect, viewport, stepIndex, currentStep]);

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
      setCalloutPosition(null);
      targetElementRef.current = null;
    }
  };

  const goToStep = (nextIndex) => {
    const bounded = Math.max(0, Math.min(steps.length - 1, nextIndex));
    setTargetRect(null);
    setCalloutPosition(null);
    setStepIndex(bounded);
    if (steps[bounded].href !== pathname) router.push(steps[bounded].href);
  };

  if (!active || !currentStep) return null;

  const left = targetRect ? Math.max(0, targetRect.left - 8) : 0;
  const top = targetRect ? Math.max(0, targetRect.top - 8) : 0;
  const width = targetRect ? Math.min(viewport.width - left, targetRect.width + 16) : 0;
  const height = targetRect ? Math.min(viewport.height - top, targetRect.height + 16) : 0;
  const panelStyle = {
    left: calloutPosition?.left ?? 12,
    top: calloutPosition?.top ?? 12,
    width: calloutPosition?.width ?? Math.min(360, viewport.width - 24),
    maxHeight: calloutPosition?.maxHeight ?? Math.min(390, viewport.height * 0.56),
    visibility: calloutPosition ? 'visible' : 'hidden',
  };
  const arrowStyle = calloutPosition?.placement === 'bottom'
    ? { left: calloutPosition.arrowOffset, top: -7 }
    : calloutPosition?.placement === 'top'
      ? { left: calloutPosition.arrowOffset, bottom: -7 }
      : calloutPosition?.placement === 'right'
        ? { left: -7, top: calloutPosition.arrowOffset }
        : { right: -7, top: calloutPosition.arrowOffset };
  const arrowClass = calloutPosition?.placement === 'bottom'
    ? 'absolute h-3.5 w-3.5 rotate-45 rounded-[2px] border-l border-t border-slate-200 bg-white/95'
    : calloutPosition?.placement === 'top'
      ? 'absolute h-3.5 w-3.5 rotate-45 rounded-[2px] border-b border-r border-slate-200 bg-white/95'
      : calloutPosition?.placement === 'right'
        ? 'absolute h-3.5 w-3.5 rotate-45 rounded-[2px] border-b border-l border-slate-200 bg-white/95'
        : 'absolute h-3.5 w-3.5 rotate-45 rounded-[2px] border-r border-t border-slate-200 bg-white/95';

  return (
    <>
      <svg className="fixed inset-0 z-[90] h-full w-full" viewBox={'0 0 ' + viewport.width + ' ' + viewport.height} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <mask id="pata-feature-tour-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={viewport.width} height={viewport.height}>
            <rect x="0" y="0" width={viewport.width} height={viewport.height} fill="white"/>
            {targetRect && <rect x={left} y={top} width={Math.max(0, width)} height={Math.max(0, height)} rx="18" fill="black"/>}
          </mask>
        </defs>
        <rect x="0" y="0" width={viewport.width} height={viewport.height} fill="rgba(2, 8, 23, 0.30)" mask="url(#pata-feature-tour-mask)"/>
      </svg>
      <div className="fixed inset-0 z-[91]" aria-hidden="true"/>
      {targetRect && (
        <div
          className="pointer-events-none fixed z-[92] rounded-[18px] border-2 border-white bg-white/10 shadow-[0_0_0_4px_rgba(11,92,70,0.18)]"
          style={{ top, left, width, height, transition: 'top 260ms ease, left 260ms ease, width 260ms ease, height 260ms ease' }}
        />
      )}
      <section
        ref={calloutRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pata-feature-tour-title"
        aria-describedby="pata-feature-tour-description"
        className="fixed z-[93] overflow-y-auto rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 text-slate-900 shadow-[0_12px_42px_rgba(2,8,23,0.20)] backdrop-blur-xl transition-[top,left,opacity] duration-250 sm:p-4"
        style={panelStyle}
      >
        {calloutPosition && <span aria-hidden="true" className={arrowClass} style={arrowStyle}/>}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Sparkles size={14}/></span>
            <p className="truncate text-[9px] font-extrabold uppercase tracking-[0.13em] text-emerald-800">{currentStep.eyebrow}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[10px] font-semibold tabular-nums text-slate-400">{stepIndex + 1}/{steps.length}</span>
            <button type="button" onClick={() => finishTour('skipped')} aria-label={isEnglish ? 'Close the guide' : 'Fermer le guide'} className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X size={15}/></button>
          </div>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <div className="h-full rounded-full bg-emerald-600 transition-all duration-300" style={{ width: ((stepIndex + 1) / steps.length * 100) + '%' }}/>
        </div>
        <h2 id="pata-feature-tour-title" className="mt-2.5 text-[15px] font-bold leading-5 tracking-tight text-slate-950 sm:text-base">{currentStep.title}</h2>
        <p id="pata-feature-tour-description" className="mt-1.5 text-[12px] leading-[1.55] text-slate-600">{currentStep.description}</p>
        <p className="mt-2.5 border-l-2 border-emerald-400 bg-slate-50 px-2.5 py-2 text-[10px] leading-[1.45] text-slate-600">{currentStep.tip}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" onClick={() => finishTour('skipped')} className="min-h-9 rounded-lg px-2 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100">{isEnglish ? 'Skip' : 'Passer'}</button>
          <div className="flex items-center gap-1.5">
            {stepIndex > 0 && (
              <button type="button" onClick={() => goToStep(stepIndex - 1)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"><ChevronLeft size={13}/>{isEnglish ? 'Previous' : 'Précédent'}</button>
            )}
            {stepIndex < steps.length - 1 ? (
              <button type="button" onClick={() => goToStep(stepIndex + 1)} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-[#075b43] px-3 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#064b38]">{isEnglish ? 'Next' : 'Suivant'} <ChevronRight size={13}/></button>
            ) : (
              <button type="button" onClick={() => finishTour('completed')} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-[#075b43] px-3 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#064b38]"><Check size={13}/>{isEnglish ? 'Finish' : 'Terminer'}</button>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

class AppFeatureTourErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('[PATA APP TOUR ERROR]', error);
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

export function AppFeatureTour() {
  return (
    <AppFeatureTourErrorBoundary>
      <AppFeatureTourContent />
    </AppFeatureTourErrorBoundary>
  );
}
