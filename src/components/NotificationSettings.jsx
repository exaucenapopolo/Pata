'use client';

import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { Bell, BellOff, Loader2, RefreshCw, Smartphone } from 'lucide-react';
import { deleteToken, getMessaging, getToken, isSupported } from 'firebase/messaging';
import app from '@/lib/firebase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';

function isIOSDevice() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandaloneWebApp() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function getPushSupportMessage() {
  if (typeof window === 'undefined') return '';
  if (isIOSDevice() && !isStandaloneWebApp()) {
    return 'Sur iPhone et iPad, ajoute d’abord Pata à l’écran d’accueil. Les notifications Web Push sont disponibles dans la web app installée sous iOS/iPadOS 16.4 ou ultérieur, pas dans un onglet Safari classique.';
  }
  if (!('Notification' in window)) return 'Ce navigateur ne fournit pas l’API Notifications.';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'Ce navigateur ne prend pas en charge les Service Workers et Push API nécessaires aux notifications en arrière-plan.';
  }
  if (!process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY) return 'La clé publique Web Push de Pata n’est pas disponible.';
  return '';
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function ensurePataServiceWorker() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error(getPushSupportMessage() || 'Les notifications en arrière-plan ne sont pas prises en charge.');
  }
  // Pata utilise déjà /sw.js pour le cache hors ligne : on le conserve et on y ajoute Push.
  let registration = await navigator.serviceWorker.getRegistration('/');
  const scriptUrl = registration?.active?.scriptURL
    || registration?.installing?.scriptURL
    || registration?.waiting?.scriptURL
    || '';
  if (!registration || !new URL(scriptUrl || location.href).pathname.endsWith('/sw.js')) {
    registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  }
  await registration.update().catch(() => {});
  await navigator.serviceWorker.ready;
  const activeRegistration = await navigator.serviceWorker.getRegistration('/');
  if (!activeRegistration?.active) throw new Error('Le Service Worker Pata ne s’est pas activé. Recharge la page puis réessaie.');
  return activeRegistration;
}

async function postSubscription(path, user, subscription) {
  const idToken = await user.getIdToken();
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'Le serveur Pata n’a pas pu enregistrer cet appareil.');
  return result;
}

async function removeLegacyFcmRegistration(user) {
  try {
    if (!(await isSupported())) return;
    const registrations = await navigator.serviceWorker.getRegistrations();
    const legacyRegistration = registrations.find((item) => new URL(item.scope).pathname === '/firebase-messaging/');
    if (!legacyRegistration) return;
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (vapidKey) {
      const messaging = getMessaging(app);
      const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: legacyRegistration }).catch(() => '');
      if (token) {
        const idToken = await user.getIdToken();
        await fetch('/api/notifications/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
          body: JSON.stringify({ token }),
        }).catch(() => {});
      }
      await deleteToken(messaging).catch(() => false);
    }
    await legacyRegistration.unregister().catch(() => false);
  } catch (error) {
    console.warn('[PATA LEGACY FCM CLEANUP]', error?.message || error);
  }
}

function WebPushNotificationSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [serverStatus, setServerStatus] = useState(null);
  const [browserSupport, setBrowserSupport] = useState('');

  const refreshStatus = useCallback(async () => {
    if (!user) {
      setEnabled(false);
      setServerStatus(null);
      return;
    }
    const idToken = await user.getIdToken();
    const response = await fetch('/api/notifications/status', {
      headers: { Authorization: 'Bearer ' + idToken },
      cache: 'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de vérifier les notifications.');
    setServerStatus(result);

    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
      setEnabled(false);
      return;
    }
    const disabled = localStorage.getItem('pata-webpush-disabled:' + user.uid) === '1';
    if (disabled || getPushSupportMessage()) {
      setEnabled(false);
      return;
    }
    const registration = await ensurePataServiceWorker();
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await postSubscription('/api/notifications/subscribe', user, subscription);
      setEnabled(true);
    } else {
      setEnabled(false);
    }
  }, [user]);

  useEffect(() => {
    const reason = getPushSupportMessage();
    setBrowserSupport(reason);
    if (!reason && 'serviceWorker' in navigator && 'PushManager' in window) {
      ensurePataServiceWorker().catch((error) => console.warn('[PATA PUSH WORKER]', error?.message || error));
    }
    refreshStatus().catch((error) => setMessage(error.message || 'Impossible de vérifier les notifications.'));
  }, [refreshStatus]);

  // Les anciens jetons FCM restent pris en charge pendant que les utilisateurs migrent vers Web Push.
  useEffect(() => {
    let unsubscribe = null;
    let active = true;
    (async () => {
      try {
        if (!user || !(await isSupported()) || !('Notification' in window) || Notification.permission !== 'granted') return;
        const messaging = getMessaging(app);
        const { onMessage } = await import('firebase/messaging');
        unsubscribe = onMessage(messaging, async (payload) => {
          if (!active || !payload) return;
          const data = payload.data || {};
          const notice = payload.notification || {};
          const registration = await navigator.serviceWorker.getRegistration('/');
          if (!registration) return;
          await registration.showNotification(data.title || notice.title || 'Pata', {
            body: data.body || notice.body || 'Ouvre Pata pour consulter cette information.',
            icon: '/android-chrome-192x192.png',
            badge: '/android-chrome-192x192.png',
            tag: data.tag || 'pata-foreground',
            data: { url: data.url || '/dashboard' },
          });
        });
      } catch (error) {
        console.warn('[PATA FOREGROUND PUSH]', error?.message || error);
      }
    })();
    return () => { active = false; if (unsubscribe) unsubscribe(); };
  }, [user]);

  const subscribe = async () => {
    if (!user) return setMessage('Reconnecte-toi pour activer les notifications.');
    const reason = getPushSupportMessage();
    if (reason) {
      setBrowserSupport(reason);
      setMessage(reason);
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Autorisation refusée. Tu peux l’activer dans les paramètres du navigateur.');
      const registration = await ensurePataServiceWorker();
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY),
        });
      }
      await postSubscription('/api/notifications/subscribe', user, subscription);
      await removeLegacyFcmRegistration(user);
      localStorage.removeItem('pata-webpush-disabled:' + user.uid);
      setEnabled(true);
      setMessage('Les notifications système sont activées sur cet appareil. Pata peut maintenant t’alerter même lorsque le site est fermé, selon les règles du navigateur et du système.');
      await refreshStatus();
    } catch (error) {
      setMessage(error.message || 'Impossible d’activer les notifications.');
    } finally {
      setLoading(false);
    }
  };

  const repairDevice = async () => {
    if (!user) return setMessage('Reconnecte-toi pour réparer les notifications.');
    setLoading(true);
    setMessage('Réparation de la connexion aux notifications…');
    try {
      const registration = await ensurePataServiceWorker();
      const previous = await registration.pushManager.getSubscription();
      if (previous) {
        await postSubscription('/api/notifications/unsubscribe', user, previous);
        await previous.unsubscribe().catch(() => false);
      }
      setLoading(false);
      await subscribe();
    } catch (error) {
      setLoading(false);
      setEnabled(false);
      setMessage(error.message || 'Impossible de réparer cet appareil.');
    }
  };

  const sendTest = async () => {
    if (!user) return setMessage('Connecte-toi pour tester les notifications.');
    setTesting(true);
    setMessage('Envoi du test système…');
    try {
      const registration = await ensurePataServiceWorker();
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) throw new Error('Cet appareil n’est pas inscrit. Active d’abord les notifications.');
      await postSubscription('/api/notifications/test', user, subscription);
      setMessage('Le serveur a accepté le test Web Push. Vérifie le centre de notifications de ton appareil.');
      await refreshStatus();
    } catch (error) {
      setMessage(error.message || 'Le test de notification a échoué.');
    } finally {
      setTesting(false);
    }
  };

  const unsubscribe = async () => {
    if (!user) return;
    setLoading(true);
    setMessage('');
    try {
      const registration = await ensurePataServiceWorker();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await postSubscription('/api/notifications/unsubscribe', user, subscription);
        await subscription.unsubscribe().catch(() => false);
      }
      await removeLegacyFcmRegistration(user);
      localStorage.setItem('pata-webpush-disabled:' + user.uid, '1');
      setEnabled(false);
      setMessage('Les notifications sont désactivées sur cet appareil. Les autres appareils du compte ne sont pas modifiés.');
      await refreshStatus();
    } catch (error) {
      setMessage(error.message || 'Désactivation impossible.');
    } finally {
      setLoading(false);
    }
  };

  const deviceCount = Number(serverStatus?.deviceCount || 0);
  const webPushCount = Number(serverStatus?.webPushDeviceCount || 0);
  const fcmCount = Number(serverStatus?.fcmDeviceCount || 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant={enabled ? 'outline' : 'primary'} onClick={enabled ? unsubscribe : subscribe} disabled={loading || Boolean(browserSupport)}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : enabled ? <BellOff size={15} /> : <Bell size={15} />}
          {loading ? 'Traitement…' : enabled ? 'Désactiver sur cet appareil' : 'Activer les notifications'}
        </Button>
        {enabled && <Button type="button" variant="outline" onClick={sendTest} disabled={testing || loading}><Bell size={15}/>{testing ? 'Envoi…' : 'Tester'}</Button>}
        <Button type="button" variant="outline" onClick={repairDevice} disabled={loading || testing || Boolean(browserSupport)}>
          {loading ? <Loader2 size={15} className="animate-spin"/> : <RefreshCw size={15}/>}
          Réparer cet appareil
        </Button>
      </div>
      {browserSupport && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p className="flex items-center gap-2 text-xs font-semibold text-amber-900"><Smartphone size={14}/> Notifications indisponibles dans ce contexte</p>
        <p className="mt-1 text-xs leading-5 text-amber-800">{browserSupport}</p>
      </div>}
      {message && <p role="status" className="text-xs leading-5 text-slate-600">{message}</p>}
      {serverStatus && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold text-slate-700">{deviceCount} appareil(aux) inscrit(s) à ton compte</p>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">{webPushCount} Web Push · {fcmCount} ancien(s) jeton(s) Firebase</p>
          {serverStatus.lastPushAcceptedAt && <p className="mt-1 text-[10px] leading-4 text-slate-500">Dernier envoi accepté : {new Date(serverStatus.lastPushAcceptedAt).toLocaleString('fr-FR')}</p>}
          {serverStatus.lastPushErrorCode && <p className="mt-1 break-words text-[10px] leading-4 text-amber-700">Dernier problème : {serverStatus.lastPushErrorCode}</p>}
        </div>
      )}
      <p className="text-[11px] leading-5 text-slate-400">Pata utilise Web Push pour les navigateurs compatibles. La livraison dépend de l’autorisation, de la connexion Internet, du système et des réglages d’économie d’énergie.</p>
    </div>
  );
}


