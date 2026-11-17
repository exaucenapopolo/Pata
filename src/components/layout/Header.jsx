'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, LogOut, Settings, User, HelpCircle } from 'lucide-react';
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
  const isHome = pathname === '/dashboard' || pathname === '/dashboard/';
  const page = PAGE_TITLES.find((item) => pathname === item.path || pathname.startsWith(item.path + '/'));
  const pageTitle = page ? (language === 'en' ? page.en : page.fr) : (language === 'en' ? 'My space' : 'Mon espace');

  const goBack = () => {
    setOpen(false);
    const sameOriginReferrer = typeof document !== 'undefined'
      && document.referrer
      && document.referrer.startsWith(window.location.origin);
    const nextHistoryEntryIsInternal = typeof window !== 'undefined'
      && Number.isInteger(window.history.state?.idx)
      && window.history.state.idx > 0;
    if (sameOriginReferrer || nextHistoryEntryIsInternal) router.back();
    else router.replace('/dashboard');
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
            <ArrowLeft size={21} strokeWidth={2.25} />
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
