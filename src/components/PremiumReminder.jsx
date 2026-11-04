/* eslint-disable react/no-unescaped-entities */
'use client';

import { useProfile } from '@/hooks/useProfile';
import { Crown, ChevronRight, AlertTriangle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';

export function PremiumReminder() {
  const { profile } = useProfile();
  
  if (!profile) return null;

  const now = new Date();
  const premiumUntil = profile.premiumUntil ? new Date(profile.premiumUntil) : null;
  
  // Cas 1 : L'utilisateur n'a JAMAIS payé (premiumUntil est null)
  if (!premiumUntil) {
    return (
      <div className="mx-4 mt-4 sm:mx-6 rounded-xl bg-gradient-to-r from-brand-50 to-emerald-50 border border-brand-200 p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-brand-800 text-sm font-medium">
          <Sparkles size={16} className="text-brand-600" />
          <span>Découvre Pata Premium pour débloquer toutes les fonctionnalités illimitées.</span>
        </div>
        <Link href="/premium" className="flex items-center gap-1 text-xs font-bold text-brand-700 hover:underline shrink-0">
          Découvrir <ChevronRight size={14} />
        </Link>
      </div>
    );
  }

  // Cas 2 : L'abonnement est expiré
  if (premiumUntil < now) {
    return (
      <div className="mx-4 mt-4 sm:mx-6 rounded-xl bg-red-50 border border-red-200 p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-red-800 text-sm font-medium">
          <AlertTriangle size={16} />
          <span>Ton abonnement Premium a expiré. Renouvelle pour retrouver l'accès illimité.</span>
        </div>
        <Link href="/premium" className="flex items-center gap-1 text-xs font-bold text-red-700 hover:underline shrink-0">
          Renouveler <ChevronRight size={14} />
        </Link>
      </div>
    );
  }

  // Cas 3 : L'abonnement expire dans 3 jours ou moins
  const daysLeft = Math.ceil((premiumUntil - now) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 3) {
    return (
      <div className="mx-4 mt-4 sm:mx-6 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
          <AlertTriangle size={16} />
          <span>Ton abonnement expire dans <strong>{daysLeft} jour{daysLeft > 1 ? 's' : ''}</strong>. Renouvelle pour éviter les restrictions.</span>
        </div>
        <Link href="/premium" className="flex items-center gap-1 text-xs font-bold text-amber-700 hover:underline shrink-0">
          Renouveler <ChevronRight size={14} />
        </Link>
      </div>
    );
  }

  // Cas 4 : Abonnement actif et il reste plus de 3 jours
  return (
    <div className="mx-4 mt-4 sm:mx-6 flex items-center gap-2 text-xs font-semibold text-brand-600">
      <Crown size={14} /> Membre Premium — {daysLeft} jours restants
    </div>
  );
}
