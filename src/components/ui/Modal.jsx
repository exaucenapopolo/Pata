'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { bodyScrollLockManager } from '@/lib/ui/bodyScrollLock.mjs';

export function Modal({ open, onClose, title, children, className }) {
  const [mounted, setMounted] = useState(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => setMounted(true), []);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => {
      if (event.key === 'Escape') onCloseRef.current?.();
    };
    const releaseScrollLock = bodyScrollLockManager.acquire(document.body);
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      releaseScrollLock();
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 px-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCloseRef.current?.(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'pata-dialog-title' : undefined}
        aria-label={title || 'Fenêtre de dialogue'}
        className={cn(
          'flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-full max-w-md flex-col overflow-hidden rounded-t-[24px] border border-slate-200/90 bg-white shadow-[0_20px_60px_rgba(8,39,70,0.18)] sm:max-h-[90dvh] sm:rounded-3xl',
          className
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2 id="pata-dialog-title" className="min-w-0 text-sm font-bold tracking-tight text-slate-900 sm:text-base">{title}</h2>
          <button onClick={() => onCloseRef.current?.()} type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800" aria-label="Fermer">
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">{children}</div>
      </section>
    </div>,
    document.body
  );
}
