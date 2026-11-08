'use client';

import { useEffect, useState } from 'react';
import { BrainCircuit } from 'lucide-react';
import { AssistantChat } from './AssistantChat';

export function AssistantButton({ showLauncher = true }) {
  const [open, setOpen] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState('');

  useEffect(() => {
    const handleOpen = (event) => {
      setInitialPrompt(String(event.detail?.prompt || ''));
      setOpen(true);
    };
    window.addEventListener('pata:assistant-open', handleOpen);
    return () => window.removeEventListener('pata:assistant-open', handleOpen);
  }, []);

  return (
    <>
      {showLauncher && (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-800/10 bg-[#075b43] text-white shadow-lg shadow-emerald-950/20 transition hover:bg-[#064b38] active:scale-95 sm:h-14 sm:w-14 lg:bottom-8 md:right-8"
        aria-label="Ouvrir l'assistante Mč"
      >
        <BrainCircuit size={26} />
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-500"></span>
        </span>
      </button>
      )}
      <AssistantChat open={open} initialPrompt={initialPrompt} onClose={() => { setOpen(false); setInitialPrompt(''); }} />
    </>
  );
}
