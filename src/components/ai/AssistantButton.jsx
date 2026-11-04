'use client';

import { useEffect, useState } from 'react';
import { BrainCircuit } from 'lucide-react';
import { AssistantChat } from './AssistantChat';

export function AssistantButton() {
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
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-slate-800 to-slate-900 text-brand-400 shadow-xl transition-all hover:scale-105 hover:shadow-brand-500/20 md:bottom-8 md:right-8 border border-slate-700/50"
        aria-label="Ouvrir l'assistante Mč"
      >
        <BrainCircuit size={26} />
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-500"></span>
        </span>
      </button>
      <AssistantChat open={open} initialPrompt={initialPrompt} onClose={() => { setOpen(false); setInitialPrompt(''); }} />
    </>
  );
}
