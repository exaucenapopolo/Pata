'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import OnboardingIllustration from '@/components/OnboardingIllustrations';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useLanguage } from '@/context/LanguageContext';

const ONBOARDING_KEY = 'pata-onboarding-completed-v2';
const slidesByLanguage = {
  fr: [
    {
      eyebrow: 'TES FINANCES, AU MÊME ENDROIT',
      title: 'Sache combien tu gagnes et ce que tu dépenses.',
      description: 'Pata rassemble tes revenus, tes dépenses et ton solde pour te montrer clairement où va ton argent.',
    },
    {
      eyebrow: 'TON ASSISTANT FINANCIER',
      title: 'Pose tes questions et reçois des conseils clairs.',
      description: 'Mč analyse tes chiffres, t’explique ta situation et t’aide à prendre de meilleures décisions.',
    },
    {
      eyebrow: 'SUIVI AUTOMATIQUE DES SMS',
      title: 'Tes opérations Mobile Money suivies automatiquement.',
      description: 'Sur Android, Pata reconnaît les SMS MTN MoMo et Orange Money pour enregistrer tes entrées et tes sorties sans les saisir une à une.',
    },
    {
      eyebrow: 'ÉPARGNE ET PROJETS',
      title: 'Économise pour réaliser tes projets.',
      description: 'Crée un objectif, ajoute tes économies et vois combien il te reste à mettre de côté.',
    },
    {
      eyebrow: 'TONTINES ET COTISATIONS',
      title: 'Organise tes cotisations sans perdre le fil.',
      description: 'Suis les membres, les paiements reçus, les sommes encore dues, les échéances et l’ordre de passage des bénéficiaires.',
    },
    {
      eyebrow: 'RAPPORTS ET ANALYSES',
      title: 'Vois clairement où part ton argent.',
      description: 'Consulte tes rapports, compare tes dépenses entre plusieurs périodes et repère ce que tu peux mieux gérer.',
    },
  ],
  en: [
    {
      eyebrow: 'YOUR FINANCES IN ONE PLACE',
      title: 'See how much you earn and spend.',
      description: 'Pata brings your income, expenses and balance together so you can clearly see where your money goes.',
    },
    {
      eyebrow: 'YOUR FINANCIAL ASSISTANT',
      title: 'Ask questions and get clear advice.',
      description: 'Mč reviews your numbers, explains your situation and helps you make better decisions.',
    },
    {
      eyebrow: 'AUTOMATIC SMS TRACKING',
      title: 'Keep track of your Mobile Money transactions automatically.',
      description: 'On Android, Pata recognises MTN MoMo and Orange Money SMS messages and records incoming and outgoing transactions for you.',
    },
    {
      eyebrow: 'SAVINGS AND PROJECTS',
      title: 'Save money to make your plans happen.',
      description: 'Create a goal, add to your savings and see how much more you need to put aside.',
    },
    {
      eyebrow: 'SAVINGS GROUPS AND CONTRIBUTIONS',
      title: 'Manage group contributions without losing track.',
      description: 'Track members, payments received, outstanding contributions, due dates and payout order.',
    },
    {
      eyebrow: 'REPORTS AND INSIGHTS',
      title: 'See clearly where your money goes.',
      description: 'View your reports, compare spending across periods and find what you could manage better.',
    },
  ],
};

function getRegisterPath() {
  if (typeof window === 'undefined') return '/register';
  const ref = new URLSearchParams(window.location.search).get('ref') || '';
  return /^[A-Fa-f0-9]{12}$/.test(ref) ? '/register?ref=' + encodeURIComponent(ref) : '/register';
}

function Spinner() {
  return (
    <main className="grid h-[100dvh] place-items-center overflow-hidden bg-[#f5f8f6]">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#0b5c46] border-t-transparent" />
    </main>
  );
}

