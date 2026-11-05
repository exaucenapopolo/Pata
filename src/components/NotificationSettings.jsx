'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import app from '@/lib/firebase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
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
        setEnabled(Boolean(token && profile?.notificationsEnabled && savedTokens.includes(token)));
      } catch {
        if (active) setEnabled(false);
      }
    };
    syncCurrentDevice();
    return () => { active = false; };
  }, [user, profile?.notificationsEnabled, profile?.pushTokens]);

  useEffect(() => {
    let unsubscribe = null;
    let active = true;
    const listen = async () => {
      try {
        if (!user || typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted' || !(await isSupported())) return;
        const messaging = getMessaging(app);
        unsubscribe = onMessage(messaging, (payload) => {
          if (!active) return;
          const title = payload.notification?.title || 'Pata';
          const options = { body: payload.notification?.body || 'Ouvre Pata pour consulter ton suivi.', icon: '/android-chrome-192x192.png', tag: payload.data?.tag || 'pata-foreground' };
          try { new Notification(title, options); } catch { /* certains navigateurs affichent uniquement en arrière-plan */ }
        });
      } catch (error) { console.warn('Écoute des notifications indisponible :', error?.message); }
    };
    listen();
    return () => { active = false; if (unsubscribe) unsubscribe(); };
  }, [user]);

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
      setMessage('Test envoyé. Vérifie que la notification apparaît sur ton appareil.');
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
        {enabled && <Button type="button" variant="outline" onClick={sendTest} disabled={testing}><Bell size={15}/>{testing ? 'Envoi…' : 'Tester'}</Button>}
      </div>
      {message && <p role="status" className="text-xs text-slate-600">{message}</p>}
      <p className="text-[11px] leading-5 text-slate-400">Reçois des rappels utiles et des alertes importantes pour suivre ton argent.</p>
    </div>
  );
}
