'use client';

import { useState } from 'react';
import { ChevronDown, Clock3, LocateFixed, MapPin } from 'lucide-react';

const PAYMENT_METHODS = [
  { value: '', label: 'Non précisé' },
  { value: 'cash', label: 'Espèces' },
  { value: 'mtn_momo', label: 'MTN Mobile Money' },
  { value: 'orange_money', label: 'Orange Money' },
  { value: 'bank_transfer', label: 'Virement bancaire' },
  { value: 'card', label: 'Carte bancaire' },
  { value: 'other', label: 'Autre moyen' },
];

export function OptionalTransactionFields({ value, onChange, kind = 'expense' }) {
  const [expanded, setExpanded] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const isIncome = kind === 'income';
  const update = (patch) => onChange({ ...value, ...patch });

  const detectLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationMessage('La localisation n’est pas disponible sur cet appareil.');
      return;
    }
    setLocating(true);
    setLocationMessage('Recherche de ta position…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        update({
          latitude: Number(coords.latitude.toFixed(6)),
          longitude: Number(coords.longitude.toFixed(6)),
          locationLabel: value.locationLabel || 'Position GPS',
          locationAccuracy: Math.round(coords.accuracy || 0),
        });
        setLocationMessage('Position enregistrée. Tu peux aussi préciser le nom du lieu.');
        setLocating(false);
      },
      (error) => {
        const message = error.code === 1
          ? 'Autorisation refusée. Tu peux tout de même saisir le lieu manuellement.'
          : error.code === 3
            ? 'La recherche a expiré. Réessaie ou saisis le lieu manuellement.'
            : 'Position indisponible. Vérifie le GPS ou saisis le lieu manuellement.';
        setLocationMessage(message);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80">
      <button type="button" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded} className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-3 text-left">
        <span><strong className="block text-sm font-semibold text-slate-800">Informations complémentaires</strong><span className="mt-0.5 block text-xs text-slate-500">Facultatif : heure, lieu, moyen de paiement…</span></span>
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
          <label className="block text-xs font-semibold text-slate-600">
            <span className="mb-1.5 flex items-center gap-1.5"><MapPin size={13}/> Lieu {isIncome ? 'de réception' : 'de la dépense'}</span>
            <input type="text" maxLength={160} value={value.locationLabel || ''} onChange={(event) => update({ locationLabel: event.target.value })} placeholder={isIncome ? 'Ex. bureau, client, agence…' : 'Ex. marché, boutique, quartier…'} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"/>
          </label>
          <button type="button" onClick={detectLocation} disabled={locating} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-3 text-xs font-semibold text-brand-800 transition hover:bg-brand-50 disabled:opacity-60 sm:w-auto">
            <LocateFixed size={15} className={locating ? 'animate-pulse' : ''}/>{locating ? 'Localisation…' : value.latitude != null ? 'Actualiser ma position' : 'Détecter ma position'}
          </button>
          {value.latitude != null && value.longitude != null && <p className="rounded-lg bg-white px-3 py-2 text-[11px] leading-5 text-slate-500">Coordonnées enregistrées : {Number(value.latitude).toFixed(5)}, {Number(value.longitude).toFixed(5)}{value.locationAccuracy ? ' · précision estimée ' + value.locationAccuracy + ' m' : ''}</p>}
          {locationMessage && <p role="status" className="text-[11px] leading-5 text-slate-500">{locationMessage}</p>}
          <label className="block text-xs font-semibold text-slate-600">
            {isIncome ? 'Client, mission ou activité (facultatif)' : 'Commerce ou bénéficiaire (facultatif)'}
            <input type="text" maxLength={160} value={value.details || ''} onChange={(event) => update({ details: event.target.value })} placeholder={isIncome ? 'Ex. client, prestation, vente…' : 'Ex. nom du commerce, destinataire…'} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"/>
          </label>
          <p className="text-[10px] leading-4 text-slate-400">La localisation est demandée uniquement lorsque tu appuies sur le bouton. Elle reste facultative.</p>
        </div>
      )}
    </section>
  );
}
