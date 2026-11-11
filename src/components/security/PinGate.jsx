'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LockKeyhole, ShieldCheck, Mail, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/context/LanguageContext';
import { PinPad } from '@/components/security/PinPad';

async function apiCall(user, path, body) {
  const token = await user.getIdToken();
  const response = await fetch('/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'Une erreur est survenue.');
  return data;
}

export function PinGate() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const [checking, setChecking] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const feedbackTimer = useRef(null);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [code, setCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [resetStep, setResetStep] = useState('new');

  const storageKey = user ? 'pata-pin-last-background:' + user.uid : '';

  useEffect(() => {
    let active = true;
    if (!user) {
      setEnabled(false); setLocked(false); setChecking(false);
      return undefined;
    }
    setChecking(true);
    apiCall(user, 'security/pin/status').then((data) => {
      if (!active) return;
      setEnabled(data.enabled === true);
      let lastBackgroundAt = 0;
      try {
        lastBackgroundAt = Number(localStorage.getItem(storageKey) || 0);
        localStorage.removeItem(storageKey);
      } catch { /* stockage local indisponible */ }
      setLocked(data.enabled === true && lastBackgroundAt > 0 && Date.now() - lastBackgroundAt >= 10 * 60 * 1000);
    }).catch((err) => {
      if (active) { setError(isEnglish ? 'Security check is unavailable.' : (err.message || 'Vérification de sécurité indisponible.')); setLocked(false); }
    }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [user, storageKey]);

  useEffect(() => {
    if (!user || !enabled) return undefined;
    const markBackground = () => {
      if (document.visibilityState === 'hidden') {
        try {
          if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, String(Date.now()));
        } catch { /* stockage local indisponible */ }
      }
    };
    const checkReturn = () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const lastBackgroundAt = Number(localStorage.getItem(storageKey) || 0);
        localStorage.removeItem(storageKey);
        if (lastBackgroundAt > 0 && Date.now() - lastBackgroundAt >= 10 * 60 * 1000) {
          setPin(''); setError(''); setLocked(true);
        }
      } catch { /* stockage local indisponible */ }
    };
    document.addEventListener('visibilitychange', markBackground);
    document.addEventListener('visibilitychange', checkReturn);
    const markPageExit = () => {
      try { localStorage.setItem(storageKey, String(Date.now())); } catch { /* stockage local indisponible */ }
    };
    window.addEventListener('pagehide', markPageExit);
    document.addEventListener('visibilitychange', markBackground);
    document.addEventListener('visibilitychange', checkReturn);
    return () => {
      document.removeEventListener('visibilitychange', markBackground);
      document.removeEventListener('visibilitychange', checkReturn);
      window.removeEventListener('pagehide', markPageExit);
    };
  }, [user, enabled, storageKey]);

  useEffect(() => {
    if (!user) return undefined;
    const refreshPinStatus = async () => {
      try {
        const data = await apiCall(user, 'security/pin/status');
        setEnabled(data.enabled === true);
      } catch (err) {
        setError(isEnglish ? 'Security check is unavailable.' : (err.message || 'Vérification de sécurité indisponible.'));
      }
    };
    window.addEventListener('pata:pin-updated', refreshPinStatus);
    return () => window.removeEventListener('pata:pin-updated', refreshPinStatus);
  }, [user]);

  useEffect(() => () => {
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
  }, []);

  const unlock = useCallback(async () => {
    if (!user || pin.length !== 4 || busy || feedback === 'success') return;
    setBusy(true); setError('');
    try {
      await apiCall(user, 'security/pin/verify', { pin });
      setEnabled(true);
      try { localStorage.removeItem(storageKey); } catch { /* stockage local indisponible */ }
      setPin('');
      setFeedback('success');
      if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
      feedbackTimer.current = window.setTimeout(() => {
        try { localStorage.removeItem(storageKey); } catch { /* stockage local indisponible */ }
        setLocked(false);
        setFeedback('');
      }, 560);
    } catch (err) {
      setError(isEnglish ? 'Incorrect passcode.' : (err.message || 'Code secret incorrect.'));
      setPin('');
      setFeedback('error');
      if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
      feedbackTimer.current = window.setTimeout(() => setFeedback(''), 650);
    } finally { setBusy(false); }
  }, [user, pin, busy, storageKey, feedback]);

  useEffect(() => {
    if (locked && enabled && pin.length === 4 && !busy) void unlock();
  }, [locked, enabled, pin, busy, unlock]);

  const requestReset = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await apiCall(user, 'security/pin/reset/request', {});
      setResetSent(true);
      setResetStep('new');
    } catch (err) { setError(err.message || 'Envoi du code impossible.'); }
    finally { setBusy(false); }
  };

  const confirmReset = async () => {
    if (code.length !== 6 || newPin.length !== 4 || newPin !== confirmPin) {
      setError(isEnglish ? 'Check the code you received and both entries of your new passcode.' : 'Vérifie le code reçu et les deux saisies du nouveau PIN.');
      return;
    }
    setBusy(true); setError('');
    try {
      await apiCall(user, 'security/pin/reset/confirm', { code, pin: newPin });
      try { localStorage.removeItem(storageKey); } catch { /* stockage local indisponible */ }
      setEnabled(true); setLocked(false); setResetMode(false); setResetSent(false);
      setCode(''); setNewPin(''); setConfirmPin(''); setPin('');
    } catch (err) { setError(isEnglish ? 'Could not reset the passcode.' : (err.message || 'Réinitialisation impossible.')); }
    finally { setBusy(false); }
  };

  if (checking && user) return <div className="fixed inset-0 z-[200] grid place-items-center bg-[#f5f8f6] dark:bg-[#101a16]"><span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-700 border-t-transparent"/></div>;
  if (!locked || !enabled) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center overflow-y-auto bg-[#f5f8f6] px-0 pt-8 dark:bg-[#101a16] sm:items-center sm:px-4 sm:py-6">
      <section className={'w-full max-w-[420px] rounded-t-[32px] border border-slate-200 bg-white px-5 pb-[calc(28px+env(safe-area-inset-bottom))] pt-7 shadow-[0_-16px_60px_rgba(15,23,42,0.12)] dark:border-slate-700 dark:bg-[#18251f] sm:rounded-[28px] sm:px-7 sm:py-7 ' + (feedback === 'error' ? 'animate-pata-pin-shake' : feedback === 'success' ? 'animate-pata-pin-success' : '')}>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
          {resetMode ? <ShieldCheck size={22}/> : <LockKeyhole size={22}/>}
        </div>
        <h1 className="mt-4 text-center text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">{resetMode ? (isEnglish ? 'Reset passcode' : 'Réinitialiser le code') : (isEnglish ? 'Passcode' : 'Code secret')}</h1>
        {!resetMode ? (
          <>
            <p className="mt-1.5 text-center text-xs text-slate-500 dark:text-slate-400">{isEnglish ? 'Unlock your personal space.' : 'Déverrouille ton espace personnel.'}</p>
            <div className="relative mt-5"><PinPad value={pin} onChange={setPin} disabled={busy || feedback === 'success'} label={isEnglish ? 'Enter your 4-digit passcode' : 'Saisis ton code à 4 chiffres'}/>{feedback === 'success' && <div role="status" className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-700"><CheckCircle2 size={16}/>{isEnglish ? 'Passcode verified' : 'Code vérifié'}</div>}</div>
            {error && <p role="alert" className="mt-3 text-center text-xs text-red-600">{error}</p>}
            <button type="button" onClick={() => { setResetMode(true); setError(''); }} className="mt-3 flex min-h-9 w-full items-center justify-center gap-1.5 text-xs font-semibold text-brand-700"><Mail size={14}/>{isEnglish ? 'Forgot your code?' : 'Code oublié ?'}</button>
          </>
        ) : (
          <div className="mt-4 space-y-3">
            {!resetSent ? (
              <>
                <p className="text-center text-xs leading-5 text-slate-500 dark:text-slate-400">{isEnglish ? 'A verification code will be sent to your account email address.' : 'Un code de vérification sera envoyé à l’adresse e-mail de ton compte.'}</p>
                <button type="button" onClick={requestReset} disabled={busy} className="h-11 w-full rounded-xl bg-brand-700 text-sm font-bold text-white disabled:opacity-50">{busy ? (isEnglish ? 'Sending…' : 'Envoi…') : (isEnglish ? 'Get the code by email' : 'Recevoir le code par e-mail')}</button>
              </>
            ) : (
              <>
                <label className="block text-xs font-semibold text-slate-600" htmlFor="pin-reset-code">{isEnglish ? 'Code received by email' : 'Code reçu par e-mail'}</label>
                <input id="pin-reset-code" type="text" inputMode="numeric" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-center text-base font-bold tracking-[.35em] outline-none focus:border-brand-500"/>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-1">
                  <button type="button" onClick={() => setResetStep('new')} className={`rounded-lg py-2 text-[11px] font-semibold ${resetStep === 'new' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>{isEnglish ? 'New passcode' : 'Nouveau PIN'}</button>
                  <button type="button" onClick={() => setResetStep('confirm')} className={`rounded-lg py-2 text-[11px] font-semibold ${resetStep === 'confirm' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>{isEnglish ? 'Confirmation' : 'Confirmation'}</button>
                </div>
                {resetStep === 'new'
                  ? <PinPad value={newPin} onChange={setNewPin} disabled={busy} label={isEnglish ? 'Choose your new passcode' : 'Choisis ton nouveau code'}/>
                  : <PinPad value={confirmPin} onChange={setConfirmPin} disabled={busy} label={isEnglish ? 'Confirm your new passcode' : 'Confirme ton nouveau code'}/>}
                {error && <p role="alert" className="text-center text-xs text-red-600">{error}</p>}
                <button type="button" onClick={confirmReset} disabled={busy || code.length !== 6 || newPin.length !== 4 || confirmPin.length !== 4} className="h-11 w-full rounded-xl bg-brand-700 text-sm font-bold text-white disabled:opacity-40">{busy ? (isEnglish ? 'Verifying…' : 'Validation…') : (isEnglish ? 'Confirm new passcode' : 'Valider le nouveau code')}</button>
              </>
            )}
            {!resetSent && error && <p role="alert" className="text-center text-xs text-red-600">{error}</p>}
            <button type="button" onClick={() => { setResetMode(false); setResetSent(false); setCode(''); setNewPin(''); setConfirmPin(''); setError(''); }} className="min-h-9 w-full text-xs font-semibold text-slate-500 dark:text-slate-400">{isEnglish ? 'Back' : 'Retour'}</button>
          </div>
        )}
      </section>
    </div>
  );
}
