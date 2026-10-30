'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
      <div className="md:hidden">
        <span className="text-xl font-black text-brand-600">Pata</span>
      </div>
      <div className="hidden md:block">
        <p className="text-sm text-slate-500">
          Bonjour, <span className="font-semibold text-slate-800">{profile?.displayName || 'toi'}</span> 👋
        </p>
      </div>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700 hover:bg-brand-200"
        >
          <User size={18} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
              <div className="px-3 py-2">
                <p className="text-sm font-semibold text-slate-800 truncate">{profile?.displayName || 'Utilisateur'}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
              <hr className="my-1 border-slate-100" />
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
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
