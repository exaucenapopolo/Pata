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
      aria-label="Aperçu de l'assistant financier intelligent de Pata"
      className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-[#eaf3ed] p-2.5 shadow-[0_14px_36px_-18px_rgba(10,50,35,.45)]"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[#f7fbf8] via-[#e8f3ec] to-[#d8e9df]" />
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/80 bg-white/95 p-2.5 text-left shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#075b43] text-[9px] font-extrabold text-white">IA</span>
            <div className="min-w-0">
              <p className="truncate text-[9px] font-bold text-slate-900">Assistant Pata</p>
              <p className="text-[7px] font-medium text-emerald-700">Comprendre. Prévoir. Agir.</p>
            </div>
          </div>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </div>
        <div className="flex-1 space-y-2 py-2">
          <div className="ml-auto max-w-[92%] rounded-xl rounded-br-sm bg-[#edf5f0] px-2 py-1.5">
            <p className="text-[7px] leading-3 text-slate-700">Comment mieux maîtriser mes dépenses ?</p>
          </div>
          <div className="max-w-[96%] rounded-xl rounded-bl-sm bg-slate-50 px-2 py-1.5">
            <p className="text-[7px] font-bold text-[#075b43]">Voici ce que montre ton suivi</p>
            <p className="mt-1 text-[7px] leading-3 text-slate-600">Le transport et l’alimentation occupent une grande part de tes dépenses.</p>
            <div className="mt-1.5 space-y-1">
              <div className="h-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-[78%] rounded-full bg-[#0b7655]" /></div>
              <div className="h-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-[54%] rounded-full bg-[#70b996]" /></div>
              <div className="h-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-[28%] rounded-full bg-[#bbd9c8]" /></div>
            </div>
          </div>
          <div className="rounded-lg border border-[#dcece2] bg-[#f7fbf8] px-2 py-1.5">
            <p className="text-[7px] font-bold uppercase tracking-[.1em] text-[#075b43]">Piste à explorer</p>
            <p className="mt-0.5 text-[7px] leading-3 text-slate-600">Compare tes dépenses à ton budget et ajuste progressivement.</p>
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-1.5 text-[7px] text-slate-400">Écris ta question…</div>
      </div>
      <div className="absolute left-3 top-3"><Brand dark /></div>
      <div className="pointer-events-none absolute bottom-3 left-3 right-3">
        <p className="text-[10px] font-extrabold leading-tight tracking-tight text-[#075b43]">Ton assistant financier</p>
        <p className="mt-0.5 text-[7px] leading-3 text-slate-600">Des réponses simples, fondées sur ton suivi.</p>
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
