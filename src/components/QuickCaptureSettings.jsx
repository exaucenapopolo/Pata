'use client';

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { BellRing, Check, CircleHelp, Smartphone } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { PataQuickCapture } from '@/lib/quickCapture/nativePlugin';

function premiumActive(profile) {
  const raw = profile?.premiumUntil;
  const date = raw?.toDate ? raw.toDate() : new Date(raw || 0);
  return Number.isFinite(date.getTime()) && date > new Date();
}

export function QuickCaptureSettings() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [enabled, setEnabled] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const native = Capacitor.isNativePlatform();
  const premium = premiumActive(profile);

  useEffect(() => {
    let active = true;
    if (!native || !premium) return undefined;
    PataQuickCapture.getPersistentNotificationStatus()
      .then((result) => { if (active) setEnabled(result?.enabled === true); })
      .catch(() => {});
    return () => { active = false; };
  }, [native, premium]);

  if (!native || !premium) return null;

  const enable = async () => {
    if (working || !user?.uid) return;
    setWorking(true);
    setMessage('');
    try {
      const permission = await PataQuickCapture.requestNotificationPermission();
      if (permission?.granted !== true) {
        setMessage('Autorise les notifications Pata dans Android pour activer cette fonction.');
        return;
      }
      await PataQuickCapture.setPersistentNotification({ enabled: true, uid: user.uid });
      setEnabled(true);
      setMessage('La notification Pata reste disponible dans le panneau des notifications. Elle ne consomme pas le quota des notifications de rappel.');
    } catch (error) {
      setMessage(error?.message || 'Impossible d’activer la saisie rapide.');
    } finally {
      setWorking(false);
    }
  };

  const disable = async () => {
    setWorking(true);
    setMessage('');
    try {
      await PataQuickCapture.setPersistentNotification({ enabled: false, uid: user?.uid || '' });
      setEnabled(false);
      setMessage('La notification permanente Pata a été désactivée.');
    } catch (error) {
      setMessage(error?.message || 'Impossible de désactiver cette fonction.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><BellRing size={19}/></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">Pata Quick Capture</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">Garde une entrée Pata dans tes notifications pour saisir une dépense, un revenu ou dicter une opération sans chercher l’application.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {enabled
              ? <button type="button" disabled={working} onClick={disable} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">Désactiver</button>
              : <button type="button" disabled={working} onClick={enable} className="rounded-xl bg-[#075b43] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{working ? 'Activation…' : 'Activer la notification permanente'}</button>}
            <span className="inline-flex items-center gap-1 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600"><Check size={13}/>{enabled ? 'Activée' : 'Désactivée'}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
        <div className="flex gap-2"><Smartphone size={16} className="mt-0.5 shrink-0 text-slate-500"/><p className="text-[11px] leading-5 text-slate-600">Widget : maintiens le doigt sur l’écran d’accueil, ouvre les widgets, puis ajoute Pata.</p></div>
        <div className="flex gap-2"><CircleHelp size={16} className="mt-0.5 shrink-0 text-slate-500"/><p className="text-[11px] leading-5 text-slate-600">Tuile Android : ouvre les réglages rapides, appuie sur Modifier, puis ajoute « Pata · Dépense rapide ».</p></div>
      </div>
      {message && <p role="status" className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-700">{message}</p>}
    </section>
  );
}