const NATIVE_PUSH_DISABLED_KEY = (uid) => `pata-native-push-disabled:${uid}`;
const NATIVE_PUSH_TOKEN_KEY = (uid) => `pata-native-push-token:${uid}`;

async function preparePataNativePushChannel() {
  await PushNotifications.createChannel({
    id: 'pata_general',
    name: 'Notifications Pata',
    description: 'Alertes et rappels importants de Pata',
    importance: 5,
    vibration: true,
    sound: 'default',
  }).catch((error) => {
    console.warn('[PATA NATIVE PUSH CHANNEL]', error?.message || error);
  });
}

async function postNativeToken(path, user, token) {
  const idToken = await user.getIdToken();
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
    body: JSON.stringify({ token }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'Le serveur Pata n’a pas enregistré cet appareil.');
  return result;
}

function getSafeNotificationPath(value) {
  if (typeof value !== 'string' || !value.trim()) return '/dashboard';
  try {
    const target = new URL(value, window.location.origin);
    if (target.origin !== window.location.origin) return '/dashboard';
    return target.pathname + target.search + target.hash;
  } catch {
    return '/dashboard';
  }
}

/**
 * Synchronise le jeton FCM natif de l'APK avec le compte connecté.
 * Aucune autorisation n'est demandée automatiquement : l'inscription silencieuse
 * ne démarre que si Android a déjà accordé la permission.
 */
