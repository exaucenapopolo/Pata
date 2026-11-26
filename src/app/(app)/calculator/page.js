'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calculator, Copy, RotateCcw } from 'lucide-react';
import { applyMoneyKey, evaluateMoneyExpression } from '@/lib/finance/decimalExpression.mjs';

const KEYS = [
  { label: 'C', action: 'clear', tone: 'utility' },
  { label: '(', tone: 'utility' },
  { label: ')', tone: 'utility' },
  { label: '⌫', action: 'delete', tone: 'utility' },
  { label: '7' }, { label: '8' }, { label: '9' }, { label: '÷', tone: 'operator' },
  { label: '4' }, { label: '5' }, { label: '6' }, { label: '×', tone: 'operator' },
  { label: '1' }, { label: '2' }, { label: '3' }, { label: '−', tone: 'operator' },
  { label: '00' }, { label: '0' }, { label: ',' }, { label: '+', tone: 'operator' },
];

function formatAmount(value) {
  if (value === '' || value == null) return '—';
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(number)
    : '—';
}

export default function CalculatorPage() {
  const [expression, setExpression] = useState('');
  const [copyFeedback, setCopyFeedback] = useState('');
  const result = useMemo(() => {
    if (!expression.trim()) return null;
    try { return evaluateMoneyExpression(expression); } catch { return null; }
  }, [expression]);

  const copyResult = async () => {
    if (!result?.roundedValue) return;
    const value = String(result.roundedValue);
    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback('Résultat copié.');
    } catch {
      setCopyFeedback('Copie indisponible sur cet appareil.');
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 pb-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" aria-label="Retour au tableau de bord" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"><ArrowLeft size={19}/></Link>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">Outil indépendant</p>
          <h1 className="text-xl font-extrabold text-slate-900">Calculatrice</h1>
        </div>
      </div>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="rounded-2xl bg-slate-50 px-4 py-5 text-right">
          <p className="min-h-6 break-all text-sm font-medium text-slate-500">{expression || 'Saisis ton calcul'}</p>
          <p aria-live="polite" className="mt-2 min-h-10 break-all text-3xl font-extrabold tracking-tight text-slate-900 tabular-nums">{result ? formatAmount(result.roundedValue) : '—'}</p>
          <p className="mt-1 text-xs font-semibold text-slate-400">FCFA</p>
        </div>

        {result?.isRounded && <p className="mt-2 text-right text-[11px] text-slate-500">Valeur exacte : {result.exactValue}</p>}
        <div className="mt-4 grid grid-cols-4 gap-2">
          {KEYS.map((key, index) => (
            <button key={index} type="button" onClick={() => { setExpression((current) => applyMoneyKey(current, key.action || key.label)); setCopyFeedback(''); }}
              className={'min-h-[62px] rounded-2xl text-xl font-bold transition active:scale-95 ' + (key.tone === 'operator' ? 'bg-emerald-50 text-emerald-800' : key.tone === 'utility' ? 'bg-slate-100 text-slate-700' : 'border border-slate-100 bg-white text-slate-900 shadow-sm')}>
              {key.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setExpression(''); setCopyFeedback(''); }} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600"><RotateCcw size={16}/> Réinitialiser</button>
          <button type="button" disabled={!result} onClick={copyResult} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#075b43] text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"><Copy size={16}/> Copier le résultat</button>
        </div>
        {copyFeedback && <p role="status" className="mt-3 text-center text-xs font-medium text-emerald-700">{copyFeedback}</p>}
      </section>
      <p className="px-1 text-center text-xs leading-5 text-slate-500">Cette calculatrice est indépendante : elle ne crée, ne modifie et ne supprime aucune dépense ni aucun revenu. Copie le résultat puis utilise-le où tu le souhaites.</p>
    </div>
  );
}
