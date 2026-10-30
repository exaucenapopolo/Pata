'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-50 px-6 text-center">
      <h1 className="text-5xl font-black tracking-tight text-brand-600">Pata</h1>
      <p className="mt-3 max-w-md text-slate-600">
        Suis tes dépenses, respecte ton budget, épargne avec discipline — et paie une amende si tu rates.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/register"><Button size="lg">Commencer</Button></Link>
        <Link href="/login"><Button size="lg" variant="outline">Se connecter</Button></Link>
      </div>
    </main>
  );
    }
