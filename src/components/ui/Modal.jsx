'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Modal({ open, onClose, title, children, className }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 px-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Fenêtre de dialogue'}
        className={cn(
          'flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-t-[28px] border border-slate-200/80 bg-white shadow-2xl sm:max-h-[90dvh] sm:rounded-3xl',
          className
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2 className="min-w-0 text-base font-bold tracking-tight text-slate-900 sm:text-lg">{title}</h2>
          <button
            onClick={onClose}
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">
          {children}
        </div>
      </section>
    </div>,
    document.body
  );
}