export function NativePushManager() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return undefined;
    let active = true;
    const listenerHandles = [];

    const addListener = async (eventName, callback) => {
      const handle = await PushNotifications.addListener(eventName, callback);
      if (!active) {
        await handle.remove().catch(() => {});
        return;
      }
      listenerHandles.push(handle);
    };

    const setup = async () => {
      await addListener('registration', async ({ value }) => {
        if (!active || typeof value !== 'string' || value.length < 40) return;
        try {
          localStorage.setItem(NATIVE_PUSH_TOKEN_KEY(user.uid), value);
          await postNativeToken('/api/notifications/subscribe', user, value);
          window.dispatchEvent(new CustomEvent('pata:native-push-token', { detail: value }));
        } catch (error) {
          console.error('[PATA NATIVE PUSH SYNC]', error?.message || error);
          window.dispatchEvent(new CustomEvent('pata:native-push-error', { detail: error?.message || 'Synchronisation impossible.' }));
        }
      });

      await addListener('registrationError', ({ error }) => {
        if (!active) return;
        console.error('[PATA NATIVE PUSH REGISTRATION]', error);
        window.dispatchEvent(new CustomEvent('pata:native-push-error', { detail: error || 'Inscription Firebase impossible.' }));
      });

      await addListener('pushNotificationActionPerformed', ({ notification }) => {
        if (!active) return;
        const target = getSafeNotificationPath(notification?.data?.url || notification?.data?.target);
        window.location.assign(target);
      });

      const disabled = localStorage.getItem(NATIVE_PUSH_DISABLED_KEY(user.uid)) === '1';
      const permission = await PushNotifications.checkPermissions();
      if (active && permission.receive === 'granted' && !disabled) {
        await preparePataNativePushChannel();
        await PushNotifications.register();
      }
    };

    setup().catch((error) => {
      console.warn('[PATA NATIVE PUSH INIT]', error?.message || error);
      window.dispatchEvent(new CustomEvent('pata:native-push-error', { detail: error?.message || 'Initialisation FCM impossible.' }));
    });

    return () => {
      active = false;
      listenerHandles.forEach((handle) => { void handle.remove().catch(() => {}); });
    };
  }, [user]);

  return null;
}

function NativeNotificationSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [nativeToken, setNativeToken] = useState('');
  const [message, setMessage] = useState('');
  const [serverStatus, setServerStatus] = useState(null);

  const refreshStatus = useCallback(async () => {
    if (!user) {
      setEnabled(false);
      setServerStatus(null);
      return;
    }
    const idToken = await user.getIdToken();
    const response = await fetch('/api/notifications/status', {
      headers: { Authorization: 'Bearer ' + idToken },
      cache: 'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de vérifier les notifications.');
    setServerStatus(result);
    const savedToken = localStorage.getItem(NATIVE_PUSH_TOKEN_KEY(user.uid)) || '';
    const disabled = localStorage.getItem(NATIVE_PUSH_DISABLED_KEY(user.uid)) === '1';
    setNativeToken(savedToken);
    setEnabled(Boolean(savedToken) && !disabled);
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    const onToken = (event) => {
      const token = typeof event.detail === 'string' ? event.detail : '';
      setNativeToken(token);
      setEnabled(Boolean(token));
      setMessage('Les notifications système de Pata sont activées sur cet appareil.');
      refreshStatus().catch((error) => setMessage(error.message || 'Statut indisponible.'));
    };
    const onError = (event) => setMessage(String(event.detail || 'Inscription aux notifications impossible.'));
    window.addEventListener('pata:native-push-token', onToken);
    window.addEventListener('pata:native-push-error', onError);
    refreshStatus().catch((error) => setMessage(error.message || 'Impossible de vérifier les notifications.'));
    return () => {
      window.removeEventListener('pata:native-push-token', onToken);
      window.removeEventListener('pata:native-push-error', onError);
    };
  }, [user, refreshStatus]);

  const subscribe = async () => {
    if (!user) return setMessage('Reconnecte-toi pour activer les notifications.');
    setLoading(true);
    setMessage('');
    try {
      let permission = await PushNotifications.checkPermissions();
      if (permission.receive !== 'granted') permission = await PushNotifications.requestPermissions();
      if (permission.receive !== 'granted') throw new Error('Autorisation refusée. Tu peux l’activer dans les paramètres Android.');
      localStorage.removeItem(NATIVE_PUSH_DISABLED_KEY(user.uid));
      await preparePataNativePushChannel();
      await PushNotifications.register();
      setMessage('Connexion au service de notifications en cours. Le jeton de cet appareil sera enregistré automatiquement.');
    } catch (error) {
      setMessage(error.message || 'Impossible d’activer les notifications.');
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    if (!user) return;
    setLoading(true);
    setMessage('');
    try {
      const token = nativeToken || localStorage.getItem(NATIVE_PUSH_TOKEN_KEY(user.uid)) || '';
      if (token) await postNativeToken('/api/notifications/unsubscribe', user, token);
      await PushNotifications.unregister();
      localStorage.setItem(NATIVE_PUSH_DISABLED_KEY(user.uid), '1');
      localStorage.removeItem(NATIVE_PUSH_TOKEN_KEY(user.uid));
      setNativeToken('');
      setEnabled(false);
      setMessage('Les notifications système sont désactivées sur cet appareil uniquement.');
      await refreshStatus();
    } catch (error) {
      setMessage(error.message || 'La désactivation des notifications a échoué.');
    } finally {
      setLoading(false);
    }
  };

  const sendTest = async () => {
    if (!user) return setMessage('Reconnecte-toi pour tester les notifications.');
    const token = nativeToken || localStorage.getItem(NATIVE_PUSH_TOKEN_KEY(user.uid)) || '';
    if (!token) return setMessage('Cet appareil n’est pas encore inscrit. Active les notifications puis réessaie.');
    setTesting(true);
    setMessage('Envoi du test système…');
    try {
      await postNativeToken('/api/notifications/test', user, token);
      setMessage('Firebase a accepté le test. Vérifie le centre de notifications Android.');
      await refreshStatus();
    } catch (error) {
      setMessage(error.message || 'Le test de notification a échoué.');
    } finally {
      setTesting(false);
    }
  };

  const deviceCount = Number(serverStatus?.deviceCount || 0);
  const webPushCount = Number(serverStatus?.webPushDeviceCount || 0);
  const fcmCount = Number(serverStatus?.fcmDeviceCount || 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant={enabled ? 'outline' : 'primary'} onClick={enabled ? unsubscribe : subscribe} disabled={loading || testing}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : enabled ? <BellOff size={15} /> : <Bell size={15} />}
          {loading ? 'Traitement…' : enabled ? 'Désactiver sur cet appareil' : 'Activer les notifications'}
        </Button>
        {enabled && <Button type="button" variant="outline" onClick={sendTest} disabled={testing || loading}>
          <Bell size={15}/>{testing ? 'Envoi…' : 'Tester'}
        </Button>}
      </div>
      {message && <p role="status" className="text-xs leading-5 text-slate-600">{message}</p>}
      {serverStatus && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold text-slate-700">{deviceCount} appareil(aux) inscrit(s) à ton compte</p>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">{webPushCount} PWA / Web Push · {fcmCount} appareil(aux) FCM</p>
          {serverStatus.lastPushAcceptedAt && <p className="mt-1 text-[10px] leading-4 text-slate-500">Dernier envoi accepté : {new Date(serverStatus.lastPushAcceptedAt).toLocaleString('fr-FR')}</p>}
          {serverStatus.lastPushErrorCode && <p className="mt-1 break-words text-[10px] leading-4 text-amber-700">Dernier problème : {serverStatus.lastPushErrorCode}</p>}
        </div>
      )}
      <p className="text-[11px] leading-5 text-slate-400">L’application Android utilise Firebase Cloud Messaging. Les notifications restent reçues en arrière-plan lorsque Pata est fermé, selon les autorisations et les réglages Android.</p>
    </div>
  );
}

export function NotificationSettings() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
    ? <NativeNotificationSettings />
    : <WebPushNotificationSettings />;
}
