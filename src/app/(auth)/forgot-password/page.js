'use client';

import { useState } from 'react';
import Link from 'next/link';
import { sendPasswordResetEmail } from 'firebase/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { auth } from '@/lib/firebase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault(); setError(''); setSent(false); setLoading(true);
    try {
      auth.languageCode = 'fr';
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch (err) {
      if (err?.code === 'auth/user-not-found') setSent(true);
      else if (err?.code === 'auth/too-many-requests') setError('Trop de demandes ont été effectuées. Attends un moment avant de réessayer.');
      else setError('Impossible d’envoyer le lien pour le moment. Vérifie l’adresse saisie et réessaie.');
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Réinitialiser mon mot de passe</h2>
      <p className="text-sm leading-6 text-slate-600">Indique l’adresse e-mail de ton compte. Si un mot de passe est associé à cette adresse, tu recevras un lien pour en choisir un nouveau.</p>
      <form onSubmit={submit} className="space-y-4">
        <Input label="Adresse e-mail" type="email" name="email" autoComplete="email" required value={email}
          onChange={(event) => setEmail(event.target.value)} />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {sent && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-5 text-emerald-800">Si un mot de passe est associé à cette adresse, un lien vient d’être envoyé. Vérifie ta boîte de réception et tes courriers indésirables.</p>}
        <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Envoi en cours…' : 'Envoyer le lien'}</Button>
      </form>
      <div className="space-y-2 border-t border-slate-100 pt-3">
        <p className="text-xs leading-5 text-slate-500">Tu utilises uniquement Google ? Connecte-toi avec Google sur le site Pata, puis ouvre Paramètres → Sécurité et notifications → Mot de passe pour en ajouter un à ton compte existant.</p>
        <p className="text-center text-sm text-slate-500"><Link href="/login" className="font-semibold text-brand-600 hover:underline">Retour à la connexion</Link></p>
      </div>
    </div>
  );
}
