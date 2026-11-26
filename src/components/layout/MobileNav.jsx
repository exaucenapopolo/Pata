'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Wallet, TrendingUp, Plus, Menu, X, Banknote, Target, BarChart3, Settings, Crown, LogOut, PiggyBank, Users, HandCoins, Receipt, Info, Lock, Pencil, GripVertical, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { bodyScrollLockManager } from '@/lib/ui/bodyScrollLock.mjs';
import { getQuickNavigationPages, moveQuickNavigationPage } from '@/lib/navigation/quickNavigation.mjs';

const MORE_NAV = [
  { href: '/wallet', label: 'Portefeuille', icon: Banknote, description: 'Solde et mouvements', position: 'top-left' },
  { href: '/budgets', label: 'Budgets', icon: PiggyBank, description: 'Enveloppes mensuelles', position: 'top-center' },
  { href: '/goals', label: 'Objectifs', icon: Target, description: 'Épargne personnelle et objectifs', position: 'top-right' },
  { href: '/cotisations', label: 'Cotisations', icon: Users, description: 'Groupes, tours et versements', position: 'middle-left' },
  { href: '/bills', label: 'Factures', icon: Receipt, description: 'Électricité, eau, loyer et abonnements', position: 'middle-right' },
  { href: '/debts', label: 'Dettes & prêts', icon: HandCoins, description: 'Créances, échéances et remboursements', position: 'bottom-left' },
  { href: '/reports', label: 'Rapports', icon: BarChart3, description: 'Bilans et analyses', position: 'bottom-center' },
  { href: '/calculator', label: 'Calculatrice', icon: Calculator, description: 'Faire un calcul et copier le résultat', position: 'top-center' },
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
  { href: '/calculator', label: 'Calculatrice', description: 'Faire un calcul', icon: Calculator, tone: 'slate' },
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
  const [quickPages, setQuickPages] = useState(() => getQuickNavigationPages(QUICK_NAV_PAGES, {}, null, 4));
  const quickPagesRef = useRef(quickPages);
  const [isQuickLocked, setIsQuickLocked] = useState(false);
  const [isArrangingQuick, setIsArrangingQuick] = useState(false);
  const [draggedQuickHref, setDraggedQuickHref] = useState(null);
  const [quickInfoOpen, setQuickInfoOpen] = useState(false);
  const quickGestureRef = useRef(null);
  const quickLongPressRef = useRef(null);
  const suppressQuickClickRef = useRef(false);

  useEffect(() => {
    if (!showMore && !showActions) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowMore(false);
        closeQuickMenu();
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
        const usage = user?.uid
          ? JSON.parse(localStorage.getItem('pata-page-visits:' + user.uid) || '{}')
          : {};
        const preference = user?.uid
          ? JSON.parse(localStorage.getItem('pata-quick-navigation:v1:' + user.uid) || 'null')
          : null;
        const pages = getQuickNavigationPages(QUICK_NAV_PAGES, usage, preference, 4);
        quickPagesRef.current = pages;
        setQuickPages(pages);
        setIsQuickLocked(Boolean(preference?.customized && preference?.locked));
      } catch {
        const fallbackPages = getQuickNavigationPages(QUICK_NAV_PAGES, {}, null, 4);
        quickPagesRef.current = fallbackPages;
        setQuickPages(fallbackPages);
        setIsQuickLocked(false);
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
    quickPagesRef.current = quickPages;
  }, [quickPages]);

  useEffect(() => () => {
    if (quickLongPressRef.current) window.clearTimeout(quickLongPressRef.current);
  }, []);

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

  const persistQuickPreference = (pages, locked) => {
    if (!user?.uid || typeof window === 'undefined') return;
    try {
      localStorage.setItem('pata-quick-navigation:v1:' + user.uid, JSON.stringify({
        version: 1,
        customized: true,
        locked: Boolean(locked),
        order: pages.map((page) => page.href),
      }));
      setIsQuickLocked(Boolean(locked));
    } catch {
      // La navigation reste utilisable même si le stockage local est indisponible.
    }
  };

  const unlockQuickNavigation = () => {
    setIsQuickLocked(false);
    setIsArrangingQuick(true);
    setQuickInfoOpen(false);
    persistQuickPreference(quickPagesRef.current, false);
  };

  function closeQuickMenu() {
    if (quickGestureRef.current && quickLongPressRef.current) {
      window.clearTimeout(quickLongPressRef.current);
    }
    quickLongPressRef.current = null;
    quickGestureRef.current = null;
    setDraggedQuickHref(null);
    setIsArrangingQuick(false);
    setQuickInfoOpen(false);
    setShowActions(false);
  }

  const lockQuickNavigation = () => {
    persistQuickPreference(quickPagesRef.current, true);
    setIsArrangingQuick(false);
    setDraggedQuickHref(null);
  };

  const handleQuickPointerDown = (event, href) => {
    if (isQuickLocked) return;
    if (quickLongPressRef.current) window.clearTimeout(quickLongPressRef.current);

    if (isArrangingQuick) {
      event.preventDefault();
      quickGestureRef.current = {
        pointerId: event.pointerId,
        href,
        startX: event.clientX,
        startY: event.clientY,
        longPressed: true,
        element: event.currentTarget,
      };
      setDraggedQuickHref(href);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }

    quickGestureRef.current = {
      pointerId: event.pointerId,
      href,
      startX: event.clientX,
      startY: event.clientY,
      longPressed: false,
      element: event.currentTarget,
    };
    quickLongPressRef.current = window.setTimeout(() => {
      const gesture = quickGestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gesture.longPressed = true;
      suppressQuickClickRef.current = true;
      setIsArrangingQuick(true);
      setDraggedQuickHref(href);
      gesture.element?.setPointerCapture?.(gesture.pointerId);
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(12);
    }, 430);
  };

  const handleQuickPointerMove = (event) => {
    const gesture = quickGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!gesture.longPressed) {
      const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
      if (distance > 10 && quickLongPressRef.current) {
        window.clearTimeout(quickLongPressRef.current);
        quickLongPressRef.current = null;
        quickGestureRef.current = null;
      }
      return;
    }

    const nodes = Array.from(document.querySelectorAll('[data-quick-href]'));
    const target = nodes.find((node) => {
      const rect = node.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    const targetHref = target?.getAttribute('data-quick-href');
    if (!targetHref || targetHref === gesture.href) return;
    setQuickPages((current) => {
      const nextPages = moveQuickNavigationPage(current, gesture.href, targetHref);
      quickPagesRef.current = nextPages;
      return nextPages;
    });
  };

  const handleQuickPointerEnd = (event) => {
    const gesture = quickGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (quickLongPressRef.current) window.clearTimeout(quickLongPressRef.current);
    quickLongPressRef.current = null;
    if (gesture.longPressed) {
      suppressQuickClickRef.current = true;
      persistQuickPreference(quickPagesRef.current, false);
      setDraggedQuickHref(null);
    }
    quickGestureRef.current = null;
  };

  const handleQuickPointerCancel = () => {
    if (quickLongPressRef.current) window.clearTimeout(quickLongPressRef.current);
    quickLongPressRef.current = null;
    quickGestureRef.current = null;
    setDraggedQuickHref(null);
  };

  return (
    <>
      {(showMore || showActions) && <button type="button" aria-label="Fermer le menu" onClick={() => { setShowMore(false); setShowActions(false); }} className={'pata-mobile-backdrop fixed inset-0 z-[60] lg:hidden' + (showMore ? ' is-orbit' : showActions ? ' is-quick' : '')} />}
      {showActions && (
        <section
          id="pata-quick-actions-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pata-quick-actions-title"
          className="pata-quick-swarm fixed inset-0 z-[70] flex items-end justify-center px-3 pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:hidden"
          onClick={closeQuickMenu}
        >
          <div className="pata-quick-swarm-content w-full" onClick={(event) => event.stopPropagation()}>
            <header className="pata-quick-swarm-toolbar">
              <div className="pata-quick-swarm-heading">
                <span className="pata-quick-swarm-eyebrow">PATA</span>
                <h2 id="pata-quick-actions-title">Tes raccourcis</h2>
              </div>
              <div className="pata-quick-swarm-controls">
                <button
                  type="button"
                  className={'pata-quick-control' + (quickInfoOpen ? ' is-selected' : '')}
                  aria-label="Comprendre les raccourcis"
                  aria-expanded={quickInfoOpen}
                  onClick={() => setQuickInfoOpen((value) => !value)}
                ><Info size={16}/></button>
                {isArrangingQuick ? (
                  <button type="button" className="pata-quick-lock" onClick={lockQuickNavigation}>
                    <Lock size={13}/> Verrouiller
                  </button>
                ) : isQuickLocked ? (
                  <button type="button" className="pata-quick-control" onClick={unlockQuickNavigation} aria-label="Déverrouiller et réorganiser les raccourcis">
                    <Pencil size={15}/>
                  </button>
                ) : null}
                <button ref={quickMenuCloseRef} type="button" className="pata-quick-control" onClick={closeQuickMenu} aria-label="Fermer les raccourcis">
                  <X size={17}/>
                </button>
              </div>
            </header>
            {quickInfoOpen && (
              <p className="pata-quick-info">
                Pata propose les pages que tu consultes le plus. Maintiens un raccourci pour le déplacer, puis verrouille ton organisation pour la conserver.
              </p>
            )}
            <div className={'pata-quick-swarm-stage' + (isArrangingQuick ? ' is-arranging' : '')}>
              {quickPages.map((item, index) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-quick-href={item.href}
                    data-slot={index}
                    style={{ '--quick-order': index }}
                    onPointerDown={(event) => handleQuickPointerDown(event, item.href)}
                    onPointerMove={handleQuickPointerMove}
                    onPointerUp={handleQuickPointerEnd}
                    onPointerCancel={handleQuickPointerCancel}
                    onContextMenu={(event) => event.preventDefault()}
                    onClick={(event) => {
                      if (suppressQuickClickRef.current || isArrangingQuick) {
                        event.preventDefault();
                        suppressQuickClickRef.current = false;
                        return;
                      }
                      closeQuickMenu();
                    }}
                    aria-current={active ? 'page' : undefined}
                    aria-label={isArrangingQuick ? item.label + ', déplacer le raccourci' : item.label}
                    className={'pata-quick-node' + (active ? ' is-current' : '') + (draggedQuickHref === item.href ? ' is-dragging' : '')}
                  >
                    <span className="pata-quick-node-icon"><Icon size={23} strokeWidth={2}/></span>
                    <strong>{item.label}</strong>
                    {isArrangingQuick && <span className="pata-quick-node-grip" aria-hidden="true"><GripVertical size={13}/></span>}
                    {active && <span className="pata-quick-node-active" aria-hidden="true"/>}
                  </Link>
                );
              })}
            </div>
            {isArrangingQuick && (
              <p className="pata-quick-arrange-hint">Fais glisser les raccourcis, puis verrouille ton choix.</p>
            )}
          </div>
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
