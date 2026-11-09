'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Wallet, TrendingUp, Plus, Menu, X, Banknote, Target, BarChart3, Settings, Crown, LogOut, PiggyBank, ArrowDownLeft, ArrowUpRight, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const MORE_NAV = [
  { href: '/wallet', label: 'Portefeuille', icon: Banknote, description: 'Solde et mouvements' },
  { href: '/budgets', label: 'Budgets', icon: PiggyBank, description: 'Enveloppes mensuelles' },
  { href: '/goals', label: 'Objectifs', icon: Target, description: 'Épargne personnelle et objectifs' },
  { href: '/cotisations', label: 'Cotisations', icon: Users, description: 'Groupes, tours et versements' },
  { href: '/reports', label: 'Rapports', icon: BarChart3, description: 'Bilans et analyses' },
  { href: '/premium', label: 'Premium', icon: Crown, description: 'Options et abonnement' },
  { href: '/settings', label: 'Paramètres', icon: Settings, description: 'Compte et préférences' },
];
const QUICK_ACTIONS = [
  { href: '/expenses?new=1', label: 'Nouvelle dépense', description: 'Enregistrer une sortie', icon: ArrowUpRight, tone: 'text-rose-700 bg-rose-50' },
  { href: '/income?new=1', label: 'Nouveau revenu', description: 'Ajouter une entrée', icon: ArrowDownLeft, tone: 'text-emerald-700 bg-emerald-50' },
  { href: '/budgets', label: 'Définir un budget', description: 'Planifier mes dépenses', icon: PiggyBank, tone: 'text-blue-700 bg-blue-50' },
  { href: '/goals', label: 'Gérer mes objectifs', description: 'Suivre mon épargne', icon: Target, tone: 'text-violet-700 bg-violet-50' },
];

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [showMore, setShowMore] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const handleLogout = async () => {
    setShowMore(false);
    await logout();
    router.replace('/login');
  };
  const isActive = (href) => pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      {(showMore || showActions) && <button type="button" aria-label="Fermer le menu" onClick={() => { setShowMore(false); setShowActions(false); }} className="fixed inset-0 z-[60] bg-slate-950/35 backdrop-blur-[2px] lg:hidden" />}
      {showActions && (
        <section className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-[70] rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl lg:hidden">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="text-base font-bold text-slate-900">Action rapide</h2><p className="mt-0.5 text-xs text-slate-500">Que souhaites-tu enregistrer ?</p></div><button type="button" onClick={() => setShowActions(false)} className="rounded-full bg-slate-100 p-2 text-slate-500" aria-label="Fermer"><X size={17}/></button></div>
          <div className="grid grid-cols-2 gap-2.5">
            {QUICK_ACTIONS.map((item) => {
              const Icon = item.icon;
              const target = item.href.split('?')[0];
              return <Link key={item.href} href={item.href} onClick={(event) => {
                if (pathname === target && item.href.includes('new=1')) {
                  event.preventDefault();
                  window.dispatchEvent(new CustomEvent(target === '/expenses' ? 'pata:expense-new' : 'pata:income-new'));
                }
                setShowActions(false);
              }} className="rounded-2xl border border-slate-100 bg-slate-50 p-3 transition active:scale-[0.98]">
                <span className={'mb-3 flex h-10 w-10 items-center justify-center rounded-xl ' + item.tone}><Icon size={19}/></span>
                <strong className="block text-xs text-slate-900">{item.label}</strong><span className="mt-1 block text-[10px] text-slate-500">{item.description}</span>
              </Link>;
            })}
          </div>
        </section>
      )}
      {showMore && (
        <section className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-[70] max-h-[72vh] overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,0.22)] animate-in slide-in-from-bottom-3 fade-in duration-200 lg:hidden">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="text-base font-bold text-slate-900">Tout Pata</h2><p className="mt-0.5 text-xs text-slate-500">Tes outils financiers au même endroit.</p></div><button type="button" onClick={() => setShowMore(false)} className="rounded-full bg-slate-100 p-2 text-slate-500" aria-label="Fermer"><X size={17}/></button></div>
          <div className="grid grid-cols-3 gap-2.5">
            {MORE_NAV.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return <Link key={item.href} href={item.href} onClick={() => setShowMore(false)} className={cn('flex min-h-[104px] min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border p-2 text-center transition active:scale-[0.96]', active ? 'border-brand-200 bg-brand-50' : 'border-slate-100 bg-slate-50/70 hover:bg-slate-50')}>
                <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', active ? 'bg-white text-brand-700 shadow-sm' : 'bg-white text-slate-600 shadow-sm')}><Icon size={18}/></span>
                <span className="min-w-0"><strong className="block break-words text-[11px] leading-4 text-slate-900">{item.label}</strong><span className="mt-1 block text-[9px] leading-3 text-slate-500">{item.description}</span></span>
              </Link>;
            })}
          </div>
          <button type="button" onClick={handleLogout} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-3 text-sm font-semibold text-red-700"><LogOut size={16}/> Se déconnecter</button>
        </section>
      )}
      <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 items-end border-t border-slate-200/90 bg-white/96 px-1 pb-[max(env(safe-area-inset-bottom),8px)] pt-1.5 shadow-[0_-6px_22px_rgba(8,39,70,0.07)] backdrop-blur-xl lg:hidden">
        <Link href="/dashboard" className={cn('flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition', isActive('/dashboard') ? 'text-brand-700' : 'text-slate-500')}><Home size={19} strokeWidth={isActive('/dashboard') ? 2.6 : 2}/><span>Accueil</span></Link>
        <Link href="/expenses" className={cn('flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition', isActive('/expenses') ? 'text-brand-700' : 'text-slate-500')}><Wallet size={19} strokeWidth={isActive('/expenses') ? 2.6 : 2}/><span>Dépenses</span></Link>
        <button type="button" onClick={() => { setShowActions((value) => !value); setShowMore(false); }} aria-label="Actions rapides" aria-expanded={showActions} className="-mt-5 mx-auto flex h-[52px] w-[52px] items-center justify-center rounded-2xl border-[3px] border-white bg-[#092b4e] text-white shadow-lg shadow-brand-900/20 transition active:scale-95"><Plus size={24} strokeWidth={2.7}/></button>
        <Link href="/income" className={cn('flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition', isActive('/income') ? 'text-brand-700' : 'text-slate-500')}><TrendingUp size={19} strokeWidth={isActive('/income') ? 2.6 : 2}/><span>Revenus</span></Link>
        <button type="button" onClick={() => { setShowMore((value) => !value); setShowActions(false); }} aria-label="Ouvrir le menu" aria-expanded={showMore} className={cn('flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition', showMore || MORE_NAV.some((item) => isActive(item.href)) ? 'text-brand-700' : 'text-slate-500')}>{showMore ? <X size={19}/> : <Menu size={19}/>}<span>Plus</span></button>
      </nav>
    </>
  );
}
