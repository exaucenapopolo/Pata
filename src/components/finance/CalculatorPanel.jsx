'use client';

import { useMemo, useState } from 'react';
import { Calculator, Copy, Delete, RotateCcw, Check, X } from 'lucide-react';
import { applyMoneyKey, evaluateMoneyExpression } from '@/lib/finance/decimalExpression.mjs';

const KEYS = [
  { label: 'C', action: 'clear', tone: 'utility' }, { label: '(', tone: 'utility' }, { label: ')', tone: 'utility' }, { label: '⌫', action: 'delete', tone: 'utility' },
  { label: '√', action: 'sqrt', tone: 'utility' }, { label: 'x²', action: 'square', tone: 'utility' }, { label: '%', tone: 'utility' }, { label: '÷', tone: 'operator' },
  { label: '7' }, { label: '8' }, { label: '9' }, { label: '×', tone: 'operator' },
  { label: '4' }, { label: '5' }, { label: '6' }, { label: '−', tone: 'operator' },
  { label: '1' }, { label: '2' }, { label: '3' }, { label: '+', tone: 'operator' },
  { label: '00' }, { label: '0' }, { label: ',' }, { label: '^', tone: 'operator' },
];

function formatResult(value) {
  if (value === '' || value == null) return '—';
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 6 }).format(number)
    : '—';
}

export function CalculatorPanel({ onUse, onClose, standalone = false }) {
  const [expression, setExpression] = useState('');
  const [feedback, setFeedback] = useState('');
  const result = useMemo(() => {
    if (!expression.trim()) return null;
    try { return evaluateMoneyExpression(expression); } catch { return null; }
  }, [expression]);

  const updateExpression = (key) => {
    setExpression((current) => applyMoneyKey(current, key));
    setFeedback('');
  };

  const copyResult = async () => {
    if (!result?.roundedValue) return;
    try {
      await navigator.clipboard.writeText(String(result.roundedValue));
      setFeedback('Copié');
    } catch {
      setFeedback('Copie impossible');
    }
  };

  const useResult = () => {
    if (!result || !onUse) return;
    onUse(String(result.roundedValue));
  };

  return (
    <section className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="rounded-2xl bg-slate-950 px-4 py-4 text-right text-white">
        <p className="min-h-6 break-all text-sm text-slate-300">{expression || '0'}</p>
        <p aria-live="polite" className="mt-2 min-h-10 break-all text-3xl font-extrabold tracking-tight tabular-nums">{result ? formatResult(result.exactValue) : '0'}</p>
        {result?.isRounded && <p className="mt-1 text-[11px] text-slate-300">Valeur entière : {formatResult(result.roundedValue)}</p>}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {KEYS.map((key, index) => (
          <button key={index} type="button" onClick={() => updateExpression(key.action || key.label)}
            className={'min-h-[54px] rounded-xl text-lg font-bold transition active:scale-95 sm:min-h-[60px] ' + (key.tone === 'operator' ? 'bg-emerald-100 text-emerald-900' : key.tone === 'utility' ? 'bg-slate-100 text-slate-700' : 'border border-slate-100 bg-white text-slate-900 shadow-sm')}>
            {key.label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => { setExpression(''); setFeedback(''); }} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700"><RotateCcw size={16}/> Effacer</button>
        {onUse ? (
          <button type="button" disabled={!result} onClick={useResult} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-800 text-sm font-bold text-white disabled:opacity-40"><Check size={16}/> Utiliser le résultat</button>
        ) : (
          <button type="button" disabled={!result} onClick={copyResult} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-800 text-sm font-bold text-white disabled:opacity-40"><Copy size={16}/> Copier</button>
        )}
      </div>
      {feedback && <p role="status" className="mt-2 text-center text-xs font-medium text-emerald-700">{feedback}</p>}
    </section>
  );
}

export function CalculatorLauncher({ value, onApply, disabled = false, className = '' }) {
  const [open, setOpen] = useState(false);

  const apply = (result) => {
    onApply?.(result);
    setOpen(false);
  };

  return (
    <>
      <button type="button" disabled={disabled} onClick={() => setOpen(true)}
        className={'mt-1.5 inline-flex min-h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40 ' + className}>
        <Calculator size={15}/> Calculatrice
      </button>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Calculatrice">
          <div className="max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-3 shadow-2xl sm:p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Calculatrice</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer la calculatrice" className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600"><X size={18}/></button>
            </div>
            <CalculatorPanel onUse={apply}/>
          </div>
        </div>
      )}
    </>
  );
}
