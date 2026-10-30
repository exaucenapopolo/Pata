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
import { formatCurrency, formatDate } from '@/lib/utils';

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

  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('1000');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const pollRef = useRef(null);
  const balance = profile?.balance || 0;

  useEffect(() => {
    if (profile?.phone) setPhone(profile.phone);
  }, [profile]);

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
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 9 || cleanPhone.length > 13) {
      return setError('Numéro invalide (9 à 13 chiffres, sans indicatif).');
    }
    const amountNum = Math.round(Number(amount));
    if (!amountNum || amountNum < 100) {
      return setError('Le montant minimum est de 100 FCFA.');
    }
    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/fapshi/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: amountNum, phone: cleanPhone, description: 'Recharge Pata' }),
      });
      const data = await res.json();
      if (!data.success || !data.checkoutUrl) {
        throw new Error(data.error || 'Impossible de démarrer le paiement.');
      }
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err.message || 'Erreur.');
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Portefeuille</h1>
        <p className="text-sm text-slate-500">
          Recharge par Mobile Money et finance tes objectifs d&apos;épargne.
        </p>
      </div>

      <Card className="border-0 bg-gradient-to-br from-brand-600 to-brand-700 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Solde disponible</p>
            <p className="mt-1 text-3xl font-bold">{formatCurrency(balance)}</p>
          </div>
          <Banknote size={40} className="opacity-40" />
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">Nouvelle recharge Mobile Money</CardTitle>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            label="Numéro Mobile Money (Orange / MTN)"
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="6XXXXXXXX"
            required
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Montant (FCFA)</label>
            <input
              type="number"
              min="100"
              step="100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              required
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((v) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => setAmount(String(v))}
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-brand-500 hover:text-brand-600"
                >
                  {v.toLocaleString('fr-FR')}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            <Plus size={16} /> {submitting ? 'Redirection…' : 'Recharger'}
          </Button>
          <p className="text-xs text-slate-500">
            Tu seras redirigé vers Fapshi pour valider le paiement Mobile Money. Ton solde est crédité automatiquement dès confirmation.
          </p>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <CardTitle>Historique des recharges</CardTitle>
          {pendingDeposits.length > 0 && (
            <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
              <RefreshCw size={12} className="animate-spin" /> Vérification auto
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
                      {d.phone ? ` — ${d.phone}` : ''}
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
