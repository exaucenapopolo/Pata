'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { HandCoins, ArrowDownLeft, ArrowUpRight, CalendarClock, History, ChevronDown, Loader2, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useDebts } from '@/hooks/useDebts';
import { useProfile } from '@/hooks/useProfile';
import { listDebtRepayments, updateDebtDueDate, deleteDebt } from '@/lib/firestore/debts';
import { formatCurrency, formatDate } from '@/lib/utils';
import { EmptyState } from '@/components/ui/EmptyState';
import DebtRequestsPanel from '@/components/debts/DebtRequestsPanel';
import { ScheduledTransactionsPanel } from '@/components/transactions/ScheduledTransactionsPanel';
import { Modal } from '@/components/ui/Modal';
import { usePersistentPageState } from '@/hooks/usePersistentPageState';

const OPEN_STATUSES = ['active', 'partial', 'late'];
const FILTERS = [
  { id: 'all', label: 'Toutes' },
  { id: 'owed_to_me', label: 'Créances' },
  { id: 'i_owe', label: 'Dettes' },
  { id: 'late', label: 'En retard' },
  { id: 'paid', label: 'Soldées' },
];

function dateKey(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export default function DebtsPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { debts, loading } = useDebts();
  const [filter, setFilter] = usePersistentPageState('debts', 'filter', 'all', user?.uid);
  const [expandedDebtId, setExpandedDebtId] = usePersistentPageState('debts', 'expandedDebtId', '', user?.uid);
  const [repaymentsByDebt, setRepaymentsByDebt] = useState({});
  const [historyLoadingId, setHistoryLoadingId] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [editingDueDateId, setEditingDueDateId] = usePersistentPageState('debts', 'editingDueDateId', '', user?.uid);
  const [dueDateDraft, setDueDateDraft] = usePersistentPageState('debts', 'dueDateDraft', '', user?.uid);
  const [dueDateSaving, setDueDateSaving] = useState(false);
  const [dueDateFeedback, setDueDateFeedback] = useState('');
  const [debtToDelete, setDebtToDelete] = useState(null);
  const [deletingDebt, setDeletingDebt] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteFeedback, setDeleteFeedback] = useState('');

  const openDebts = useMemo(() => debts.filter((debt) => OPEN_STATUSES.includes(debt.status) && Number(debt.remaining) > 0), [debts]);
  const receivables = openDebts.filter((debt) => debt.type === 'owed_to_me');
  const payables = openDebts.filter((debt) => debt.type === 'i_owe');
  const totalReceivable = receivables.reduce((sum, debt) => sum + (Number(debt.remaining) || 0), 0);
  const totalPayable = payables.reduce((sum, debt) => sum + (Number(debt.remaining) || 0), 0);
  const receivablePeopleCount = new Set(receivables.map((debt) => String(debt.person || '').trim().toLocaleLowerCase('fr-FR')).filter(Boolean)).size;
  const payablePeopleCount = new Set(payables.map((debt) => String(debt.person || '').trim().toLocaleLowerCase('fr-FR')).filter(Boolean)).size;
  const premiumExpiry = profile?.premiumUntil?.toDate ? profile.premiumUntil.toDate() : new Date(profile?.premiumUntil || 0);
  const isPremium = Number.isFinite(premiumExpiry.getTime()) && premiumExpiry > new Date();
  const activeDebtCount = openDebts.length;
  const freeDebtLimitReached = !isPremium && activeDebtCount >= 2;
  const filtered = debts.filter((debt) => {
    if (filter === 'all') return true;
    if (filter === 'late') return debt.status === 'late';
    if (filter === 'paid') return debt.status === 'paid';
    return debt.type === filter;
  });

  const statusLabel = { active: 'En cours', partial: 'Partiellement remboursée', paid: 'Soldée', late: 'En retard', cancelled: 'Annulée' };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const debtId = params.get('editDue');
    if (!debtId || !debts.length) return;
    const debt = debts.find((item) => item.id === debtId);
    if (!debt) return;
    setEditingDueDateId(debt.id);
    setDueDateDraft(dateKey(debt.dueDate));
    params.delete('editDue');
    const query = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : ''));
  }, [debts]);

  const saveDebtDueDate = async (event, debt) => {
    event.preventDefault();
    if (!user?.uid || !dueDateDraft) return;
    setDueDateSaving(true);
    setDueDateFeedback('');
    try {
      await updateDebtDueDate(debt.id, dueDateDraft);
      setEditingDueDateId('');
      setDueDateFeedback('Échéance enregistrée. Pata pourra maintenant te rappeler cette date.');
    } catch (error) {
      setDueDateFeedback(error.message || 'Impossible d’enregistrer cette échéance.');
    } finally {
      setDueDateSaving(false);
    }
  };

  const confirmDeleteDebt = async () => {
    if (!user?.uid || !debtToDelete || deletingDebt) return;
    setDeletingDebt(true);
    setDeleteError('');
    try {
      const result = await deleteDebt(user.uid, debtToDelete.id);
      setDeleteFeedback(result.message || (result.archived ? 'Dossier retiré de la liste.' : 'Dossier supprimé.'));
      setDebtToDelete(null);
      setExpandedDebtId('');
      setRepaymentsByDebt((current) => {
        const next = { ...current };
        delete next[debtToDelete.id];
        return next;
      });
    } catch (error) {
      setDeleteError(error.message || 'Impossible de supprimer cette dette ou ce prêt.');
    } finally {
      setDeletingDebt(false);
    }
  };

  const toggleHistory = async (debt) => {
    if (expandedDebtId === debt.id) {
      setExpandedDebtId('');
      setHistoryError('');
      return;
    }
    setExpandedDebtId(debt.id);
    setHistoryError('');
    if (Object.prototype.hasOwnProperty.call(repaymentsByDebt, debt.id)) return;
    setHistoryLoadingId(debt.id);
    try {
      const rows = await listDebtRepayments(user.uid, debt.id);
      setRepaymentsByDebt((current) => ({ ...current, [debt.id]: rows }));
    } catch (error) {
      setHistoryError(error.message || 'Impossible de charger cet historique.');
    } finally {
      setHistoryLoadingId('');
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="pata-page-title text-2xl font-bold text-slate-900">Dettes & prêts</h1>
          <p className="mt-1 text-sm text-slate-500">Suis ce que tu as prêté, ce que tu dois et chaque remboursement.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {freeDebtLimitReached ? <Link href="/premium" data-pata-tour="debt-create" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#075b43] px-3 text-sm font-semibold text-white hover:bg-[#064b38]">Débloquer les dettes illimitées</Link> : <>
            <Link href="/income?new=1&flowType=debt_borrowed" data-pata-tour="debt-create" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Plus size={15}/> Nouvelle dette</Link>
            <Link href="/expenses?new=1&flowType=loan_given" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#075b43] px-3 text-sm font-semibold text-white hover:bg-[#064b38]"><Plus size={15}/> Nouveau prêt</Link>
          </>}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-semibold text-emerald-800">On me doit</p>
          <p className="mt-1 text-xl font-bold text-emerald-900">{formatCurrency(totalReceivable)}</p>
          <p className="mt-1 text-[11px] text-emerald-800">{receivablePeopleCount} personne(s) te doivent de l’argent</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold text-amber-800">Je dois</p>
          <p className="mt-1 text-xl font-bold text-amber-900">{formatCurrency(totalPayable)}</p>
          <p className="mt-1 text-[11px] text-amber-800">{payablePeopleCount} créancier(s) ou banque(s) à qui tu dois</p>
        </div>
      </section>

      <ScheduledTransactionsPanel kinds={['loan_given', 'debt_borrowed', 'debt_repayment', 'repayment_received']} isPremium={isPremium} />

      {deleteFeedback && <p role="status" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">{deleteFeedback}</p>}
      <DebtRequestsPanel uid={user?.uid} />

      {!isPremium && <p className={'rounded-xl border px-3 py-2.5 text-xs ' + (freeDebtLimitReached ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-600')}>Compte gratuit : {activeDebtCount}/2 dettes ou prêts actifs. Les remboursements complets libèrent une place ; Premium permet un suivi illimité.</p>}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((item) => <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={'pata-filter-pill shrink-0 rounded-full border px-3 py-2 text-xs font-semibold ' + (filter === item.id ? 'is-active border-[#075b43] bg-[#075b43] text-white' : 'border-slate-200 bg-white text-slate-600')}>{item.label}</button>)}
      </div>

      {loading ? <div className="pata-surface-card rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Chargement du suivi…</div>
        : filtered.length === 0 ? <EmptyState title="Aucune dette à afficher" description="Tes prêts et dettes enregistrés apparaîtront ici." />
        : <section className="space-y-3">
          {filtered.map((debt) => {
            const isReceivable = debt.type === 'owed_to_me';
            const actionHref = isReceivable
              ? '/income?new=1&flowType=repayment_received&debtId=' + encodeURIComponent(debt.id)
              : '/expenses?new=1&flowType=repayment&debtId=' + encodeURIComponent(debt.id);
            const due = dateKey(debt.dueDate);
            const remaining = Math.max(0, Number(debt.remaining) || 0);
            const amount = Math.max(0, Number(debt.amount) || 0);
            const alreadyRepaid = Math.max(0, amount - remaining);
            const since = dateKey(debt.createdAt);
            const expanded = expandedDebtId === debt.id;
            const historyLoaded = Object.prototype.hasOwnProperty.call(repaymentsByDebt, debt.id);
            return <article key={debt.id} className="pata-surface-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' + (isReceivable ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>{isReceivable ? <ArrowDownLeft size={19}/> : <ArrowUpRight size={19}/>}</span>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-bold text-slate-900">{debt.bankName || debt.person || 'Créancier non renseigné'}</h2>
                    <p className="mt-0.5 text-xs text-slate-500">{isReceivable ? 'Prêt accordé · On me doit' : debt.availableAsFunding === true ? (debt.counterpartyType === 'bank' ? 'Emprunt bancaire · argent reçu' : 'Dette contractée · argent reçu') : debt.availableAsFunding === false ? (debt.counterpartyType === 'bank' ? 'Dette bancaire · Je dois' : 'Biens ou services pris à crédit · Je dois') : 'Ancienne dette · nature à préciser'}</p>
                    {debt.phone && <p className="mt-1 text-xs text-slate-500">{debt.phone}</p>}
                  </div>
                </div>
                <span className={'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ' + (debt.status === 'late' ? 'bg-red-50 text-red-700' : debt.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : debt.status === 'cancelled' ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-700')}>{statusLabel[debt.status] || debt.status}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
                <div><p className="text-[10px] text-slate-500">Montant initial</p><p className="mt-1 text-sm font-semibold text-slate-800">{formatCurrency(amount)}</p></div>
                <div><p className="text-[10px] text-slate-500">Déjà remboursé</p><p className="mt-1 text-sm font-semibold text-emerald-700">{formatCurrency(alreadyRepaid)}</p></div>
                <div><p className="text-[10px] text-slate-500">Solde restant</p><p className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(remaining)}</p></div>
                <div><p className="text-[10px] text-slate-500">Enregistré depuis</p><p className="mt-1 text-sm font-semibold text-slate-800">{since ? formatDate(since) : 'Date inconnue'}</p></div>
                <div className="col-span-2 flex items-center gap-1.5 text-[11px] text-slate-500"><CalendarClock size={13}/> Échéance : {due ? formatDate(due) : 'Non précisée'}</div>
              </div>
              {debt.linkStatus === 'pending' && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">Demande envoyée à un autre compte Pata. La dette reste enregistrée chez toi pendant l’attente de sa réponse.</p>}
              {debt.linkStatus === 'accepted' && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">Dette synchronisée avec un autre compte Pata. Les remboursements déclarés par le débiteur devront être confirmés par le créancier.</p>}
              {debt.linkStatus === 'rejected' && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">La demande de liaison n’a pas été acceptée. Ton suivi personnel reste actif.</p>}
              {debt.note && <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">{debt.note}</p>}
              {OPEN_STATUSES.includes(debt.status) && remaining > 0 && !(isReceivable && debt.linkStatus === 'accepted') && <Link href={actionHref} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <HandCoins size={15}/> {debt.linkStatus === 'accepted' && !isReceivable ? 'Déclarer un remboursement' : 'Enregistrer un remboursement'}
              </Link>}
              {isReceivable && debt.linkStatus === 'accepted' && remaining > 0 && <p className="mt-3 text-[11px] leading-5 text-slate-500">Le débiteur doit déclarer son remboursement depuis son compte. Tu recevras alors une demande à confirmer ici.</p>}
              {(() => {
                const linked = ['pending', 'accepted'].includes(String(debt.linkStatus || '')) || Boolean(debt.peerDebtId || debt.linkedDebtId);
                const partiallyRepaid = alreadyRepaid > 0 && remaining > 0;
                const cannotDelete = linked || partiallyRepaid;
                return <div className="mt-3">
                  <button type="button" disabled={cannotDelete} onClick={() => { setDebtToDelete(debt); setDeleteError(''); }} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-red-100 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">
                    <Trash2 size={14}/> Supprimer ce dossier
                  </button>
                  {cannotDelete && <p className="mt-1 text-[10px] leading-4 text-slate-500">{linked ? 'Suppression indisponible : ce dossier est lié à un autre compte Pata.' : 'Suppression indisponible : un remboursement a déjà été effectué et un solde reste à payer.'}</p>}
                </div>;
              })()}
              <button type="button" onClick={() => toggleHistory(debt)} aria-expanded={expanded} className="mt-3 inline-flex min-h-9 w-full items-center justify-between rounded-xl border border-slate-100 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                <span className="inline-flex items-center gap-2"><History size={14}/> Voir les détails et remboursements</span>
                <ChevronDown size={15} className={expanded ? 'rotate-180 transition-transform' : 'transition-transform'}/>
              </button>
              {expanded && <div className="mt-2 rounded-xl bg-slate-50 p-3">
                {historyLoadingId === debt.id ? <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={14} className="animate-spin"/> Chargement de l’historique…</div>
                  : historyError ? <p className="text-xs text-red-700">{historyError}</p>
                    : historyLoaded && repaymentsByDebt[debt.id].length > 0 ? <ul className="space-y-2">
                      {repaymentsByDebt[debt.id].map((repayment) => <li key={repayment.id} className="flex items-center justify-between gap-3 text-xs"><span className="text-slate-500">{repayment.date ? formatDate(repayment.date) : 'Date inconnue'} · {repayment.source === 'sms' ? 'SMS' : 'Manuel'}</span><strong className="text-slate-800">{formatCurrency(Number(repayment.amount) || 0)}</strong></li>)}
                    </ul>
                    : <p className="text-xs text-slate-500">Aucun remboursement enregistré pour le moment.</p>}
              </div>}
            </article>;
          })}
        </section>}
      <Modal open={!!debtToDelete} onClose={() => { if (!deletingDebt) { setDebtToDelete(null); setDeleteError(''); } }} title={debtToDelete?.type === 'owed_to_me' ? 'Supprimer ce prêt ?' : 'Supprimer cette dette ?'}>
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">
            {debtToDelete?.status === 'paid' || (Number(debtToDelete?.remaining) === 0 && Number(debtToDelete?.amount) > 0)
              ? 'Ce dossier sera retiré de ta liste. Les opérations financières et les remboursements déjà enregistrés resteront conservés dans ton historique.'
              : 'Le dossier et son écriture associée seront supprimés. Si cet emprunt a déjà servi à financer une dépense ou si le prêt est lié à une opération protégée, Pata refusera la suppression pour préserver tes soldes.'}
          </p>
          {debtToDelete && <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">{debtToDelete.bankName || debtToDelete.person || 'Créancier / bénéficiaire'}</p>
            <p className="mt-1">Montant initial : {formatCurrency(Number(debtToDelete.amount) || 0)}</p>
            <p>Solde restant : {formatCurrency(Number(debtToDelete.remaining) || 0)}</p>
          </div>}
          {deleteError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700">{deleteError}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={deletingDebt} onClick={() => { setDebtToDelete(null); setDeleteError(''); }} className="min-h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 disabled:opacity-50">Annuler</button>
            <button type="button" disabled={deletingDebt || !debtToDelete} onClick={confirmDeleteDebt} className="min-h-11 flex-1 rounded-xl bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">{deletingDebt ? 'Suppression…' : 'Confirmer la suppression'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
