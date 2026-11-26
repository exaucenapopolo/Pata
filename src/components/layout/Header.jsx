'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, LogOut, Settings, User, HelpCircle, Calculator } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useLanguage } from '@/context/LanguageContext';
import { NotificationInbox } from '@/components/NotificationInbox';

const PAGE_TITLES = [
  { path: '/dashboard', fr: "Vue d’ensemble", en: 'Overview' },
  { path: '/expenses', fr: 'Dépenses', en: 'Expenses' },
  { path: '/income', fr: 'Revenus', en: 'Income' },
  { path: '/budgets', fr: 'Budgets', en: 'Budgets' },
  { path: '/debts', fr: 'Dettes et prêts', en: 'Debts & loans' },
  { path: '/bills', fr: 'Factures', en: 'Bills' },
  { path: '/cotisations', fr: 'Cotisations', en: 'Contributions' },
  { path: '/goals', fr: 'Épargne et objectifs', en: 'Savings & goals' },
  { path: '/wallet', fr: 'Portefeuille', en: 'Wallet' },
  { path: '/reports', fr: 'Rapports', en: 'Reports' },
  { path: '/calculator', fr: 'Calculatrice', en: 'Calculator' },
  { path: '/premium', fr: 'Pata Premium', en: 'Pata Premium' },
  { path: '/settings', fr: 'Paramètres', en: 'Settings' },
];

export function Header() {
  const { user, logout } = useAuth();
  const { profile } = useProfile();
  const { language } = useLanguage();
  const pathname = usePathname() || '/dashboard';
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const routeStackRef = useRef([]);
  const replaceTargetRef = useRef(null);

  useEffect(() => {
    const syncStackAfterHistoryNavigation = () => {
      const nextPath = window.location.pathname || '/dashboard';
      const stack = routeStackRef.current;
      const previousIndex = stack.lastIndexOf(nextPath);
      routeStackRef.current = previousIndex >= 0
        ? stack.slice(0, previousIndex + 1)
        : [...stack, nextPath].slice(-25);
    };
    window.addEventListener('popstate', syncStackAfterHistoryNavigation);
    return () => window.removeEventListener('popstate', syncStackAfterHistoryNavigation);
  }, []);

  useEffect(() => {
    const stack = routeStackRef.current;
    if (replaceTargetRef.current === pathname) {
      replaceTargetRef.current = null;
      routeStackRef.current = [pathname];
      return;
    }
    if (stack[stack.length - 1] === pathname) return;
    routeStackRef.current = [...stack, pathname].slice(-25);
  }, [pathname]);

  const isHome = pathname === '/dashboard' || pathname === '/dashboard/';
  const page = PAGE_TITLES.find((item) => pathname === item.path || pathname.startsWith(item.path + '/'));
  const pageTitle = page ? (language === 'en' ? page.en : page.fr) : (language === 'en' ? 'My space' : 'Mon espace');

  const goBack = () => {
    setOpen(false);
    if (routeStackRef.current.length > 1) {
      router.back();
      return;
    }

    // A page opened from another page on the same Pata origin should return there.
    let hasInternalReferrer = false;
    try {
      hasInternalReferrer = Boolean(
        document.referrer
        && new URL(document.referrer).origin === window.location.origin
        && window.history.length > 1
      );
    } catch {
      hasInternalReferrer = false;
    }
    if (hasInternalReferrer) {
      router.back();
      return;
    }

    // When a deep link has no previous in-app page, return to its natural section.
    const parentPage = PAGE_TITLES.find((item) => pathname.startsWith(item.path + '/'));
    const fallbackPath = parentPage?.path || '/dashboard';
    replaceTargetRef.current = fallbackPath;
    routeStackRef.current = [fallbackPath];
    router.replace(fallbackPath);
  };

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    router.replace('/login');
  };

  return (
    <header className="pata-app-header sticky top-0 z-40 flex h-[60px] shrink-0 items-center justify-between border-b border-slate-200/90 bg-white/95 px-3 backdrop-blur-xl sm:px-6 lg:h-[68px] lg:px-8">
      <div className="flex h-10 w-10 shrink-0 items-center justify-start">
        {!isHome && (
          <button
            type="button"
            onClick={goBack}
            className="pata-header-back inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition active:scale-95 hover:bg-slate-100 hover:text-slate-900"
            aria-label={language === 'en' ? 'Go back' : 'Retour'}
            title={language === 'en' ? 'Go back' : 'Retour'}
          >
            <ChevronLeft size={25} strokeWidth={2.5} />
          </button>
        )}
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 w-[min(66%,680px)] -translate-x-1/2 -translate-y-1/2 text-center">
        <h1 className="pata-header-title truncate text-[19px] font-extrabold tracking-[-0.045em] text-slate-900 sm:text-[21px]">
          {pageTitle}
        </h1>
        {isHome && profile?.displayName && (
          <p className="hidden truncate text-[10px] font-medium text-slate-500 sm:block">
            {language === 'en' ? 'Your personal space' : 'Ton espace personnel'}
          </p>
        )}
      </div>

      <div className="relative flex shrink-0 items-center gap-1.5 sm:gap-2">
        <Link href="/calculator" aria-label={language === 'en' ? 'Open calculator' : 'Ouvrir la calculatrice'} title={language === 'en' ? 'Calculator' : 'Calculatrice'} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"><Calculator size={18}/></Link>
        <NotificationInbox />
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-95"
          aria-label={language === 'en' ? 'Open my profile' : 'Ouvrir mon profil'}
          aria-expanded={open}
        >
          {profile?.photoURL ? (
            <img src={profile.photoURL} alt="" className="h-full w-full rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <User size={19} strokeWidth={2} />
          )}
        </button>
        {open && (
          <>
            <button type="button" aria-label={language === 'en' ? 'Close profile menu' : 'Fermer le menu utilisateur'} onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default" />
            <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
              <div className="px-3 py-3">
                <p className="truncate text-sm font-bold text-slate-900">{profile?.displayName || (language === 'en' ? 'My account' : 'Mon compte')}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{user?.email}</p>
              </div>
              <Link href="/settings" onClick={() => setOpen(false)} className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><Settings size={16} /> {language === 'en' ? 'Account settings' : 'Paramètres du compte'}</Link>
              <Link href="/help" onClick={() => setOpen(false)} className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><HelpCircle size={16} /> {language === 'en' ? 'Help center' : 'Centre d’aide'}</Link>
              <button type="button" onClick={handleLogout} className="mt-1 flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-red-700 hover:bg-red-50"><LogOut size={16} /> {language === 'en' ? 'Sign out' : 'Se déconnecter'}</button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
