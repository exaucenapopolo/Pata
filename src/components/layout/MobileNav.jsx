'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, Wallet, TrendingUp, Plus, Menu, X, Banknote, Target, BarChart3, Settings, Crown, LogOut, PiggyBank, ArrowDownLeft, ArrowUpRight, Users, HandCoins, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

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
  const moreMenuCloseRef = useRef(null);

  useEffect(() => {
    if (!showMore) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setShowMore(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    moreMenuCloseRef.current?.focus();
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showMore]);

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
      {(showMore || showActions) && <button type="button" aria-label="Fermer le menu" onClick={() => { setShowMore(false); setShowActions(false); }} className={'pata-mobile-backdrop fixed inset-0 z-[60] lg:hidden' + (showMore ? ' is-orbit' : '')} />}
      {showActions && (
        <section id="pata-quick-actions-panel" role="dialog" aria-modal="true" aria-labelledby="pata-quick-actions-title" aria-describedby="pata-quick-actions-description" className="pata-quick-action-panel fixed bottom-[calc(4.65rem+env(safe-area-inset-bottom))] left-3 right-3 z-[70] lg:hidden">
          <div className="pata-quick-action-header">
            <div>
              <p className="pata-quick-action-eyebrow">ACTION RAPIDE</p>
              <h2 id="pata-quick-actions-title">Que veux-tu faire ?</h2>
              <p id="pata-quick-actions-description">Accède directement à l’essentiel.</p>
            </div>
            <button type="button" onClick={() => setShowActions(false)} className="pata-quick-action-close" aria-label="Fermer les actions rapides"><X size={17}/></button>
          </div>
          <div className="pata-quick-action-grid">
            {QUICK_ACTIONS.map((item, index) => {
              const Icon = item.icon;
              const target = item.href.split('?')[0];
              const featured = index === 0;
              return <Link key={item.href} href={item.href} style={{ '--action-order': index }} onClick={(event) => {
                if (pathname === target && item.href.includes('new=1')) {
                  event.preventDefault();
                  window.dispatchEvent(new CustomEvent(target === '/expenses' ? 'pata:expense-new' : 'pata:income-new'));
                }
                setShowActions(false);
              }} className={'pata-quick-action-card' + (featured ? ' is-featured' : '')}>
                <span className={'pata-quick-action-icon ' + item.tone}><Icon size={featured ? 21 : 19}/></span>
                <span className="pata-quick-action-copy">
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </span>
                <ArrowUpRight className="pata-quick-action-arrow" size={16}/>
              </Link>;
            })}
          </div>
          <p className="pata-quick-action-footnote">Tes opérations restent modifiables après leur enregistrement.</p>
        </section>
      )}
      {showMore && (
        <section id="pata-orbit-menu" role="dialog" aria-modal="true" aria-labelledby="pata-more-title" aria-describedby="pata-more-description" className="pata-orbit-overlay fixed inset-0 z-[70] flex items-center justify-center px-3 pb-[calc(5.4rem+env(safe-area-inset-bottom))] pt-[max(env(safe-area-inset-top),18px)] lg:hidden">
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
      <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 items-end border-t border-slate-200/90 bg-white/96 px-1 pb-[max(env(safe-area-inset-bottom),8px)] pt-1.5 shadow-[0_-6px_22px_rgba(7,91,67,0.07)] backdrop-blur-xl lg:hidden">
        <Link href="/dashboard" className={cn('flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition', isActive('/dashboard') ? 'text-brand-700' : 'text-slate-500')}><Home size={19} strokeWidth={isActive('/dashboard') ? 2.6 : 2}/><span>Accueil</span></Link>
        <Link href="/expenses" className={cn('flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition', isActive('/expenses') ? 'text-brand-700' : 'text-slate-500')}><Wallet size={19} strokeWidth={isActive('/expenses') ? 2.6 : 2}/><span>Dépenses</span></Link>
        <button type="button" onClick={() => { setShowActions((value) => !value); setShowMore(false); }} aria-label={showActions ? 'Fermer les actions rapides' : 'Actions rapides'} aria-expanded={showActions} aria-controls="pata-quick-actions-panel" className={'pata-quick-launcher -mt-5 mx-auto flex h-[54px] w-[54px] items-center justify-center rounded-[19px] border-[3px] border-white text-white shadow-lg shadow-brand-900/20 transition active:scale-95' + (showActions ? ' is-open' : '')}><Plus size={25} strokeWidth={2.6}/></button>
        <Link href="/income" className={cn('flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition', isActive('/income') ? 'text-brand-700' : 'text-slate-500')}><TrendingUp size={19} strokeWidth={isActive('/income') ? 2.6 : 2}/><span>Revenus</span></Link>
        <button type="button" onClick={() => { setShowMore((value) => !value); setShowActions(false); }} aria-label={showMore ? 'Fermer les espaces' : 'Explorer les espaces'} aria-expanded={showMore} aria-controls="pata-orbit-menu" className={cn('flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition', showMore || MORE_NAV.some((item) => isActive(item.href)) ? 'text-brand-700' : 'text-slate-500')}>{showMore ? <X size={19}/> : <Menu size={19}/>}<span>Plus</span></button>
      </nav>
    </>
  );
}
