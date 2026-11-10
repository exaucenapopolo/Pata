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
    <main className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#f5f8f6] px-4 pb-[max(.7rem,env(safe-area-inset-bottom))] pt-[max(.65rem,env(safe-area-inset-top))] text-slate-900 sm:px-6">
      <header className="mx-auto flex w-full max-w-xl shrink-0 items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/android-chrome-192x192.png" alt="Pata" className="h-9 w-9 rounded-xl" />
          <span className="text-xl font-extrabold tracking-tight text-[#075b43]">Pata</span>
        </div>
        <button type="button" onClick={() => finish('/login')} className="rounded-full px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-white">
          Passer
        </button>
      </header>

      <section className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col py-2">
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#0b5c46]">Découvrir Pata</p>
          <span className="text-xs font-semibold tabular-nums text-slate-400">{slide + 1} / {slides.length}</span>
        </div>

        <div
          ref={carouselRef}
          onScroll={onScroll}
          aria-label="Présentation des fonctionnalités de Pata"
          className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {slides.map((item, index) => (
            <article key={item.eyebrow} className="flex h-full w-full shrink-0 snap-start flex-col items-center justify-center px-1 text-center">
              <div className="mb-2 flex h-[clamp(150px,31dvh,228px)] w-full max-w-[350px] shrink-0 items-center justify-center">
                <OnboardingIllustration index={index} />
              </div>
              <p className="text-[9px] font-bold tracking-[.17em] text-[#0b5c46] sm:text-[10px]">{item.eyebrow}</p>
              <h1 className="mt-2 max-w-lg text-[clamp(1.55rem,5.5vw,2.1rem)] font-bold leading-[1.12] tracking-tight text-slate-950">
                {item.title}
              </h1>
              <p className="mt-3 max-w-md text-[13px] leading-[1.55rem] text-slate-600 sm:text-sm">{item.description}</p>
              <p className="mt-3 max-w-sm text-[11px] font-medium leading-5 text-slate-500 sm:text-xs">{item.note}</p>
            </article>
          ))}
        </div>

        <div className="mt-2 flex shrink-0 items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-label="Progression de la présentation">
            {slides.map((item, index) => (
              <button
                key={item.eyebrow}
                type="button"
                aria-label={'Afficher la page ' + (index + 1)}
                aria-current={slide === index ? 'step' : undefined}
                onClick={() => moveSlide(index)}
                className={'h-1.5 rounded-full transition-all duration-300 ' + (slide === index ? 'w-7 bg-[#0b5c46]' : 'w-1.5 bg-slate-300')}
              />
            ))}
          </div>
          {slide > 0 && (
            <button type="button" onClick={() => moveSlide(slide - 1)} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-white">
              ← Précédent
            </button>
          )}
        </div>

        {slide < slides.length - 1 ? (
          <button type="button" onClick={() => moveSlide(slide + 1)} className="mt-3 flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#0b5c46] text-sm font-bold text-white shadow-[0_8px_20px_-12px_rgba(11,92,70,.8)] transition hover:bg-[#084b39]">
            Suivant <span aria-hidden="true">→</span>
          </button>
        ) : (
          <div className="mt-3 grid shrink-0 gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => finish(getRegisterPath())} className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#0b5c46] text-sm font-bold text-white transition hover:bg-[#084b39]">
              Créer mon compte <span aria-hidden="true">→</span>
            </button>
            <button type="button" onClick={() => finish('/login')} className="h-11 rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-50">
              J’ai déjà un compte
            </button>
          </div>
        )}
      </section>

      <footer className="mx-auto flex w-full max-w-xl shrink-0 items-center justify-center border-t border-slate-200/80 pt-2 text-center text-[10px] text-slate-400">
        Pata · Organiser, comprendre et suivre ton argent.
      </footer>
    </main>
  );
}