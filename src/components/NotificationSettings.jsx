'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging';
import app from '@/lib/firebase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/Button';

export async function getDeviceMessagingToken(vapidKey) {
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
  let registration = await navigator.serviceWorker.getRegistration('/firebase-messaging/');
  if (!registration) {
    registration = await navigator.serviceWorker.register(workerUrl, { scope: '/firebase-messaging/', updateViaCache: 'none' });
  } else {
    await registration.update().catch(() => {});
  }
  if (!registration.active) {
    const worker = registration.installing || registration.waiting;
    if (worker) {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('La préparation des notifications a pris trop de temps. Réessaie.')), 12000);
        const finish = () => {
          if (worker.state === 'activated') { clearTimeout(timeout); resolve(); }
          if (worker.state === 'redundant') { clearTimeout(timeout); reject(new Error('Impossible de préparer les notifications sur cet appareil.')); }
        };
        worker.addEventListener('statechange', finish);
        finish();
      });
    }
  }
  if (!registration.active) throw new Error('Le service de notifications ne démarre pas sur cet appareil. Recharge la page puis réessaie.');
  const messaging = getMessaging(app);
  return getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
}

export function NotificationSettings() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [deviceToken, setDeviceToken] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let active = true;
    const syncCurrentDevice = async () => {
      if (!user || typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
        if (active) { setEnabled(false); setDeviceToken(''); }
        return;
      }
      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!vapidKey || !(await isSupported())) {
        if (active) setEnabled(false);
        return;
      }
      try {
        const token = await getDeviceMessagingToken(vapidKey);
        if (!active) return;
        const savedTokens = Array.isArray(profile?.pushTokens) ? profile.pushTokens : [];
        setDeviceToken(token || '');
        if (token && !savedTokens.includes(token)) {
          // Un jeton peut être renouvelé par Firebase après une mise à jour du navigateur.
          // On synchronise le jeton courant au lieu d'afficher un faux état désactivé.
          const idToken = await user.getIdToken();
          const response = await fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
            body: JSON.stringify({ token }),
          });
          if (!response.ok) throw new Error('Impossible de synchroniser cet appareil.');
          if (active) setEnabled(true);
        } else {
          setEnabled(Boolean(token && profile?.notificationsEnabled && savedTokens.includes(token)));
        }
      } catch {
        if (active) setEnabled(false);
      }
    };
    syncCurrentDevice();
    return () => { active = false; };
  }, [user, profile?.notificationsEnabled, profile?.pushTokens]);

  const subscribe = async () => {
    setMessage('');
    if (!user) return setMessage('Reconnecte-toi pour activer les notifications.');
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      return setMessage('Ce navigateur ne prend pas en charge les notifications en arrière-plan.');
    }
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) return setMessage('Les notifications ne sont pas encore disponibles sur Pata. Réessaie plus tard ou contacte le support.');
    setLoading(true);
    try {
      const supported = await isSupported();
      if (!supported) throw new Error('Cet appareil ne prend pas en charge les notifications.');
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
      setDeviceToken(token);
      setMessage('Les rappels sont activés sur cet appareil.');
    } catch (error) {
      setMessage(error.message || 'Activation impossible.');
    } finally {
      setLoading(false);
    }
  };

  const repairDevice = async () => {
    if (!user) return setMessage('Reconnecte-toi pour réparer les notifications.');
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      return setMessage('Ce navigateur ne prend pas en charge les notifications en arrière-plan.');
    }
    setLoading(true);
    setMessage('Réparation de la connexion aux notifications…');
    try {
      const supported = await isSupported();
      if (!supported) throw new Error('Cet appareil ne prend pas en charge les notifications.');
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Autorise les notifications dans les paramètres de ton navigateur.');
      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!vapidKey) throw new Error('La clé VAPID manque dans la configuration de Pata.');
      const messaging = getMessaging(app);
      const previousToken = deviceToken || await getDeviceMessagingToken(vapidKey);
      const idToken = await user.getIdToken();
      if (previousToken) {
        await fetch('/api/notifications/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ token: previousToken }),
        });
      }
      await deleteToken(messaging).catch(() => false);
      const freshToken = await getDeviceMessagingToken(vapidKey);
      if (!freshToken) throw new Error('Firebase n’a pas fourni de nouveau jeton. Recharge la page et réessaie.');
      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ token: freshToken }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Le nouveau jeton n’a pas pu être enregistré.');
      setDeviceToken(freshToken);
      setEnabled(true);
      setMessage('Cet appareil est maintenant réinscrit. Tu peux envoyer un test pour vérifier la réception.');
    } catch (error) {
      setEnabled(false);
      setMessage(error.message || 'Impossible de réparer les notifications sur cet appareil.');
    } finally {
      setLoading(false);
    }
  };

  const sendTest = async () => {
    if (!user) return setMessage('Connecte-toi pour tester les notifications.');
    setTesting(true);
    setMessage('Envoi du test…');
    try {
      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!vapidKey || Notification.permission !== 'granted') throw new Error('Active d’abord les notifications sur cet appareil.');
      const token = deviceToken || await getDeviceMessagingToken(vapidKey);
      if (!token) throw new Error('Impossible de retrouver cet appareil. Désactive puis réactive les notifications.');
      if (!deviceToken) setDeviceToken(token);
      const idToken = await user.getIdToken();
      const response = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ token }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Le test n’a pas pu être envoyé.');
      setMessage(`Test transmis au service de notifications (référence ${String(result.messageId || '').slice(-8)}). L’affichage dépend encore des autorisations et réglages de cet appareil.`);
    } catch (error) {
      setMessage(error.message || 'Le test a échoué.');
    } finally { setTesting(false); }
  };

  const unsubscribe = async () => {
    setLoading(true);
    setMessage('');
    try {
      const supported = await isSupported();
      if (supported && user) {
        const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
        if (!vapidKey) throw new Error('Les notifications ne sont pas encore disponibles sur Pata. Réessaie plus tard ou contacte le support.');
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
      setDeviceToken('');
      setMessage('Les rappels sont désactivés sur cet appareil.');
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
        <span className={`text-xs font-medium ${enabled ? 'text-emerald-700' : 'text-slate-500'}`}>{enabled ? 'Activées sur cet appareil' : 'Non activées'}</span>
        {enabled && <Button type="button" variant="outline" onClick={sendTest} disabled={testing || loading}><Bell size={15}/>{testing ? 'Envoi…' : 'Tester'}</Button>}
        <Button type="button" variant="outline" onClick={repairDevice} disabled={loading || testing}>
          {loading ? <Loader2 size={15} className="animate-spin"/> : <Bell size={15}/>}
          Réparer cet appareil
        </Button>
      </div>
      {message && <p role="status" className="text-xs text-slate-600">{message}</p>}
      <p className="text-[11px] leading-5 text-slate-400">Reçois des rappels utiles et des alertes importantes pour suivre ton argent.</p>
    </div>
  );
}
