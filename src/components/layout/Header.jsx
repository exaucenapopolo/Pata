'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut, Settings, User, HelpCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { NotificationInbox } from '@/components/NotificationInbox';

export function Header() {
  const { user, logout } = useAuth();
  const { profile } = useProfile();
  const router = useRouter();
  const [open, setOpen] = useState(false);

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
          <button type="button" onClick={() => setOpen((value) => !value)} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50" aria-label="Ouvrir mon profil" aria-expanded={open}>
            {profile?.photoURL ? (
              <img src={profile.photoURL} alt="" className="h-full w-full rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <User size={19} strokeWidth={2}/>
            )}
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

    </>
  );
}
