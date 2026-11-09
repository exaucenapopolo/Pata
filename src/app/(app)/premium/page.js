'use client';

import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Check, Minus, ShieldCheck, Wallet, CalendarDays, ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const PRICE = 2500;
const BENEFITS = [
  { group: 'Gestion quotidienne', items: [
    ['Enregistrer des dépenses', '60 par mois', 'Sans limite'],
    ['Enregistrer des revenus', '2 par mois', 'Sans limite'],
    ['Créer des budgets', '2 par mois', 'Sans limite'],
    ['Créer des objectifs d’épargne', '2 par mois', 'Sans limite'],
    ['Prévisions vitales', '1 création par mois', 'Sans limite'],
    ['Suivre les soldes de chaque revenu', true, true],
    ['Modifier et supprimer les opérations', true, true],
  ]},
  { group: 'Assistante Mč', items: [
    ['Questions à l’assistante', '3 utilisations par jour', 'Utilisation élargie*'],
    ['Enregistrer et corriger des opérations par chat', true, true],
    ['Conseils et analyses personnalisés', true, true],
    ['Créer et analyser des images', 'Utilisation limitée', 'Utilisation élargie*'],
    ['Écouter les réponses vocales', 'Utilisation limitée', 'Utilisation élargie*'],
  ]},
  { group: 'Prévisions et planification', items: [
    ['Prévisions vitales et leur analyse avec Mč', '1 création par mois', 'Sans limite'],
    ['Prévisions de durée de vie du capital', '1 création par mois', 'Sans limite'],
    ['Analyse de scénarios et recommandations', true, true],
  ]},
  { group: 'Organisation et suivi', items: [
    ['Dépenses récurrentes programmées', true, true],
    ['Bilans hebdomadaires automatiques', true, true],
    ['Historique et comparaison des périodes', true, true],
    ['Suivi des dates de consommation des revenus', true, true],
    ['Créer et suivre des projets de dépenses', false, true],
    ['Réserver des revenus à un projet', false, true],
    ['Analyser les projets avec Mč', false, true],
    ['Détails des dépenses par catégorie de budget', true, true],
    ['Alertes et rappels personnalisés', true, true],
    ['Rapports et comparaison des périodes', true, true],
    ['Suivi du portefeuille Pata', true, true],
    ['Export et téléchargement des données', true, true],
  ]},
];

function Value({ value }) {
  if (value === true) return <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700"><Check size={15} /> Inclus</span>;
  if (value === false) return <span className="inline-flex items-center gap-1.5 text-sm text-slate-400"><Minus size={15} /> Non inclus</span>;
  return <span className="text-sm text-slate-600">{value}</span>;
}

