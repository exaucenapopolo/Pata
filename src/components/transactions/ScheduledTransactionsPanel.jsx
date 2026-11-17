'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, RefreshCw, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/context/LanguageContext';
import { cancelScheduledTransaction, listScheduledTransactions, retryScheduledTransaction } from '@/lib/firestore/scheduledTransactions';
import { formatCurrency, formatDate } from '@/lib/utils';

const KIND_LABELS = {
  expense: 'Dépense', income: 'Revenu', loan_given: 'Prêt accordé', debt_borrowed: 'Emprunt',
  debt_repayment: 'Remboursement de dette', repayment_received: 'Remboursement reçu',
};

export function ScheduledTransactionsPanel({ kinds = null, isPremium = true, compact = false }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const kindsKey = Array.isArray(kinds) ? kinds.join('|') : '*';
  const allowed = useMemo(() => kindsKey === '*' ? null : new Set(kindsKey.split('|')), [kindsKey]);
  const load = useCallback(async () => {
    if (!user?.uid) { setItems([]); setLoading(false); return; }
    try {
      const rows = await listScheduledTransactions(user.uid);
      setItems(rows.filter((item) => !allowed || allowed.has(item.kind)));
      setError('');
    } catch (loadError) { setError(loadError.message || 'Impossible de charger les programmations.'); }
    finally { setLoading(false); }
  }, [user, allowed]);
  useEffect(() => { void load(); }, [load]);

  const cancel = async (item) => {
    if (!user?.uid || busyId) return;
    setBusyId(item.id); setError('');
    try { await cancelScheduledTransaction(user.uid, item.id); await load(); }
    catch (cancelError) { setError(cancelError.message || 'Impossible d’annuler cette programmation.'); }
    finally { setBusyId(''); }
  };

  const retry = async (item) => {
    if (!user?.uid || busyId) return;
    setBusyId(item.id); setError('');
    try { await retryScheduledTransaction(user.uid, item.id); await load(); }
    catch (retryError) { setError(retryError.message || 'Impossible de relancer cette programmation.'); }
    finally { setBusyId(''); }
  };

  const upcoming = items.filter((item) => item.status === 'scheduled' && item.active !== false);
  const failed = items.filter((item) => item.status === 'failed');
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2"><span className="mt-0.5 text-slate-500"><CalendarClock size={18}/></span><div><h2 className="text-sm font-bold text-slate-900">{isEnglish ? 'Scheduled operations' : 'Opérations programmées'}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{isEnglish ? 'Operations saved for a future date are recorded only when that date arrives.' : 'Les opérations à venir sont enregistrées dans tes comptes uniquement lorsque leur date arrive.'}</p></div></div>
        <button type="button" onClick={() => { setLoading(true); void load(); }} aria-label={isEnglish ? 'Refresh' : 'Actualiser'} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><RefreshCw size={14}/></button>
      </div>
      {!isPremium && <div className="mt-3 rounded-xl bg-slate-50 p-3"><p className="text-xs leading-5 text-slate-600">{isEnglish ? 'Scheduling expenses, income and loans is a Pata Premium feature.' : 'La programmation des dépenses, revenus et prêts est une fonctionnalité Pata Premium.'} <Link className="font-semibold text-brand-700 underline" href="/premium">{isEnglish ? 'Explore Premium' : 'Découvrir Premium'}</Link></p></div>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      {loading ? <p className="mt-3 text-xs text-slate-500">{isEnglish ? 'Loading…' : 'Chargement…'}</p>
        : !upcoming.length && !failed.length ? <p className="mt-3 text-xs text-slate-500">{isEnglish ? 'No upcoming operations.' : 'Aucune opération à venir pour le moment.'}</p>
        : <div className="mt-3 space-y-2">
          {upcoming.map((item) => <article key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 p-3">
            <div className="min-w-0"><p className="text-xs font-semibold text-slate-800">{KIND_LABELS[item.kind] || item.kind} · {formatCurrency(Number(item.amount) || 0)}</p><p className="mt-1 truncate text-xs text-slate-600">{item.note || item.source || item.person || item.categoryId}</p><p className="mt-1 text-[11px] text-slate-500">{isEnglish ? 'Next date' : 'Prochaine date'} : {formatDate(item.nextRunDate || item.scheduleDate)}{item.recurrenceEnabled ? ' · ' + (item.frequency === 'daily' ? (isEnglish ? 'Daily' : 'Chaque jour') : item.frequency === 'weekly' ? (isEnglish ? 'Weekly' : 'Chaque semaine') : (isEnglish ? 'Monthly' : 'Chaque mois')) : ''}</p></div>
            <button type="button" onClick={() => cancel(item)} disabled={busyId === item.id} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><X size={12}/>{busyId === item.id ? '…' : (isEnglish ? 'Cancel' : 'Annuler')}</button>
          </article>)}
          {failed.map((item) => <article key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="min-w-0"><p className="text-xs font-semibold text-amber-900">{isEnglish ? 'Operation needs attention' : 'Opération à vérifier'} · {formatCurrency(Number(item.amount) || 0)}</p><p className="mt-1 text-xs text-amber-800">{item.lastError || (isEnglish ? 'The operation could not be recorded.' : 'Pata n’a pas pu enregistrer cette opération.')}</p></div><button type="button" onClick={() => retry(item)} disabled={busyId === item.id} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-amber-300 bg-white px-2 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"><RefreshCw size={12}/>{busyId === item.id ? '…' : (isEnglish ? 'Retry' : 'Réessayer')}</button></article>)}
        </div>}
    </section>
  );
}
