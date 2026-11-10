'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Check, Minus, ShieldCheck, Wallet, ArrowRight, Crown, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
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
  { group: 'Suivi Mobile Money', items: [
    ['Détection des confirmations Mobile Money', false, true],
    ['Enregistrement automatique des opérations détectées', false, true],
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
  const [showAllBenefits, setShowAllBenefits] = useState(false);

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
  const premiumUntil = profile?.premiumUntil?.toDate ? profile.premiumUntil.toDate() : profile?.premiumUntil ? new Date(profile.premiumUntil) : null;
  const isPremium = Boolean(premiumUntil && Number.isFinite(premiumUntil.getTime()) && premiumUntil > now);
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
    <div className="mx-auto max-w-4xl space-y-5 pb-10">
      <header className="space-y-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">Les offres Pata</p>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Ton abonnement</h1>
        <p className="max-w-2xl text-sm leading-5 text-slate-500">Vois clairement le forfait que tu utilises et ce qui change avec Premium.</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Crown size={19}/></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Forfait utilisé actuellement</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">{isPremium ? 'Pata Premium' : 'Pata gratuit'}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {isPremium
                ? `Ton accès Premium est actif jusqu’au ${premiumUntil.toLocaleDateString('fr-FR')}.`
                : 'Tu utilises la version gratuite. Les outils essentiels de gestion restent disponibles sans abonnement.'}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${isPremium ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{isPremium ? 'ACTIF' : 'GRATUIT'}</span>
        </div>
        {isPremium ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div><p className="text-xs font-semibold text-slate-800">{daysLeft} jour(s) restant(s)</p><p className="mt-0.5 text-[11px] text-slate-500">Tu peux prolonger ton accès avant son échéance.</p></div>
            <span className="text-xs font-semibold text-emerald-700">Toutes les fonctions Premium sont accessibles</span>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-slate-100 pt-3 sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-bold text-slate-900">60</p><p className="mt-0.5 text-[10px] leading-4 text-slate-500">Dépenses par mois</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-bold text-slate-900">2</p><p className="mt-0.5 text-[10px] leading-4 text-slate-500">Revenus par mois</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-bold text-slate-900">2</p><p className="mt-0.5 text-[10px] leading-4 text-slate-500">Budgets par mois</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-bold text-slate-900">3</p><p className="mt-0.5 text-[10px] leading-4 text-slate-500">Messages Mč par jour</p></div>
          </div>
        )}
      </section>

      {!isPremium && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700"><Sparkles size={18}/></span>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-emerald-950">Ce que Premium change concrètement</h2>
              <p className="mt-1 text-xs leading-5 text-emerald-900/80">Tu conserves les mêmes outils, avec plus de capacité pour les utiliser et organiser tes finances.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-white/85 p-3">
              <Check size={16} className="text-emerald-700"/>
              <p className="mt-2 text-xs font-semibold text-slate-800">Plus de capacité</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">Davantage de dépenses, revenus, budgets et objectifs à gérer.</p>
            </div>
            <div className="rounded-xl bg-white/85 p-3">
              <Check size={16} className="text-emerald-700"/>
              <p className="mt-2 text-xs font-semibold text-slate-800">Mč, plus disponible</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">Une utilisation élargie de l’assistante pour tes questions et analyses.</p>
            </div>
            <div className="rounded-xl bg-white/85 p-3">
              <Check size={16} className="text-emerald-700"/>
              <p className="mt-2 text-xs font-semibold text-slate-800">Gestion de projets</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">Crée des projets, réserve des revenus et suis les dépenses associées.</p>
            </div>
            <div className="rounded-xl bg-white/85 p-3">
              <Check size={16} className="text-emerald-700"/>
              <p className="mt-2 text-xs font-semibold text-slate-800">Mobile Money automatique</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">Avec l’application Android, les confirmations sont détectées et les opérations ajoutées à ton suivi sans ressaisie.</p>
            </div>
          </div>
        </section>
      )}

      {checkingDiscount && <p className="text-xs text-slate-400">Vérification de ton éventuelle offre de parrainage…</p>}
      {discountEligible && !isPremium && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs leading-5 text-emerald-900">
          <strong>Ton offre de parrainage est disponible.</strong> Le premier mois revient à 1 250 FCFA au lieu de 2 500 FCFA.
        </div>
      )}
      {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs font-semibold text-emerald-800">Paiement confirmé. Ton accès Premium a été prolongé.</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-700">{error}</p>}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Pata Premium</p><h2 className="mt-1 text-lg font-bold text-slate-900">{isPremium ? 'Prolonge ton abonnement' : 'Passe à Premium'}</h2><p className="mt-1 text-xs leading-5 text-slate-500">2 500 FCFA par mois, sans engagement obligatoire.</p></div>
          <div className="text-right"><p className="text-2xl font-bold tracking-tight text-slate-900">{discountEligible ? '1 250' : '2 500'}</p><p className="text-[10px] text-slate-500">FCFA / premier mois{discountEligible ? ' admissible' : ''}</p></div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_280px] md:items-end">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700" htmlFor="premium-months">Durée souhaitée</label>
            <select id="premium-months" value={months} onChange={(event) => setMonths(Number(event.target.value))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800">
              <option value={1}>1 mois — {discountEligible ? '1 250' : '2 500'} FCFA</option>
              <option value={3}>3 mois — {discountEligible ? '6 250' : '7 500'} FCFA</option>
              <option value={6}>6 mois — {discountEligible ? '13 750' : '15 000'} FCFA</option>
              <option value={12}>12 mois — {discountEligible ? '28 750' : '30 000'} FCFA</option>
            </select>
            <p className="mt-2 text-[11px] leading-4 text-slate-500">Chaque mois ajoute 30 jours. Si ton accès est déjà actif, les jours restants sont conservés.</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3.5">
            <div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-500">Solde Pata</span><strong className="text-xs text-slate-800">{formatCurrency(balance)}</strong></div>
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-200 pt-2"><span className="text-xs text-slate-500">Total à payer</span><strong className="text-sm text-slate-900">{formatCurrency(totalAmount)}</strong></div>
            {missingAmount > 0 && <p className="mt-2 text-[11px] leading-4 text-amber-700">Il manque {formatCurrency(missingAmount)} sur ton portefeuille.</p>}
            <Button onClick={handlePayWithBalance} disabled={loading || balance < totalAmount} className="mt-3 w-full">
              <Wallet size={15}/>{loading ? 'Paiement en cours…' : isPremium ? 'Prolonger Premium' : 'Activer Premium'}
            </Button>
            {missingAmount > 0 && <Link href="/wallet" className="mt-2.5 flex items-center justify-center gap-1 text-xs font-semibold text-brand-700 hover:underline">Recharger mon portefeuille <ArrowRight size={13}/></Link>}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <button type="button" onClick={() => setShowAllBenefits((value) => !value)} aria-expanded={showAllBenefits} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50 sm:px-5">
          <span><strong className="block text-sm text-slate-800">Voir le détail des fonctionnalités</strong><span className="mt-0.5 block text-[11px] text-slate-500">Comparaison complète entre Gratuit et Premium</span></span>
          {showAllBenefits ? <ChevronUp size={18} className="text-slate-500"/> : <ChevronDown size={18} className="text-slate-500"/>}
        </button>
        {showAllBenefits && (
          <div className="space-y-5 border-t border-slate-100 p-4 sm:p-5">
            {BENEFITS.map((group) => (
              <section key={group.group} className="space-y-2.5">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{group.group}</h3>
                {group.items.map(([label, free, premium]) => (
                  <div key={label} className="grid grid-cols-[1.2fr_1fr_1fr] items-start gap-2 border-b border-slate-100 py-2.5 last:border-0">
                    <p className="text-xs leading-4 text-slate-700">{label}</p>
                    <div><p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">Gratuit</p><Value value={free}/></div>
                    <div><p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-brand-700">Premium</p><Value value={premium}/></div>
                  </div>
                ))}
              </section>
            ))}
            <p className="text-[10px] leading-4 text-slate-500">Les fonctions d’intelligence artificielle restent soumises à leur disponibilité et aux règles de sécurité de Pata. Premium permet une utilisation plus large, sans garantir une disponibilité illimitée.</p>
          </div>
        )}
      </section>

      <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-brand-700"/>
        <p className="text-[11px] leading-5 text-slate-500">Ton abonnement est activé après confirmation du paiement. Tu peux continuer à utiliser gratuitement les fonctions essentielles de Pata.</p>
      </div>
    </div>
  );
}
