'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Wallet, Banknote, TrendingUp, Target, BarChart3, Settings, PiggyBank, Crown, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Accueil', section: 'PRINCIPAL', icon: LayoutDashboard },
  { href: '/wallet', label: 'Portefeuille', section: 'PRINCIPAL', icon: Banknote },
  { href: '/expenses', label: 'Dépenses', section: 'GESTION', icon: Wallet },
  { href: '/income', label: 'Revenus', section: 'GESTION', icon: TrendingUp },
  { href: '/budgets', label: 'Budgets', section: 'GESTION', icon: PiggyBank },
  { href: '/goals', label: 'Objectifs', section: 'GESTION', icon: Target },
  { href: '/cotisations', label: 'Cotisations', section: 'GESTION', icon: Users },
  { href: '/reports', label: 'Rapports', section: 'ANALYSE', icon: BarChart3 },
  { href: '/premium', label: 'Pata Premium', section: 'COMPTE', icon: Crown },
  { href: '/settings', label: 'Paramètres', section: 'COMPTE', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  let lastSection = '';
  return (
    <aside className="sticky top-0 hidden h-[100dvh] w-[248px] shrink-0 flex-col border-r border-slate-200/90 bg-white lg:flex">
      <Link href="/dashboard" className="flex h-[72px] items-center gap-3 border-b border-slate-100 px-6">
        <img src="/android-chrome-192x192.png" alt="" className="h-10 w-10 rounded-xl object-cover" />
        <span className="text-[24px] font-bold tracking-[-0.055em] text-[#075b43]">pata</span>
      </Link>
      <nav aria-label="Navigation principale" className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          const showSection = item.section !== lastSection;
          lastSection = item.section;
          const Icon = item.icon;
          return (
            <div key={item.href}>
              {showSection && <p className="px-3 pb-2 pt-4 text-[9px] font-bold tracking-[0.16em] text-slate-400">{item.section}</p>}
              <Link href={item.href} aria-current={active ? 'page' : undefined} className={cn('group flex min-h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition-colors duration-150', active ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900')}>
                <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg transition', active ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-400 group-hover:text-slate-700')}><Icon size={17} strokeWidth={active ? 2.5 : 2}/></span>
                {item.label}
                {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-600"/>}
              </Link>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-slate-100 p-4">
        <div className="rounded-2xl bg-[#edf5f0] p-3">
          <p className="text-xs font-semibold text-slate-800">Tes finances, en clair.</p>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">Revenus, dépenses et épargne réunis dans un seul espace.</p>
        </div>
        <p className="mt-3 text-center text-[9px] font-medium tracking-wide text-slate-400">PATA · ESPACE PERSONNEL</p>
      </div>
    </aside>
  );
}
