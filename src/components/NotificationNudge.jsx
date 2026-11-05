'use client';

import { useEffect, useState } from 'react';
import { Bell, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getDeviceMessagingToken } from '@/components/NotificationSettings';

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function NotificationNudge() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (!user || typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (Notification.permission !== 'default') return;
    if (!process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) return;
    try {
      const key = `pata-notification-nudge:${user.uid}`;
      const lastDismissed = Number(localStorage.getItem(key) || 0);
      if (Date.now() - lastDismissed >= COOLDOWN_MS) setVisible(true);
    } catch { setVisible(true); }
  }, [user]);

  const dismiss = () => {
    try { localStorage.setItem(`pata-notification-nudge:${user?.uid || 'guest'}`, String(Date.now())); } catch { /* stockage local indisponible */ }
    setVisible(false);
  };

  const activate = async () => {
    if (!user) return;
    setBusy(true);
    setFeedback('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Les notifications ne sont pas autorisées sur cet appareil.');
      const token = await getDeviceMessagingToken(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY);
      if (!token) throw new Error('Impossible de préparer les rappels sur cet appareil.');
      const idToken = await user.getIdToken();
      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ token }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Activation impossible.');
      setVisible(false);
      setFeedback('Les rappels sont activés sur cet appareil.');
    } catch (error) {
      setFeedback(error.message || 'Activation impossible.');
    } finally { setBusy(false); }
  };

  if (!visible && !feedback) return null;
  return (
    <div className="mx-4 mb-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:mx-6 dark:border-slate-700 dark:bg-slate-900">
      {visible ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ne manque aucun rappel important</p><p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">Reçois les rappels utiles de Pata directement sur cet appareil.</p></div>
          <button type="button" onClick={activate} disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-slate-900">{busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />} {busy ? 'Activation…' : 'Activer'}</button>
          <button type="button" onClick={dismiss} aria-label="Plus tard" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={15} /></button>
          {feedback && <p role="status" className="w-full text-xs text-amber-700 dark:text-amber-300">{feedback}</p>}
        </div>
      ) : <p role="status" className="text-xs text-slate-600 dark:text-slate-300">{feedback}</p>}
    </div>
  );
}