export default function HomePage() {
  const { user, loading } = useAuth();
  const { language } = useLanguage();
  const slides = slidesByLanguage[language] || slidesByLanguage.fr;
  const isEnglish = language === 'en';
  const router = useRouter();
  const carouselRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace('/dashboard');
      return;
    }
    try {
      if (localStorage.getItem(ONBOARDING_KEY) === '1') {
        router.replace(new URLSearchParams(window.location.search).has('ref') ? getRegisterPath() : '/login');
        return;
      }
    } catch {
      // La présentation reste accessible si le stockage local est indisponible.
    }
    setReady(true);
  }, [loading, user, router]);

  const finish = (destination = '/login') => {
    try {
      localStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      // La navigation reste possible sans stockage local.
    }
    router.replace(destination);
  };

  const moveSlide = (next) => {
    const index = Math.max(0, Math.min(slides.length - 1, next));
    setSlide(index);
    const target = carouselRef.current?.children?.[index];
    target?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  };

  const onScroll = (event) => {
    const width = event.currentTarget.clientWidth || 1;
    setSlide(Math.max(0, Math.min(slides.length - 1, Math.round(event.currentTarget.scrollLeft / width))));
  };

  if (loading || user || !ready) return <Spinner />;

  return (
    <main className="relative h-[100dvh] min-h-[100svh] w-full overflow-hidden bg-[#081a13] text-white">
      <div className="absolute inset-0">
        <div ref={carouselRef} onScroll={onScroll} aria-label={isEnglish ? 'Pata feature presentation' : 'Présentation des fonctionnalités de Pata'} className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
          {slides.map((item, index) => <article key={item.eyebrow} className="relative h-full w-full shrink-0 snap-start overflow-hidden"><OnboardingIllustration index={index} content={item} /></article>)}
        </div>
      </div>
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-[max(.75rem,env(safe-area-inset-top))] sm:px-6">
        <div className="flex items-center gap-2.5 rounded-full border border-white/20 bg-black/25 px-3 py-2 backdrop-blur-md">
          <img src="/android-chrome-192x192.png" alt="Pata" className="h-8 w-8 rounded-lg" />
          <span className="text-lg font-extrabold tracking-tight text-white">Pata</span>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <LanguageSwitcher appearance="dark" />
          <button type="button" onClick={() => finish('/login')} className="rounded-full border border-white/25 bg-black/30 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-md transition hover:bg-black/50">{isEnglish ? 'Skip' : 'Passer'}</button>
        </div>
      </header>
      <div className="pointer-events-none absolute right-4 top-[max(4.7rem,calc(env(safe-area-inset-top)+4rem))] z-20 rounded-full border border-white/20 bg-black/30 px-3 py-1.5 text-xs font-bold tabular-nums text-white backdrop-blur-md">{slide + 1} / {slides.length}</div>
      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-16 sm:px-6">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-label={isEnglish ? 'Presentation progress' : 'Progression de la présentation'}>
            {slides.map((item, index) => <button key={item.eyebrow} type="button" aria-label={(isEnglish ? 'Show slide ' : 'Afficher la page ') + (index + 1)} aria-current={slide === index ? 'step' : undefined} onClick={() => moveSlide(index)} className={'h-2 rounded-full transition-all duration-300 ' + (slide === index ? 'w-7 bg-white' : 'w-2 bg-white/55 hover:bg-white/80')}/>)}
          </div>
          {slide > 0 && <button type="button" onClick={() => moveSlide(slide - 1)} className="rounded-xl border border-white/25 bg-black/25 px-3 py-2 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-black/45">{isEnglish ? '← Previous' : '← Précédent'}</button>}
        </div>
        {slide < slides.length - 1 ? (
          <button type="button" onClick={() => moveSlide(slide + 1)} className="mx-auto mt-3 flex h-12 w-full max-w-xl items-center justify-center gap-2 rounded-2xl bg-[#0b5c46] text-sm font-bold text-white shadow-lg transition hover:bg-[#084b39]">{isEnglish ? 'Next' : 'Suivant'} <span aria-hidden="true">→</span></button>
        ) : (
          <div className="mx-auto mt-3 grid w-full max-w-xl gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => finish(getRegisterPath())} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#0b5c46] text-sm font-bold text-white transition hover:bg-[#084b39]">{isEnglish ? 'Create my account' : 'Créer mon compte'} <span aria-hidden="true">→</span></button>
            <button type="button" onClick={() => finish('/login')} className="h-12 rounded-2xl border border-white/35 bg-black/35 text-sm font-bold text-white backdrop-blur-md transition hover:bg-black/50">{isEnglish ? 'I already have an account' : 'J’ai déjà un compte'}</button>
          </div>
        )}
        <div className="mx-auto mt-3 w-full max-w-xl text-center">
          <Link href="/fonctionnalites" className="text-xs font-semibold text-white/80 underline decoration-white/40 underline-offset-4 transition hover:text-white">
            {isEnglish ? 'Discover all Pata features' : 'Découvrir toutes les fonctionnalités de Pata'}
          </Link>
        </div>
      </div>
    </main>
  );
}