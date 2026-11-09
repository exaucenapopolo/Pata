'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Capacitor } from '@capacitor/core';
import {
  BatteryCharging, Bell, CheckCircle2, Link2, MessageSquareText,
  RefreshCw, ShieldCheck, Smartphone,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { PataSms } from '@/lib/sms/nativePlugin';
import { Button } from '@/components/ui/Button';

const DIAGNOSTIC_LABELS = {
  permission_missing: 'Réception SMS bloquée : permission manquante',
  disabled: 'Détection automatique désactivée',
  premium_expired: 'Abonnement Premium expiré',
  sms_read_error: 'Android n’a pas pu lire le SMS reçu',
  unrecognized: 'SMS reçu, mais format non reconnu',
  duplicate: 'SMS déjà présent dans la file locale',
  account_link_required: 'SMS reconnu : appareil à relier au compte',
  recognized_waiting_sync: 'SMS reconnu : synchronisation programmée',
  sync_credentials_missing: 'Identifiants de synchronisation manquants',
  registered: 'Transaction enregistrée dans Pata',
  already_registered: 'Transaction déjà enregistrée : aucun doublon créé',
  awaiting_review: 'Retrait détecté : en attente de ta classification',
  server_rejected: 'Le serveur a refusé cet import',
  network_retry: 'Connexion indisponible : nouvelle tentative prévue',
};

function readDiagnostic(raw) {
  try {
    const value = JSON.parse(raw || '{}');
    return value && typeof value === 'object' && value.status ? value : null;
  } catch {
    return null;
  }
}

export function SmsImportSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [serverEnabled, setServerEnabled] = useState(false);
  const [premium, setPremium] = useState(false);
  const [permission, setPermission] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(false);
  const [batteryExempt, setBatteryExempt] = useState(false);
  const [deviceLinked, setDeviceLinked] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [premiumUntil, setPremiumUntil] = useState(null);
  const [diagnostic, setDiagnostic] = useState(null);
  const [message, setMessage] = useState('');
  const isNative = Capacitor.isNativePlatform();

  const applyNativeStatus = (status) => {
    if (!status) return;
    setPermission(status.receiveSmsGranted === true);
    setNotificationPermission(status.notificationsGranted === true);
    setBatteryExempt(status.ignoringBatteryOptimizations === true);
    setPendingCount(Math.max(0, Number(status.pendingCount) || 0));
    setDiagnostic(readDiagnostic(status.lastSmsDiagnosticJson));
  };

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    setMessage('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/sms-import', {
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Paramètres SMS indisponibles.');
      }

      setPremium(data.isPremium === true);
      setPremiumUntil(data.premiumUntil || null);
      setServerEnabled(data.enabled === true);

      if (!isNative) {
        setEnabled(data.enabled === true);
        setDeviceLinked(false);
        setPendingCount(0);
        setDiagnostic(null);
        return;
      }

      let status = await PataSms.getStatus();
      applyNativeStatus(status);
      const currentDiagnostic = readDiagnostic(status.lastSmsDiagnosticJson);
      const tokenWasRejected = currentDiagnostic?.status === 'server_rejected'
        && /cet appareil n'est plus autorise/i.test(String(currentDiagnostic.message || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

      // Un jeton peut être présent localement tout en ayant été révoqué côté serveur.
      // Dans ce cas, on en demande un nouveau puis on le remplace sur cet appareil.
      const needsDeviceLink = data.enabled === true && (
        status.hasDeviceToken !== true
        || status.userUid !== user.uid
        || tokenWasRejected
      );

      let deviceToken = '';
      if (needsDeviceLink) {
        const tokenResponse = await fetch('/api/sms-import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
          },
          body: JSON.stringify({ action: 'device-token' }),
        });
        const tokenData = await tokenResponse.json().catch(() => ({}));
        if (!tokenResponse.ok || !tokenData.success || !tokenData.deviceToken) {
          throw new Error(tokenData.error || 'Impossible de relier cet appareil à la synchronisation automatique.');
        }
        deviceToken = tokenData.deviceToken;
      }

      const nativeConfig = await PataSms.setConfiguration({
        enabled: data.enabled === true,
        uid: user.uid,
        deviceToken,
        premiumUntilMillis: data.premiumUntil ? new Date(data.premiumUntil).getTime() : 0,
      });

      if (data.enabled === true && nativeConfig.enabled === true) {
        await PataSms.retryPendingSync().catch(() => {});
      }

      status = await PataSms.getStatus();
      applyNativeStatus(status);
      const isLinked = data.enabled === true
        && nativeConfig.enabled === true
        && status.userUid === user.uid
        && status.hasDeviceToken === true;
      setDeviceLinked(isLinked);
      setEnabled(data.enabled === true && nativeConfig.enabled === true);

      if (data.enabled === true && !nativeConfig.enabled) {
        setMessage(!status.receiveSmsGranted
          ? 'L’option est activée sur ton compte, mais Android n’accorde pas la permission de lecture des SMS. Le partage manuel reste disponible.'
          : 'L’option est activée sur ton compte, mais cet appareil n’est pas encore correctement relié. Actualise les paramètres pour réessayer.');
      }
    } catch (error) {
      setMessage(error.message || 'Impossible de charger les paramètres SMS.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // Le compte actif détermine le jeton local et le rattachement de l'appareil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const toggle = async (nextEnabled) => {
    setMessage('');
    if (!isNative) {
      setMessage('L’import SMS automatique nécessite l’application Android Pata. La PWA reste disponible.');
      return;
    }
    if (nextEnabled && !premium) {
      setMessage('Cette fonction est réservée à Pata Premium, à 2 500 FCFA par mois.');
      return;
    }

    setSaving(true);
    try {
      if (nextEnabled) {
        const permissionResult = await PataSms.requestSmsPermission();
        setPermission(permissionResult.granted === true);
        if (!permissionResult.granted) {
          throw new Error(permissionResult.reason || 'Android n’a pas accordé RECEIVE_SMS. Vérifie les autorisations de l’application.');
        }
        // Les notifications système sont facultatives : leur refus ne bloque pas l’import.
        try {
          await PataSms.requestNotificationPermission();
        } catch {
          // La permission pourra être accordée plus tard dans les paramètres Android.
        }
      }

      const token = await user.getIdToken();
      const response = await fetch('/api/sms-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ action: 'configure', enabled: nextEnabled }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Impossible de modifier ce réglage.');
      }

      setServerEnabled(nextEnabled);
      setPremiumUntil(data.premiumUntil || premiumUntil);
      const nativeConfig = await PataSms.setConfiguration({
        enabled: nextEnabled,
        uid: user.uid,
        deviceToken: data.deviceToken || '',
        premiumUntilMillis: data.premiumUntil ? new Date(data.premiumUntil).getTime() : 0,
      });

      const status = await PataSms.getStatus();
      applyNativeStatus(status);
      const isLinked = nextEnabled
        && nativeConfig.enabled === true
        && status.userUid === user.uid
        && status.hasDeviceToken === true;
      setDeviceLinked(isLinked);
      setEnabled(nextEnabled && nativeConfig.enabled === true);

      if (nextEnabled && nativeConfig.enabled !== true) {
        setMessage(!status.receiveSmsGranted
          ? 'Le compte est activé, mais Android bloque encore la permission SMS. Le partage manuel reste disponible.'
          : 'Le compte est activé, mais le rattachement de cet appareil n’est pas terminé. Appuie sur « Actualiser les paramètres ».');
      } else if (nextEnabled) {
        setMessage('Détection automatique activée. Pata analyse localement les SMS reconnus et synchronise les opérations quand une connexion est disponible.');
      } else {
        setMessage('Import SMS désactivé. Les nouveaux SMS ne seront plus traités automatiquement.');
      }
    } catch (error) {
      setMessage(error.message || 'Impossible de modifier l’import SMS.');
    } finally {
      setSaving(false);
      const status = await PataSms.getStatus().catch(() => null);
      if (status) applyNativeStatus(status);
    }
  };

  const retryPending = async () => {
    if (!isNative) return;
    setRetrying(true);
    setMessage('');
    try {
      const result = await PataSms.retryPendingSync();
      const scheduled = Math.max(0, Number(result.scheduled) || 0);
      const status = await PataSms.getStatus();
      applyNativeStatus(status);
      if (scheduled > 0) {
        setMessage(scheduled + ' SMS en attente remis à la synchronisation. Le traitement continue en arrière-plan ; actualise le diagnostic pour vérifier le résultat.');
      } else if (!enabled || !deviceLinked) {
        setMessage('Aucune synchronisation ne peut démarrer : active l’import et vérifie que cet appareil est relié au compte.');
      } else {
        setMessage('Aucun SMS local en attente de synchronisation sur cet appareil.');
      }
    } catch (error) {
      setMessage(error.message || 'Impossible de relancer la synchronisation.');
    } finally {
      setRetrying(false);
    }
  };

  const openBatterySettings = async () => {
    try {
      await PataSms.openBatterySettings();
      setMessage('Dans les réglages Android, choisis Pata puis autorise son activité en arrière-plan ou sélectionne « Sans restriction » lorsque cette option existe.');
    } catch {
      setMessage('Ouvre les paramètres Batterie du téléphone et retire Pata de l’optimisation de batterie.');
    }
  };

  if (loading) return <p className="text-xs text-slate-500">Chargement des paramètres d’import…</p>;

  const diagnosticLabel = diagnostic
    ? (DIAGNOSTIC_LABELS[diagnostic.status] || 'Événement de réception SMS')
    : 'Aucun SMS analysé depuis cette installation.';

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700">
            <MessageSquareText size={19}/>
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-900">Import Mobile Money par SMS</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Pata analyse les confirmations MTN MoMo et Orange Money sur le téléphone.
              Le SMS brut, le numéro de l’expéditeur et le solde ne sont pas envoyés au serveur.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Import SMS automatique</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {enabled ? 'Actif sur cet appareil' : serverEnabled ? 'Activé sur le compte, appareil à vérifier' : 'Désactivé'}
              {' · réservé à Premium'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={saving || !isNative || !premium}
            onClick={() => toggle(!enabled)}
            className={'relative h-7 w-12 shrink-0 rounded-full transition ' + (enabled ? 'bg-brand-700' : 'bg-slate-300') + ' disabled:cursor-not-allowed disabled:opacity-50'}
          >
            <span className={'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ' + (enabled ? 'left-6' : 'left-1')}/>
          </button>
        </div>
      </div>

      {!isNative && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs font-semibold text-amber-900">Application Android requise</p>
        <p className="mt-1 text-xs leading-5 text-amber-800">La PWA reste disponible. Installe l’APK Pata pour activer le récepteur SMS et le partage Android.</p>
        <Link href="/telecharger" className="mt-2 inline-flex text-xs font-bold text-brand-800 underline underline-offset-2">Voir le téléchargement Android</Link>
      </div>}

      {!premium && <div className="rounded-xl border border-slate-200 p-3">
        <p className="text-xs font-semibold text-slate-900">Fonctionnalité Pata Premium</p>
        <p className="mt-1 text-xs leading-5 text-slate-600">L’import automatique SMS est inclus dans l’abonnement à 2 500 FCFA par mois.</p>
        <Link href="/premium" className="mt-2 inline-flex text-xs font-bold text-brand-800 underline underline-offset-2">Découvrir Premium</Link>
      </div>}

      {isNative && <div className="space-y-2 rounded-xl border border-slate-200 p-3">
        <div className="flex items-center gap-2 text-xs text-slate-700">
          <ShieldCheck size={15} className={permission ? 'text-emerald-700' : 'text-amber-700'}/>
          <span>Autorisation de lecture SMS : <strong>{permission ? 'accordée' : 'non accordée'}</strong></span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-700">
          <Bell size={15} className={notificationPermission ? 'text-emerald-700' : 'text-amber-700'}/>
          <span>Notifications Android : <strong>{notificationPermission ? 'autorisées' : 'non autorisées'}</strong></span>
        </div>
        <p className="pl-6 text-[10px] leading-4 text-slate-500">
          Les notifications sont facultatives. Leur refus n’empêche pas l’enregistrement des opérations dans Pata.
        </p>
        <div className="flex items-center gap-2 text-xs text-slate-700">
          <BatteryCharging size={15} className={batteryExempt ? 'text-emerald-700' : 'text-amber-700'}/>
          <span>Optimisation batterie : <strong>{batteryExempt ? 'Pata sans restriction' : 'à vérifier'}</strong></span>
        </div>
        {!batteryExempt && <div className="pt-1">
          <p className="text-[11px] leading-5 text-slate-500">
            Sur Tecno, Infinix et Xiaomi, les restrictions d’arrière-plan peuvent retarder la réception ou la notification.
            Autorise Pata à fonctionner sans restriction pour une meilleure fiabilité.
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={openBatterySettings}>
            <Smartphone size={14}/> Régler la batterie
          </Button>
        </div>}
        <div className="flex items-center gap-2 text-xs text-slate-700">
          <Link2 size={15} className={deviceLinked ? 'text-emerald-700' : 'text-amber-700'}/>
          <span>Rattachement au compte : <strong>{deviceLinked ? 'appareil relié' : serverEnabled ? 'à terminer' : 'non actif'}</strong></span>
        </div>
      </div>}

      {isNative && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-slate-800">Diagnostic de la réception SMS</p>
          <span className="text-[10px] tabular-nums text-slate-500">{pendingCount} en attente</span>
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-800">{diagnosticLabel}</p>
        <p className="mt-1 text-[11px] text-slate-600">
          {diagnostic?.receivedAt
            ? new Date(diagnostic.receivedAt).toLocaleString('fr-FR')
            : 'Aucun événement SMS enregistré depuis cette installation'}
          {diagnostic?.provider
            ? ' · ' + (diagnostic.provider === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money')
            : ''}
        </p>
        {diagnostic?.message && <p className="mt-1 text-[11px] leading-5 text-slate-600">{diagnostic.message}</p>}
        {pendingCount > 0 && <p className="mt-1 text-[11px] leading-5 text-slate-600">
          Ces éléments sont conservés sur le téléphone jusqu’à ce que le serveur les accepte.
        </p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={retrying || saving || !enabled || !deviceLinked} onClick={retryPending}>
            <RefreshCw size={14}/> {retrying ? 'Programmation…' : 'Relancer la synchronisation'}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={saving || retrying} onClick={refresh}>
            Actualiser les paramètres
          </Button>
        </div>
      </div>}

      {message && <p role="status" className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-700">{message}</p>}
      {enabled && permission && deviceLinked && <p className="flex items-center gap-2 text-xs font-medium text-emerald-800">
        <CheckCircle2 size={15}/> Détection locale active et appareil relié au compte.
      </p>}
      {premiumUntil && <p className="text-[10px] text-slate-400">Premium jusqu’au {new Date(premiumUntil).toLocaleDateString('fr-FR')}.</p>}
      <p className="text-[10px] leading-4 text-slate-400">
        Android peut limiter RECEIVE_SMS selon l’installateur et la version du système. En cas de permission indisponible,
        le partage manuel d’un SMS reste disponible.
      </p>
    </div>
  );
}
