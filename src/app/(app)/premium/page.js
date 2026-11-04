/* eslint-disable react/no-unescaped-entities */
'use client';

import { useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { getSubscriptionStatus } from '@/lib/firestore/subscriptions';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CheckCircle2, Crown, Wallet, CreditCard, Calendar, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const PRICE = 2500;

export default function PremiumPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const status = getSubscriptionStatus(profile);
  const [months, setMonths] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const balance = profile?.balance || 0;
  const totalAmount = PRICE * months;

  const handlePayWithBalance = async () => {
    setError('');
    if (balance < totalAmount) {
      return setError(`Solde insuffisant. Il te faut ${formatCurrency(totalAmount)}, tu as ${formatCurrency(balance)}.`);
    }
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/subscription/pay-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ months }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Erreur.');
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePayWithFapshi = async () => {
    setError('');
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ months }),
      });
      const data = await res.json();
      if (!data.success || !data.checkoutUrl) throw new Error(data.error || 'Erreur.');
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-3">
          <Crown size={32} />
        </div>
        <h1 className="text-3xl font-bold text-slate-900">Pata Premium</h1>
        <p className="text-slate-500 mt-1">Débloque tout le potentiel de ton assistant financier.</p>
      </div>

      {success && (
        <div className="rounded-xl bg-brand-50 border border-brand-200 p-4 flex items-center gap-2 text-brand-700">
          <CheckCircle2 size={18} />
          <p className="text-sm font-semibold">Félicitations ! Ton abonnement est actif.</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 flex items-center gap-2 text-red-700">
          <AlertTriangle size={18} />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      )}

      <Card>
        <div className="text-center mb-6">
          <p className="text-4xl font-black text-slate-900">{formatCurrency(PRICE)}<span className="text-base font-medium text-slate-500"> / mois</span></p>
          <p className="text-sm text-slate-500 mt-1">Moins d’un café par jour pour reprendre le contrôle.</p>
        </div>

        <ul className="space-y-3 mb-6">
          <li className="flex items-center gap-2 text-sm text-slate-700"><CheckCircle2 size={16} className="text-brand-500" /> Dépenses, revenus et budgets illimités</li>
          <li className="flex items-center gap-2 text-sm text-slate-700"><CheckCircle2 size={16} className="text-brand-500" /> Objectifs d’épargne illimités</li>
          <li className="flex items-center gap-2 text-sm text-slate-700"><CheckCircle2 size={16} className="text-brand-500" /> Prévisions vitales et automatisations</li>
          <li className="flex items-center gap-2 text-sm text-slate-700"><CheckCircle2 size={16} className="text-brand-500" /> Assistant Mč illimité (texte, audio, vision)</li>
          <li className="flex items-center gap-2 text-sm text-slate-700"><CheckCircle2 size={16} className="text-brand-500" /> Exportation des données</li>
        </ul>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">Durée de l’abonnement</label>
          <select 
            value={months} 
            onChange={(e) => setMonths(Number(e.target.value))}
            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
          >
            <option value={1}>1 mois — {formatCurrency(PRICE)}</option>
            <option value={3}>3 mois — {formatCurrency(PRICE * 3)}</option>
            <option value={6}>6 mois — {formatCurrency(PRICE * 6)}</option>
            <option value={12}>12 mois — {formatCurrency(PRICE * 12)}</option>
          </select>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Button onClick={handlePayWithFapshi} disabled={loading} className="w-full">
            <CreditCard size={16} /> Payer par Mobile Money
          </Button>
          <Button onClick={handlePayWithBalance} variant="outline" disabled={loading || balance < totalAmount} className="w-full">
            <Wallet size={16} /> Payer avec mon solde ({formatCurrency(balance)})
          </Button>
        </div>

        <p className="text-xs text-slate-500 text-center mt-4">
          Le solde Pata est l’argent réellement déposé sur la plateforme. Les revenus que tu enregistres ne sont pas débités ici.
        </p>
      </Card>

      {status.isPremium && (
        <Card className="bg-brand-50 border-brand-200">
          <div className="flex items-center gap-2 text-brand-700">
            <Calendar size={18} />
            <p className="text-sm font-semibold">
              Ton abonnement est actif jusqu’au {status.expiresAt.toLocaleDateString('fr-FR')} ({status.daysLeft} jours restants).
            </p>
          </div>
        </Card>
      )}
    </div>
  );
          }
