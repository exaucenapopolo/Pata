'use client';

import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
};

/**
 * Pata's own confirmation and message dialog. It replaces browser-native
 * alert/confirm popups with a consistent, accessible application surface.
 */
export function AppDialog({
  open,
  title,
  message,
  kind = 'info',
  confirmLabel = 'Compris',
  cancelLabel = 'Annuler',
  onConfirm,
  onClose,
  busy = false,
  showCancel = true,
  prompt = false,
  promptValue = '',
  onPromptChange,
  promptPlaceholder = '',
  promptMultiline = false,
}) {
  const Icon = ICONS[kind] || Info;
  const iconClass = kind === 'danger' ? 'bg-rose-50 text-rose-700'
    : kind === 'warning' ? 'bg-amber-50 text-amber-700'
      : kind === 'success' ? 'bg-emerald-50 text-emerald-700'
        : 'bg-slate-100 text-slate-700';
  const buttonClass = kind === 'danger' ? 'bg-rose-700 hover:bg-rose-800' : '';

  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-md">
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <span className={'grid h-10 w-10 shrink-0 place-items-center rounded-2xl ' + iconClass}>
            <Icon size={19}/>
          </span>
          <p className="min-w-0 flex-1 whitespace-pre-line pt-1 text-sm leading-6 text-slate-700">{message}</p>
        </div>
        {prompt && (
          <div>
            {promptMultiline ? (
              <textarea
                autoFocus
                value={promptValue}
                onChange={(event) => onPromptChange?.(event.target.value)}
                placeholder={promptPlaceholder}
                rows={4}
                maxLength={2000}
                className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 text-slate-800 outline-none transition focus:border-[#0b5c46] focus:ring-2 focus:ring-[#0b5c46]/10"
              />
            ) : (
              <input
                autoFocus
                value={promptValue}
                onChange={(event) => onPromptChange?.(event.target.value)}
                placeholder={promptPlaceholder}
                maxLength={500}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-[#0b5c46] focus:ring-2 focus:ring-[#0b5c46]/10"
              />
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          {showCancel && <Button type="button" variant="outline" onClick={onClose} disabled={busy}>{cancelLabel}</Button>}
          <Button type="button" onClick={onConfirm || onClose} disabled={busy} className={buttonClass}>
            {busy ? 'Traitement…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
