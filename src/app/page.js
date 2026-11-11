'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import OnboardingIllustration from '@/components/OnboardingIllustrations';

const ONBOARDING_KEY = 'pata-onboarding-completed-v1';
const slides = [
  {
    eyebrow: 'TES FINANCES, AU MÊME ENDROIT',
    title: 'Ton argent, mieux organisé.',
    description: 'Retrouve tes revenus, tes dépenses, ton budget et ton solde dans un seul espace. Les informations essentielles restent faciles à consulter.',
    note: 'Tu vois rapidement où tu en es et ce qu’il te reste.',
  },
  {
    eyebrow: 'UN CONSEIL QUI TE COMPREND',
    title: 'Comprends mieux tes habitudes.',
    description: 'Pose tes questions avec tes mots. L’assistant analyse les informations de ton suivi et t’aide à comprendre tes habitudes financières.',
    note: 'Des explications claires et des pistes concrètes, à partir de ton activité dans Pata.',
  },
  {
    eyebrow: 'LE SUIVI MOBILE MONEY AUTOMATIQUE',
    title: 'Moins de saisie, plus de suivi.',
    description: 'L’application Android peut reconnaître les SMS de confirmation MTN MoMo et Orange Money pour préparer l’enregistrement des opérations.',
    note: 'Tu gardes une trace des opérations sans devoir tout recopier.',
  },
  {
    eyebrow: 'TES PROJETS PRENNENT FORME',
    title: 'Fais grandir ton épargne.',
    description: 'Crée un objectif, suis les versements et visualise la progression de ton épargne.',
    note: 'Une vue plus claire pour ajuster ton budget et tes priorités.',
  },
  {
    eyebrow: 'AVANCER À PLUSIEURS',
    title: 'Tes cotisations sous contrôle.',
    description: 'Organise une tontine, suis les contributions et retrouve les échéances ainsi que l’ordre des bénéficiaires.',
    note: 'Les informations importantes restent faciles à retrouver.',
  },
  {
    eyebrow: 'DES CHOIX PLUS ÉCLAIRÉS',
    title: 'Mesure tes progrès.',
    description: 'Compare tes périodes, repère les postes les plus importants et suis l’évolution de tes finances.',
    note: 'Un meilleur aperçu pour ajuster tes décisions au bon moment.',
  },
];

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
        <div ref={carouselRef} onScroll={onScroll} aria-label="Présentation des fonctionnalités de Pata" className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
          {slides.map((item, index) => <article key={item.eyebrow} className="relative h-full w-full shrink-0 snap-start overflow-hidden"><OnboardingIllustration index={index} /></article>)}
        </div>
      </div>
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-[max(.75rem,env(safe-area-inset-top))] sm:px-6">
        <div className="flex items-center gap-2.5 rounded-full border border-white/20 bg-black/25 px-3 py-2 backdrop-blur-md">
          <img src="/android-chrome-192x192.png" alt="Pata" className="h-8 w-8 rounded-lg" />
          <span className="text-lg font-extrabold tracking-tight text-white">Pata</span>
        </div>
        <button type="button" onClick={() => finish('/login')} className="pointer-events-auto rounded-full border border-white/25 bg-black/30 px-4 py-2.5 text-xs font-bold text-white backdrop-blur-md transition hover:bg-black/50">Passer</button>
      </header>
      <div className="pointer-events-none absolute right-4 top-[max(4.7rem,calc(env(safe-area-inset-top)+4rem))] z-20 rounded-full border border-white/20 bg-black/30 px-3 py-1.5 text-xs font-bold tabular-nums text-white backdrop-blur-md">{slide + 1} / {slides.length}</div>
      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-16 sm:px-6">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-label="Progression de la présentation">
            {slides.map((item, index) => <button key={item.eyebrow} type="button" aria-label={'Afficher la page ' + (index + 1)} aria-current={slide === index ? 'step' : undefined} onClick={() => moveSlide(index)} className={'h-2 rounded-full transition-all duration-300 ' + (slide === index ? 'w-7 bg-white' : 'w-2 bg-white/55 hover:bg-white/80')}/>)}
          </div>
          {slide > 0 && <button type="button" onClick={() => moveSlide(slide - 1)} className="rounded-xl border border-white/25 bg-black/25 px-3 py-2 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-black/45">← Précédent</button>}
        </div>
        {slide < slides.length - 1 ? (
          <button type="button" onClick={() => moveSlide(slide + 1)} className="mx-auto mt-3 flex h-12 w-full max-w-xl items-center justify-center gap-2 rounded-2xl bg-[#0b5c46] text-sm font-bold text-white shadow-lg transition hover:bg-[#084b39]">Suivant <span aria-hidden="true">→</span></button>
        ) : (
          <div className="mx-auto mt-3 grid w-full max-w-xl gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => finish(getRegisterPath())} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#0b5c46] text-sm font-bold text-white transition hover:bg-[#084b39]">Créer mon compte <span aria-hidden="true">→</span></button>
            <button type="button" onClick={() => finish('/login')} className="h-12 rounded-2xl border border-white/35 bg-black/35 text-sm font-bold text-white backdrop-blur-md transition hover:bg-black/50">J’ai déjà un compte</button>
          </div>
        )}
      </div>
    </main>
  );
}