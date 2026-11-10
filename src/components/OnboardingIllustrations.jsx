'use client';

const VISUALS = {
  0: {
    src: '/onboarding/budget.jpg',
    title: 'Un budget clair',
    subtitle: 'Revenus, dépenses — tout au même endroit',
    alt: 'Visuel Pata consacré au suivi du budget',
  },
  2: {
    src: '/onboarding/import-sms.jpg',
    title: 'Import SMS automatique',
    subtitle: 'MTN MoMo & Orange Money, sans effort',
    alt: 'Visuel Pata consacré à l’import automatique des SMS Mobile Money',
  },
  3: {
    src: '/onboarding/epargne.jpg',
    title: 'Épargne sans effort',
    subtitle: 'Coffres & objectifs, dépôt par Mobile Money',
    alt: 'Visuel Pata consacré aux objectifs d’épargne',
  },
  4: {
    src: '/onboarding/cotisations.jpg',
    title: 'Tontines & cotisations',
    subtitle: 'Suivi de groupe et rappels automatiques',
    alt: 'Visuel Pata consacré aux tontines et cotisations',
  },
  5: {
    src: '/onboarding/analyse.jpg',
    title: 'Pata Premium',
    subtitle: '2500 FCFA / mois — tout est débloqué',
    alt: 'Visuel Pata consacré à l’analyse et à Premium',
  },
};

function Brand({ dark = false }) {
  return (
    <span className={'text-[15px] font-extrabold tracking-tight ' + (dark ? 'text-[#075b43]' : 'text-white')}>
      Pata<span className="text-[#7fe0a8]">.</span>
    </span>
  );
}

function AIVisual() {
  return (
    <div
      role="img"
      aria-label="Aperçu de l’assistant financier Pata"
      className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-[#e8f2eb] p-2 shadow-[0_16px_36px_-18px_rgba(7,65,43,.45)]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,107,63,.18),transparent_48%),linear-gradient(145deg,#f8fbf8,#e4efe7)]" />
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[15px] border border-white/90 bg-[#fbfdfb] p-2.5 text-left shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[#0b5c46] text-[11px] font-extrabold tracking-tight text-white">
            P<span className="text-[#91dfb1]">.</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[9px] font-bold text-slate-900">Assistant Pata</p>
            <p className="mt-0.5 text-[7px] font-medium text-[#0b7655]">À partir de ton suivi</p>
          </div>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
        </div>

        <div className="mt-2 rounded-xl rounded-tr-sm bg-[#edf5ef] px-2 py-2">
          <p className="text-[7px] font-bold uppercase tracking-[.1em] text-[#4b7660]">Ta question</p>
          <p className="mt-1 text-[8px] font-semibold leading-[1.3] text-slate-800">
            Comment mieux organiser mon budget ?
          </p>
        </div>

        <div className="mt-2 rounded-xl border border-[#e2ece5] bg-white p-2">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#0b7655]" />
            <p className="text-[8px] font-bold text-[#0b5c46]">Une première piste</p>
          </div>
          <p className="mt-1.5 text-[7px] leading-[1.4] text-slate-600">
            Compare tes dépenses aux montants prévus. Tu verras plus facilement où ajuster.
          </p>
          <div className="mt-2 space-y-2">
            <div>
              <p className="mb-1 text-[7px] font-medium text-slate-500">Transport</p>
              <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full w-[72%] rounded-full bg-[#0b7655]" />
              </div>
            </div>
            <div>
              <p className="mb-1 text-[7px] font-medium text-slate-500">Alimentation</p>
              <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full w-[54%] rounded-full bg-[#80b99a]" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-auto rounded-xl bg-[#edf5ef] px-2 py-1.5">
          <p className="text-[7px] font-semibold leading-[1.35] text-[#315f49]">
            Un conseil clair pour avancer, à ton rythme.
          </p>
        </div>

        <div className="mt-2 flex items-center justify-between rounded-full border border-slate-200 bg-white py-1.5 pl-2.5 pr-1.5">
          <span className="text-[7px] text-slate-400">Pose ta question…</span>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0b5c46] text-[10px] font-bold text-white">↑</span>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingIllustration({ index = 0 }) {
  if (index === 1) {
    return <div className="h-full aspect-[9/16] max-h-full max-w-full"><AIVisual /></div>;
  }

  const visual = VISUALS[index];
  if (!visual) return null;

  return (
    <div className="relative h-full aspect-[9/16] max-h-full max-w-full overflow-hidden rounded-2xl bg-[#0a4a2b] shadow-[0_20px_50px_-18px_rgba(10,40,25,.35)]">
      <img
        src={visual.src}
        alt={visual.alt}
        className="absolute inset-0 h-full w-full object-cover"
        loading={index === 0 ? 'eager' : 'lazy'}
        decoding="async"
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(8,28,18,.62)_0%,rgba(8,28,18,.35)_38%,rgba(8,28,18,0)_62%),linear-gradient(to_top,rgba(8,28,18,.55)_0%,rgba(8,28,18,0)_30%)]" />
      <div className="absolute left-3 top-3"><Brand /></div>
      <div className="pointer-events-none absolute bottom-8 left-3 right-3 text-white">
        <p className="text-[11px] font-extrabold leading-[1.12] tracking-tight">{visual.title}</p>
        <p className="mt-1.5 max-w-[95%] text-[7px] font-medium leading-3 text-white/90">{visual.subtitle}</p>
      </div>
      <div className="absolute bottom-2 left-3 text-[6px] font-semibold tracking-wide text-white/75">www.pata-yam.site</div>
    </div>
  );
}
