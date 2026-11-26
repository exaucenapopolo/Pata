'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CalculatorPanel } from '@/components/finance/CalculatorPanel';

export default function CalculatorPage() {
  return (
    <div className="mx-auto w-full max-w-xl space-y-4 pb-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" aria-label="Retour au tableau de bord" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"><ArrowLeft size={19}/></Link>
        <h1 className="text-xl font-extrabold text-slate-900">Calculatrice</h1>
      </div>
      <CalculatorPanel/>
    </div>
  );
}
