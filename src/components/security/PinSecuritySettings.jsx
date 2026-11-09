'use client';

import { useCallback, useEffect, useState } from 'react';
import { LockKeyhole, ShieldCheck, Mail } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

async function call(user, path, body) {
  const token = await user.getIdToken();
  const response = await fetch('/api/' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(()=>({}));
  if (!response.ok || !data.success) throw new Error(data.error || 'Une erreur est survenue.');
  return data;
}

export function PinSecuritySettings() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [code, setCode] = useState('');

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await call(user, 'security/pin/status');
      setEnabled(data.enabled === true);
    } catch (err) {
      setError(err.message || 'Impossible de vérifier le code secret.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const savePin = async (event) => {
    event.preventDefault(); setError(''); setMessage('');
    if (pin.length!==4 || pin!==confirmPin) return setError('Les deux codes doivent contenir les mêmes 4 chiffres.');
    if (enabled && currentPin.length!==4) return setError('Saisis ton code secret actuel.');
    setSaving(true);
    try {
      await call(user,'security/pin/set',{pin,currentPin});
      setEnabled(true); setPin(''); setConfirmPin(''); setCurrentPin('');
      window.dispatchEvent(new Event('pata:pin-updated'));
      try { localStorage.removeItem('pata-pin-last-background:'+user.uid); } catch { /* stockage local indisponible */ }
      setMessage('Ton code secret est enregistré. Il sera demandé uniquement après au moins 10 minutes passées hors de Pata.');
    } catch(err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const requestReset = async () => {
    setSaving(true); setError(''); setMessage('');
    try { const data=await call(user,'security/pin/reset/request',{}); setResetSent(true); setMessage('Un code a été envoyé à '+(data.maskedEmail||'ton adresse e-mail')+'. Il expire dans 15 minutes.'); }
    catch(err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const confirmReset = async (event) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    if(code.length!==6 || pin.length!==4 || pin!==confirmPin) { setError('Vérifie le code à 6 chiffres et les deux nouveaux codes PIN.'); setSaving(false); return; }
    try {
      await call(user,'security/pin/reset/confirm',{code,pin});
      setEnabled(true); setCode(''); setPin(''); setConfirmPin(''); setCurrentPin(''); setResetSent(false);
      window.dispatchEvent(new Event('pata:pin-updated'));
      try { localStorage.removeItem('pata-pin-last-background:'+user.uid); } catch { /* stockage local indisponible */ }
      setMessage('Ton nouveau code secret est enregistré.');
    } catch(err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return <section className="rounded-2xl border border-slate-200 bg-white p-4">
    <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#edf5f0] text-[#0b5c46]"><LockKeyhole size={19}/></span><div><h3 className="text-sm font-bold text-slate-900">Code secret à 4 chiffres</h3><p className="mt-1 text-xs leading-5 text-slate-500">Ajoute un code secret à 4 chiffres. Il est demandé une seule fois lorsque tu reviens dans Pata après au moins 10 minutes passées hors de l’application, pas à chaque opération.</p></div></div>
    {loading ? <p className="mt-4 text-xs text-slate-400">Vérification…</p> : <>
      <p className="mt-3 flex items-center gap-2 text-xs font-semibold">{enabled?<><ShieldCheck size={15} className="text-emerald-700"/> Protection activée</>:<span className="text-slate-500">Aucun code secret configuré</span>}</p>
      <form onSubmit={resetSent?confirmReset:savePin} className="mt-4 space-y-3">
        {enabled && !resetSent && <input type="password" inputMode="numeric" maxLength={4} value={currentPin} onChange={e=>setCurrentPin(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="Code actuel (4 chiffres)" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-center tracking-[.4em] outline-none focus:border-[#0b5c46]"/>}
        {resetSent && <input inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="Code de vérification reçu par e-mail" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-center tracking-[.3em] outline-none focus:border-[#0b5c46]"/>}
        <div className="grid gap-2 sm:grid-cols-2"><input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="Nouveau PIN (4 chiffres)" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-center tracking-[.4em] outline-none focus:border-[#0b5c46]"/><input type="password" inputMode="numeric" maxLength={4} value={confirmPin} onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="Confirmer le PIN" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-center tracking-[.4em] outline-none focus:border-[#0b5c46]"/></div>
        <div className="flex flex-wrap gap-2"><button disabled={saving || pin.length!==4 || confirmPin.length!==4 || (enabled&&!resetSent&&currentPin.length!==4) || (resetSent&&code.length!==6)} className="h-10 rounded-xl bg-[#0b5c46] px-4 text-xs font-bold text-white disabled:opacity-50">{saving?'Enregistrement…':enabled?'Enregistrer le nouveau PIN':'Activer mon code secret'}</button>{enabled&&!resetSent&&<button type="button" onClick={requestReset} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 disabled:opacity-50"><Mail size={14}/> Code oublié ?</button>}{resetSent&&<button type="button" onClick={()=>{setResetSent(false);setCode('');setError('');setMessage('');}} className="h-10 rounded-xl px-3 text-xs font-semibold text-slate-500">Annuler</button>}</div>
      </form>
      {message&&<p role="status" className="mt-3 text-xs leading-5 text-emerald-700">{message}</p>}
      {error&&<p role="alert" className="mt-3 text-xs leading-5 text-red-600">{error}</p>}
    </>}
  </section>;
}
