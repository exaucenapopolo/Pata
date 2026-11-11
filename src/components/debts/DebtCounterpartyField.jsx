'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Search, UserRound } from 'lucide-react';
import { searchDebtCounterparties } from '@/lib/firestore/debts';
import { Capacitor } from '@capacitor/core';
import { PataSms } from '@/lib/sms/nativePlugin';

export function DebtCounterpartyField({
  value,
  selectedUid = '',
  label,
  onNameChange,
  onSelect,
  onContactSelect,
}) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState('');
  const timerRef = useRef(null);
  const requestRef = useRef(0);

  const pickContact = async () => {
    setContactLoading(true);
    setContactError('');
    try {
      const result = await PataSms.pickContact();
      if (result?.cancelled) return;
      const displayName = String(result?.displayName || '').trim();
      const phone = String(result?.phone || '').trim();
      if (!displayName && !phone) throw new Error('Le contact sélectionné ne contient ni nom ni numéro.');
      const name = displayName || phone;
      onNameChange(name);
      onContactSelect?.({ displayName: name, phone });
      setResults([]);
      setSearched(false);
    } catch (error) {
      setContactError(error?.message || 'Impossible de choisir ce contact.');
    } finally {
      setContactLoading(false);
    }
  };

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const sequence = ++requestRef.current;
    const query = String(value || '').trim();
    if (selectedUid || query.length < 3) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      setSearchError('');
      return undefined;
    }
    timerRef.current = window.setTimeout(async () => {
      setLoading(true);
      setSearchError('');
      try {
        const rows = await searchDebtCounterparties(query);
        if (sequence !== requestRef.current) return;
        setResults(rows);
        setSearched(true);
      } catch (error) {
        if (sequence !== requestRef.current) return;
        setSearchError(error.message || 'Recherche momentanément indisponible.');
        setResults([]);
        setSearched(true);
      } finally {
        if (sequence === requestRef.current) setLoading(false);
      }
    }, 350);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [value, selectedUid]);

  return (
    <div className="relative min-w-0">
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          required
          maxLength={100}
          autoComplete="off"
          value={value || ''}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Saisis le nom de la personne…"
          className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        {loading && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
      </div>
      {Capacitor.getPlatform() === 'android' && !selectedUid && (
        <div className="mt-2">
          <button type="button" onClick={pickContact} disabled={contactLoading} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">
            {contactLoading ? <Loader2 size={14} className="animate-spin"/> : <UserRound size={14}/>}
            {contactLoading ? 'Ouverture des contacts…' : 'Choisir dans mes contacts'}
          </button>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">Tu choisis un seul contact dans le sélecteur du téléphone. Pata ne parcourt pas ton carnet d’adresses.</p>
        </div>
      )}
      {contactError && <p role="status" className="mt-1.5 text-[11px] text-amber-700">{contactError}</p>}

      {selectedUid ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
          <Check size={13} /> Compte Pata reconnu. Une demande de confirmation lui sera envoyée.
        </p>
      ) : (
        <>
          {String(value || '').trim().length > 0 && String(value || '').trim().length < 3 && (
            <p className="mt-1.5 text-[11px] text-slate-400">Entre au moins 3 caractères pour rechercher un compte Pata.</p>
          )}
          {searched && !loading && !searchError && results.length === 0 && (
            <p className="mt-1.5 text-[11px] text-slate-500">Aucun compte Pata correspondant. Tu peux continuer avec ce nom, sans liaison automatique.</p>
          )}
          {searchError && <p role="status" className="mt-1.5 text-[11px] text-amber-700">Recherche indisponible : tu peux quand même saisir le nom manuellement.</p>}
          {results.length > 0 && (
            <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
              {results.map((account) => (
                <button
                  key={account.uid}
                  type="button"
                  onClick={() => {
                    onSelect(account);
                    setResults([]);
                    setSearched(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-emerald-50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><UserRound size={15}/></span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{account.displayName}</span>
                  <span className="shrink-0 text-[10px] font-medium text-emerald-700">Compte Pata</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
