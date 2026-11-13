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

function AppFeatureTourContent() {
  const { user } = useAuth();
  const { profile, loading: profileLoading, save } = useProfile();
  const { language } = useLanguage();
  const steps = language === 'en' ? TOUR_STEPS.en : TOUR_STEPS.fr;
  const pathname = usePathname();
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const autoStartCheckedRef = useRef(false);
  const pathnameRef = useRef(pathname);
  const storageKey = user?.uid ? 'pata-feature-tour-completed:' + user.uid : '';

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const startTour = useCallback(() => {
    try {
      autoStartCheckedRef.current = true;
      setStepIndex(0);
      setActive(true);
      if (pathnameRef.current !== '/dashboard') router.push('/dashboard');
    } catch (error) {
      console.error('[PATA APP TOUR START]', error);
      setActive(false);
    }
  }, [router]);

  useEffect(() => {
    if (profileLoading || !user || !profile || pathname !== '/dashboard' || autoStartCheckedRef.current) return;
    autoStartCheckedRef.current = true;

    let locallyCompleted = false;
    try {
      locallyCompleted = window.localStorage.getItem(storageKey) === '1';
    } catch {
      // Le profil conserve l’état du guide lorsque le stockage local est indisponible.
    }

    if (profile.appTourCompleted === false && !locallyCompleted) {
      setStepIndex(0);
      setActive(true);
    }
  }, [profile, profileLoading, pathname, user, storageKey]);

  useEffect(() => {
    window.addEventListener('pata:app-tour-start', startTour);
    return () => window.removeEventListener('pata:app-tour-start', startTour);
  }, [startTour]);

  const currentStep = steps[stepIndex];

  // Le guide ne mesure plus le DOM ni ne calcule de coordonnées SVG.
  // Il fait uniquement défiler la cible lorsqu’elle existe ; la carte reste
  // toujours visible même si la cible d’une page n’est pas disponible.
  useEffect(() => {
    if (!active || !currentStep) return undefined;

    let cancelled = false;
    let timer = null;
    let attempts = 0;

    const locateTarget = () => {
      if (cancelled) return;
      try {
        const target = document.querySelector('[data-pata-tour="' + currentStep.target + '"]');
        if (target) {
          target.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          return;
        }
      } catch (error) {
        console.warn('[PATA APP TOUR TARGET]', error?.message || error);
      }

      attempts += 1;
      if (attempts < 8) timer = window.setTimeout(locateTarget, 180);
    };

    timer = window.setTimeout(locateTarget, 180);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [active, stepIndex, pathname, currentStep]);

  const finishTour = async (reason) => {
    setActive(false);
    if (storageKey) {
      try {
        window.localStorage.setItem(storageKey, '1');
      } catch {
        // La sauvegarde du profil reste la référence entre appareils.
      }
    }

    try {
      await save({
        appTourCompleted: true,
        appTourCompletedAt: new Date().toISOString(),
        appTourCompletionReason: reason,
      });
    } catch (error) {
      console.warn('[PATA APP TOUR SAVE]', error?.message || error);
    }
  };

  const goToStep = (nextIndex) => {
    const bounded = Math.max(0, Math.min(steps.length - 1, nextIndex));
    const nextStep = steps[bounded];
    if (!nextStep) return;

    setStepIndex(bounded);
    if (nextStep.href !== pathname) {
      try {
        router.push(nextStep.href);
      } catch (error) {
        console.error('[PATA APP TOUR NAVIGATION]', error);
      }
    }
  };

  if (!active || !currentStep) return null;

  return (
    <>
      <div className="pointer-events-auto fixed inset-0 z-[90] bg-slate-950/35" aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pata-feature-tour-title"
        aria-describedby="pata-feature-tour-description"
        className="pointer-events-auto fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-[93] w-[min(440px,calc(100vw-24px))] max-h-[min(70dvh,520px)] -translate-x-1/2 overflow-y-auto rounded-2xl border border-slate-200/90 bg-white p-4 text-slate-900 shadow-[0_12px_42px_rgba(2,8,23,0.24)] sm:bottom-6 sm:p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Sparkles size={15}/></span>
            <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.13em] text-emerald-800">{currentStep.eyebrow}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[10px] font-semibold tabular-nums text-slate-400">{stepIndex + 1}/{steps.length}</span>
            <button type="button" onClick={() => finishTour('skipped')} aria-label={language === 'en' ? 'Close the guide' : 'Fermer le guide'} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X size={16}/></button>
          </div>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <div className="h-full rounded-full bg-emerald-600 transition-all duration-300" style={{ width: ((stepIndex + 1) / steps.length * 100) + '%' }}/>
        </div>
        <h2 id="pata-feature-tour-title" className="mt-3 text-base font-bold leading-6 tracking-tight text-slate-950">{currentStep.title}</h2>
        <p id="pata-feature-tour-description" className="mt-2 text-sm leading-6 text-slate-600">{currentStep.description}</p>
        <p className="mt-3 border-l-2 border-emerald-400 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">{currentStep.tip}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={() => finishTour('skipped')} className="min-h-10 rounded-lg px-2.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100">{language === 'en' ? 'Skip' : 'Passer'}</button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button type="button" onClick={() => goToStep(stepIndex - 1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"><ChevronLeft size={14}/>{language === 'en' ? 'Previous' : 'Précédent'}</button>
            )}
            {stepIndex < steps.length - 1 ? (
              <button type="button" onClick={() => goToStep(stepIndex + 1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-[#075b43] px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#064b38]">{language === 'en' ? 'Next' : 'Suivant'} <ChevronRight size={14}/></button>
            ) : (
              <button type="button" onClick={() => finishTour('completed')} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-[#075b43] px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#064b38]"><Check size={14}/>{language === 'en' ? 'Finish' : 'Terminer'}</button>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

// Une erreur propre au guide ne doit jamais faire tomber la page courante.
// Le garde peut être réinitialisé en relançant le guide depuis Paramètres.
class AppFeatureTourErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, revision: 0 };
    this.handleReplay = this.handleReplay.bind(this);
  }

  componentDidMount() {
    window.addEventListener('pata:app-tour-start', this.handleReplay);
  }

  componentWillUnmount() {
    window.removeEventListener('pata:app-tour-start', this.handleReplay);
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[PATA APP TOUR RENDER ERROR]', error, info?.componentStack || '');
  }

  handleReplay() {
    if (this.state.hasError) {
      this.setState(
        (state) => ({ hasError: false, revision: state.revision + 1 }),
        () => {
          // Le composant enfant vient d’être remonté : on peut relancer le guide.
          window.dispatchEvent(new Event('pata:app-tour-start'));
        },
      );
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="fixed bottom-4 left-1/2 z-[999] w-[min(420px,calc(100vw-24px))] -translate-x-1/2 rounded-2xl border border-amber-200 bg-white p-4 text-slate-900 shadow-xl" role="alert">
          <p className="text-sm font-semibold">{'Le guide a rencontré un problème.'}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{'Le reste de Pata reste disponible. Tu peux relancer le guide depuis Paramètres.'}</p>
          <button type="button" onClick={this.handleReplay} className="mt-3 min-h-9 rounded-lg bg-[#075b43] px-3 text-xs font-bold text-white">{'Réessayer'}</button>
        </section>
      );
    }

    return <AppFeatureTourContent key={this.state.revision}/>;
  }
}

export function AppFeatureTour() {
  return <AppFeatureTourErrorBoundary />;
}