export default function PremiumPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const router = useRouter();
  const [months, setMonths] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [discountEligible, setDiscountEligible] = useState(false);
  const [checkingDiscount, setCheckingDiscount] = useState(true);

  useEffect(() => {
    let active = true;
    const loadReferralOffer = async () => {
      if (!user) { setDiscountEligible(false); setCheckingDiscount(false); return; }
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/referrals/status', { headers: { Authorization: 'Bearer ' + token } });
        const data = await response.json().catch(() => ({}));
        if (active) setDiscountEligible(response.ok && data.discountEligible === true);
      } catch {
        if (active) setDiscountEligible(false);
      } finally {
        if (active) setCheckingDiscount(false);
      }
    };
    loadReferralOffer();
    return () => { active = false; };
  }, [user]);

  const balance = Number(profile?.balance) || 0;
  const totalAmount = discountEligible ? 1250 + (months - 1) * PRICE : PRICE * months;
  const missingAmount = Math.max(0, totalAmount - balance);
  const now = new Date();
  const premiumUntil = profile?.premiumUntil ? new Date(profile.premiumUntil) : null;
  const isPremium = Boolean(premiumUntil && premiumUntil > now);
  const daysLeft = isPremium ? Math.max(0, Math.ceil((premiumUntil.getTime() - now.getTime()) / 86400000)) : 0;

  const handlePayWithBalance = async () => {
    setError('');
    if (!user) return setError('Connecte-toi pour continuer.');
    if (balance < totalAmount) return setError(`Ton solde est insuffisant. Il manque ${formatCurrency(missingAmount)}.`);
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/subscription/pay-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ months }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Le paiement n’a pas pu être confirmé.');
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Offre Pata</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Passe à Pata Premium</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Plus de marge pour suivre ton argent, préparer tes décisions et utiliser ton assistante financière au quotidien.</p>
            <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('pata:assistant-open', { detail: { prompt: 'Résume-moi les avantages essentiels de Pata Premium par rapport à la version gratuite, en langage simple et en quelques points.' } }))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Résumer avec Mč</button><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('pata:assistant-open', { detail: { prompt: 'Explique-moi concrètement chaque avantage de Pata Premium et donne-moi des exemples liés à la gestion de mon argent.' } }))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Plus d’explications</button></div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-right">
            <p className="text-xs font-medium text-slate-500">À partir de</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{discountEligible ? '1 250' : '2 500'} <span className="text-base font-semibold text-slate-500">FCFA</span></p>
            <p className="text-xs text-slate-500">pour le premier mois admissible</p>
          </div>
        </div>
        {isPremium && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-emerald-900">Ton abonnement est actif</p>
              <p className="mt-0.5 text-xs text-emerald-800">Il reste {daysLeft} jour(s), jusqu’au {premiumUntil.toLocaleDateString('fr-FR')}.</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700">Premium actif</span>
          </div>
        )}
      </header>

      {discountEligible && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-5 text-emerald-900"><strong>Offre de parrainage activée.</strong> Ton premier mois coûte 1 250 FCFA au lieu de 2 500 FCFA. Les mois suivants restent au tarif normal.</div>}
      {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">Paiement confirmé. Ton abonnement Premium vient d’être prolongé.</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <Card>
        <div className="grid gap-5 md:grid-cols-[1fr_300px] md:items-center">
          <div>
            <CardTitle>Choisis la durée de ton abonnement</CardTitle>
            <p className="mt-1 text-sm text-slate-500">Chaque mois ajoute 30 jours à ton accès. Si tu es déjà Premium, la durée restante est conservée.</p>
            <label className="mt-4 block text-xs font-semibold text-slate-600" htmlFor="premium-months">Durée</label>
            <select id="premium-months" value={months} onChange={(event) => setMonths(Number(event.target.value))} className="mt-1 h-11 w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value={1}>1 mois — {discountEligible ? '1 250' : '2 500'} FCFA</option>
              <option value={3}>3 mois — {discountEligible ? '6 250' : '7 500'} FCFA</option>
              <option value={6}>6 mois — {discountEligible ? '13 750' : '15 000'} FCFA</option>
              <option value={12}>12 mois — {discountEligible ? '28 750' : '30 000'} FCFA</option>
            </select>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex justify-between text-sm"><span className="text-slate-500">Solde Pata</span><strong className="text-slate-900">{formatCurrency(balance)}</strong></div>
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm"><span className="text-slate-500">Total à payer</span><strong className="text-slate-900">{formatCurrency(totalAmount)}</strong></div>
            {missingAmount > 0 && <p className="mt-2 text-xs text-amber-700">Il manque {formatCurrency(missingAmount)} sur ton portefeuille.</p>}
            <Button onClick={handlePayWithBalance} disabled={loading || balance < totalAmount} className="mt-4 w-full">
              <Wallet size={16} /> {loading ? 'Paiement en cours…' : 'Payer avec mon solde'}
            </Button>
            {missingAmount > 0 && <Link href="/wallet" className="mt-3 flex items-center justify-center gap-1 text-sm font-semibold text-brand-700 hover:underline">Recharger mon portefeuille <ArrowRight size={14} /></Link>}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Ce que Premium t’apporte</CardTitle>
            <p className="mt-1 text-xs text-slate-500">Compare précisément les deux formules.</p>
          </div>
          <span className="text-xs font-medium text-slate-500">Gratuit ou 2 500 FCFA / mois</span>
        </div>
        <div className="mt-4 hidden overflow-x-auto rounded-xl border border-slate-200 sm:block">
          <table className="w-full min-w-[650px] border-collapse text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-700">Fonctionnalité</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Gratuit</th>
                <th className="bg-slate-100 px-4 py-3 font-semibold text-slate-900">Premium</th>
              </tr>
            </thead>
            <tbody>
              {BENEFITS.map((group) => (
                <Fragment key={group.group}>
                  <tr key={`${group.group}-heading`}><th colSpan={3} className="border-t border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.group}</th></tr>
                  {group.items.map(([label, free, premium]) => (
                    <tr key={label} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-700">{label}</td>
                      <td className="px-4 py-3"><Value value={free} /></td>
                      <td className="bg-emerald-50/40 px-4 py-3"><Value value={premium} /></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 space-y-4 sm:hidden">
          {BENEFITS.map((group) => (
            <section key={`mobile-${group.group}`} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group.group}</h3>
              {group.items.map(([label, free, premium]) => (
                <div key={`mobile-${label}`} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-800">{label}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Gratuit</p><Value value={free} /></div>
                    <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Premium</p><Value value={premium} /></div>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">* Les fonctions d’intelligence artificielle restent soumises à leur disponibilité et aux règles de sécurité de Pata. Premium permet une utilisation plus large, sans garantir une disponibilité illimitée.</p>
      </Card>



      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-slate-700"><ShieldCheck size={17} /><p className="text-sm font-semibold">Paiement contrôlé</p></div>
          <p className="mt-2 text-xs leading-5 text-slate-500">Le solde est vérifié et débité côté serveur. L’accès n’est prolongé qu’après confirmation du paiement.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-slate-700"><CalendarDays size={17} /><p className="text-sm font-semibold">Suivi de l’échéance</p></div>
          <p className="mt-2 text-xs leading-5 text-slate-500">La date de fin apparaît ici et dans les échanges avec Mč lorsque tu lui demandes l’état de ton abonnement.</p>
        </div>
      </div>
      <p className="text-center text-xs text-slate-500">Tu peux continuer à utiliser gratuitement les principales fonctions de Pata sans t’abonner.</p>
    </div>
  );
}
