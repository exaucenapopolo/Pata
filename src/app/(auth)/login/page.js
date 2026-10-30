'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) router.replace('/dashboard');
  }, [user, router]);

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

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h2 className="text-lg font-semibold">Connexion</h2>
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
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Connexion…' : 'Se connecter'}
      </Button>
      <p className="text-center text-sm text-slate-500">
        Pas de compte ?{' '}
        <Link href="/register" className="font-semibold text-brand-600 hover:underline">
          Créer un compte
        </Link>
      </p>
    </form>
  );
          }
