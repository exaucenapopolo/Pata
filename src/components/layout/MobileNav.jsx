'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Wallet, Banknote, Target, Menu, X,
  TrendingUp, PiggyBank, BarChart3, Settings, LogOut, Crown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const MAIN_NAV = [
  { href: '/dashboard', label: 'Accueil',    icon: LayoutDashboard },
  { href: '/expenses',  label: 'Dépenses',   icon: Wallet },
  { href: '/wallet',    label: 'Solde',      icon: Banknote },
  { href: '/goals',     label: 'Objectifs',  icon: Target },
];

const MORE_NAV = [
  { href: '/income',    label: 'Revenus',    icon: TrendingUp },
  { href: '/budgets',   label: 'Budgets',    icon: PiggyBank },
  { href: '/reports',   label: 'Rapports',   icon: BarChart3 },
  { href: '/premium',   label: 'Premium',    icon: Crown },
  { href: '/settings',  label: 'Paramètres', icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [showMore, setShowMore] = useState(false);

  const handleLogout = async () => {
    setShowMore(false);
    await logout();
    router.replace('/login');
  };

  return (
    <>
      {showMore && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/40 md:hidden">
          <div className="flex-1" onClick={() => setShowMore(false)} />
          
          <div className="rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl">
            <div className="mx-auto mb-4 mt-2 h-1.5 w-12 rounded-full bg-slate-200" />
            
            <div className="px-4 pb-4">
              <h3 className="mb-4 text-sm font-bold text-slate-900 px-2">Toutes les options</h3>
              <div className="grid grid-cols-2 gap-3">
                {MORE_NAV.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setShowMore(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border p-3 transition-colors',
                      pathname === href
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-slate-100 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    )}
                  >
                    <div className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm',
                      pathname === href ? 'text-brand-600' : 'text-slate-500'
                    )}>
                      <Icon size={20} />
                    </div>
                    <span className="text-sm font-semibold">{label}</span>
                  </Link>
                ))}
              </div>

              <button
                onClick={handleLogout}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-bold text-red-600 transition hover:bg-red-100"
              >
                <LogOut size={18} />
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {MAIN_NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-3 text-[10px] font-medium transition-colors',
                active ? 'text-brand-600' : 'text-slate-500'
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}
        
        <button
          onClick={() => setShowMore(true)}
          className={cn(
            'flex flex-1 flex-col items-center gap-1 py-3 text-[10px] font-medium transition-colors',
            showMore ? 'text-brand-600' : 'text-slate-500'
          )}
        >
          <Menu size={20} strokeWidth={showMore ? 2.5 : 2} />
          Plus
        </button>
      </nav>
    </>
  );
                      }
