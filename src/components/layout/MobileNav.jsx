'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Wallet, TrendingUp, Target, BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Accueil',   icon: LayoutDashboard },
  { href: '/expenses',  label: 'Dépenses',  icon: Wallet },
  { href: '/income',    label: 'Revenus',   icon: TrendingUp },
  { href: '/goals',     label: 'Objectifs', icon: Target },
  { href: '/reports',   label: 'Rapports',  icon: BarChart3 },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-slate-200 bg-white md:hidden">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium',
              active ? 'text-brand-600' : 'text-slate-500'
            )}
          >
            <Icon size={18} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
   }
