'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { ensureUserProfile } from '@/lib/firestore/profile';

export default function RegisterPage() {
  const { user, register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) router.replace('/dashboard');
  }, [user, router]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      return setError('Le mot de passe doit contenir au moins 6 caractères.');
    }
    if (password !== confirm) {
      return setError('Les mots de passe ne correspondent pas.');
    }
    setLoading(true);
    try {
      const cred = await register(email.trim(), password);
      await ensureUserProfile(cred.user);
      router.replace('/dashboard');
    } catch (err) {
      setError(
        err.code === 'auth/email-already-in-use'
          ? 'Cet email est déjà utilisé.'
          : err.code === 'auth/invalid-email'
          ? 'Email invalide.'
          : 'Erreur lors de l’inscription. Réessaie.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h2 className="text-lg font-semibold">Créer un compte</h2>
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
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Input
        label="Confirmer le mot de passe"
        type="password"
        name="confirm"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Création…' : 'Créer mon compte'}
      </Button>
      <p className="text-center text-sm text-slate-500">
        Déjà inscrit ?{' '}
        <Link href="/login" className="font-semibold text-brand-600 hover:underline">
          Se connecter
        </Link>
      </p>
    </form>
  );
}
