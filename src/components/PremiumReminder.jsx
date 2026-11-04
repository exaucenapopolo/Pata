/* eslint-disable react/no-unescaped-entities */
'use client';

import { useProfile } from '@/hooks/useProfile';
import { getSubscriptionStatus } from '@/lib/firestore/subscriptions';
import { AlertTriangle, Crown, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export function PremiumReminder() {
  const { profile } = useProfile();
  const status = getSubscriptionStatus(profile);

  if (!status.isPremium) {
    return (
      <div className="mx-4 mt-4 sm:mx-6 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
          <AlertTriangle size={16} />
          <span>Ton abonnement a expiré. Passe Premium pour débloquer toutes les fonctionnalités.</span>
        </div>
        <Link href="/premium" className="flex items-center gap-1 text-xs font-bold text-amber-700 hover:underline shrink-0">
          S’abonner <ChevronRight size={14} />
        </Link>
      </div>
    );
  }

  if (status.daysLeft <= 3) {
    return (
      <div className="mx-4 mt-4 sm:mx-6 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
          <AlertTriangle size={16} />
          <span>Ton abonnement expire dans <strong>{status.daysLeft} jour{status.daysLeft > 1 ? 's' : ''}</strong>. Renouvelle pour ne rien perdre.</span>
        </div>
        <Link href="/premium" className="flex items-center gap-1 text-xs font-bold text-amber-700 hover:underline shrink-0">
          Renouveler <ChevronRight size={14} />
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-4 sm:mx-6 flex items-center gap-2 text-xs font-semibold text-brand-600">
      <Crown size={14} /> Abonné Premium — {status.daysLeft} jours restants
    </div>
  );
}
