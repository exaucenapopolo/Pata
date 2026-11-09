'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function NotificationNudge() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
          const permission = await PushNotifications.checkPermissions();
          if (!active || !['prompt', 'prompt-with-rationale'].includes(permission.receive)) return;
        } else {
          if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
          if (Notification.permission !== 'default' || !process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY) return;
        }
        const lastDismissed = Number(localStorage.getItem('pata-notification-nudge') || 0);
        if (active && Date.now() - lastDismissed >= COOLDOWN_MS) setVisible(true);
      } catch (error) {
        console.warn('[PATA NOTIFICATION NUDGE]', error?.message || error);
      }
    };
    void check();
    return () => { active = false; };
  }, []);

  const dismiss = () => {
    try { localStorage.setItem('pata-notification-nudge', String(Date.now())); } catch { /* stockage local indisponible */ }
    setVisible(false);
  };

  const openSettings = () => {
    dismiss();
    router.push('/settings');
  };

  if (!visible) return null;
  return (
    <div className="mx-4 mb-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:mx-6 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Active les notifications de Pata</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">Retrouve les réglages dans Paramètres pour recevoir les alertes système sur cet appareil.</p>
        </div>
        <button type="button" onClick={openSettings} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white dark:bg-white dark:text-slate-900">
          <Bell size={14} /> Configurer
        </button>
        <button type="button" onClick={dismiss} aria-label="Plus tard" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
