'use client';

import { useEffect, useState } from 'react';
import { EmailAuthProvider, linkWithCredential, reauthenticateWithCredential, updatePassword, sendPasswordResetEmail } from 'firebase/auth';
import { KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { auth } from '@/lib/firebase/client';

export function PasswordSettings() {
  const { user } = useAuth();
  const [hasPassword, setHasPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setHasPassword(Boolean(user?.providerData?.some((provider) => provider.providerId === 'password')));
  }, [user]);

  const clearFeedback = () => { setMessage(''); setError(''); };

  const submit = async (event) => {
    event.preventDefault();
    clearFeedback();
    if (!user?.email) return setError('Aucune adresse e-mail n’est associée à ce compte.');
    if (newPassword.length < 6) return setError('Le nouveau mot de passe doit contenir au moins 6 caractères.');
    if (newPassword !== confirmPassword) return setError('Les deux nouveaux mots de passe ne correspondent pas.');
    if (hasPassword && !currentPassword) return setError('Saisis ton mot de passe actuel pour confirmer le changement.');

    setSaving(true);
    try {
      if (hasPassword) {
        const currentCredential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, currentCredential);
        await updatePassword(user, newPassword);
        setMessage('Ton mot de passe a été modifié.');
      } else {
        // Lier l'e-mail et le mot de passe au compte Google ouvert conserve le
        // même utilisateur, ses données, son abonnement et son historique.
        const emailCredential = EmailAuthProvider.credential(user.email, newPassword);
        const linked = await linkWithCredential(user, emailCredential);
        setHasPassword(linked.user.providerData.some((provider) => provider.providerId === 'password'));
        setMessage('Un mot de passe a été ajouté à ton compte. Tu peux maintenant te connecter avec ton e-mail et ce mot de passe.');
      }
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      const code = String(err?.code || '');
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') setError('Le mot de passe actuel est incorrect.');
      else if (code === 'auth/weak-password') setError('Choisis un mot de passe plus solide, avec au moins 6 caractères.');
      else if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use') setError('Cette adresse e-mail ou ce moyen de connexion est déjà associé à un autre compte. Aucun compte n’a été fusionné.');
      else if (code === 'auth/requires-recent-login') setError('Pour protéger ton compte, déconnecte-toi puis reconnecte-toi, et recommence cette opération.');
      else if (code === 'auth/operation-not-allowed') setError('La connexion par e-mail et mot de passe doit être activée pour Pata. Réessaie plus tard.');
      else setError('Impossible d’enregistrer le mot de passe pour le moment. Vérifie ta connexion et réessaie.');
    } finally { setSaving(false); }
  };

  const sendReset = async () => {
    clearFeedback();
    if (!user?.email) return setError('Aucune adresse e-mail n’est associée à ce compte.');
    setResetting(true);
    try {
      auth.languageCode = 'fr';
      await sendPasswordResetEmail(auth, user.email);
      setMessage('Si un mot de passe est associé à cette adresse, un lien de réinitialisation vient d’être envoyé. Vérifie aussi tes courriers indésirables.');
    } catch (err) {
      setError(err?.code === 'auth/too-many-requests'
        ? 'Trop de demandes ont été effectuées. Attends un moment avant de réessayer.'
        : 'Impossible d’envoyer le lien pour le moment. Réessaie plus tard.');
    } finally { setResetting(false); }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#edf5f0] text-[#0b5c46]"><KeyRound size={19} /></span>
        <div>
          <h3 className="text-sm font-bold text-slate-900">{hasPassword ? 'Modifier mon mot de passe' : 'Ajouter un mot de passe'}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {hasPassword
              ? 'Confirme ton mot de passe actuel avant de choisir le nouveau.'
              : 'Ton compte est actuellement lié à une connexion Google. Ajouter un mot de passe te permettra aussi de te connecter avec ton adresse e-mail.'}
          </p>
        </div>
      </div>
      {!user?.email ? (
        <p className="mt-4 text-xs leading-5 text-amber-700">Aucune adresse e-mail n’est disponible pour ce compte.</p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          {hasPassword && (
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-700">Mot de passe actuel</span>
              <input type="password" autoComplete="current-password" value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-500" required disabled={saving} />
            </label>
          )}
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-700">Nouveau mot de passe</span>
            <input type="password" autoComplete="new-password" value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-500" minLength={6} required disabled={saving} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-700">Confirmer le nouveau mot de passe</span>
            <input type="password" autoComplete="new-password" value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-500" minLength={6} required disabled={saving} />
          </label>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="submit" disabled={saving || resetting}>{saving ? 'Enregistrement…' : hasPassword ? 'Modifier le mot de passe' : 'Ajouter ce mot de passe'}</Button>
            {hasPassword && (
              <button type="button" onClick={sendReset} disabled={saving || resetting}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 disabled:opacity-50">
                <Mail size={14} />{resetting ? 'Envoi…' : 'Mot de passe oublié ?'}
              </button>
            )}
          </div>
        </form>
      )}
      {message && <p role="status" className="mt-3 flex items-start gap-2 text-xs leading-5 text-emerald-700"><ShieldCheck size={15} className="mt-0.5 shrink-0" />{message}</p>}
      {error && <p role="alert" className="mt-3 text-xs leading-5 text-red-600">{error}</p>}
    </section>
  );
}
