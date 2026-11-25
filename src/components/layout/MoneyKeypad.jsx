'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { ClipboardPaste, Delete, X } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { applyMoneyKey, evaluateMoneyExpression } from '@/lib/finance/decimalExpression.mjs';
import { normalizeClipboardAmount } from '@/lib/finance/clipboardAmount.mjs';
import { hideNativeMoneyKeyboard, restoreNativeMoneyKeyboard } from '@/lib/finance/moneyInputKeyboard.mjs';

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
  const [pasteMenuOpen, setPasteMenuOpen] = useState(false);
  const [pasteFeedback, setPasteFeedback] = useState('');
  const activeInputRef = useRef(null);
  const activeInputOriginalInputModeRef = useRef(null);
  const syncingCalculatorValueRef = useRef(false);
  const allowNativeContextMenuRef = useRef(false);

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
    if (input) {
      input.blur();
      restoreNativeMoneyKeyboard(input, activeInputOriginalInputModeRef.current);
    }
    activeInputOriginalInputModeRef.current = null;
    activeInputRef.current = null;
  }, []);

  const close = useCallback(() => {
    allowNativeContextMenuRef.current = false;
    restoreActiveInput();
    setActiveField(null);
    setExpression('');
    setPasteMenuOpen(false);
    setPasteFeedback('');
  }, [restoreActiveInput]);

  const activate = useCallback((input) => {
    if (!input || activeInputRef.current === input) return;
    allowNativeContextMenuRef.current = false;
    if (activeInputRef.current) restoreActiveInput();
    // Keep the field focusable but temporarily read-only so Android does not open Gboard.
    // The custom keypad writes the calculated value programmatically.
    activeInputOriginalInputModeRef.current = hideNativeMoneyKeyboard(input);
    activeInputRef.current = input;
    const label = getInputLabel(input).trim() || (language === 'en' ? 'Amount' : 'Montant');
    setActiveField({ label });
    setExpression(String(input.value || '').replace(/\s/g, ''));
    setPasteMenuOpen(false);
    setPasteFeedback('');
  }, [language, restoreActiveInput]);

  const pasteClipboardAmount = useCallback(async () => {
    const input = activeInputRef.current;
    if (!input) return;
    try {
      if (!navigator.clipboard?.readText) throw new Error('Clipboard API indisponible');
      const copiedText = await navigator.clipboard.readText();
      const amount = normalizeClipboardAmount(copiedText);
      if (amount == null) {
        setPasteFeedback(language === 'en'
          ? 'The clipboard does not contain a valid amount.'
          : 'Le presse-papiers ne contient pas de montant valide.');
        setPasteMenuOpen(true);
        return;
      }
      setExpression(amount);
      setPasteMenuOpen(false);
      setPasteFeedback('');
    } catch {
      // Certains WebViews refusent l'accès direct au presse-papiers.
      // On garde le vrai champ de montant actif et on laisse Android proposer
      // son menu système Coller au prochain appui long.
      allowNativeContextMenuRef.current = true;
      restoreNativeMoneyKeyboard(input, activeInputOriginalInputModeRef.current);
      setPasteFeedback(language === 'en'
        ? 'Clipboard access is blocked here. Long-press the amount field to use Android Paste.'
        : 'Le collage direct est bloqué. Fais un appui long sur le champ de montant pour utiliser le menu Coller d’Android.');
      setPasteMenuOpen(true);
      input.focus({ preventScroll: true });
    }
  }, [language]);

  useEffect(() => {
    const input = activeInputRef.current;
    if (!activeField || !input) return undefined;
    let longPressTimer = null;
    const clearLongPress = () => {
      if (longPressTimer) window.clearTimeout(longPressTimer);
      longPressTimer = null;
    };
    const openPasteMenu = () => {
      setPasteFeedback('');
      setPasteMenuOpen(true);
    };
    const onContextMenu = (event) => {
      if (allowNativeContextMenuRef.current) {
        return; // Laisse Android afficher son menu système Coller jusqu'à la réception de l'événement input.
      }
      event.preventDefault();
      openPasteMenu();
    };
    const handleNativeInput = () => {
      if (syncingCalculatorValueRef.current || activeInputRef.current !== input) return;
      setExpression(String(input.value || '').replace(/\s/g, ''));
      // After Android's native Paste action, hide Gboard again without losing the pasted value.
      if (allowNativeContextMenuRef.current) {
        allowNativeContextMenuRef.current = false;
        hideNativeMoneyKeyboard(input);
        input.blur();
      }
    };
    input.addEventListener('input', handleNativeInput);
    input.addEventListener('change', handleNativeInput);
    const onPointerDown = (event) => {
      if (event.pointerType && event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      clearLongPress();
      longPressTimer = window.setTimeout(openPasteMenu, 550);
    };
    const onTouchStart = () => {
      clearLongPress();
      longPressTimer = window.setTimeout(openPasteMenu, 550);
    };
    input.addEventListener('contextmenu', onContextMenu);
    if ('PointerEvent' in window) {
      input.addEventListener('pointerdown', onPointerDown);
      input.addEventListener('pointerup', clearLongPress);
      input.addEventListener('pointercancel', clearLongPress);
      input.addEventListener('pointerleave', clearLongPress);
    } else {
      input.addEventListener('touchstart', onTouchStart, { passive: true });
      input.addEventListener('touchend', clearLongPress);
      input.addEventListener('touchcancel', clearLongPress);
    }
    return () => {
      clearLongPress();
      input.removeEventListener('input', handleNativeInput);
      input.removeEventListener('change', handleNativeInput);
      input.removeEventListener('contextmenu', onContextMenu);
      input.removeEventListener('pointerdown', onPointerDown);
      input.removeEventListener('pointerup', clearLongPress);
      input.removeEventListener('pointercancel', clearLongPress);
      input.removeEventListener('pointerleave', clearLongPress);
      input.removeEventListener('touchstart', onTouchStart);
      input.removeEventListener('touchend', clearLongPress);
      input.removeEventListener('touchcancel', clearLongPress);
    };
  }, [activeField]);

  useEffect(() => {
    let androidNative = false;
    try {
      androidNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    } catch {
      androidNative = false;
    }
    if (!androidNative) return undefined;

    const handleFocusIn = (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!target || target.closest('[data-pata-money-keypad]')) return;
      const input = target.closest('input');
      if (input && input === activeInputRef.current) return;
      if (input && isMoneyInput(input)) {
        activate(input);
        return;
      }
      if (activeInputRef.current) close();
    };

    const handlePointerDown = (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!target) return;
      // Never cancel pointerdown on the keypad: Android/WebView may then suppress the
      // subsequent click, making every number, clear and delete button appear dead.
      if (target.closest('[data-pata-money-keypad]')) {
        if (allowNativeContextMenuRef.current && activeInputRef.current) {
          allowNativeContextMenuRef.current = false;
          hideNativeMoneyKeyboard(activeInputRef.current);
          activeInputRef.current.blur();
        }
        return;
      }
      const input = target.closest('input');
      if (input && input === activeInputRef.current) return;
      if (input && isMoneyInput(input)) {
        // Lock the native keyboard before the browser focuses the amount field.
        activate(input);
        return;
      }
      if (activeInputRef.current) close();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && activeInputRef.current) close();
      // Ne bloque pas Ctrl/Cmd+V : le collage natif reste géré par le navigateur.
    };

    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [activate, close]);

  // Keep the real form field synchronized while the user types the calculation.
  // Incomplete expressions (for example "500 +") leave the last valid amount intact.
  useEffect(() => {
    const input = activeInputRef.current;
    if (!input || !input.isConnected) return;
    const writeCalculatorValue = (value) => {
      syncingCalculatorValueRef.current = true;
      try {
        setInputValue(input, value);
      } finally {
        syncingCalculatorValueRef.current = false;
      }
    };
    if (!expression.trim()) {
      writeCalculatorValue('');
      return;
    }
    try {
      const evaluated = evaluateMoneyExpression(expression);
      const amount = Number(evaluated.roundedValue);
      if (Number.isFinite(amount) && amount >= 0) {
        writeCalculatorValue(evaluated.roundedValue);
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
        <div className="mb-3 flex min-w-0 items-start justify-between gap-3 px-1">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-500">{activeField.label}</p>
            <p className="mt-0.5 min-h-4 truncate text-sm font-semibold text-slate-700">{expression || ' '}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <p className="text-right text-[22px] font-extrabold tracking-tight text-emerald-900 tabular-nums">
              {result ? formatAmount(result.roundedValue, language) : '—'}
              <span className="ml-1 text-[10px] font-bold">FCFA</span>
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => { setPasteFeedback(''); setPasteMenuOpen((current) => !current); }}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 text-[11px] font-semibold text-emerald-800 shadow-sm"
                aria-expanded={pasteMenuOpen}
                aria-label={language === 'en' ? 'Show paste options' : 'Afficher les options de collage'}
              >
                <ClipboardPaste size={14}/>{language === 'en' ? 'Paste' : 'Coller'}
              </button>
              <button type="button" onClick={close} className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 shadow-sm" aria-label={language === 'en' ? 'Close calculator' : 'Fermer la calculatrice'}><X size={14}/>{language === 'en' ? 'Close' : 'Fermer'}</button>
            </div>
          </div>
        </div>
        {pasteMenuOpen && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-white px-3 py-2 shadow-sm">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-800">{language === 'en' ? 'Paste an amount' : 'Coller un montant'}</p>
              <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
                {pasteFeedback || (language === 'en' ? 'Long-press or right-click the amount field to show this option.' : 'Fais un appui long ou un clic droit sur le champ de montant pour afficher cette option.')}
              </p>
            </div>
            <button type="button" onClick={pasteClipboardAmount} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1 rounded-lg bg-[#075b43] px-3 text-xs font-semibold text-white" data-pata-no-haptic="true">
              <ClipboardPaste size={14}/>{language === 'en' ? 'Paste' : 'Coller'}
            </button>
            <button type="button" onClick={() => setPasteMenuOpen(false)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500" aria-label={language === 'en' ? 'Cancel paste' : 'Annuler le collage'}><X size={14}/></button>
          </div>
        )}

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
