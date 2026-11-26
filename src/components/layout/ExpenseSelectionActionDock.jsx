'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Link2, MoreVertical, Pencil, Trash2 } from 'lucide-react';

export function ExpenseSelectionActionDock({ selectedCount, totalLabel, visible = true, busy = false, sourceDisabled = false, onEdit, onDate, onSource, onDelete }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      document.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [open]);

  useEffect(() => {
    if (!visible || selectedCount < 1) setOpen(false);
  }, [visible, selectedCount]);

  if (!visible || selectedCount < 1 || typeof document === 'undefined') return null;
  const invoke = (handler) => { setOpen(false); handler?.(); };

  return createPortal(
    <div ref={rootRef} className="fixed left-4 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[85] lg:bottom-6 lg:left-6">
      {open && (
        <div role="menu" aria-label="Actions des dépenses sélectionnées"
          className="absolute bottom-full left-0 mb-2 w-[min(19rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-[0_16px_46px_rgba(15,23,42,.22)]">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">{selectedCount} dépense{selectedCount > 1 ? 's' : ''} sélectionnée{selectedCount > 1 ? 's' : ''}</p>
            <p className="mt-0.5 text-xs font-semibold tabular-nums text-slate-500">{totalLabel}</p>
          </div>
          <button type="button" role="menuitem" disabled={busy} onClick={() => invoke(onEdit)} className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"><Pencil size={17} className="text-slate-500"/> Modifier ensemble</button>
          <button type="button" role="menuitem" disabled={busy} onClick={() => invoke(onDate)} className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"><Calendar size={17} className="text-slate-500"/> Changer la date</button>
          <button type="button" role="menuitem" disabled={busy || sourceDisabled} onClick={() => invoke(onSource)} className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"><Link2 size={17} className="text-slate-500"/> Regrouper les revenus</button>
          <div className="my-1 border-t border-slate-100"/>
          <button type="button" role="menuitem" disabled={busy} onClick={() => invoke(onDelete)} className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-40"><Trash2 size={17}/> Supprimer</button>
        </div>
      )}
      <button type="button" disabled={busy} onClick={() => setOpen((current) => !current)}
        aria-label="Afficher les actions des dépenses sélectionnées" aria-haspopup="menu" aria-expanded={open}
        className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/20 bg-[#075b43] px-4 text-sm font-bold text-white shadow-lg shadow-emerald-950/20 transition hover:bg-[#064b38] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50">
        <MoreVertical size={19}/><span>Options</span>
        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-white/15 px-1 text-xs tabular-nums">{selectedCount}</span>
      </button>
    </div>,
    document.body
  );
}
