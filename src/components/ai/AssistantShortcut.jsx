'use client';

import { Sparkles } from 'lucide-react';

export function AssistantShortcut({
  label = 'Demander à Mč',
  prompt,
  className = '',
}) {
  const openAssistant = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('pata:assistant-open', {
      detail: { prompt: String(prompt || 'Aide-moi à comprendre cette partie de Pata et à prendre une bonne décision.') },
    }));
  };

  return (
    <button
      type="button"
      onClick={openAssistant}
      className={'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 active:scale-[0.98] ' + className}
    >
      <Sparkles size={15} className="shrink-0 text-brand-700"/>
      <span>{label}</span>
    </button>
  );
}
