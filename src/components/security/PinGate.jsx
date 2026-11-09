'use client';

import { useEffect, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

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

  const storageKey = user ? 'pata-pin-last-background:' + user.uid : '';

  useEffect(() => {
    let active = true;
    if (!user) { setEnabled(false); setLocked(false); setChecking(false); return undefined; }
    setChecking(true);
    apiCall(user, 'security/pin/status').then((data) => {
      if (!active) return;
      setEnabled(data.enabled === true);
      let lastBackgroundAt = 0;
      try {
        lastBackgroundAt = Number(localStorage.getItem(storageKey) || 0);
        localStorage.removeItem(storageKey);
      } catch { /* stockage local indisponible */ }
      const inactiveForTenMinutes = lastBackgroundAt > 0 && Date.now() - lastBackgroundAt >= 10 * 60 * 1000;
      setLocked(data.enabled === true && inactiveForTenMinutes);
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
          setPin('');
          setError('');
          setLocked(true);
        }
      } catch { /* stockage local indisponible */ }
    };
    document.addEventListener('visibilitychange', markBackground);
    document.addEventListener('visibilitychange', checkReturn);
    window.addEventListener('pagehide', markBackground);
    return () => {
      document.removeEventListener('visibilitychange', markBackground);
      document.removeEventListener('visibilitychange', checkReturn);
      window.removeEventListener('pagehide', markBackground);
    };
  }, [user, enabled, storageKey]);

  const unlock = async (event) => {
    event.preventDefault();
    if (!user || pin.length !== 4) return;
    setBusy(true); setError('');
    try {
      const result = await apiCall(user, 'security/pin/verify', { pin });
      if (!result.enabled) { setEnabled(false); setLocked(false); return; }
      try { localStorage.removeItem(storageKey); } catch { /* stockage local indisponible */ }
      setLocked(false); setPin('');
    } catch (err) { setError(err.message || 'Code secret incorrect.'); setPin(''); }
    finally { setBusy(false); }
  };

  const requestReset = async () => {
    setBusy(true); setError('');
    try { await apiCall(user, 'security/pin/reset/request', {}); setResetSent(true); }
    catch (err) { setError(err.message || 'Envoi du code impossible.'); }
    finally { setBusy(false); }
  };

  const confirmReset = async (event) => {
    event.preventDefault();
    if (newPin.length !== 4 || newPin !== confirmPin || code.length !== 6) return setError('Vérifie le code reçu et les deux nouveaux codes PIN.');
    setBusy(true); setError('');
    try {
      await apiCall(user, 'security/pin/reset/confirm', { code, pin: newPin });
      try { localStorage.removeItem(storageKey); } catch { /* stockage local indisponible */ }
      setEnabled(true); setLocked(false); setResetMode(false); setResetSent(false);
      setCode(''); setNewPin(''); setConfirmPin('');
    } catch (err) { setError(err.message || 'Réinitialisation impossible.'); }
    finally { setBusy(false); }
  };

  if (checking && user) return <div className="fixed inset-0 z-[200] grid place-items-center bg-[#f5f8f6]"><span className="h-8 w-8 animate-spin rounded-full border-2 border-[#0b5c46] border-t-transparent"/></div>;
  if (!locked || !enabled) return null;

  return <div className="fixed inset-0 z-[200] grid place-items-center bg-[#f5f8f6] px-4 py-8">
    <section className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#edf5f0] text-[#0b5c46]">{resetMode ? <ShieldCheck size={25}/> : <LockKeyhole size={25}/>}</div>
      <p className="mt-5 text-center text-[10px] font-bold uppercase tracking-[.18em] text-[#0b5c46]">Protection Pata</p>
      <h1 className="mt-2 text-center text-xl font-bold text-slate-950">{resetMode ? 'Réinitialiser ton code' : 'Saisis ton code secret'}</h1>
      {!resetMode ? <>
        <p className="mt-2 text-center text-sm leading-6 text-slate-500">Après 10 minutes ou plus passées hors de Pata, saisis ton code PIN pour reprendre l'accès à ton espace financier.</p>
        <form onSubmit={unlock} className="mt-5 space-y-3">
          <input autoFocus type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={4} pattern="[0-9]{4}" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,4))} className="h-14 w-full rounded-xl border border-slate-200 text-center text-2xl font-bold tracking-[.7em] outline-none focus:border-[#0b5c46]" aria-label="Code secret à quatre chiffres" placeholder="••••"/>
          {error && <p role="alert" className="text-center text-xs text-red-600">{error}</p>}
          <button disabled={busy || pin.length!==4} className="h-12 w-full rounded-xl bg-[#0b5c46] text-sm font-bold text-white disabled:opacity-50">{busy?'Vérification…':'Déverrouiller Pata'}</button>
        </form>
        <button type="button" onClick={()=>{setResetMode(true);setError('');}} className="mt-4 w-full text-center text-xs font-semibold text-[#0b5c46] hover:underline">J’ai oublié mon code</button>
      </> : <>
        <p className="mt-2 text-center text-sm leading-6 text-slate-500">Un code de vérification sera envoyé à l’adresse e-mail de ton compte. Il restera valable 15 minutes.</p>
        {!resetSent ? <button type="button" onClick={requestReset} disabled={busy} className="mt-5 h-12 w-full rounded-xl bg-[#0b5c46] text-sm font-bold text-white disabled:opacity-50">{busy?'Envoi…':'Recevoir mon code par e-mail'}</button> : <form onSubmit={confirmReset} className="mt-5 space-y-3">
          <input inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="Code reçu par e-mail" className="h-12 w-full rounded-xl border border-slate-200 px-3 text-center text-lg font-bold tracking-[.3em] outline-none focus:border-[#0b5c46]"/>
          <input type="password" inputMode="numeric" maxLength={4} value={newPin} onChange={e=>setNewPin(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="Nouveau PIN à 4 chiffres" className="h-12 w-full rounded-xl border border-slate-200 px-3 text-center text-lg tracking-[.3em] outline-none focus:border-[#0b5c46]"/>
          <input type="password" inputMode="numeric" maxLength={4} value={confirmPin} onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="Confirmer le PIN" className="h-12 w-full rounded-xl border border-slate-200 px-3 text-center text-lg tracking-[.3em] outline-none focus:border-[#0b5c46]"/>
          <button disabled={busy || code.length!==6 || newPin.length!==4 || confirmPin.length!==4} className="h-12 w-full rounded-xl bg-[#0b5c46] text-sm font-bold text-white disabled:opacity-50">{busy?'Validation…':'Valider le nouveau code'}</button>
        </form>}
        {error && <p role="alert" className="mt-3 text-center text-xs text-red-600">{error}</p>}
        <button type="button" onClick={()=>{setResetMode(false);setResetSent(false);setError('');}} className="mt-4 w-full text-center text-xs font-semibold text-slate-500 hover:underline">Retour</button>
      </>}
    </section>
  </div>;
}
