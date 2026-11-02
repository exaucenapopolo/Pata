'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogOut, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';

export function Header() {
  const { user, logout } = useAuth();
  const { profile } = useProfile();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
      {/* Logo pour Mobile */}
      <div className="md:hidden">
        <Link href="/dashboard">
          <img 
            src="/android-chrome-192x192.png" 
            alt="Pata" 
            className="h-9 w-9 rounded-lg object-cover shadow-sm" 
          />
        </Link>
      </div>

      {/* Message pour Desktop */}
      <div className="hidden md:block">
        <p className="text-sm text-slate-500">
          Connecté en tant que{' '}
          <span className="font-semibold text-slate-800">{profile?.displayName || user?.email}</span>
        </p>
      </div>

      {/* Menu Utilisateur */}
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700 hover:bg-brand-200 transition-colors"
          aria-label="Menu utilisateur"
        >
          <User size={18} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
              <div className="px-3 py-2">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {profile?.displayName || 'Utilisateur'}
                </p>
                <p className="truncate text-xs text-slate-500">{user?.email}</p>
              </div>
              <hr className="my-1 border-slate-100" />
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={16} /> Se déconnecter
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
      }
