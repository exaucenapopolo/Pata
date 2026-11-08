'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Clock3, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const labels = {
  PENDING_REVIEW: 'À vérifier par l’administration',
  PROCESSING: 'Transmis au prestataire',
  SENDING: 'En cours d’envoi',
  RECONCILIATION_REQUIRED: 'Vérification nécessaire',
  PAID: 'Envoyé',
  REJECTED: 'Refusé',
  FAILED: 'Échec',
  EXPIRED: 'Expiré',
};

export function WithdrawalHistory({ type = 'savings' }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) { setItems([]); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/withdrawals/list', { headers: { Authorization: 'Bearer ' + token } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Impossible de charger les retraits.');
      setItems((data.withdrawals || []).filter((item) => type === 'cotisation'
        ? item.withdrawalType === 'cotisation'
        : item.withdrawalType !== 'cotisation'));
    } catch (err) {
      setError(err.message || 'Impossible de charger les retraits.');
    } finally {
      setLoading(false);
    }
  }, [user, type]);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><h2 className="text-base font-bold text-slate-900">Historique des retraits</h2><p className="mt-1 text-xs text-slate-500">Consulte les demandes, leur statut et les confirmations d’envoi.</p></div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 disabled:opacity-50"><RefreshCw size={13}/> Actualiser</button>
      </div>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      {loading ? <p className="py-5 text-center text-xs text-slate-500">Chargement de l’historique…</p>
        : items.length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Aucune demande de retrait enregistrée.</p>
        : <div className="divide-y divide-slate-100">{items.map((item) => {
          const status = labels[item.status] || item.status || 'Statut inconnu';
          const date = item.createdAt ? new Date(item.createdAt).toLocaleString('fr-FR') : 'Date non disponible';
          const title = item.goalName || (item.actionType === 'cancel' ? 'Clôture d’épargne' : 'Retrait d’épargne');
          return <article key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0"><p className="text-sm font-semibold text-slate-800">{title}</p><p className="mt-1 text-[11px] text-slate-500">{date} · {item.phone || 'Numéro non renseigné'}</p>{item.adminNote && <p className="mt-1 text-[11px] text-slate-500">Motif : {item.adminNote}</p>}{item.providerMessage && <p className="mt-1 text-[11px] text-amber-700">{item.providerMessage}</p>}</div>
            <div className="shrink-0 text-right"><p className="text-sm font-bold text-slate-900">{formatCurrency(item.amount)}</p><span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600">{['PAID'].includes(item.status) ? <CheckCircle2 size={12}/> : ['FAILED','REJECTED','EXPIRED'].includes(item.status) ? <AlertCircle size={12}/> : <Clock3 size={12}/>} {status}</span></div>
          </article>;
        })}</div>}
    </section>
  );
}
