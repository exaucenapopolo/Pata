'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Delete, Equal, X } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { evaluateMoneyExpression } from '@/lib/finance/decimalExpression.mjs';

const MONEY_HINTS = /montant|amount|budget|capital|dépense|depense|revenu|income|expense|somme|versement|cotisation|facture|bill|loyer|épargne|epargne|solde|balance|recharge|payment|paiement|prêt|pret|loan|dette|debt|prix|price|tarif|frais|fcfa|xaf|usd|eur/i;
const NON_MONEY_HINTS = /pourcentage|percent|participants?|personnes?|jours?|days?|année|annee|years?|fréquence|frequence|frequency|quota|heures?|minutes?/i;

function getInputLabel(input) {
  const directLabel = input.closest('label');
  const siblingLabel = input.parentElement?.querySelector('label');
  return directLabel?.textContent || siblingLabel?.textContent
    || input.getAttribute('aria-label') || input.placeholder || input.name || input.id || '';
}

function isMoneyInput(input) {
  if (!input || input.disabled || input.readOnly) return false;
  if (input.dataset.pataMoney === 'false') return false;
  if (input.dataset.pataMoney === 'true') return true;
  if (!(input instanceof HTMLInputElement)) return false;
  if (!['number'].includes(input.type) && !['numeric', 'decimal'].includes(input.inputMode)) return false;
  const hint = [input.name, input.id, input.placeholder, input.getAttribute('aria-label'), getInputLabel(input)].filter(Boolean).join(' ');
  if (NON_MONEY_HINTS.test(hint) && !/montant|amount|fcfa|xaf|usd|eur|budget|capital|dépense|depense|revenu|income|versement|cotisation/i.test(hint)) return false;
  return MONEY_HINTS.test(hint);
}

function formatAmount(value, language) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat(language === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 0 }).format(amount);
}

const KEYS = [
  { label: 'C', kind: 'utility', action: 'clear', aria: 'Effacer le calcul' },
  { label: '(', kind: 'utility' },
  { label: ')', kind: 'utility' },
  { label: '⌫', kind: 'utility', action: 'delete', aria: 'Effacer le dernier caractère' },
  { label: '7' }, { label: '8' }, { label: '9' }, { label: '÷', kind: 'operator' },
  { label: '4' }, { label: '5' }, { label: '6' }, { label: '×', kind: 'operator' },
  { label: '1' }, { label: '2' }, { label: '3' }, { label: '−', kind: 'operator' },
  { label: '00' }, { label: '0' }, { label: ',' }, { label: '+', kind: 'operator' },
];

