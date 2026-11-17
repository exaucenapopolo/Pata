'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Wallet, TrendingUp, Plus, Menu, X, Banknote, Target, BarChart3, Settings, Crown, LogOut, PiggyBank, Users, HandCoins, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { bodyScrollLockManager } from '@/lib/ui/bodyScrollLock.mjs';
import { rankQuickNavigationPages } from '@/lib/navigation/quickNavigation.mjs';

const MORE_NAV = [
  { href: '/wallet', label: 'Portefeuille', icon: Banknote, description: 'Solde et mouvements', position: 'top-left' },
  { href: '/budgets', label: 'Budgets', icon: PiggyBank, description: 'Enveloppes mensuelles', position: 'top-center' },
  { href: '/goals', label: 'Objectifs', icon: Target, description: 'Épargne personnelle et objectifs', position: 'top-right' },
  { href: '/cotisations', label: 'Cotisations', icon: Users, description: 'Groupes, tours et versements', position: 'middle-left' },
  { href: '/bills', label: 'Factures', icon: Receipt, description: 'Électricité, eau, loyer et abonnements', position: 'middle-right' },
  { href: '/debts', label: 'Dettes & prêts', icon: HandCoins, description: 'Créances, échéances et remboursements', position: 'bottom-left' },
  { href: '/reports', label: 'Rapports', icon: BarChart3, description: 'Bilans et analyses', position: 'bottom-center' },
  { href: '/premium', label: 'Premium', icon: Crown, description: 'Options et abonnement', position: 'center' },
  { href: '/settings', label: 'Paramètres', icon: Settings, description: 'Compte et préférences', position: 'bottom-right' },
];
const QUICK_NAV_PAGES = [
  { href: '/expenses', label: 'Dépenses', description: 'Suivre tes sorties', icon: Wallet, tone: 'rose' },
  { href: '/income', label: 'Revenus', description: 'Suivre tes entrées', icon: TrendingUp, tone: 'emerald' },
  { href: '/budgets', label: 'Budgets', description: 'Organiser tes dépenses', icon: PiggyBank, tone: 'blue' },
  { href: '/goals', label: 'Épargne', description: 'Suivre tes objectifs', icon: Target, tone: 'violet' },
  { href: '/debts', label: 'Dettes & prêts', description: 'Voir tes remboursements', icon: HandCoins, tone: 'amber' },
  { href: '/bills', label: 'Factures', description: 'Retrouver tes échéances', icon: Receipt, tone: 'sky' },
  { href: '/cotisations', label: 'Cotisations', description: 'Gérer tes groupes', icon: Users, tone: 'teal' },
  { href: '/wallet', label: 'Portefeuille', description: 'Consulter ton solde', icon: Banknote, tone: 'lime' },
  { href: '/reports', label: 'Rapports', description: 'Voir tes analyses', icon: BarChart3, tone: 'purple' },
  { href: '/premium', label: 'Premium', description: 'Explorer les automatisations', icon: Crown, tone: 'green' },
  { href: '/settings', label: 'Paramètres', description: 'Gérer tes préférences', icon: Settings, tone: 'slate' },
];

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [showMore, setShowMore] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const moreMenuCloseRef = useRef(null);
  const quickMenuCloseRef = useRef(null);
  const [quickPages, setQuickPages] = useState(() => rankQuickNavigationPages(QUICK_NAV_PAGES, {}, 4));
  const [hasQuickHistory, setHasQuickHistory] = useState(false);

  useEffect(() => {
    if (!showMore && !showActions) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowMore(false);
        setShowActions(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    if (showMore) moreMenuCloseRef.current?.focus();
    if (showActions) quickMenuCloseRef.current?.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showMore, showActions]);

  useEffect(() => {
    const refreshQuickPages = () => {
      try {
        const saved = user?.uid
          ? JSON.parse(localStorage.getItem('pata-page-visits:' + user.uid) || '{}')
          : {};
        const hasHistory = Object.values(saved).some((entry) => Number(entry?.count) > 0);
        setQuickPages(rankQuickNavigationPages(QUICK_NAV_PAGES, saved, 4));
        setHasQuickHistory(hasHistory);
      } catch {
        setQuickPages(rankQuickNavigationPages(QUICK_NAV_PAGES, {}, 4));
        setHasQuickHistory(false);
      }
    };
    refreshQuickPages();
    window.addEventListener('pata:page-usage-updated', refreshQuickPages);
    window.addEventListener('storage', refreshQuickPages);
    return () => {
      window.removeEventListener('pata:page-usage-updated', refreshQuickPages);
      window.removeEventListener('storage', refreshQuickPages);
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!showMore && !showActions) return undefined;
    return bodyScrollLockManager.acquire(document.body);
  }, [showMore, showActions]);

  useEffect(() => {
    setShowMore(false);
    setShowActions(false);
  }, [pathname]);
  const handleLogout = async () => {
    setShowMore(false);
    await logout();
    router.replace('/login');
  };
  const isActive = (href) => pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      {(showMore || showActions) && <button type="button" aria-label="Fermer le menu" onClick={() => { setShowMore(false); setShowActions(false); }} className={'pata-mobile-backdrop fixed inset-0 z-[60] lg:hidden' + (showMore ? ' is-orbit' : showActions ? ' is-quick' : '')} />}
      {showActions && (
        <section id="pata-quick-actions-panel" role="dialog" aria-modal="true" aria-labelledby="pata-quick-actions-title" aria-describedby="pata-quick-actions-description" className="pata-quick-picker fixed bottom-[calc(5.35rem+env(safe-area-inset-bottom))] left-1/2 z-[70] w-[min(92vw,348px)] -translate-x-1/2 lg:hidden">
          <header className="pata-quick-picker-header">
            <div className="min-w-0">
              <p className="pata-quick-picker-eyebrow">{hasQuickHistory ? 'TES HABITUDES' : 'POUR COMMENCER'}</p>
              <h2 id="pata-quick-actions-title">{hasQuickHistory ? 'Tes 4 espaces les plus consultés' : 'Tes espaces à portée de main'}</h2>
              <p id="pata-quick-actions-description">{hasQuickHistory ? 'Classés selon tes visites sur cet appareil.' : 'Pata les classera au fil de ton utilisation.'}</p>
            </div>
            <button ref={quickMenuCloseRef} type="button" onClick={() => setShowActions(false)} className="pata-quick-picker-close" aria-label="Fermer les raccourcis"><X size={16}/></button>
          </header>
          <div className="pata-quick-picker-grid">
            {quickPages.map((item, index) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setShowActions(false)}
                  aria-current={active ? 'page' : undefined}
                  style={{ '--quick-order': index }}
                  className={'pata-quick-page' + (index === 0 ? ' is-top' : '') + (active ? ' is-current' : '')}
                >
                  <span className="pata-quick-page-icon"><Icon size={21} strokeWidth={2}/></span>
                  <span className="pata-quick-page-rank">{String(index + 1).padStart(2, '0')}</span>
                  <strong>{item.label}</strong>
                  <small>{item.visitCount > 0 ? item.visitCount + ' visite' + (item.visitCount > 1 ? 's' : '') : 'À découvrir'}</small>
                </Link>
              );
            })}
          </div>
          <p className="pata-quick-picker-footnote">{hasQuickHistory ? 'Tes raccourcis évoluent avec tes habitudes.' : 'Tes pages les plus consultées apparaîtront ici.'}</p>
        </section>
      )}
      {showMore && (
        <section id="pata-orbit-menu" role="dialog" aria-modal="true" aria-labelledby="pata-more-title" aria-describedby="pata-more-description" className="pata-orbit-overlay fixed inset-0 z-[70] flex items-center justify-center px-3 pb-[calc(5.4rem+env(safe-area-inset-bottom))] pt-[max(env(safe-area-inset-top),18px)] lg:hidden" onClick={() => setShowMore(false)}>
          <div className="pata-orbit-menu w-full" onClick={(event) => event.stopPropagation()}>
            <header className="pata-orbit-header">
              <div>
                <p className="pata-orbit-eyebrow">TON ESPACE PATA</p>
                <h2 id="pata-more-title">Explorer Pata</h2>
                <p id="pata-more-description">Tous tes espaces, à portée de main.</p>
              </div>
              <button ref={moreMenuCloseRef} type="button" onClick={() => setShowMore(false)} className="pata-orbit-close" aria-label="Fermer le menu"><X size={19}/></button>
            </header>
            <div className="pata-orbit-wheel" aria-label="Raccourcis de navigation">
              <div className="pata-orbit-track pata-orbit-track-outer" aria-hidden="true"/>
              <div className="pata-orbit-track pata-orbit-track-inner" aria-hidden="true"/>
              {MORE_NAV.map((item, index) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                const central = item.position === 'center';
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMore(false)}
                    aria-current={active ? 'page' : undefined}
                    aria-label={item.label + ' — ' + item.description}
                    data-position={item.position}
                    style={{ '--orbit-order': index }}
                    className={'pata-orbit-item' + (central ? ' is-central' : '') + (active ? ' is-active' : '')}
                  >
                    <span className="pata-orbit-icon"><Icon size={central ? 25 : 21} strokeWidth={central ? 2.1 : 1.9}/></span>
                    <span className="pata-orbit-label">{item.label}</span>
                    {central && <span className="pata-orbit-subtitle">Découvrir</span>}
                  </Link>
                );
              })}
            </div>
            <footer className="pata-orbit-footer">
              <button type="button" onClick={handleLogout} className="pata-orbit-logout"><LogOut size={15}/> Se déconnecter</button>
              <span className="pata-orbit-hint">Touche en dehors du menu pour fermer</span>
            </footer>
          </div>
        </section>
      )}
      <nav aria-label="Navigation principale" className="pata-bottom-nav fixed left-2.5 right-2.5 bottom-[calc(8px+env(safe-area-inset-bottom))] z-50 grid grid-cols-5 items-end rounded-[24px] border border-slate-200/80 bg-white/90 px-1 pb-1.5 pt-1.5 shadow-[0_8px_30px_rgba(7,91,67,0.12)] backdrop-blur-2xl lg:hidden">
        <Link href="/dashboard" className={cn('flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition', isActive('/dashboard') ? 'text-brand-700' : 'text-slate-500')}><Home size={19} strokeWidth={isActive('/dashboard') ? 2.6 : 2}/><span>Accueil</span></Link>
        <Link href="/expenses" className={cn('flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition', isActive('/expenses') ? 'text-brand-700' : 'text-slate-500')}><Wallet size={19} strokeWidth={isActive('/expenses') ? 2.6 : 2}/><span>Dépenses</span></Link>
        <button type="button" onClick={() => { setShowActions((value) => !value); setShowMore(false); }} aria-label={showActions ? 'Fermer les actions rapides' : 'Actions rapides'} aria-expanded={showActions} aria-controls="pata-quick-actions-panel" className={'pata-quick-launcher -mt-5 mx-auto flex h-[54px] w-[54px] items-center justify-center rounded-[19px] border-[3px] border-white text-white shadow-lg shadow-brand-900/20 transition active:scale-95' + (showActions ? ' is-open' : '')}><Plus size={25} strokeWidth={2.6}/></button>
        <Link href="/income" className={cn('flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition', isActive('/income') ? 'text-brand-700' : 'text-slate-500')}><TrendingUp size={19} strokeWidth={isActive('/income') ? 2.6 : 2}/><span>Revenus</span></Link>
        <button type="button" onClick={() => { setShowMore((value) => !value); setShowActions(false); }} aria-label={showMore ? 'Fermer les espaces' : 'Explorer les espaces'} aria-expanded={showMore} aria-controls="pata-orbit-menu" className={cn('flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition', showMore || MORE_NAV.some((item) => isActive(item.href)) ? 'text-brand-700' : 'text-slate-500')}>{showMore ? <X size={19}/> : <Menu size={19}/>}<span>Plus</span></button>
      </nav>
    </>
  );
}
