'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import app from '@/lib/firebase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';

async function getDeviceMessagingToken(vapidKey) {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  };
  const params = new URLSearchParams(config);
  const workerUrl = `/firebase-messaging-sw.js?${params.toString()}`;
  const registration = await navigator.serviceWorker.getRegistration('/firebase-messaging/')
    || await navigator.serviceWorker.register(workerUrl, { scope: '/firebase-messaging/' });
  const messaging = getMessaging(app);
  return getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
}

export function NotificationSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) setEnabled(Notification.permission === 'granted');
  }, []);

  const subscribe = async () => {
    setMessage('');
    if (!user) return setMessage('Reconnecte-toi pour activer les notifications.');
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      return setMessage('Ce navigateur ne prend pas en charge les notifications en arrière-plan.');
    }
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) return setMessage('La clé Web Push Firebase manque dans la configuration de l’application.');
    setLoading(true);
    try {
      const supported = await isSupported();
      if (!supported) throw new Error('Les notifications Firebase ne sont pas prises en charge sur cet appareil.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Autorisation refusée. Tu peux l’activer dans les paramètres du navigateur.');
      const token = await getDeviceMessagingToken(vapidKey);
      if (!token) throw new Error('Le navigateur n’a pas fourni de jeton de notification.');
      const idToken = await user.getIdToken();
      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ token }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Impossible d’enregistrer cet appareil.');
      setEnabled(true);
      setMessage('Notifications activées sur cet appareil.');
    } catch (error) {
      setMessage(error.message || 'Activation impossible.');
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    setLoading(true);
    setMessage('');
    try {
      const supported = await isSupported();
      if (supported && user) {
        const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
        if (!vapidKey) throw new Error('La clé Web Push Firebase manque dans la configuration de l’application.');
        const token = await getDeviceMessagingToken(vapidKey);
        if (token) {
          const idToken = await user.getIdToken();
          await fetch('/api/notifications/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
            body: JSON.stringify({ token }),
          });
        }
      }
      setEnabled(false);
      setMessage('Cet appareil ne recevra plus les notifications Pata.');
    } catch (error) {
      setMessage(error.message || 'Désactivation impossible.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant={enabled ? 'outline' : 'primary'} onClick={enabled ? unsubscribe : subscribe} disabled={loading}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : enabled ? <BellOff size={15} /> : <Bell size={15} />}
          {loading ? 'Traitement…' : enabled ? 'Désactiver sur cet appareil' : 'Activer les notifications'}
        </Button>
        <span className={`text-xs font-medium ${enabled ? 'text-emerald-700' : 'text-slate-500'}`}>{enabled ? 'Autorisation accordée' : 'Non activées'}</span>
      </div>
      {message && <p role="status" className="text-xs text-slate-600">{message}</p>}
      <p className="text-[11px] leading-5 text-slate-400">Les rappels quotidiens sont prévus vers 20 h 30 (heure du Cameroun). Ils dépendent de l’autorisation du navigateur, de la configuration Firebase Web Push et du planificateur serveur.</p>
    </div>
  );
}
