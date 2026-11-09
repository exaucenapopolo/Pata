'use client';

import { useEffect, useState } from 'react';
import { LockKeyhole, ShieldCheck, Mail } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
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
  const [checking, setChecking] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
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
      if (active) { setError(err.message || 'Vérification de sécurité indisponible.'); setLocked(false); }
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
        setError(err.message || 'Vérification de sécurité indisponible.');
      }
    };
    window.addEventListener('pata:pin-updated', refreshPinStatus);
    return () => window.removeEventListener('pata:pin-updated', refreshPinStatus);
  }, [user]);

  const unlock = async () => {
    if (!user || pin.length !== 4 || busy) return;
    setBusy(true); setError('');
    try {
      const result = await apiCall(user, 'security/pin/verify', { pin });
      setEnabled(true);
      try { localStorage.removeItem(storageKey); } catch { /* stockage local indisponible */ }
      setLocked(false); setPin('');
    } catch (err) {
      setError(err.message || 'Code secret incorrect.');
      setPin('');
    } finally { setBusy(false); }
  };

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
      setError('Vérifie le code reçu et les deux saisies du nouveau PIN.');
      return;
    }
    setBusy(true); setError('');
    try {
      await apiCall(user, 'security/pin/reset/confirm', { code, pin: newPin });
      try { localStorage.removeItem(storageKey); } catch { /* stockage local indisponible */ }
      setEnabled(true); setLocked(false); setResetMode(false); setResetSent(false);
      setCode(''); setNewPin(''); setConfirmPin(''); setPin('');
    } catch (err) { setError(err.message || 'Réinitialisation impossible.'); }
    finally { setBusy(false); }
  };

  if (checking && user) return <div className="fixed inset-0 z-[200] grid place-items-center bg-[#f5f8f6] dark:bg-[#101a16]"><span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-700 border-t-transparent"/></div>;
  if (!locked || !enabled) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-[#f5f8f6] dark:bg-[#101a16] px-4 py-6">
      <section className="w-full max-w-[340px] rounded-[28px] border border-slate-200 bg-white px-5 py-6 shadow-xl dark:border-slate-700 dark:bg-[#18251f] sm:px-7">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
          {resetMode ? <ShieldCheck size={22}/> : <LockKeyhole size={22}/>}
        </div>
        <h1 className="mt-4 text-center text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">{resetMode ? 'Réinitialiser le code' : 'Code secret'}</h1>
        {!resetMode ? (
          <>
            <p className="mt-1.5 text-center text-xs text-slate-500 dark:text-slate-400">Déverrouille ton espace personnel.</p>
            <div className="mt-5"><PinPad value={pin} onChange={setPin} disabled={busy} label="Saisis ton code à 4 chiffres"/></div>
            {error && <p role="alert" className="mt-3 text-center text-xs text-red-600">{error}</p>}
            <button type="button" onClick={unlock} disabled={busy || pin.length !== 4} className="mt-4 h-11 w-full rounded-xl bg-brand-700 text-sm font-bold text-white transition hover:bg-brand-800 disabled:opacity-40">{busy ? 'Vérification…' : 'Déverrouiller'}</button>
            <button type="button" onClick={() => { setResetMode(true); setError(''); }} className="mt-3 flex min-h-9 w-full items-center justify-center gap-1.5 text-xs font-semibold text-brand-700"><Mail size={14}/> Code oublié ?</button>
          </>
        ) : (
          <div className="mt-4 space-y-3">
            {!resetSent ? (
              <>
                <p className="text-center text-xs leading-5 text-slate-500 dark:text-slate-400">Un code de vérification sera envoyé à l’adresse e-mail de ton compte.</p>
                <button type="button" onClick={requestReset} disabled={busy} className="h-11 w-full rounded-xl bg-brand-700 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Envoi…' : 'Recevoir le code par e-mail'}</button>
              </>
            ) : (
              <>
                <label className="block text-xs font-semibold text-slate-600" htmlFor="pin-reset-code">Code reçu par e-mail</label>
                <input id="pin-reset-code" type="text" inputMode="numeric" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-center text-base font-bold tracking-[.35em] outline-none focus:border-brand-500"/>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-1">
                  <button type="button" onClick={() => setResetStep('new')} className={`rounded-lg py-2 text-[11px] font-semibold ${resetStep === 'new' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>Nouveau PIN</button>
                  <button type="button" onClick={() => setResetStep('confirm')} className={`rounded-lg py-2 text-[11px] font-semibold ${resetStep === 'confirm' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>Confirmation</button>
                </div>
                {resetStep === 'new'
                  ? <PinPad value={newPin} onChange={setNewPin} disabled={busy} label="Choisis ton nouveau code"/>
                  : <PinPad value={confirmPin} onChange={setConfirmPin} disabled={busy} label="Confirme ton nouveau code"/>}
                {error && <p role="alert" className="text-center text-xs text-red-600">{error}</p>}
                <button type="button" onClick={confirmReset} disabled={busy || code.length !== 6 || newPin.length !== 4 || confirmPin.length !== 4} className="h-11 w-full rounded-xl bg-brand-700 text-sm font-bold text-white disabled:opacity-40">{busy ? 'Validation…' : 'Valider le nouveau code'}</button>
              </>
            )}
            {!resetSent && error && <p role="alert" className="text-center text-xs text-red-600">{error}</p>}
            <button type="button" onClick={() => { setResetMode(false); setResetSent(false); setCode(''); setNewPin(''); setConfirmPin(''); setError(''); }} className="min-h-9 w-full text-xs font-semibold text-slate-500 dark:text-slate-400">Retour</button>
          </div>
        )}
      </section>
    </div>
  );
}
