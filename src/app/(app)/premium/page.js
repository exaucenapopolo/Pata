'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import {
  Activity, ArrowRight, ArrowUpRight, BellRing, Check, CheckCircle2,
  ChevronDown, ChevronUp, Crown, Minus, MessageCircle, ShieldCheck,
  Smartphone, Sparkles, Wallet, Zap
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { calculatePremiumPricing } from '@/lib/premiumPricing.mjs';

const BENEFITS = [
  { group: 'Automatisation et saisie intelligente', items: [
    ['Détection automatique des SMS entrants et sortants Mobile Money', false, true],
    ['Enregistrement automatique des opérations reconnues par SMS', false, true],
    ['Saisie rapide depuis la notification permanente Pata', false, true],
    ['Saisie conservée hors connexion puis synchronisée automatiquement', false, true],
    ['Reconnaissance des emprunts, dettes et remboursements en langage naturel', false, true],
    ['Conversation Mč directement depuis les notifications', false, true],
    ['Historique séparé des conversations Mč par notification', false, true],
    ['Épingler les conversations importantes de Mč', false, true],
    ['Widget Android des soldes financiers du tableau de bord', false, true],
  ]},
  { group: 'Gestion quotidienne', items: [
    ['Enregistrer des dépenses', '60 par mois', 'Sans limite'],
    ['Enregistrer des revenus', '2 par mois', 'Sans limite'],
    ['Créer des budgets', '2 par mois', 'Sans limite'],
    ['Créer des objectifs d’épargne', '1 par mois', 'Sans limite'],
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
    ['Détection et classement des retraits MTN et Orange', false, true],
    ['Rapprochement des retraits avec un revenu déjà suivi', false, true],
    ['Suivi séparé de l’argent disponible en espèces', false, true],
  ]},
  { group: 'Organisation et suivi', items: [
    ['Dépenses récurrentes programmées', true, true],
    ['Bilans hebdomadaires automatiques', true, true],
    ['Historique et comparaison des périodes', true, true],
    ['Suivi des dates de consommation des revenus', true, true],
    ['Suivi des dettes et des prêts actifs', '2 actifs', 'Sans limite'],
    ['Rappels des échéances de dettes', true, true],
    ['Factures personnalisées et échéances récurrentes', true, true],
    ['Rappels avant et après les échéances de factures', true, true],
    ['Priorités après réception d’un revenu (dettes, factures, objectifs)', true, true],
    ['Sélection d’un contact du téléphone pour une dette ou un prêt', true, true],
    ['Jour le plus dépensier et moyennes par jour, semaine et mois', true, true],
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
  const [months, setMonths] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [discountEligible, setDiscountEligible] = useState(false);
  const [checkingDiscount, setCheckingDiscount] = useState(true);
  const [showAllBenefits, setShowAllBenefits] = useState(false);
  const [benefitFilter, setBenefitFilter] = useState('compare');

  useEffect(() => {
    let active = true;
    const loadReferralOffer = async () => {
      if (!user) {
        setDiscountEligible(false);
        setCheckingDiscount(false);
        return;
      }
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/referrals/status', {
          headers: { Authorization: 'Bearer ' + token },
        });
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

  const pricing = calculatePremiumPricing(months, discountEligible);
  const totalAmount = pricing.totalAmount;
  const balance = Number(profile?.balance) || 0;
  const missingAmount = Math.max(0, totalAmount - balance);
  const premiumUntil = profile?.premiumUntil?.toDate
    ? profile.premiumUntil.toDate()
    : profile?.premiumUntil ? new Date(profile.premiumUntil) : null;
  const isPremium = Boolean(premiumUntil && Number.isFinite(premiumUntil.getTime()) && premiumUntil > new Date());
  const daysLeft = isPremium
    ? Math.max(0, Math.ceil((premiumUntil.getTime() - Date.now()) / 86400000))
    : 0;
  const hasDurationDiscount = pricing.durationDiscount > 0;

  const handlePayWithBalance = async () => {
    setError('');
    setSuccess(false);
    if (!user) {
      setError('Connecte-toi pour continuer.');
      return;
    }
    if (balance < totalAmount) {
      setError('Ton solde est insuffisant. Il manque ' + formatCurrency(missingAmount) + '.');
      return;
    }

    setPaymentMethod('balance');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/subscription/pay-balance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ months }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Le paiement avec ton portefeuille n’a pas pu être confirmé.');
      }
      setSuccess(true);
    } catch (paymentError) {
      setError(paymentError.message || 'Une erreur est survenue pendant le paiement.');
    } finally {
      setPaymentMethod('');
    }
  };

  const handlePayWithFapshi = async () => {
    setError('');
    setSuccess(false);
    if (!user) {
      setError('Connecte-toi pour continuer.');
      return;
    }

    setPaymentMethod('fapshi');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ months }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.checkoutUrl) {
        throw new Error(data.error || 'Impossible de préparer le paiement Mobile Money. Réessaie.');
      }
      window.location.assign(data.checkoutUrl);
    } catch (paymentError) {
      setError(paymentError.message || 'Le service de paiement est momentanément indisponible.');
      setPaymentMethod('');
    }
  };

  return (
    <div className="pata-premium-page mx-auto max-w-5xl space-y-5 pb-10 sm:space-y-6">
      <header className="pata-page-heading space-y-1">
        <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-brand-700">Ton espace abonnement</p>
        <h1 className="pata-page-title text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          {isPremium ? 'Ton abonnement Pata' : 'Découvre Pata Premium'}
        </h1>
      </header>

      <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-brand-800">
              <Crown size={14}/>
              <span className="text-[10px] font-extrabold uppercase tracking-[.15em]">Pata Premium</span>
            </div>
            <h2 className="mt-4 max-w-xl text-2xl font-extrabold leading-tight tracking-[-.035em] text-slate-950 sm:text-3xl">
              Tes finances suivies avec moins d’efforts.
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-5 text-slate-600">
              Automatisation Mobile Money, saisie rapide, assistant Mč et suivi avancé.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-700">SMS Mobile Money</span>
              <span className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-700">Notifications intelligentes</span>
              <span className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-700">Mč et automatisations</span>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-[#f8faf9] p-4 md:min-w-[210px]">
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">À partir de</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <strong className="text-3xl font-extrabold tracking-tight text-slate-950">2 500</strong>
              <span className="text-xs font-semibold text-slate-500">FCFA / mois</span>
            </div>
            <a href="#premium-checkout" className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#075b43] px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#064b38]">
              {isPremium ? 'Prolonger mon accès' : 'Choisir Premium'} <ArrowRight size={15}/>
            </a>
            <a href="#premium-benefits" className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1 text-xs font-semibold text-slate-600 hover:text-brand-700">
              Comparer les fonctionnalités
            </a>
          </div>
        </div>
      </section>

      <section className="pata-surface-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Crown size={19}/></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-slate-500">Ton forfait actuel</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">{isPremium ? 'Pata Premium' : 'Pata gratuit'}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {isPremium
                ? 'Ton accès Premium est actif jusqu’au ' + premiumUntil.toLocaleDateString('fr-FR') + '.'
                : 'La version gratuite reste disponible pour gérer tes opérations essentielles, tes budgets et ton épargne.'}
            </p>
          </div>
          <span className={'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ' + (isPremium ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700')}>
            {isPremium ? 'ACTIF' : 'GRATUIT'}
          </span>
        </div>
        {isPremium ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div>
              <p className="text-sm font-bold text-slate-900">{daysLeft} jour(s) restant(s)</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Tu peux prolonger ton accès sans perdre les jours déjà acquis.</p>
            </div>
            <Link href="/telecharger" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#075b43] px-3.5 text-xs font-bold text-white">
              Installer Pata sur Android <ArrowRight size={14}/>
            </Link>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-slate-100 pt-3 sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-extrabold text-slate-900">60</p><p className="mt-0.5 text-[10px] leading-4 text-slate-500">Dépenses par mois</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-extrabold text-slate-900">2</p><p className="mt-0.5 text-[10px] leading-4 text-slate-500">Revenus par mois</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-extrabold text-slate-900">2</p><p className="mt-0.5 text-[10px] leading-4 text-slate-500">Budgets par mois</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-extrabold text-slate-900">3</p><p className="mt-0.5 text-[10px] leading-4 text-slate-500">Questions Mč par jour</p></div>
          </div>
        )}
      </section>

      <section id="premium-benefits" className="space-y-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-brand-700">Ce qui change au quotidien</p>
          <h2 className="mt-1 text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">Les avantages que tu remarques dès les premiers jours</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <article className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/90 to-white p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-emerald-800 shadow-sm"><Activity size={19}/></span>
            <h3 className="mt-3 text-sm font-extrabold text-slate-900">Les SMS Mobile Money sont détectés</h3>
            <p className="mt-1.5 text-xs leading-5 text-slate-600">Pata reconnaît certaines confirmations MTN MoMo et Orange Money et prépare les opérations correspondantes pour ton suivi.</p>
            <p className="mt-2 text-[10px] font-semibold text-emerald-800">Android · après autorisation</p>
          </article>
          <article className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/90 to-white p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-emerald-800 shadow-sm"><BellRing size={19}/></span>
            <h3 className="mt-3 text-sm font-extrabold text-slate-900">Saisis sans ouvrir Pata à chaque fois</h3>
            <p className="mt-1.5 text-xs leading-5 text-slate-600">La notification permanente donne un accès direct à la saisie rapide. Tes opérations peuvent être conservées hors connexion puis synchronisées.</p>
            <p className="mt-2 text-[10px] font-semibold text-emerald-800">Saisie rapide · mode hors connexion</p>
          </article>
          <article className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/90 to-white p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-emerald-800 shadow-sm"><MessageCircle size={19}/></span>
            <h3 className="mt-3 text-sm font-extrabold text-slate-900">Continue à parler avec Mč depuis les notifications</h3>
            <p className="mt-1.5 text-xs leading-5 text-slate-600">Retrouve des conversations séparées, épingle les échanges importants et réalise certaines actions sans revenir systématiquement dans l’application.</p>
            <p className="mt-2 text-[10px] font-semibold text-emerald-800">Assistant · historique · conversations épinglées</p>
          </article>
          <article className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/90 to-white p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-emerald-800 shadow-sm"><Smartphone size={19}/></span>
            <h3 className="mt-3 text-sm font-extrabold text-slate-900">Retrouve tes soldes depuis ton écran Android</h3>
            <p className="mt-1.5 text-xs leading-5 text-slate-600">Le widget financier affiche les informations utiles de ton tableau de bord directement sur ton téléphone.</p>
            <p className="mt-2 text-[10px] font-semibold text-emerald-800">Widget Android</p>
          </article>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Sparkles size={17}/></span>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">Et pour le reste de ta gestion ?</h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">Augmente tes capacités pour les revenus, dépenses, budgets, objectifs et prévisions. Suis davantage de dettes, organise des projets et profite d’un usage élargi de Mč.</p>
              <p className="mt-2 text-[10px] leading-4 text-slate-500">L’utilisation de l’IA reste soumise à la disponibilité des fournisseurs et aux règles de sécurité de Pata.</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
          <p className="text-[11px] leading-5 text-slate-600">
            Les fonctions qui lisent les SMS, utilisent la notification permanente ou affichent le widget nécessitent l’application Android officielle et les autorisations correspondantes. Tu peux continuer à utiliser Pata sur le Web sans activer ces accès.
          </p>
        </div>
      </section>

      {checkingDiscount && <p className="text-xs text-slate-400">Vérification de ton éventuelle offre de parrainage…</p>}
      {discountEligible && !isPremium && (
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs leading-5 text-emerald-900">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0"/>
          <p><strong>Ton avantage de parrainage est disponible.</strong> Le premier mois bénéficie de 1 250 FCFA de réduction. Cette remise peut se cumuler avec la réduction de durée.</p>
        </div>
      )}
      {success && (
        <section role="status" aria-live="polite" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={21} className="mt-0.5 shrink-0 text-emerald-700"/>
            <div>
              <p className="text-sm font-extrabold text-emerald-950">Paiement confirmé. Ton accès Premium est prolongé.</p>
              <p className="mt-1 text-xs leading-5 text-emerald-900/80">Pour profiter de l’import Mobile Money, de la notification permanente et du widget, installe l’application Android officielle.</p>
              <Link href="/telecharger" className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#075b43] px-4 text-xs font-bold text-white">Installer Pata sur Android <ArrowRight size={14}/></Link>
            </div>
          </div>
        </section>
      )}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs leading-5 text-red-700">{error}</p>}

      <section id="premium-checkout" className="pata-premium-checkout scroll-mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-[#f8faf9] p-4 sm:p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-emerald-800">Choisis ton abonnement</p>
          <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{isPremium ? 'Prolonge ton accès Premium' : 'Active Pata Premium'}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">Pas de renouvellement automatique : tu choisis quand prolonger.</p>
            </div>
            {hasDurationDiscount && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[10px] font-extrabold text-brand-800 ring-1 ring-slate-200">
                <Zap size={12}/> {pricing.bundleLabel}
              </span>
            )}
          </div>
        </div>
        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[1.1fr_.9fr]">
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-800">Durée souhaitée</label>
            <div className="grid grid-cols-2 gap-2">
              {[1, 3, 6, 12].map((option) => {
                const optionPricing = calculatePremiumPricing(option, discountEligible);
                const selected = months === option;
                return (
                  <button key={option} type="button" onClick={() => setMonths(option)} aria-pressed={selected}
                    className={'pata-premium-duration relative min-h-[78px] rounded-2xl border p-3 text-left transition ' + (selected ? 'border-brand-700 bg-[#f3f7f5] ring-2 ring-brand-700/10' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50')}>
                    {optionPricing.bundleLabel && <span className="absolute right-2 top-2 max-w-[calc(100%-16px)] rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] font-extrabold text-slate-700">{optionPricing.bundleLabel}</span>}
                    <span className="block text-[11px] font-bold text-slate-500">{option} mois</span>
                    <strong className="mt-1 block text-base font-extrabold tracking-tight text-slate-900">{formatCurrency(optionPricing.totalAmount)}</strong>
                    {optionPricing.bundleSavings > 0 && <span className="mt-0.5 block text-[9px] font-semibold text-brand-800">Économise {formatCurrency(optionPricing.bundleSavings)}</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] leading-5 text-slate-500">Chaque mois ajoute 30 jours. Si ton accès est déjà actif, les jours restants sont conservés.</p>
            <div className="pata-surface-card rounded-xl bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-500">Prix normal</span>
                <strong className="text-slate-800">{formatCurrency(pricing.regularAmount)}</strong>
              </div>
              {pricing.referralDiscount > 0 && (
                <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500">Avantage de parrainage</span>
                  <strong className="text-emerald-700">− {formatCurrency(pricing.referralDiscount)}</strong>
                </div>
              )}
              {pricing.durationDiscount > 0 && (
                <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500">Avantage du forfait</span>
                  <strong className="text-emerald-700">− {formatCurrency(pricing.durationDiscount)}</strong>
                </div>
              )}
              <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-slate-200 pt-2.5">
                <span className="text-xs font-bold text-slate-700">Total à payer</span>
                <strong className="text-lg font-extrabold tracking-tight text-[#075b43]">{formatCurrency(totalAmount)}</strong>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl bg-[#f4f8f5] p-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500">Solde Pata</span>
                <strong className="text-xs font-bold text-slate-900">{formatCurrency(balance)}</strong>
              </div>
              {missingAmount > 0 && <p className="mt-2 text-[11px] leading-4 text-amber-700">Il manque {formatCurrency(missingAmount)} dans ton portefeuille.</p>}
              <Button onClick={handlePayWithBalance} disabled={Boolean(paymentMethod) || balance < totalAmount} className="mt-3 w-full">
                <Wallet size={15}/>{paymentMethod === 'balance' ? 'Paiement en cours…' : 'Payer avec mon portefeuille'}
              </Button>
              {missingAmount > 0 && (
                <Link href="/wallet" className="mt-2.5 flex min-h-9 items-center justify-center gap-1 text-xs font-bold text-brand-700 hover:underline">
                  Recharger mon portefeuille <ArrowUpRight size={13}/>
                </Link>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 p-3.5">
              <div className="flex items-center gap-2">
                <Smartphone size={17} className="text-brand-700"/>
                <p className="text-xs font-extrabold text-slate-900">Paiement Mobile Money</p>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">Continue vers la page de paiement sécurisée pour choisir le moyen proposé.</p>
              <Button variant="secondary" onClick={handlePayWithFapshi} disabled={Boolean(paymentMethod)} className="mt-3 w-full">
                {paymentMethod === 'fapshi' ? 'Préparation du paiement…' : 'Payer par Mobile Money'} <ArrowRight size={14}/>
              </Button>
            </div>
            <p className="flex items-start gap-2 text-[10px] leading-4 text-slate-500">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-700"/>
              Ton abonnement est activé après confirmation du paiement. Tes fonctions gratuites restent accessibles.
            </p>
          </div>
        </div>
      </section>

      <section className="pata-surface-card overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <button type="button" onClick={() => setShowAllBenefits((value) => !value)} aria-expanded={showAllBenefits}
          className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50 sm:px-5">
          <span>
            <strong className="block text-sm font-extrabold text-slate-900">Explorer toutes les fonctionnalités</strong>
            <span className="mt-0.5 block text-[11px] text-slate-500">Comparaison détaillée entre la version gratuite et Premium</span>
          </span>
          {showAllBenefits ? <ChevronUp size={18} className="text-slate-500"/> : <ChevronDown size={18} className="text-slate-500"/>}
        </button>
        {showAllBenefits && (
          <div className="space-y-5 border-t border-slate-100 p-4 sm:p-5">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer les avantages">
              {[
                ['compare', 'Comparer les deux'],
                ['free', 'Version gratuite'],
                ['premium', 'Version Premium'],
              ].map(([value, label]) => (
                <button key={value} type="button" aria-pressed={benefitFilter === value} onClick={() => setBenefitFilter(value)}
                  className={'min-h-9 rounded-lg border px-3 py-2 text-xs font-semibold transition ' + (
                    benefitFilter === value
                      ? 'border-brand-700 bg-brand-700 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  )}>
                  {label}
                </button>
              ))}
            </div>
            {BENEFITS.map((group) => {
              const visibleItems = group.items.filter(([, free, paid]) => (
                benefitFilter === 'compare' || (benefitFilter === 'free' ? free !== false : paid !== false)
              ));
              if (!visibleItems.length) return null;
              const grid = benefitFilter === 'compare'
                ? 'grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]'
                : 'grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]';
              return (
                <section key={group.group} className="space-y-2.5">
                  <h3 className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-500">{group.group}</h3>
                  <div className={grid + ' items-center gap-2 border-b border-slate-200 pb-2'}>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Fonctionnalité</p>
                    {benefitFilter !== 'premium' && <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Gratuit</p>}
                    {benefitFilter !== 'free' && <p className="text-[10px] font-bold uppercase tracking-wide text-brand-700">Premium</p>}
                  </div>
                  {visibleItems.map(([label, free, paid]) => (
                    <div key={label} className={grid + ' items-start gap-2 border-b border-slate-100 py-2.5 last:border-0'}>
                      <p className="text-xs leading-4 text-slate-700">{label}</p>
                      {benefitFilter !== 'premium' && <div><Value value={free}/></div>}
                      {benefitFilter !== 'free' && <div><Value value={paid}/></div>}
                    </div>
                  ))}
                </section>
              );
            })}
            <p className="text-[10px] leading-4 text-slate-500">
              Les fonctions d’intelligence artificielle restent soumises à leur disponibilité et aux règles de sécurité de Pata. Premium élargit l’accès sans garantir une disponibilité illimitée. L’import automatique des SMS Mobile Money, la notification permanente et le widget financier nécessitent l’application Android officielle et les autorisations correspondantes.
            </p>
          </div>
        )}
      </section>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
        <p className="text-[11px] leading-5 text-slate-600">
          Tu peux conserver la version gratuite aussi longtemps que tu le souhaites. Premium ajoute des capacités et des automatisations : il ne supprime pas l’accès à tes fonctions essentielles si tu ne t’abonnes pas.
        </p>
      </div>
    </div>
  );
}
