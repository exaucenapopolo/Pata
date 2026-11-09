'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Capacitor } from '@capacitor/core';
import { PataSms } from '@/lib/sms/nativePlugin';
import { BatteryCharging, CheckCircle2, MessageSquareText, ShieldCheck, Smartphone } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';

export function SmsImportSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [premium, setPremium] = useState(false);
  const [permission, setPermission] = useState(false);
  const [batteryExempt, setBatteryExempt] = useState(false);
  const [premiumUntil, setPremiumUntil] = useState(null);
  const [diagnostic, setDiagnostic] = useState(null);
  const [message, setMessage] = useState('');
  const isNative = Capacitor.isNativePlatform();

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/sms-import', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Paramètres SMS indisponibles.');
      setPremium(data.isPremium === true);
      setPremiumUntil(data.premiumUntil || null);
      setEnabled(data.enabled === true);
      if (isNative) {
        const status = await PataSms.getStatus();
        setPermission(status.receiveSmsGranted === true);
        setBatteryExempt(status.ignoringBatteryOptimizations === true);
        try { setDiagnostic(JSON.parse(status.lastSmsDiagnosticJson || '{}')); } catch { setDiagnostic(null); }
        let deviceToken = '';
        if (data.enabled === true && (status.hasDeviceToken !== true || (status.userUid && status.userUid !== user.uid))) {
          const tokenResponse = await fetch('/api/sms-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
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
        setEnabled(data.enabled === true && nativeConfig.enabled === true);
      }
    } catch (error) {
      setMessage(error.message || 'Impossible de charger les paramètres.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [user]);

  const toggle = async (nextEnabled) => {
    setMessage('');
    if (!isNative) {
      setMessage('L’import SMS automatique nécessite l’application Android Pata. La PWA continue de fonctionner normalement.');
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
          throw new Error(permissionResult.reason || 'Android n’a pas accordé RECEIVE_SMS. Vérifie l’autorisation dans les paramètres de l’application.');
        }
        try { await PataSms.requestNotificationPermission(); } catch { /* Notifications facultatives. */ }
      }
      const token = await user.getIdToken();
      const response = await fetch('/api/sms-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action: 'configure', enabled: nextEnabled }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Impossible de modifier ce réglage.');
      setEnabled(nextEnabled);
      setPremiumUntil(data.premiumUntil || premiumUntil);
      const nativeConfig = await PataSms.setConfiguration({
        enabled: nextEnabled,
        uid: user.uid,
        deviceToken: data.deviceToken || '',
        premiumUntilMillis: data.premiumUntil ? new Date(data.premiumUntil).getTime() : 0,
      });
      setEnabled(nextEnabled && nativeConfig.enabled === true);
      setMessage(nextEnabled && nativeConfig.enabled !== true
        ? 'Le réglage serveur est enregistré, mais Android n’a pas autorisé la réception automatique. Tu peux continuer à partager tes SMS avec Pata.'
        : nextEnabled
          ? 'Import automatique activé. Pata enregistrera les transactions reconnues même lorsque l’application est fermée, puis enverra une notification et un e-mail.'
          : 'Import SMS désactivé sur cet appareil.');
    } catch (error) {
      setMessage(error.message || 'Impossible d’activer l’import SMS.');
    } finally {
      setSaving(false);
      const status = await PataSms.getStatus().catch(() => null);
      if (status) {
        setPermission(status.receiveSmsGranted === true);
        setBatteryExempt(status.ignoringBatteryOptimizations === true);
        try { setDiagnostic(JSON.parse(status.lastSmsDiagnosticJson || '{}')); } catch { setDiagnostic(null); }
      }
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
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700"><MessageSquareText size={19}/></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-900">Import Mobile Money par SMS</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">Pata détecte localement les confirmations MTN MoMo et Orange Money. Le SMS brut, le numéro de l’expéditeur et le solde ne sont jamais envoyés au serveur.</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <div><p className="text-sm font-semibold text-slate-800">Import SMS automatique</p><p className="mt-0.5 text-[11px] text-slate-500">{enabled ? 'Activé' : 'Désactivé'} · réservé à Premium</p></div>
          <button type="button" role="switch" aria-checked={enabled} disabled={saving || !isNative || !premium}
            onClick={() => toggle(!enabled)}
            className={'relative h-7 w-12 shrink-0 rounded-full transition ' + (enabled ? 'bg-brand-700' : 'bg-slate-300') + ' disabled:cursor-not-allowed disabled:opacity-50'}>
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
        <div className="flex items-center gap-2 text-xs text-slate-700"><ShieldCheck size={15} className={permission ? 'text-emerald-700' : 'text-amber-700'}/><span>Autorisation RECEIVE_SMS : <strong>{permission ? 'accordée' : 'non accordée'}</strong></span></div>
        <div className="flex items-center gap-2 text-xs text-slate-700"><BatteryCharging size={15} className={batteryExempt ? 'text-emerald-700' : 'text-amber-700'}/><span>Optimisation batterie : <strong>{batteryExempt ? 'désactivée' : 'à vérifier'}</strong></span></div>
        {!batteryExempt && <div className="pt-1">
          <p className="text-[11px] leading-5 text-slate-500">Sur Tecno, Infinix et Xiaomi, les restrictions d’arrière-plan peuvent retarder la réception ou la notification. Autorise Pata à fonctionner sans restriction pour une meilleure fiabilité.</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={openBatterySettings}><Smartphone size={14}/> Régler la batterie</Button>
        </div>}
      </div>}

      {isNative && diagnostic && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold text-slate-800">Diagnostic de la dernière réception SMS</p>
        <p className="mt-1 text-[11px] text-slate-600">
          {diagnostic.receivedAt ? new Date(diagnostic.receivedAt).toLocaleString('fr-FR') : 'Aucun SMS reçu depuis cette installation'}
          {diagnostic.provider ? ' · ' + (diagnostic.provider === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money') : ''}
        </p>
        <p className="mt-1 text-[11px] leading-5 text-slate-600">{diagnostic.message || 'Les événements de réception seront affichés ici.'}</p>
        <p className="mt-1 text-[10px] text-slate-500">{Number(diagnostic.pendingCount || 0) > 0 ? diagnostic.pendingCount + ' SMS en attente de synchronisation.' : ''}</p>
        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={async () => { await PataSms.retryPendingSync().catch(() => {}); await refresh(); }}>Actualiser le diagnostic</Button>
      </div>}
      {message && <p role="status" className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-700">{message}</p>}
      {enabled && permission && <p className="flex items-center gap-2 text-xs font-medium text-emerald-800"><CheckCircle2 size={15}/> Détection locale active sur cet appareil.</p>}
      {premiumUntil && <p className="text-[10px] text-slate-400">Premium jusqu’au {new Date(premiumUntil).toLocaleDateString('fr-FR')}.</p>}
      <p className="text-[10px] leading-4 text-slate-400">Android peut limiter RECEIVE_SMS selon l’installateur et la version du système. En cas de permission indisponible, le partage manuel d’un SMS reste disponible.</p>
    </div>
  );
}
