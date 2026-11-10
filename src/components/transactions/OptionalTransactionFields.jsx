'use client';

import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { ChevronDown, Clock3, ExternalLink, LocateFixed, MapPin } from 'lucide-react';

const PAYMENT_METHODS = [
  { value: '', label: 'Non précisé' },
  { value: 'cash', label: 'Espèces' },
  { value: 'mtn_momo', label: 'MTN Mobile Money' },
  { value: 'orange_money', label: 'Orange Money' },
  { value: 'bank_transfer', label: 'Virement bancaire' },
  { value: 'card', label: 'Carte bancaire' },
  { value: 'other', label: 'Autre moyen' },
];

function clearLocationWatch(watchId, timeoutId) {
  if (watchId != null && typeof navigator !== 'undefined' && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
  }
  if (timeoutId != null) window.clearTimeout(timeoutId);
}

export function OptionalTransactionFields({ value, onChange, kind = 'expense' }) {
  const [expanded, setExpanded] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const watchRef = useRef(null);
  const timeoutRef = useRef(null);
  const finishedRef = useRef(false);
  const isIncome = kind === 'income';
  const update = (patch) => onChange({ ...value, ...patch });

  useEffect(() => () => {
    finishedRef.current = true;
    clearLocationWatch(watchRef.current, timeoutRef.current);
    watchRef.current = null;
    timeoutRef.current = null;
  }, []);

  const finishLocation = async (position, message) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const coords = position && position.coords;
    if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return;
    clearLocationWatch(watchRef.current, timeoutRef.current);
    watchRef.current = null;
    timeoutRef.current = null;
    const latitude = Number(coords.latitude.toFixed(6));
    const longitude = Number(coords.longitude.toFixed(6));
    const accuracy = Math.max(0, Math.round(Number(coords.accuracy) || 0));
    let locationLabel = '';
    try {
      const query = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        localityLanguage: 'fr',
      });
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 6500);
      try {
        const response = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?' + query.toString(), {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (response.ok) {
          const place = await response.json();
          const parts = [
            place.locality,
            place.city,
            place.principalSubdivision,
            place.countryName,
          ].filter((part, index, all) => part && all.indexOf(part) === index);
          locationLabel = parts.slice(0, 3).join(', ');
        }
      } finally {
        window.clearTimeout(timeout);
      }
    } catch (error) {
      console.warn('[PATA LOCATION LABEL]', error?.message || error);
    }
    if (!locationLabel) {
      locationLabel = accuracy > 2500 ? 'Position approximative' : 'Position géographique';
    }
    update({
      latitude,
      longitude,
      locationLabel,
      locationAccuracy: accuracy || null,
    });
    setLocationMessage(message || (accuracy > 2500
      ? 'Position enregistrée avec une précision approximative. Le nom du lieu sera affiché si le service de localisation le reconnaît.'
      : 'Lieu détecté et enregistré.'));
    setLocating(false);
  };

  const detectLocation = async () => {
    // Dans l'APK, la permission doit être demandée par Android/Capacitor.
    // La PWA conserve le parcours navigateur existant ci-dessous.
    if (Capacitor.isNativePlatform()) {
      clearLocationWatch(watchRef.current, timeoutRef.current);
      watchRef.current = null;
      timeoutRef.current = null;
      finishedRef.current = false;
      setLocating(true);
      setLocationMessage('Vérification de l’autorisation de localisation…');
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        let permission = await Geolocation.checkPermissions();
        if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
          setLocationMessage('Autorise Pata à accéder à ta position dans la fenêtre Android.');
          permission = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
        }
        if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
          throw new Error('Accès à la localisation refusé. Autorise la position pour Pata dans les paramètres Android, puis réessaie.');
        }
        setLocationMessage('Autorisation accordée. Recherche de ta position GPS…');
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 60000,
          maximumAge: 120000,
        });
        await finishLocation({ coords: position.coords });
      } catch (error) {
        setLocating(false);
        const message = String(error?.message || '');
        if (/location services|disabled|OS-PLUG-GLOC-0007/i.test(message)) {
          setLocationMessage('La localisation du téléphone est désactivée. Active-la dans les réglages rapides Android, puis réessaie.');
        } else if (/permission|denied|OS-PLUG-GLOC-0003|OS-PLUG-GLOC-0018/i.test(message)) {
          setLocationMessage('Accès à la position refusé. Ouvre les paramètres Android > Applications > Pata > Autorisations > Position, autorise l’accès, puis réessaie.');
        } else {
          setLocationMessage('La position n’a pas pu être obtenue. Vérifie que le GPS est activé et réessaie dans quelques instants.');
        }
        console.warn('[PATA NATIVE LOCATION]', error?.message || error);
      }
      return;
    }

  const detectLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationMessage('La localisation GPS n’est pas prise en charge par ce navigateur.');
      return;
    }
    if (!window.isSecureContext) {
      setLocationMessage('La détection GPS nécessite une connexion sécurisée HTTPS. Ouvre Pata depuis son adresse sécurisée.');
      return;
    }

    clearLocationWatch(watchRef.current, timeoutRef.current);
    watchRef.current = null;
    timeoutRef.current = null;
    finishedRef.current = false;
    setLocating(true);
    setLocationMessage('Recherche de ta position GPS… Garde la fenêtre ouverte quelques instants.');

    let bestPosition = null;
    let bestAccuracy = Infinity;
    let permissionDenied = false;

    try {
      watchRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const accuracy = Number(position.coords?.accuracy);
          if (Number.isFinite(accuracy) && accuracy < bestAccuracy) {
            bestPosition = position;
            bestAccuracy = accuracy;
          }

          // A usable network/GPS fix is accepted immediately. If the first fix is
          // coarse, keep listening for a more precise GPS result.
          if (bestPosition && bestAccuracy <= 1500) {
            finishLocation(bestPosition);
          } else if (bestPosition) {
            setLocationMessage('Position trouvée. Pata cherche une précision GPS meilleure…');
          }
        },
        (error) => {
          if (error.code === 1) {
            finishedRef.current = true;
            permissionDenied = true;
            clearLocationWatch(watchRef.current, timeoutRef.current);
            watchRef.current = null;
            timeoutRef.current = null;
            setLocating(false);
            setLocationMessage('Accès à la position refusé. Autorise la localisation pour Pata dans les réglages du navigateur ou du téléphone, puis réessaie.');
            return;
          }
          if (error.code === 2 && !bestPosition) {
            setLocationMessage('Le téléphone ne reçoit pas encore de position. Active le GPS et vérifie que la localisation est autorisée pour Pata.');
          } else if (error.code === 3 && !bestPosition) {
            setLocationMessage('Le GPS cherche encore un signal. Laisse la recherche se terminer ou rapproche-toi d’un endroit dégagé.');
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 60000,
          maximumAge: 120000,
        }
      );

      timeoutRef.current = window.setTimeout(() => {
        if (bestPosition) {
          finishLocation(bestPosition, bestAccuracy > 2500
            ? 'Position GPS enregistrée avec la meilleure précision disponible. Pour une position plus précise, active le GPS haute précision et réessaie à l’extérieur.'
            : 'Position GPS détectée et enregistrée.');
        } else if (!permissionDenied && !finishedRef.current) {
          finishedRef.current = true;
          clearLocationWatch(watchRef.current, timeoutRef.current);
          watchRef.current = null;
          timeoutRef.current = null;
          setLocating(false);
          setLocationMessage('Aucune position n’a pu être obtenue. Vérifie que le GPS du téléphone est activé et que Pata est autorisé à accéder à la localisation, puis réessaie.');
        }
      }, 45000);
    } catch (error) {
      clearLocationWatch(watchRef.current, timeoutRef.current);
      watchRef.current = null;
      timeoutRef.current = null;
      setLocating(false);
      setLocationMessage('Impossible de démarrer le GPS. Vérifie les autorisations de localisation de ton appareil.');
    }
  };

  const clearLocation = () => {
    finishedRef.current = true;
    clearLocationWatch(watchRef.current, timeoutRef.current);
    watchRef.current = null;
    timeoutRef.current = null;
    setLocating(false);
    update({ latitude: null, longitude: null, locationLabel: '', locationAccuracy: null });
    setLocationMessage('Position supprimée de cette opération.');
  };

  const mapUrl = value.latitude != null && value.longitude != null
    ? 'https://www.google.com/maps?q=' + encodeURIComponent(value.latitude + ',' + value.longitude)
    : '';

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80">
      <button type="button" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded} className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-3 text-left">
        <span>
          <strong className="block text-sm font-semibold text-slate-800">Informations complémentaires</strong>
          <span className="mt-0.5 block text-xs text-slate-500">Facultatif : heure, lieu GPS, moyen de paiement…</span>
        </span>
        <ChevronDown size={18} className={'shrink-0 text-slate-500 transition-transform ' + (expanded ? 'rotate-180' : '')} />
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-slate-200 px-3 pb-3 pt-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-600">
              <span className="mb-1.5 flex items-center gap-1.5"><Clock3 size={13}/> Heure</span>
              <input type="time" value={value.time || ''} onChange={(event) => update({ time: event.target.value })} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"/>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              <span className="mb-1.5 block">Moyen de paiement</span>
              <select value={value.paymentMethod || ''} onChange={(event) => update({ paymentMethod: event.target.value })} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                {PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
              </select>
            </label>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><MapPin size={18}/></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">Lieu de {isIncome ? 'réception' : 'la dépense'}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">Pata peut enregistrer la position actuelle de ton téléphone. La demande n’est faite que lorsque tu appuies sur le bouton.</p>
              </div>
            </div>
            <button type="button" onClick={detectLocation} disabled={locating} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-3 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:cursor-wait disabled:opacity-60">
              <LocateFixed size={15} className={locating ? 'animate-pulse' : ''}/>
              {locating ? 'Recherche GPS en cours…' : value.latitude != null ? 'Actualiser ma position' : 'Détecter automatiquement ma position'}
            </button>
            {value.latitude != null && value.longitude != null && (
              <div className="mt-3 rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-800">{value.locationLabel || 'Position géographique enregistrée'}</p>
                <p className="mt-1 text-[11px] text-slate-500">{Number(value.latitude).toFixed(5)}, {Number(value.longitude).toFixed(5)}{value.locationAccuracy ? ' · précision ±' + value.locationAccuracy + ' m' : ''}</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700"><ExternalLink size={13}/> Voir sur la carte</a>
                  <button type="button" onClick={clearLocation} className="text-xs font-medium text-slate-500 underline underline-offset-2">Retirer</button>
                </div>
              </div>
            )}
            {locationMessage && <p role="status" aria-live="polite" className="mt-2 text-[11px] leading-5 text-slate-500">{locationMessage}</p>}
            <p className="mt-2 text-[10px] leading-4 text-slate-400">Aucun suivi en arrière-plan. La position GPS n’est ajoutée à cette opération que si tu la demandes.</p>
          </div>

          <label className="block text-xs font-semibold text-slate-600">
            {isIncome ? 'Client, mission ou activité (facultatif)' : 'Commerce ou bénéficiaire (facultatif)'}
            <input type="text" maxLength={160} value={value.details || ''} onChange={(event) => update({ details: event.target.value })} placeholder={isIncome ? 'Ex. client, prestation, vente…' : 'Ex. nom du commerce, destinataire…'} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"/>
          </label>
        </div>
      )}
    </section>
  );
}
