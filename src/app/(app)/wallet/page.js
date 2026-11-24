'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, Plus, RefreshCw, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useDeposits } from '@/hooks/useDeposits';
import { formatCurrency, formatDate, getPreferredLocale } from '@/lib/utils';
import { AssistantShortcut } from '@/components/ai/AssistantShortcut';
import { usePersistentPageState } from '@/hooks/usePersistentPageState';

const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000, 25000];

function statusInfo(s) {
  switch ((s || '').toUpperCase()) {
    case 'CONFIRMED':
      return { Icon: CheckCircle2, color: 'text-brand-600', label: 'Confirmé' };
    case 'FAILED':
      return { Icon: XCircle, color: 'text-red-600', label: 'Échoué' };
    default:
      return { Icon: Clock, color: 'text-amber-600', label: 'En attente' };
  }
}

export default function WalletPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { deposits, loading } = useDeposits();

  const [amount, setAmount] = usePersistentPageState('wallet', 'amount', '1000', user?.uid);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);

  const pollRef = useRef(null);

  useEffect(() => {
    let active = true;
    const loadWalletTransactions = async () => {
      if (!user) { setTransactionsLoading(false); return; }
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/wallet/transactions', {
          headers: { Authorization: 'Bearer ' + token },
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de charger les opérations.');
        if (active) setWalletTransactions(result.transactions || []);
      } catch (loadError) {
        if (active) console.warn('[PATA WALLET TRANSACTIONS]', loadError.message || loadError);
      } finally {
        if (active) setTransactionsLoading(false);
      }
    };
    loadWalletTransactions();
    return () => { active = false; };
  }, [user]);

  const balance = profile?.balance || 0;
  const parsedAmount = Number(amount);
  const validAmount = /^\d+$/.test(String(amount)) && Number.isSafeInteger(parsedAmount) && parsedAmount >= 100;
  const serviceFee = validAmount ? Math.round(parsedAmount * 0.05) : 0;
  const totalToPay = validAmount ? parsedAmount + serviceFee : 0;

  const pendingDeposits = useMemo(
    () => deposits.filter((d) => (d.status || '').toUpperCase() === 'PENDING'),
    [deposits]
  );
  const pendingKey = pendingDeposits.map((d) => d.id).sort().join(',');

  const verifyTransaction = useCallback(
    async (transId) => {
      if (!user) return false;
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/fapshi/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ transId }),
        });
        const data = await res.json();
        return data.success && data.status === 'CONFIRMED';
      } catch {
        return false;
      }
    },
    [user]
  );

  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (!pendingKey) return;

    const ids = pendingKey.split(',').filter(Boolean);
    ids.forEach((id) => verifyTransaction(id));
    pollRef.current = setInterval(() => {
      ids.forEach((id) => verifyTransaction(id));
    }, 10000);

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [pendingKey, verifyTransaction]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const amountNum = Number(amount);
    if (!/^\d+$/.test(String(amount)) || !Number.isSafeInteger(amountNum) || amountNum < 100) {
      return setError('Saisis un montant entier, sans virgule ni point, d’au moins 100 FCFA.');
    }
    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/fapshi/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: amountNum, description: 'Recharge de solde' }),
      });
      const data = await res.json();
      if (!data.success || !data.checkoutUrl) {
        throw new Error('Recharge indisponible pour le moment. Réessaie dans quelques instants.');
      }
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError('Impossible de lancer la recharge pour le moment. Vérifie ta connexion puis réessaie.');
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="pata-page-heading flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="pata-page-title text-2xl font-bold text-slate-900">Portefeuille</h1>
        </div>
        <AssistantShortcut label="Comprendre mon portefeuille" prompt="Explique-moi le fonctionnement de mon portefeuille Pata, la différence entre solde disponible, recharge initiée, paiement confirmé et argent affecté aux objectifs. Aide-moi à vérifier mes opérations sans en créer ni en modifier aucune." />
      </div>

      <Card className="border border-slate-200 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Solde disponible</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{formatCurrency(balance)}</p>
          </div>
          <Banknote size={32} className="text-slate-300" />
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">Recharger mon solde</CardTitle>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Montant (FCFA)</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]+"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="pata-field h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              required
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((v) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => setAmount(String(v))}
                  className="pata-filter-pill rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-brand-500 hover:text-brand-600"
                >
                  {v.toLocaleString(getPreferredLocale())}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3 text-xs text-slate-600"><span>Montant crédité au portefeuille</span><strong className="tabular-nums text-slate-900">{validAmount ? formatCurrency(parsedAmount) : '—'}</strong></div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-600"><span>Frais de service (5 %)</span><strong className="tabular-nums text-slate-900">{validAmount ? formatCurrency(serviceFee) : '—'}</strong></div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-3 text-sm font-bold text-slate-950"><span>Total à payer</span><span className="tabular-nums">{validAmount ? formatCurrency(totalToPay) : '—'}</span></div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            <Plus size={16} /> {submitting ? 'Ouverture…' : validAmount ? 'Payer ' + formatCurrency(totalToPay) : 'Recharger'}
          </Button>
          <p className="text-xs leading-5 text-slate-500">Le montant saisi sera crédité sur ton portefeuille après confirmation. Les frais de service de 5 % s’ajoutent au paiement et sont affichés avant validation.</p>
        </form>
      </Card>

      {walletTransactions.length > 0 && (
        <Card>
          <CardTitle className="mb-3">Autres opérations du portefeuille</CardTitle>
          {transactionsLoading ? <p className="py-3 text-xs text-slate-500">Chargement…</p> : (
            <ul className="divide-y divide-slate-100">
              {walletTransactions.map((transaction) => (
                <li key={transaction.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{transaction.description || (transaction.type === 'COTISATION_CHAT_ACCESS' ? 'Déblocage du chat d’une cotisation' : 'Opération du portefeuille')}</p>
                    {transaction.groupName && <p className="mt-0.5 truncate text-xs text-slate-500">{transaction.groupName}</p>}
                    <p className="mt-0.5 text-[10px] text-slate-400">{transaction.createdAt ? new Date(transaction.createdAt).toLocaleString(getPreferredLocale()) : 'Date non disponible'}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-red-600">− {formatCurrency(transaction.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <CardTitle>Historique</CardTitle>
          {pendingDeposits.length > 0 && (
            <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
              <RefreshCw size={12} className="animate-spin" /> Vérification
            </span>
          )}
        </div>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          </div>
        ) : deposits.length === 0 ? (
          <EmptyState
            icon={Banknote}
            title="Aucune recharge"
            description="Effectue ta première recharge pour alimenter ton solde."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {deposits.map((d) => {
              const { Icon, color, label } = statusInfo(d.status);
              return (
                <li key={d.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{formatCurrency(d.amount)}</p>
                    <p className="text-xs text-slate-500">
                      {formatDate(d.createdAt?.toDate ? d.createdAt.toDate() : d.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`flex items-center gap-1 text-xs font-medium ${color}`}>
                      <Icon size={14} /> {label}
                    </span>
                    {label === 'En attente' && (
                      <button
                        onClick={() => verifyTransaction(d.id)}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Vérifier
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
              }
