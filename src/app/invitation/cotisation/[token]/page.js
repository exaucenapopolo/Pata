'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Users, CalendarDays, Wallet, ShieldCheck, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';

const money = (value) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(value) || 0) + ' FCFA';
const frequencies = { daily: 'Chaque jour', weekly: 'Chaque semaine', monthly: 'Chaque mois' };

export default function CotisationInvitationPage({ params }) {
  const token = params?.token || '';
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  const returnTo = useMemo(() => '/cotisations?invite=' + encodeURIComponent(token), [token]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/cotisations/invite?token=' + encodeURIComponent(token), { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.error || 'Cette invitation est introuvable.');
        if (active) setGroup(data.group);
      } catch (err) {
        if (active) setError(err.message || 'Impossible de charger cette invitation.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [token]);

  const acceptInvitation = () => {
    if (!token) return;
    if (!user) {
      router.push('/register?returnTo=' + encodeURIComponent(returnTo));
      return;
    }
    router.push(returnTo);
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex items-center gap-3"><img src="/android-chrome-192x192.png" alt="Pata" className="h-10 w-10 rounded-xl"/><div><p className="text-sm font-bold text-slate-950">Pata</p><p className="text-xs text-slate-500">Cotisations et tontines</p></div></div>
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-7">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">Invitation à une cotisation</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Tu as été invité à rejoindre un groupe.</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Consulte les informations de la cotisation avant d’accepter. Tu pourras ensuite suivre les contributions et les tours depuis ton espace Pata.</p>
          </div>
          <div className="p-6">
            {loading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={18} className="animate-spin"/>Chargement de l’invitation…</div>
              : error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle size={16} className="mr-2 inline"/>{error}</div>
              : group && <>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-slate-500">Nom de la cotisation</p><h2 className="mt-1 text-lg font-bold text-slate-950">{group.name}</h2><p className="mt-1 text-sm text-slate-600">Chef du groupe : <strong>{group.ownerName}</strong></p></div><Users size={23} className="text-slate-400"/></div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Par participant</p><p className="mt-1 text-base font-bold text-slate-900">{money(group.contributionAmount)}</p></div>
                    <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Fréquence</p><p className="mt-1 text-base font-bold text-slate-900">{frequencies[group.frequency] || group.frequency}</p></div>
                    <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Participants prévus</p><p className="mt-1 text-base font-bold text-slate-900">{group.memberCount}/{group.expectedMembers}</p></div>
                    <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Échéance</p><p className="mt-1 text-base font-bold text-slate-900">{group.frequency === 'monthly' ? 'Le ' + group.dueDay + ' du mois' : 'À chaque période'}</p></div>
                  </div>
                  <div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                    <p className="flex items-start gap-2"><CalendarDays size={14} className="mt-0.5 shrink-0"/> Début prévu : {group.startDate}</p>
                    <p className="flex items-start gap-2"><ShieldCheck size={14} className="mt-0.5 shrink-0"/> Délai de grâce : {group.graceDays} jour(s). Majoration après retard : {group.lateFeeLabel}.</p>
                    <p className="flex items-start gap-2"><Wallet size={14} className="mt-0.5 shrink-0"/> Frais de paiement Pata : 5 % par versement. Aucun frais de retrait ajouté par Pata.</p>
                  </div>
                </div>

                {!group.canJoin ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{group.startedAt ? 'Cette cotisation a déjà démarré et n’accepte plus de nouveaux membres.' : 'Le nombre de participants prévu est déjà atteint. Le chef ne peut plus ajouter de membre.'}</div>
                  : <div className="mt-5">
                    <p className="text-sm leading-6 text-slate-600">En acceptant, tu rejoins ce groupe et acceptes ses paramètres de contribution et de retard. Le chef peut encore modifier les positions avant le lancement.</p>
                    <button type="button" onClick={acceptInvitation} disabled={authLoading || joining} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
                      {joining ? <Loader2 size={17} className="animate-spin"/> : <ArrowRight size={17}/>}
                      Accepter l’invitation et rejoindre
                    </button>
                  </div>}
              </>}
          </div>
          <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 text-center text-xs text-slate-500">
            {user ? 'Connecté à Pata.' : <>Tu as déjà un compte ? <a className="font-semibold text-brand-700 underline" href={'/login?returnTo=' + encodeURIComponent(returnTo)}>Connecte-toi</a>. Tu n’as pas encore de compte ? L’inscription avec Google est disponible.</>}
          </div>
        </section>
        <p className="mt-5 text-center text-[11px] text-slate-400">Ne verse aucun argent en dehors du parcours de paiement sécurisé affiché dans Pata.</p>
      </div>
    </main>
  );
}
