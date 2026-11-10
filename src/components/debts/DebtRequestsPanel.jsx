'use client';

import { useEffect, useState } from 'react';
import { Check, Clock3, Loader2, RefreshCw, X } from 'lucide-react';
import { listDebtRequests, respondDebtRequest } from '@/lib/firestore/debts';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function DebtRequestsPanel({ uid }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(Boolean(uid));
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = async () => {
    if (!uid) return;
    setLoading(true);
    setError('');
    try {
      setRequests(await listDebtRequests());
    } catch (loadError) {
      setError(loadError.message || 'Impossible de charger les demandes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [uid]);

  const handleDecision = async (item, decision) => {
    setActionId(item.id);
    setError('');
    setMessage('');
    try {
      await respondDebtRequest(item.id, decision);
      setRequests((current) => current.filter((entry) => entry.id !== item.id));
      setMessage(item.type === 'repayment'
        ? (decision === 'accept' ? 'Remboursement confirmé. Les deux comptes ont été mis à jour.' : 'Remboursement refusé. La dette reste inchangée.')
        : (decision === 'accept' ? 'Dette confirmée et synchronisée dans les deux comptes.' : 'Demande refusée. Le suivi personnel de l’autre utilisateur est conservé.'));
    } catch (actionError) {
      setError(actionError.message || 'Impossible de traiter cette demande.');
    } finally {
      setActionId('');
    }
  };

  if (!uid || (!loading && requests.length === 0 && !error && !message)) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/70 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Demandes à confirmer</h2>
          <p className="mt-0.5 text-[11px] text-slate-600">Vérifie les montants avant de synchroniser les deux comptes.</p>
        </div>
        <button type="button" onClick={refresh} disabled={loading} aria-label="Actualiser les demandes" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-white text-emerald-800 disabled:opacity-50">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
        </button>
      </div>
      <div className="space-y-3 p-3">
        {loading && <div className="flex items-center gap-2 px-1 py-2 text-xs text-slate-500"><Loader2 size={14} className="animate-spin"/> Chargement des demandes…</div>}
        {requests.map((item) => {
          const isRepayment = item.type === 'repayment';
          const description = isRepayment
            ? (item.requesterName || 'Un utilisateur') + ' déclare t’avoir remboursé.'
            : item.kind === 'borrowed'
              ? (item.requesterName || 'Un utilisateur') + ' déclare avoir emprunté auprès de toi.'
              : (item.requesterName || 'Un utilisateur') + ' déclare t’avoir prêté cette somme.';
          return (
            <article key={item.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900">{isRepayment ? 'Confirmation d’un remboursement' : 'Demande de liaison de dette'}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
                  {item.counterpartyName && <p className="mt-1 text-[11px] text-slate-500">Personne concernée : {item.counterpartyName}</p>}
                </div>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><Clock3 size={16}/></span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2.5">
                <div><p className="text-[10px] text-slate-500">Montant</p><p className="mt-0.5 text-sm font-bold text-slate-900">{formatCurrency(Number(item.amount) || 0)}</p></div>
                <div><p className="text-[10px] text-slate-500">{isRepayment ? 'Déclaré le' : 'Échéance'}</p><p className="mt-0.5 text-xs font-semibold text-slate-800">{isRepayment ? (item.date ? formatDate(item.date) : 'Date non précisée') : (item.dueDate ? formatDate(item.dueDate) : 'Non précisée')}</p></div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => handleDecision(item, 'reject')} disabled={actionId === item.id} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 disabled:opacity-50">
                  {actionId === item.id ? <Loader2 size={14} className="animate-spin"/> : <X size={14}/>} Refuser
                </button>
                <button type="button" onClick={() => handleDecision(item, 'accept')} disabled={actionId === item.id} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#075b43] text-xs font-semibold text-white disabled:opacity-50">
                  {actionId === item.id ? <Loader2 size={14} className="animate-spin"/> : <Check size={14}/>} {isRepayment ? 'Confirmer reçu' : 'Confirmer la dette'}
                </button>
              </div>
            </article>
          );
        })}
        {message && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{message}</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </div>
    </section>
  );
}
