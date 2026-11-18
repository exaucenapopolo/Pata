'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import {
  Activity, ArrowRight, ArrowUpRight, Check, CheckCircle2,
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
    <div className="pata-premium-page mx-auto w-full max-w-2xl space-y-5 pb-10 sm:space-y-6">
      <header className="relative isolate overflow-hidden rounded-[28px] bg-gradient-to-b from-[#e8f3ec] via-[#f5f9f6] to-transparent px-4 pb-5 pt-5 text-center dark:from-[#18382b] dark:via-[#14231b]">
        <div className="pointer-events-none absolute -top-20 left-1/2 -z-10 h-56 w-56 -translate-x-1/2 rounded-full bg-brand-300/25 blur-3xl" />
        <div className="relative mx-auto grid h-28 w-28 place-items-center rounded-full bg-gradient-to-br from-[#0b7657] via-[#075b43] to-[#043a2c] text-white shadow-[0_16px_34px_rgba(7,91,67,.24)]">
          <div className="absolute inset-[7px] rounded-full border border-white/15" />
          <Crown size={43} strokeWidth={1.65} />
          <span className="absolute right-3 top-3 text-emerald-100"><Sparkles size={17} /></span>
        </div>
        <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[.2em] text-brand-700 dark:text-emerald-300">Pata Premium</p>
        <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-[-.045em] text-slate-950 dark:text-white sm:text-3xl">
          {isPremium ? 'Prolonge ton accès' : 'Passe à'}{' '}
          <span className="text-brand-700 dark:text-emerald-300">Premium</span>
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-300">
          {isPremium
            ? 'Continue à profiter de toutes les possibilités de Pata, sans interruption.'
            : 'Une gestion financière plus complète, plus intelligente et moins limitée.'}
        </p>
        {isPremium && (
          <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-2 text-xs font-bold text-emerald-800 shadow-sm dark:border-emerald-900 dark:bg-[#173329] dark:text-emerald-200">
            <CheckCircle2 size={15} />
            Premium actif · {daysLeft} jour(s) restant(s)
          </div>
        )}
      </header>

      <section className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-[#18251f] sm:p-5" aria-labelledby="premium-benefits-heading">
        <div className="mb-2">
          <p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-brand-700 dark:text-emerald-300">Les avantages Premium</p>
          <h2 id="premium-benefits-heading" className="mt-1 text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
            Plus de possibilités au quotidien
          </h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {[
            {
              icon: Activity,
              title: 'Le suivi Mobile Money devient plus simple',
              description: 'Pata détecte les SMS compatibles et prépare les opérations pour ton suivi.',
              note: 'Android · après autorisation',
            },
            {
              icon: Zap,
              title: 'Saisis tes opérations plus rapidement',
              description: 'Accède à la saisie depuis la notification Pata, même hors connexion, puis synchronise tes données.',
              note: 'Saisie rapide · mode hors connexion',
            },
            {
              icon: MessageCircle,
              title: 'Profite davantage de ton assistante Mč',
              description: 'Retrouve tes conversations depuis les notifications et épingle les échanges importants.',
              note: 'Assistant · historique · conversations épinglées',
            },
            {
              icon: Wallet,
              title: 'Gère tes finances avec moins de limites',
              description: 'Débloque les capacités étendues pour tes revenus, dépenses, budgets, objectifs, projets et prévisions.',
              note: 'Fonctionnalités Premium',
            },
            {
              icon: Smartphone,
              title: 'Consulte tes soldes depuis ton écran',
              description: 'Retrouve les informations utiles de ton tableau de bord grâce au widget financier Android.',
              note: 'Widget Android',
            },
          ].map(({ icon: BenefitIcon, title, description, note }) => (
            <div key={title} className="flex items-start gap-3 py-3.5 first:pt-2 last:pb-1">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-[#173329] dark:text-emerald-300">
                <BenefitIcon size={19} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[13px] font-bold leading-5 text-slate-900 dark:text-slate-100">{title}</h3>
                <p className="mt-0.5 text-xs leading-5 text-slate-600 dark:text-slate-300">{description}</p>
                <p className="mt-1 text-[10px] font-semibold text-brand-700 dark:text-emerald-300">{note}</p>
              </div>
              <CheckCircle2 size={17} className="mt-1 shrink-0 text-brand-700 dark:text-emerald-300" />
            </div>
          ))}
        </div>
      </section>

      {checkingDiscount && (
        <p className="text-center text-[11px] text-slate-400">Vérification de ton éventuel avantage de parrainage…</p>
      )}

      <section id="premium-checkout" className="scroll-mt-5 overflow-hidden rounded-[25px] border border-brand-200 bg-white shadow-[0_10px_30px_rgba(7,91,67,.07)] dark:border-[#315844] dark:bg-[#18251f]">
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-brand-700 dark:text-emerald-300">Ton abonnement</p>
              <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
                {months === 1 ? 'Accès pendant 30 jours' : 'Accès pendant ' + (months * 30) + ' jours'}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1.5 text-[10px] font-bold text-brand-800 dark:bg-[#173329] dark:text-emerald-200">
              <ShieldCheck size={13} /> Sans renouvellement auto
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <strong className="text-[32px] font-extrabold leading-none tracking-[-.045em] text-slate-950 dark:text-white">
                {formatCurrency(totalAmount)}
              </strong>
              {pricing.totalSavings > 0 && (
                <span className="text-xs font-semibold text-slate-400 line-through">{formatCurrency(pricing.regularAmount)}</span>
              )}
            </div>
            {pricing.totalSavings > 0 && (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold text-emerald-800 dark:bg-[#173329] dark:text-emerald-200">
                Économise {formatCurrency(pricing.totalSavings)}
              </span>
            )}
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2" role="group" aria-label="Choisir la durée de l'abonnement">
            {[1, 3, 6, 12].map((option) => {
              const optionPricing = calculatePremiumPricing(option, discountEligible);
              const selected = months === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMonths(option)}
                  aria-pressed={selected}
                  className={'flex min-h-[54px] min-w-0 flex-col items-center justify-center rounded-xl border px-1.5 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ' + (
                    selected
                      ? 'border-brand-700 bg-brand-50 text-brand-900 ring-2 ring-brand-700/10 dark:border-emerald-500 dark:bg-[#173329] dark:text-emerald-100'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:bg-brand-50/50 dark:border-slate-700 dark:bg-[#14221b] dark:text-slate-300'
                  )}
                >
                  <span className="text-xs font-extrabold">{option} mois</span>
                  {optionPricing.bundleSavings > 0 && (
                    <span className="mt-0.5 max-w-full truncate text-[8px] font-bold text-emerald-700 dark:text-emerald-300">
                      {option === 3 ? '−501 FCFA' : option === 6 ? '1 mois offert' : '2 mois offerts'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {(pricing.referralDiscount > 0 || pricing.durationDiscount > 0) && (
            <div className="mt-3 space-y-1 rounded-xl bg-emerald-50/80 px-3 py-2.5 text-[11px] dark:bg-[#173329]">
              {pricing.referralDiscount > 0 && (
                <p className="flex items-center justify-between gap-3 text-emerald-900 dark:text-emerald-200">
                  <span>Avantage de parrainage</span><strong>− {formatCurrency(pricing.referralDiscount)}</strong>
                </p>
              )}
              {pricing.durationDiscount > 0 && (
                <p className="flex items-center justify-between gap-3 text-emerald-900 dark:text-emerald-200">
                  <span>Réduction de durée</span><strong>− {formatCurrency(pricing.durationDiscount)}</strong>
                </p>
              )}
            </div>
          )}

          {discountEligible && !isPremium && (
            <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
              Ton avantage de parrainage est appliqué automatiquement au premier mois.
            </p>
          )}

          {error && (
            <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700 dark:border-red-900 dark:bg-[#3a2423] dark:text-red-200">
              {error}
            </p>
          )}

          {success && (
            <div role="status" aria-live="polite" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-[#173329]">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-300" />
                <div>
                  <p className="text-xs font-extrabold text-emerald-950 dark:text-emerald-100">Paiement confirmé. Ton accès Premium est prolongé.</p>
                  <p className="mt-1 text-[11px] leading-4 text-emerald-900 dark:text-emerald-200">Pour profiter des fonctions Android, installe l’application officielle.</p>
                  <Link href="/telecharger" className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3 text-[11px] font-bold text-white">
                    Installer Pata sur Android <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 space-y-2.5">
            <Button onClick={handlePayWithFapshi} disabled={Boolean(paymentMethod)} size="lg" className="min-h-12 w-full rounded-2xl text-sm font-extrabold shadow-[0_9px_22px_rgba(7,91,67,.18)]">
              {paymentMethod === 'fapshi' ? 'Préparation du paiement…' : isPremium ? 'Prolonger mon accès Premium' : 'Acheter Premium'}
              {paymentMethod !== 'fapshi' && <ArrowRight size={17} />}
            </Button>

            {balance >= totalAmount ? (
              <button
                type="button"
                onClick={handlePayWithBalance}
                disabled={Boolean(paymentMethod)}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-xs font-bold text-brand-800 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-[#14221b] dark:text-emerald-200 dark:hover:bg-[#1d3027]"
              >
                <Wallet size={15} />
                {paymentMethod === 'balance' ? 'Paiement en cours…' : 'Payer avec mon portefeuille Pata'}
              </button>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] dark:bg-[#14221b]">
                <span className="text-slate-600 dark:text-slate-300">Solde Pata : <strong className="text-slate-900 dark:text-white">{formatCurrency(balance)}</strong></span>
                <Link href="/wallet" className="inline-flex min-h-8 items-center gap-1 font-bold text-brand-700 hover:underline dark:text-emerald-300">
                  Recharger <ArrowUpRight size={13} />
                </Link>
              </div>
            )}
          </div>

          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[10px] leading-4 text-slate-500 dark:text-slate-400">
            <ShieldCheck size={13} className="shrink-0 text-brand-700 dark:text-emerald-300" />
            Paiement sécurisé · Aucun renouvellement automatique
          </p>
        </div>
      </section>

      <p className="px-2 text-center text-[11px] leading-5 text-slate-500 dark:text-slate-400">
        Tu peux conserver la version gratuite aussi longtemps que tu le souhaites. Premium ajoute des capacités sans supprimer l’accès à tes fonctions essentielles.
      </p>

      <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-[#18251f]">
        <button
          type="button"
          onClick={() => setShowAllBenefits((value) => !value)}
          aria-expanded={showAllBenefits}
          className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-[#1d3027] sm:px-5"
        >
          <span>
            <strong className="block text-sm font-extrabold text-slate-900 dark:text-white">Comparer toutes les fonctionnalités</strong>
            <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">Voir le détail des différences entre Gratuit et Premium</span>
          </span>
          {showAllBenefits ? <ChevronUp size={18} className="text-slate-500" /> : <ChevronDown size={18} className="text-slate-500" />}
        </button>

        {showAllBenefits && (
          <div className="space-y-5 border-t border-slate-100 p-4 dark:border-slate-700 sm:p-5">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer les avantages">
              {[
                ['compare', 'Comparer les deux'],
                ['free', 'Version gratuite'],
                ['premium', 'Version Premium'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={benefitFilter === value}
                  onClick={() => setBenefitFilter(value)}
                  className={'min-h-9 rounded-lg border px-3 py-2 text-xs font-semibold transition ' + (
                    benefitFilter === value
                      ? 'border-brand-700 bg-brand-700 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-[#14221b] dark:text-slate-300'
                  )}
                >
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
                  <h3 className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-500 dark:text-slate-400">{group.group}</h3>
                  <div className={grid + ' items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-700'}>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Fonctionnalité</p>
                    {benefitFilter !== 'premium' && <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Gratuit</p>}
                    {benefitFilter !== 'free' && <p className="text-[10px] font-bold uppercase tracking-wide text-brand-700 dark:text-emerald-300">Premium</p>}
                  </div>
                  {visibleItems.map(([label, free, paid]) => (
                    <div key={label} className={grid + ' items-start gap-2 border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-700'}>
                      <p className="text-xs leading-4 text-slate-700 dark:text-slate-300">{label}</p>
                      {benefitFilter !== 'premium' && <div><Value value={free} /></div>}
                      {benefitFilter !== 'free' && <div><Value value={paid} /></div>}
                    </div>
                  ))}
                </section>
              );
            })}

            <p className="text-[10px] leading-4 text-slate-500 dark:text-slate-400">
              Les fonctions d’intelligence artificielle restent soumises à leur disponibilité et aux règles de sécurité de Pata. Premium élargit l’accès sans garantir une disponibilité illimitée. L’import automatique des SMS Mobile Money, la notification permanente et le widget financier nécessitent l’application Android officielle et les autorisations correspondantes.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
