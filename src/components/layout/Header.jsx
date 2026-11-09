'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Download, LogOut, Settings, X, User, HelpCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { NotificationInbox } from '@/components/NotificationInbox';

export function Header() {
  const { user, logout } = useAuth();
  const { profile } = useProfile();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isAppleMobile, setIsAppleMobile] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent || '';
    const ipadDesktopMode = window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
    setIsAppleMobile(/iphone|ipad|ipod/i.test(ua) || ipadDesktopMode);
    setIsInstalled(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
    const capture = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener('beforeinstallprompt', capture);
    return () => window.removeEventListener('beforeinstallprompt', capture);
  }, []);

  const installApp = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') setInstallPrompt(null);
      return;
    }
    if (isAppleMobile) setShowIosHelp(true);
  };

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    router.replace('/login');
  };

  return (
    <>
      <header className="sticky top-0 z-40 flex h-[64px] shrink-0 items-center justify-between border-b border-slate-200/90 bg-white/95 px-3 backdrop-blur-xl sm:px-6 lg:h-[68px] lg:px-8">
        <div className="lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2" aria-label="Pata, accueil">
            <img src="/android-chrome-192x192.png" alt="Pata" className="h-9 w-9 rounded-xl object-contain" />
          </Link>
        </div>
        <div className="hidden min-w-0 lg:block">
          <p className="truncate text-xs font-medium text-slate-500">Espace personnel</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">Bonjour{profile && profile.displayName ? ', ' + profile.displayName.split(' ')[0] : ''}</p>
        </div>
        <div className="relative flex items-center gap-2">
          <NotificationInbox />
          {!isInstalled && (installPrompt || isAppleMobile) && (
            <button type="button" onClick={installApp} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 text-xs font-semibold text-brand-800 transition hover:bg-brand-100" aria-label="Installer Pata">
              <Download size={15}/><span className="hidden sm:inline">Installer</span>
            </button>
          )}
          <button type="button" onClick={() => setOpen((value) => !value)} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50" aria-label="Ouvrir mon profil" aria-expanded={open}>
            <User size={19} strokeWidth={2}/>
          </button>
          {open && (
            <>
              <button type="button" aria-label="Fermer le menu utilisateur" onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default" />
              <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                <div className="px-3 py-3">
                  <p className="truncate text-sm font-bold text-slate-900">{profile && profile.displayName || 'Mon compte'}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{user && user.email}</p>
                </div>
                <Link href="/settings" onClick={() => setOpen(false)} className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><Settings size={16}/> Paramètres du compte</Link>
                <Link href="/support" onClick={() => setOpen(false)} className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><HelpCircle size={16}/> Assistance · +1 (242) 454-2961</Link>
                <button type="button" onClick={handleLogout} className="mt-1 flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-red-700 hover:bg-red-50"><LogOut size={16}/> Se déconnecter</button>
              </div>
            </>
          )}
        </div>
      </header>
      {showIosHelp && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 p-3 sm:items-center">
          <section className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between"><h2 className="text-base font-bold text-slate-900">Installer Pata sur l’écran d’accueil</h2><button type="button" onClick={() => setShowIosHelp(false)} aria-label="Fermer" className="rounded-full bg-slate-100 p-2"><X size={16}/></button></div>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600"><li>Appuie sur le bouton <strong>Partager</strong> de Safari.</li><li>Choisis <strong>Sur l’écran d’accueil</strong>.</li><li>Confirme avec <strong>Ajouter</strong>.</li></ol>
            <p className="mt-4 rounded-xl bg-brand-50 p-3 text-xs leading-5 text-brand-900">Pata sera accessible depuis ton écran d’accueil, dans une fenêtre dédiée.</p>
          </section>
        </div>
      )}
    </>
  );
}
