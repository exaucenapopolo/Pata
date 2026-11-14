'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { Bell, CheckCircle2, MessageSquareText, ShieldCheck, Smartphone } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/context/LanguageContext';
import { PataSms } from '@/lib/sms/nativePlugin';
import { requestPataNotifications } from '@/components/NotificationSettings';
import { enablePataSmsImport } from '@/components/SmsImportSettings';

const notificationPromptKey = (uid, platform) => 'pata:first-permissions:notifications:v1:' + uid + ':' + platform;
const smsPromptKey = (uid) => 'pata:first-permissions:sms:v1:' + uid + ':android';

function safeGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeSet(key) {
  try { window.localStorage.setItem(key, 'done'); } catch { /* stockage local indisponible */ }
}

export function FirstAccessPermissions() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const router = useRouter();
  const isEnglish = language === 'en';
  const [open, setOpen] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [smsConfigured, setSmsConfigured] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSms, setShowSms] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [smsBusy, setSmsBusy] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [smsMessage, setSmsMessage] = useState('');

  useEffect(() => {
    if (!user?.uid) return undefined;
    let active = true;

    const inspectPermissions = async () => {
      const nativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
      const platform = nativeAndroid ? 'android' : 'web';
      const pushKey = notificationPromptKey(user.uid, platform);
      const smsKey = smsPromptKey(user.uid);
      const pushAlreadyPrompted = safeGet(pushKey) === 'done';
      const smsAlreadyPrompted = safeGet(smsKey) === 'done';

      let notificationsGranted = false;
      let canRequestNotifications = false;
      try {
        if (nativeAndroid) {
          const permission = await PushNotifications.checkPermissions();
          notificationsGranted = permission.receive === 'granted';
          canRequestNotifications = true;
        } else if (typeof window !== 'undefined' && 'Notification' in window) {
          notificationsGranted = Notification.permission === 'granted';
          canRequestNotifications = true;
        }
      } catch {
        notificationsGranted = false;
      }

      let premium = false;
      let smsStatus = null;
      let smsEnabled = false;
      if (nativeAndroid) {
        smsStatus = await PataSms.getStatus().catch(() => null);
        try {
          const token = await user.getIdToken();
          const response = await fetch('/api/sms-import', {
            headers: { Authorization: 'Bearer ' + token },
            cache: 'no-store',
          });
          const result = await response.json().catch(() => ({}));
          premium = response.ok && result.success && result.isPremium === true;
          smsEnabled = response.ok && result.success && result.enabled === true;
        } catch {
          premium = false;
        }
      }

      if (!active) return;
      const needsNotifications = canRequestNotifications && !pushAlreadyPrompted && !notificationsGranted;
      const needsSms = nativeAndroid && premium && !smsAlreadyPrompted
        && (smsStatus?.receiveSmsGranted !== true || smsEnabled !== true);
      setIsAndroid(nativeAndroid);
      setIsPremium(premium);
      setSmsConfigured(smsStatus?.receiveSmsGranted === true && smsEnabled);
      setShowNotifications(needsNotifications);
      setShowSms(needsSms);
      if (needsNotifications || needsSms) {
        setOpen(true);
      } else {
        if (notificationsGranted) safeSet(pushKey);
        if (nativeAndroid && premium && smsStatus?.receiveSmsGranted === true && smsEnabled) safeSet(smsKey);
      }
    };

    inspectPermissions().catch((error) => console.warn('[PATA FIRST ACCESS PERMISSIONS]', error?.message || error));
    return () => { active = false; };
  }, [user]);

  const finishOne = (kind) => {
    if (!user?.uid) return;
    if (kind === 'notifications') {
      const platform = isAndroid ? 'android' : 'web';
      safeSet(notificationPromptKey(user.uid, platform));
      setShowNotifications(false);
      setOpen(showSms);
    } else {
      safeSet(smsPromptKey(user.uid));
      setShowSms(false);
      setSmsConfigured(true);
      setOpen(showNotifications);
    }
  };

  const dismiss = () => {
    if (!user?.uid) return setOpen(false);
    const platform = isAndroid ? 'android' : 'web';
    if (showNotifications) safeSet(notificationPromptKey(user.uid, platform));
    if (showSms && isPremium) safeSet(smsPromptKey(user.uid));
    setOpen(false);
  };

  const activateNotifications = async () => {
    if (!user || notificationBusy) return;
    setNotificationBusy(true);
    setNotificationMessage('');
    try {
      await requestPataNotifications(user);
      setNotificationMessage(isEnglish
        ? 'Permission granted. Pata is registering this device for notifications.'
        : 'Autorisation accordée. Pata termine l’inscription de cet appareil.');
      finishOne('notifications');
    } catch (error) {
      setNotificationMessage(error?.message || (isEnglish
        ? 'Notifications could not be enabled. You can retry in Settings.'
        : 'Les notifications n’ont pas pu être activées. Tu peux réessayer dans les Paramètres.'));
    } finally {
      setNotificationBusy(false);
    }
  };

  const activateSms = async () => {
    if (!user || smsBusy) return;
    if (!isPremium) {
      dismiss();
      router.push('/premium');
      return;
    }
    setSmsBusy(true);
    setSmsMessage('');
    try {
      await enablePataSmsImport(user);
      setSmsMessage(isEnglish
        ? 'Mobile Money SMS detection is enabled on this Android device.'
        : 'La détection Mobile Money par SMS est activée sur cet appareil Android.');
      finishOne('sms');
    } catch (error) {
      setSmsMessage(error?.message || (isEnglish
        ? 'SMS detection could not be enabled. You can retry in Settings.'
        : 'La détection SMS n’a pas pu être activée. Tu peux réessayer dans les Paramètres.'));
    } finally {
      setSmsBusy(false);
    }
  };

  if (!user) return null;

  return (
    <Modal
      open={open}
      onClose={dismiss}
      title={isEnglish ? 'Set up Pata on this device' : 'Configure Pata sur cet appareil'}
      className="max-w-lg"
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-[#f3f8f5] p-3">
          <p className="text-sm font-semibold text-slate-900">
            {isEnglish ? 'A couple of permissions will make Pata more useful.' : 'Quelques autorisations aideront Pata à mieux t’accompagner.'}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {isEnglish
              ? 'Choose what you want to enable now. You can change these settings later from Pata Settings.'
              : 'Choisis ce que tu souhaites activer maintenant. Tu pourras modifier ces réglages plus tard dans les Paramètres de Pata.'}
          </p>
        </div>

        {showNotifications && (
          <section className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Bell size={19}/>
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-900">{isEnglish ? 'Pata notifications' : 'Notifications Pata'}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {isEnglish
                    ? 'Receive due-date reminders, important account updates and useful alerts directly on this device. Push delivery can reduce the need for email fallbacks.'
                    : 'Reçois directement sur cet appareil les rappels d’échéances, les informations importantes de ton compte et les alertes utiles. Les notifications Push peuvent limiter le recours aux e-mails de secours.'}
                </p>
                <button type="button" onClick={activateNotifications} disabled={notificationBusy}
                  className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#0b5c46] px-4 text-xs font-bold text-white disabled:opacity-60">
                  {notificationBusy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"/> : <Bell size={15}/>}
                  {notificationBusy ? (isEnglish ? 'Activating…' : 'Activation…') : (isEnglish ? 'Enable notifications' : 'Activer les notifications')}
                </button>
                {notificationMessage && <p role="status" className="mt-2 text-[11px] leading-5 text-slate-600">{notificationMessage}</p>}
              </div>
            </div>
          </section>
        )}

        {isAndroid && (
          <section className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <MessageSquareText size={19}/>
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-900">{isEnglish ? 'Mobile Money SMS detection' : 'Détection des SMS Mobile Money'}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {isEnglish
                    ? 'On Android, Pata can detect supported MTN MoMo and Orange Money confirmations as they arrive. The original SMS stays on your phone; only the information needed to prepare the transaction is processed.'
                    : 'Sur Android, Pata peut détecter les confirmations MTN MoMo et Orange Money compatibles dès leur réception. Le SMS original reste sur ton téléphone ; seules les informations nécessaires à la préparation de l’opération sont traitées.'}
                </p>
                {!isPremium ? (
                  <div className="mt-3">
                    <p className="text-[11px] leading-5 text-slate-500">
                      {isEnglish ? 'Automatic SMS detection is included with Pata Premium.' : 'La détection automatique des SMS est réservée à Pata Premium.'}
                    </p>
                    <button type="button" onClick={activateSms} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 px-4 text-xs font-bold text-emerald-800">
                      <Smartphone size={15}/>{isEnglish ? 'Discover Premium' : 'Découvrir Premium'}
                    </button>
                  </div>
                ) : showSms ? (
                  <>
                    <button type="button" onClick={activateSms} disabled={smsBusy}
                      className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#0b5c46] px-4 text-xs font-bold text-white disabled:opacity-60">
                      {smsBusy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"/> : <ShieldCheck size={15}/>}
                      {smsBusy ? (isEnglish ? 'Activating…' : 'Activation…') : (isEnglish ? 'Allow and enable SMS detection' : 'Autoriser et activer la détection SMS')}
                    </button>
                    {smsMessage && <p role="status" className="mt-2 text-[11px] leading-5 text-slate-600">{smsMessage}</p>}
                    <p className="mt-2 text-[10px] leading-4 text-slate-500">
                      {isEnglish
                        ? 'Android may restrict RECEIVE_SMS depending on how the APK was installed. If it is blocked, you can still share a message from your Messages app to Pata.'
                        : 'Android peut restreindre RECEIVE_SMS selon la source d’installation de l’APK. Si l’autorisation est bloquée, tu peux toujours partager un message depuis ton application Messages vers Pata.'}
                    </p>
                  </>
                ) : smsConfigured ? (
                  <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                    <CheckCircle2 size={14}/>{isEnglish ? 'SMS detection is configured.' : 'La détection SMS est configurée.'}
                  </p>
                ) : (
                  <p className="mt-3 text-[11px] leading-5 text-slate-500">
                    {isEnglish ? 'You can enable SMS detection later in Settings.' : 'Tu peux activer la détection SMS plus tard dans les Paramètres.'}
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <p className="text-[10px] leading-4 text-slate-400">
            {isEnglish
              ? 'Permissions are requested only after you choose an action. Your choice is remembered on this device.'
              : 'Les permissions sont demandées uniquement après ton choix. Ta décision est mémorisée sur cet appareil.'}
          </p>
          <button type="button" onClick={dismiss} className="min-h-10 rounded-xl px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100">
            {isEnglish ? 'Later' : 'Plus tard'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
