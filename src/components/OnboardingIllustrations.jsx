'use client';

import { useLanguage } from '@/context/LanguageContext';

const VISUALS = {
  0: {
    src: '/onboarding/budget.jpg',
    alt: 'Visuel Pata consacré au suivi du budget',
  },
  2: {
    src: '/onboarding/import-sms.jpg',
    alt: 'Visuel Pata consacré à l’import automatique des SMS Mobile Money',
  },
  3: {
    src: '/onboarding/epargne.jpg',
    alt: 'Visuel Pata consacré aux objectifs d’épargne',
  },
  4: {
    src: '/onboarding/cotisations.jpg',
    alt: 'Visuel Pata consacré aux tontines et cotisations',
  },
  5: {
    src: '/onboarding/analyse.jpg',
    alt: 'Visuel Pata consacré à l’analyse des finances',
  },
};

function Brand() {
  return (
    <span className="text-[15px] font-extrabold tracking-tight text-white">
      Pata<span className="text-[#7fe0a8]">.</span>
    </span>
  );
}

function OnboardingCopy({ content, className = '' }) {
  if (!content) return null;

  return (
    <div className={'text-white drop-shadow-[0_2px_12px_rgba(0,0,0,.28)] ' + className}>
      <p className="mb-3 text-[10px] font-extrabold uppercase leading-[1.35] tracking-[.16em] text-[#a8e8c1] sm:mb-4 sm:text-xs">
        {content.eyebrow}
      </p>
      <h1 className="max-w-[14ch] text-[clamp(1.3rem,4.1vw,2.65rem)] font-extrabold leading-[1.08] tracking-[-.035em] sm:leading-[1.06]">
        {content.title}
      </h1>
      <p className="mt-3 max-w-[34rem] text-[clamp(.85rem,1.35vw,1.05rem)] font-medium leading-[1.48] text-white/92 sm:mt-4">
        {content.description}
      </p>
    </div>
  );
}

function AIVisual() {
  const { language } = useLanguage();
  const isEnglish = language === 'en';

  return (
    <div
      role="img"
      aria-label={isEnglish ? 'Preview of the Pata financial assistant' : 'Aperçu de l’assistant financier Pata'}
      className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[20px] bg-[#e8f2eb] p-1.5 shadow-[0_18px_44px_-18px_rgba(0,0,0,.58)] sm:rounded-[24px] sm:p-2.5"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,107,63,.18),transparent_48%),linear-gradient(145deg,#f8fbf8,#e4efe7)]" />
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[15px] border border-white/90 bg-[#fbfdfb] p-2 text-left shadow-sm sm:rounded-[18px] sm:p-3">
        <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2 sm:gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] bg-[#0b5c46] text-[10px] font-extrabold tracking-tight text-white sm:h-8 sm:w-8 sm:text-xs">
            P<span className="text-[#91dfb1]">.</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[8px] font-bold text-slate-900 sm:text-[10px]">Assistant Pata</p>
            <p className="mt-0.5 truncate text-[7px] font-medium text-[#0b7655] sm:text-[8px]">{isEnglish ? 'Based on your records' : 'À partir de ton suivi'}</p>
          </div>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
        </div>

        <div className="mt-2 rounded-xl rounded-tr-sm bg-[#edf5ef] px-2 py-2">
          <p className="text-[7px] font-bold uppercase tracking-[.08em] text-[#4b7660] sm:text-[8px]">{isEnglish ? 'Your question' : 'Ta question'}</p>
          <p className="mt-1 text-[8px] font-semibold leading-[1.3] text-slate-800 sm:text-[9px]">
            {isEnglish ? 'How can I manage my budget better?' : 'Comment mieux gérer mon budget ?'}
          </p>
        </div>

        <div className="mt-2 rounded-xl border border-[#e2ece5] bg-white p-2 sm:p-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#0b7655]" />
            <p className="text-[8px] font-bold text-[#0b5c46] sm:text-[9px]">{isEnglish ? 'A first suggestion' : 'Une première piste'}</p>
          </div>
          <p className="mt-1.5 text-[8px] leading-[1.4] text-slate-600 sm:text-[9px]">
            {isEnglish ? 'Compare your spending with your plan to see what you could adjust.' : 'Compare tes dépenses au prévu pour repérer quoi ajuster.'}
          </p>
          <div className="mt-2 space-y-2">
            <div>
              <p className="mb-1 text-[7px] font-medium text-slate-500 sm:text-[8px]">{isEnglish ? 'Transport' : 'Transport'}</p>
              <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full w-[72%] rounded-full bg-[#0b7655]" />
              </div>
            </div>
            <div>
              <p className="mb-1 text-[7px] font-medium text-slate-500 sm:text-[8px]">{isEnglish ? 'Food' : 'Alimentation'}</p>
              <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full w-[54%] rounded-full bg-[#80b99a]" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-auto rounded-xl bg-[#edf5ef] px-2 py-1.5">
          <p className="text-[8px] font-semibold leading-[1.35] text-[#315f49] sm:text-[9px]">
            {isEnglish ? 'Clear advice, at your own pace.' : 'Un conseil clair, à ton rythme.'}
          </p>
        </div>

        <div className="mt-2 flex items-center justify-between rounded-full border border-slate-200 bg-white py-1.5 pl-2.5 pr-1.5">
          <span className="truncate text-[7px] text-slate-400 sm:text-[8px]">{isEnglish ? 'Ask your question…' : 'Pose ta question…'}</span>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0b5c46] text-[10px] font-bold text-white">↑</span>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingIllustration({ index = 0, content }) {
  if (index === 1) {
    return (
      <div className="absolute inset-0 h-full w-full overflow-hidden bg-[#0b1d15]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_48%,rgba(54,143,94,.25),transparent_47%),linear-gradient(90deg,#0b1d15_0%,#10291e_48%,#0b1d15_100%)]" />
        <OnboardingCopy
          content={content}
          className="absolute left-[5.5%] top-1/2 z-10 w-[42%] max-w-[430px] -translate-y-1/2"
        />
        <div className="absolute bottom-[13%] right-[5%] top-[15%] w-[48%] max-w-[440px]">
          <AIVisual />
        </div>
      </div>
    );
  }

  const visual = VISUALS[index];
  if (!visual) return null;

  return (
    <div className="absolute inset-0 h-full w-full overflow-hidden bg-[#0a4a2b]">
      <img
        src={visual.src}
        alt={visual.alt}
        className="absolute inset-0 h-full w-full object-cover"
        loading={index === 0 ? 'eager' : 'lazy'}
        decoding="async"
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(5,24,16,.9)_0%,rgba(5,24,16,.76)_40%,rgba(5,24,16,.28)_70%,rgba(5,24,16,0)_100%),linear-gradient(0deg,rgba(5,24,16,.16)_0%,rgba(5,24,16,0)_34%)]" />
      <div className="absolute left-3 top-3 z-10"><Brand /></div>
      <OnboardingCopy
        content={content}
        className="pointer-events-none absolute left-[6%] top-1/2 z-10 w-[60%] max-w-[560px] -translate-y-1/2"
      />
    </div>
  );
}
