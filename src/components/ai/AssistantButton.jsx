'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { AssistantChat } from './AssistantChat';

export function AssistantButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg transition hover:scale-105 md:bottom-6"
        aria-label="Assistant Mč"
      >
        <Sparkles size={24} />
      </button>
      <AssistantChat open={open} onClose={() => setOpen(false)} />
    </>
  );
}
