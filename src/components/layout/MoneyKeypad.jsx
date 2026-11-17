'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { Delete } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { applyMoneyKey, evaluateMoneyExpression } from '@/lib/finance/decimalExpression.mjs';

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
  if (input.type !== 'number' && !['numeric', 'decimal'].includes(input.inputMode)) return false;
  const hint = [input.name, input.id, input.placeholder, input.getAttribute('aria-label'), getInputLabel(input)].filter(Boolean).join(' ');
  if (NON_MONEY_HINTS.test(hint) && !/montant|amount|fcfa|xaf|usd|eur|budget|capital|dépense|depense|revenu|income|versement|cotisation/i.test(hint)) return false;
  return MONEY_HINTS.test(hint);
}

function setInputValue(input, value) {
  if (!input || String(input.value) === String(value)) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
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
  const activeInputRef = useRef(null);
  const originalAttributesRef = useRef(null);

  const result = useMemo(() => {
    if (!expression.trim()) return null;
    try {
      return evaluateMoneyExpression(expression);
    } catch {
      return null;
    }
  }, [expression]);

  const restoreActiveInput = useCallback(() => {
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
  }, []);

  const close = useCallback(() => {
    restoreActiveInput();
    setActiveField(null);
    setExpression('');
  }, [restoreActiveInput]);

  const activate = useCallback((input) => {
    if (!input || activeInputRef.current === input) return;
    restoreActiveInput();
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
  }, [language, restoreActiveInput]);

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
      if (!target || target.closest('[data-pata-money-keypad]')) return;

      const input = target.closest('input');
      if (input && input === activeInputRef.current) return;

      if (input && isMoneyInput(input)) {
        event.preventDefault();
        event.stopPropagation();
        activate(input);
        return;
      }

      // Touching another field or control dismisses only the calculator.
      // The original form and the user's next interaction remain untouched.
      if (activeInputRef.current) close();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && activeInputRef.current) close();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [activate, close]);

  // Keep the real form field synchronized while the user types the calculation.
  // Incomplete expressions (for example "500 +") leave the last valid amount intact.
  useEffect(() => {
    const input = activeInputRef.current;
    if (!input) return;
    if (!expression.trim()) {
      setInputValue(input, '');
      return;
    }
    try {
      const evaluated = evaluateMoneyExpression(expression);
      const amount = Number(evaluated.roundedValue);
      if (Number.isFinite(amount) && amount >= 0) {
        setInputValue(input, evaluated.roundedValue);
      }
    } catch {
      // Keep the last valid amount while an expression is being completed.
    }
  }, [expression]);

  const appendKey = (key) => {
    setExpression((current) => applyMoneyKey(current, key));
  };

  if (!activeField || typeof document === 'undefined') return null;

  return createPortal(
    <div className="pata-money-keypad-layer pointer-events-none fixed inset-x-0 bottom-0 z-[2147483000] flex justify-center px-2 pb-[env(safe-area-inset-bottom)]">
      <section
        data-pata-money-keypad="true"
        role="group"
        aria-label={language === 'en' ? 'Amount calculator keypad' : 'Clavier de calcul du montant'}
        className="pata-money-keypad pointer-events-auto w-full max-w-md rounded-t-[24px] border border-white/80 bg-[#f7faf8] p-3 shadow-[0_-12px_44px_rgba(12,39,25,.22)]"
      >
        <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-slate-300" />
        <div className="mb-3 flex min-w-0 items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-500">{activeField.label}</p>
            <p className="mt-0.5 min-h-4 truncate text-sm font-semibold text-slate-700">{expression || ' '}</p>
          </div>
          <p className="shrink-0 text-right text-[22px] font-extrabold tracking-tight text-emerald-900 tabular-nums">
            {result ? formatAmount(result.roundedValue, language) : '—'}
            <span className="ml-1 text-[10px] font-bold">FCFA</span>
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {KEYS.map((key, index) => (
            <button
              key={index}
              type="button"
              onClick={() => appendKey(key.action || key.label)}
              aria-label={key.aria || key.label}
              data-pata-no-haptic="true"
              className={'pata-money-key h-[48px] rounded-xl text-lg font-bold transition active:scale-[.96] ' +
                (key.kind === 'operator'
                  ? 'bg-emerald-100 text-emerald-900'
                  : key.kind === 'utility'
                    ? 'bg-white text-slate-600 shadow-sm'
                    : 'bg-white text-slate-900 shadow-[0_2px_8px_rgba(20,55,35,.06)]')}
            >
              {key.label === '⌫' ? <Delete size={20} className="mx-auto" /> : key.label}
            </button>
          ))}
        </div>
      </section>
    </div>,
    document.body
  );
}
