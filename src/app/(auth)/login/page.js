'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const { user, loading: authLoading, login, loginWithGoogle } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Redirige dès que la session est connue — évite de rester bloqué sur /login
  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, authLoading, router]);

  // Affiche un spinner tant que Firebase n'a pas tranché (session existante ou non)
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        <p className="mt-3 text-sm text-slate-500">Vérification de ta session…</p>
      </div>
    );
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace('/dashboard');
    } catch (err) {
      setError(
        err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password'
          ? 'Email ou mot de passe incorrect.'
          : err.code === 'auth/user-not-found'
          ? 'Aucun compte avec cet email.'
          : 'Erreur de connexion. Réessaie.'
      );
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const u = await loginWithGoogle();
      if (u) router.replace('/dashboard');
    } catch (err) {
      setError(err.message || 'Connexion Google impossible.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Connexion</h2>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onGoogle}
        disabled={googleLoading || loading}
      >
        {googleLoading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-transparent" />
        ) : (
          <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
            <path
              fill="#FFC107"
              d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
            />
            <path
              fill="#FF3D00"
              d="M6.3 14.7l6.6 4.8C14.7 15.3 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.6 4 24 4 16 4 9.1 8.6 6.3 14.7z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.5 0 10.4-2.1 14.1-5.5l-6.5-5.5C29.6 34.6 26.9 36 24 36c-5.2 0-9.7-3.1-11.3-7.4l-6.6 5C9.1 39.4 16 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.6 20.5H42V20H24v8h11.3c-.8 2.4-2.3 4.4-4.2 5.9l6.5 5.5C41.7 36 44 30.5 44 24c0-1.3-.1-2.4-.4-3.5z"
            />
          </svg>
        )}
        Se connecter avec Google
      </Button>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs text-slate-400">ou par email</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Mot de passe"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading || googleLoading}>
          {loading ? 'Connexion…' : 'Se connecter'}
        </Button>
      </form>

      <p className="text-center text-sm text-slate-500">
        Pas de compte ?{' '}
        <Link href="/register" className="font-semibold text-brand-600 hover:underline">
          Créer un compte
        </Link>
      </p>
    </div>
  );
      }
