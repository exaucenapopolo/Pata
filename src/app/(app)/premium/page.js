/* eslint-disable react/no-unescaped-entities */
'use client';

import { useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CheckCircle2, Crown, Wallet, ShieldCheck, Zap, TrendingUp, Calendar, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const PRICE = 2500;

export default function PremiumPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const router = useRouter();
  const [months, setMonths] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const balance = profile?.balance || 0;
  const totalAmount = PRICE * months;
  const missingAmount = Math.max(0, totalAmount - balance);

  const now = new Date();
  const premiumUntil = profile?.premiumUntil ? new Date(profile.premiumUntil) : null;
  const isPremium = premiumUntil && premiumUntil > now;

  const handlePayWithBalance = async () => {
    setError('');
    if (balance < totalAmount) {
      return setError(`Il te manque ${formatCurrency(missingAmount)} sur ton solde.`);
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

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-10">
      <div className="text-center pt-4">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-3">
          <Crown size={32} />
        </div>
        <h1 className="text-3xl font-bold text-slate-900">Pata Premium</h1>
        <p className="text-slate-500 mt-1">Ne subis plus tes finances. Prends le contrôle total.</p>
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

      <Card className="border-brand-200 shadow-md">
        <div className="text-center mb-6">
          <p className="text-4xl font-black text-slate-900">{formatCurrency(PRICE)}<span className="text-base font-medium text-slate-500"> / mois</span></p>
          <p className="text-sm text-slate-500 mt-1">Moins qu'un plat de poulet pour une paix financière durable.</p>
        </div>

        <div className="space-y-4 mb-8">
          <div className="flex items-start gap-3">
            <ShieldCheck className="text-brand-500 shrink-0" size={20} />
            <div>
              <p className="text-sm font-semibold text-slate-800">Zéro restriction</p>
              <p className="text-xs text-slate-500">Dépenses, revenus et budgets illimités. Plus de blocage à 100 dépenses.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Zap className="text-brand-500 shrink-0" size={20} />
            <div>
              <p className="text-sm font-semibold text-slate-800">Assistant Mč illimité</p>
              <p className="text-xs text-slate-500">Pose 100 questions par jour si tu veux. Génère des images, utilise la voix.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <TrendingUp className="text-brand-500 shrink-0" size={20} />
            <div>
              <p className="text-sm font-semibold text-slate-800">Objectifs illimités</p>
              <p className="text-xs text-slate-500">Crée autant d'objectifs d'épargne que tu veux pour tes projets.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="text-brand-500 shrink-0" size={20} />
            <div>
              <p className="text-sm font-semibold text-slate-800">Prévisions Vitales</p>
              <p className="text-xs text-slate-500">Calcule automatiquement ton budget de survie et transforme-le en revenus.</p>
            </div>
          </div>
        </div>

        <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <label className="block text-sm font-medium text-slate-700 mb-2">Durée de l'abonnement</label>
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

        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm font-medium">
            <span className="text-slate-600">Solde disponible</span>
            <span className="text-slate-900">{formatCurrency(balance)}</span>
          </div>
          <div className="flex justify-between items-center text-sm font-medium border-b border-slate-100 pb-2">
            <span className="text-slate-600">Montant à payer</span>
            <span className="text-brand-600">{formatCurrency(totalAmount)}</span>
          </div>
          
          <Button 
            onClick={handlePayWithBalance} 
            disabled={loading || missingAmount > 0} 
            className="w-full"
          >
            <Wallet size={16} /> {loading ? 'Traitement...' : 'Payer avec mon solde'}
          </Button>

          {missingAmount > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-center">
              <p className="text-sm text-amber-800 font-medium">
                Il te manque <strong>{formatCurrency(missingAmount)}</strong> sur ton solde.
              </p>
              <Button 
                onClick={() => router.push('/wallet')} 
                variant="outline" 
                className="mt-2 text-amber-700 border-amber-300 hover:bg-amber-100"
              >
                Recharger mon solde
              </Button>
            </div>
          )}
        </div>
      </Card>

      {isPremium && (
        <Card className="bg-brand-50 border-brand-200">
          <div className="flex items-center gap-2 text-brand-700">
            <Calendar size={18} />
            <p className="text-sm font-semibold">
              Ton abonnement est actif jusqu'au {premiumUntil.toLocaleDateString('fr-FR')}.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
    }
