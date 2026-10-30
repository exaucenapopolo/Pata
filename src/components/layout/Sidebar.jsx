'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Wallet, TrendingUp, Target, BarChart3, Settings, PiggyBank,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/expenses',  label: 'Dépenses',        icon: Wallet },
  { href: '/income',    label: 'Revenus',         icon: TrendingUp },
  { href: '/budgets',   label: 'Budgets',         icon: PiggyBank },
  { href: '/goals',     label: 'Objectifs',       icon: Target },
  { href: '/reports',   label: 'Rapports',        icon: BarChart3 },
  { href: '/settings',  label: 'Paramètres',      icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
      <Link href="/dashboard" className="flex h-16 items-center gap-2 border-b border-slate-200 px-6">
        <span className="text-2xl font-black tracking-tight text-brand-600">Pata</span>
      </Link>
      <nav className="flex-1 space-y-1 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
      }
