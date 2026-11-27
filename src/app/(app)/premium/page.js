'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import {
  Activity, ArrowRight, ArrowUpRight, BellRing, Check,
  ChevronDown, ChevronUp, Minus, ShieldCheck, Sparkles, Wallet
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
  { group: 'Gestion d’entreprise', items: [
    ['Créer et gérer plusieurs espaces professionnels', false, true],
    ['Trésorerie séparée, caisses et comptes Mobile Money', false, true],
    ['Revenus, dépenses, apports et transferts professionnels', false, true],
    ['Factures clients, créances et obligations à payer', false, true],
    ['Clients, fournisseurs, partenaires et contrats', false, true],
    ['Budgets et rapports financiers professionnels', false, true],
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
  if (value === true) return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"><Check size={14} /> Inclus</span>;
  if (value === false) return <span className="inline-flex items-center gap-1.5 text-xs text-slate-400"><Minus size={14} /> Non inclus</span>;
  return <span className="text-xs text-slate-600 dark:text-slate-300">{value}</span>;
}

const QUICK_BENEFITS = [
  { icon: Activity, title: 'Détection automatique des SMS Mobile Money' },
  { icon: BellRing, title: 'Saisie rapide depuis les notifications Pata' },
  { icon: Wallet, title: 'Dépenses, revenus et budgets sans limite' },
  { icon: Sparkles, title: 'Assistante Mč et prévisions avancées' },
];

export default function PremiumPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [months, setMonths] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [discountEligible, setDiscountEligible] = useState(false);
  const [showAllBenefits, setShowAllBenefits] = useState(false);
  const [benefitFilter, setBenefitFilter] = useState('compare');

  useEffect(() => {
    let active = true;
    const loadReferralOffer = async () => {
      if (!user) {
        setDiscountEligible(false);
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
    <div className="pata-premium-page mx-auto flex w-full max-w-[440px] flex-col gap-3 pb-2">
      <header className="flex flex-col items-center text-center">
        <Image
          src="/pata-premium-piggy.svg"
          alt="Tirelire Pata Premium avec pièce et couronne dorées"
          width={170}
          height={145}
          priority
          className="h-[100px] w-[118px] object-contain"
        />
        <h1 className="mt-0.5 text-[26px] font-extrabold leading-8 tracking-[-.045em] text-slate-950 dark:text-white">
          Passer à <span className="text-brand-700 dark:text-emerald-300">Premium</span>
        </h1>
        <p className="mt-0.5 max-w-[340px] text-[12px] leading-[18px] text-slate-600 dark:text-slate-300">
          Plus de liberté pour gérer ton argent, avec les outils avancés de Pata.
        </p>
        {isPremium && (
          <p className="mt-1 text-[10px] font-semibold text-brand-700 dark:text-emerald-300">
            Abonnement actif · {daysLeft} jour(s) restant(s)
          </p>
        )}
      </header>

      <section aria-labelledby="premium-quick-benefits" className="px-1">
        <h2 id="premium-quick-benefits" className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[.14em] text-brand-700 dark:text-emerald-300">
          Les avantages Premium
        </h2>
        <div className="space-y-1">
          {QUICK_BENEFITS.map(({ icon: BenefitIcon, title }) => (
            <div key={title} className="flex min-h-[29px] items-center gap-2.5">
              <span className="flex h-[25px] w-[25px] shrink-0 items-center justify-center rounded-full bg-[#e8f1e9] text-brand-700 dark:bg-[#20372b] dark:text-emerald-300">
                <BenefitIcon size={14} strokeWidth={2.1} />
              </span>
              <span className="min-w-0 flex-1 text-[12px] font-semibold leading-[17px] text-slate-800 dark:text-slate-100">
                {title}
              </span>
              <Check size={15} className="shrink-0 text-brand-700 dark:text-emerald-300" />
            </div>
          ))}
        </div>
        <p className="mt-1 text-[9px] leading-3 text-slate-400">
          * La détection des SMS et le widget nécessitent l’application Android et les autorisations correspondantes.
        </p>
      </section>

      <section id="premium-checkout" className="rounded-[18px] border border-[#dce7df] bg-white px-3 py-3 shadow-[0_2px_9px_rgba(18,62,39,.045)] dark:border-slate-700 dark:bg-[#18251f]">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-extrabold text-slate-900 dark:text-white">Choisis ton accès</h2>
          <span className="text-[9px] font-medium text-slate-500 dark:text-slate-400">Sans renouvellement automatique</span>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-1.5" role="group" aria-label="Durée de l’abonnement">
          {[1, 3, 6, 12].map((option) => {
            const optionPricing = calculatePremiumPricing(option, discountEligible);
            const selected = months === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setMonths(option)}
                aria-pressed={selected}
                className={'flex min-h-[39px] flex-col items-center justify-center rounded-[10px] border px-1 py-1 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 ' + (
                  selected
                    ? 'border-brand-700 bg-[#edf4ee] text-brand-900 dark:border-emerald-500 dark:bg-[#20372b] dark:text-emerald-100'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 dark:border-slate-700 dark:bg-[#14221b] dark:text-slate-300'
                )}
              >
                <span className="text-[11px] font-extrabold">{option} mois</span>
                {optionPricing.bundleSavings > 0 && (
                  <span className="text-[8px] font-semibold text-emerald-700 dark:text-emerald-300">
                    {option === 3 ? '−501 FCFA' : option === 6 ? '1 mois offert' : '2 mois offerts'}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-2.5 flex items-end justify-between gap-2">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[.1em] text-slate-500 dark:text-slate-400">Total à payer</p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <strong className="text-[25px] font-extrabold leading-7 tracking-[-.04em] text-slate-950 dark:text-white">
                {formatCurrency(totalAmount)}
              </strong>
              {pricing.totalSavings > 0 && (
                <span className="text-[10px] font-medium text-slate-400 line-through">{formatCurrency(pricing.regularAmount)}</span>
              )}
            </div>
          </div>
          <span className="pb-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
            {months === 1 ? '30 jours' : (months * 30) + ' jours'}
          </span>
        </div>

        {(pricing.referralDiscount > 0 || pricing.durationDiscount > 0) && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] font-semibold text-emerald-700 dark:text-emerald-300">
            {pricing.referralDiscount > 0 && <span>Parrainage : −{formatCurrency(pricing.referralDiscount)}</span>}
            {pricing.durationDiscount > 0 && <span>Forfait : −{formatCurrency(pricing.durationDiscount)}</span>}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] leading-4 text-red-700 dark:border-red-900 dark:bg-[#3a2423] dark:text-red-200">
            {error}
          </p>
        )}

        {success && (
          <p role="status" aria-live="polite" className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] font-semibold text-emerald-800 dark:bg-[#173329] dark:text-emerald-200">
            Paiement confirmé. Ton accès Premium a été prolongé.
          </p>
        )}

        <Button
          onClick={handlePayWithFapshi}
          disabled={Boolean(paymentMethod)}
          size="lg"
          className="mt-2.5 min-h-[45px] w-full rounded-xl text-[13px] font-extrabold shadow-none"
        >
          {paymentMethod === 'fapshi' ? 'Préparation du paiement…' : isPremium ? 'Prolonger Premium' : 'Acheter Premium'}
          {paymentMethod !== 'fapshi' && <ArrowRight size={16} />}
        </Button>

        {balance >= totalAmount ? (
          <button
            type="button"
            onClick={handlePayWithBalance}
            disabled={Boolean(paymentMethod)}
            className="mt-1.5 flex min-h-[27px] w-full items-center justify-center gap-1.5 text-[10px] font-bold text-brand-700 hover:underline disabled:opacity-60 dark:text-emerald-300"
          >
            <Wallet size={12} />
            Ou payer avec mon portefeuille Pata
          </button>
        ) : (
          <p className="mt-1.5 text-center text-[10px] text-slate-500 dark:text-slate-400">
            Solde Pata : {formatCurrency(balance)} · <Link href="/wallet" className="font-bold text-brand-700 hover:underline dark:text-emerald-300">Recharger</Link>
          </p>
        )}

        <p className="mt-1 flex items-center justify-center gap-1 text-[9px] leading-3 text-slate-400">
          <ShieldCheck size={11} className="shrink-0 text-brand-700 dark:text-emerald-300" />
          Paiement sécurisé · Aucun renouvellement automatique
        </p>
      </section>

      <section className="rounded-[14px] border border-[#e1e9e3] bg-white dark:border-slate-700 dark:bg-[#18251f]">
        <button
          type="button"
          onClick={() => setShowAllBenefits((value) => !value)}
          aria-expanded={showAllBenefits}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3.5 py-2 text-left"
        >
          <span>
            <strong className="block text-[11px] font-extrabold text-slate-800 dark:text-slate-100">En savoir plus sur Premium</strong>
            <span className="mt-0.5 block text-[9px] text-slate-500 dark:text-slate-400">Comparer toutes les fonctionnalités</span>
          </span>
          {showAllBenefits ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
        </button>

        {showAllBenefits && (
          <div className="space-y-4 border-t border-slate-100 px-3.5 py-3 dark:border-slate-700">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer les avantages">
              {[
                ['compare', 'Comparer'],
                ['free', 'Gratuit'],
                ['premium', 'Premium'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={benefitFilter === value}
                  onClick={() => setBenefitFilter(value)}
                  className={'min-h-8 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition ' + (
                    benefitFilter === value
                      ? 'border-brand-700 bg-brand-700 text-white'
                      : 'border-slate-200 bg-white text-slate-600 dark:border-slate-600 dark:bg-[#14221b] dark:text-slate-300'
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
                <section key={group.group} className="space-y-2">
                  <h3 className="text-[9px] font-bold uppercase tracking-[.12em] text-slate-500 dark:text-slate-400">{group.group}</h3>
                  <div className={grid + ' items-center gap-2 border-b border-slate-200 pb-1.5 dark:border-slate-700'}>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Fonctionnalité</p>
                    {benefitFilter !== 'premium' && <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Gratuit</p>}
                    {benefitFilter !== 'free' && <p className="text-[9px] font-bold uppercase tracking-wide text-brand-700 dark:text-emerald-300">Premium</p>}
                  </div>
                  {visibleItems.map(([label, free, paid]) => (
                    <div key={label} className={grid + ' items-start gap-2 border-b border-slate-100 py-2 last:border-0 dark:border-slate-700'}>
                      <p className="text-[10px] leading-4 text-slate-700 dark:text-slate-300">{label}</p>
                      {benefitFilter !== 'premium' && <div><Value value={free} /></div>}
                      {benefitFilter !== 'free' && <div><Value value={paid} /></div>}
                    </div>
                  ))}
                </section>
              );
            })}

            <div className="space-y-1 text-[9px] leading-4 text-slate-500 dark:text-slate-400">
              <p>Les fonctions d’intelligence artificielle restent soumises à leur disponibilité et aux règles de sécurité de Pata. Premium élargit l’accès sans garantir une disponibilité illimitée.</p>
              <p>L’import automatique des SMS Mobile Money, la notification permanente et le widget financier nécessitent l’application Android officielle et les autorisations correspondantes.</p>
              <p>Tu peux conserver la version gratuite aussi longtemps que tu le souhaites. Premium ajoute des capacités sans supprimer l’accès à tes fonctions essentielles.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