export function MoneyKeypad() {
  const { language } = useLanguage();
  const [activeField, setActiveField] = useState(null);
  const [expression, setExpression] = useState('');
  const [error, setError] = useState('');
  const activeInputRef = useRef(null);
  const originalAttributesRef = useRef(null);

  const result = useMemo(() => {
    if (!expression.trim()) return null;
    try {
      return { ...evaluateMoneyExpression(expression), error: '' };
    } catch (calculationError) {
      return { exactValue: '', roundedValue: '', isRounded: false, error: calculationError.message };
    }
  }, [expression]);

  const activate = useCallback((input) => {
    if (!input || activeInputRef.current === input) return;
    if (activeInputRef.current) return;
    activeInputRef.current = input;
    originalAttributesRef.current = {
      readOnly: input.readOnly,
      inputMode: input.getAttribute('inputmode'),
    };
    input.readOnly = true;
    input.setAttribute('inputmode', 'none');
    input.focus({ preventScroll: true });
    const label = getInputLabel(input).trim() || (language === 'en' ? 'Amount' : 'Montant');
    setActiveField({ label });
    setExpression(String(input.value || '').replace(/\s/g, ''));
    setError('');
  }, [language]);

  const close = useCallback(() => {
    const input = activeInputRef.current;
    const original = originalAttributesRef.current;
    if (input && original) {
      input.readOnly = original.readOnly;
      if (original.inputMode == null) input.removeAttribute('inputmode');
      else input.setAttribute('inputmode', original.inputMode);
      input.blur();
    }
    activeInputRef.current = null;
    originalAttributesRef.current = null;
    setActiveField(null);
    setError('');
  }, []);

  useEffect(() => {
    let androidNative = false;
    try {
      androidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    } catch {
      androidNative = false;
    }
    if (!androidNative) return undefined;

    const handlePointerDown = (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      const input = target?.closest?.('input');
      if (!input || !isMoneyInput(input)) return;
      event.preventDefault();
      event.stopPropagation();
      activate(input);
    };

    const handleFocus = (event) => {
      const input = event.target;
      if (!isMoneyInput(input)) return;
      activate(input);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('focusin', handleFocus, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('focusin', handleFocus, true);
    };
  }, [activate]);

  const appendKey = (key) => {
    setError('');
    setExpression((current) => {
      if (key === 'C') return '';
      if (key === '⌫') return current.slice(0, -1);
      return current + key;
    });
  };

  const calculate = () => {
    if (!expression.trim()) return;
    if (result?.error) {
      setError(result.error);
      return;
    }
    setError('');
  };

  const commit = () => {
    const input = activeInputRef.current;
    if (!input) return;
    if (expression.trim()) {
      let evaluated;
      try {
        evaluated = evaluateMoneyExpression(expression);
      } catch (calculationError) {
        setError(calculationError.message);
        return;
      }
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) nativeSetter.call(input, evaluated.roundedValue);
      else input.value = evaluated.roundedValue;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close();
  };

  const heading = language === 'en' ? 'Calculator' : 'Calculatrice';
  const done = language === 'en' ? 'Use this amount' : 'Utiliser ce montant';

  if (!activeField) return null;

  return (
    <div
      className="pata-money-keypad-backdrop fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-4"
      onPointerDown={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pata-money-keypad-title"
        className="pata-money-keypad w-full max-w-md rounded-t-[28px] border border-white/70 bg-[#f7faf8] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[28px]"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-700">PATA · FCFA</p>
            <h2 id="pata-money-keypad-title" className="mt-0.5 text-lg font-extrabold tracking-tight text-slate-900">{heading}</h2>
            <p className="max-w-[270px] truncate text-xs text-slate-500">{activeField.label}</p>
          </div>
          <button type="button" onClick={close} aria-label={language === 'en' ? 'Close calculator' : 'Fermer la calculatrice'} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm active:scale-95"><X size={19}/></button>
        </div>

        <div className="mb-3 rounded-2xl border border-emerald-100 bg-[#eaf3ed] px-4 py-3">
          <p className="min-h-6 break-all text-right text-sm font-semibold text-slate-600" aria-label={language === 'en' ? 'Calculation' : 'Calcul'}>{expression || '0'}</p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{language === 'en' ? 'Result' : 'Résultat'}</p>
            <p className="truncate text-right text-[25px] font-extrabold tracking-tight text-emerald-900 tabular-nums">
              {result && !result.error ? formatAmount(result.roundedValue, language) : '—'} <span className="text-xs font-bold">FCFA</span>
            </p>
          </div>
          {result?.isRounded && !result.error && <p className="mt-1 text-right text-[10px] text-slate-500">{language === 'en' ? 'Rounded to the nearest whole CFA franc.' : 'Arrondi au franc CFA le plus proche.'}</p>}
          {(error || result?.error) && <p role="alert" className="mt-2 text-right text-xs font-semibold text-red-600">{error || result.error}</p>}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {KEYS.map((key, index) => (
            <button
              key={index}
              type="button"
              onClick={() => appendKey(key.action || key.label)}
              aria-label={key.aria}
              data-pata-no-haptic="true"
              className={'pata-money-key h-[52px] rounded-2xl text-lg font-bold transition active:scale-[.96] ' +
                (key.kind === 'operator' ? 'bg-emerald-100 text-emerald-900' :
                  key.kind === 'utility' ? 'bg-white text-slate-600 shadow-sm' : 'bg-white text-slate-900 shadow-[0_2px_8px_rgba(20,55,35,.06)]')}
            >
              {key.label === '⌫' ? <Delete size={20} className="mx-auto"/> : key.label}
            </button>
          ))}
          <button type="button" onClick={calculate} className="col-span-4 flex h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-800 text-sm font-bold text-white shadow-sm active:scale-[.99]">
            <Equal size={17}/> {language === 'en' ? 'Calculate' : 'Calculer'}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <button type="button" onClick={commit} disabled={Boolean(result?.error)} className="h-12 rounded-2xl bg-[#075b43] px-4 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40 active:scale-[.99]">{done}</button>
          <button type="button" onClick={close} className="h-12 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 active:scale-[.99]">{language === 'en' ? 'Cancel' : 'Annuler'}</button>
        </div>
      </section>
    </div>
  );
}
