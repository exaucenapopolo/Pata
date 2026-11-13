'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Users, CalendarDays, Wallet, ShieldCheck, AlertCircle, ArrowRight, Loader2, Crown, Clock3, CheckCircle2, UserRound } from 'lucide-react';

const money = (value) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(value) || 0) + ' FCFA';
const frequencies = { daily: 'Chaque jour', weekly: 'Chaque semaine', monthly: 'Chaque mois' };

function Avatar({ photoURL, name, size = 'h-11 w-11' }) {
  return (
    <span className={'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-bold text-slate-600 ' + size}>
      {photoURL ? <img src={photoURL} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer"/> : (String(name || 'M').trim().slice(0, 1).toUpperCase() || 'M')}
    </span>
  );
}

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
    setJoining(true);
    if (!user) {
      router.push('/register?returnTo=' + encodeURIComponent(returnTo));
      return;
    }
    router.push(returnTo);
  };

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-6 sm:px-5 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-5 flex items-center gap-3 px-1">
          <img src="/android-chrome-192x192.png" alt="Pata" className="h-10 w-10 rounded-xl"/>
          <div><p className="text-sm font-bold text-slate-950">Pata</p><p className="text-xs text-slate-500">Cotisations et tontines</p></div>
        </div>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="relative flex min-h-44 items-end overflow-hidden bg-slate-200 sm:min-h-64">
            {group?.imageURL ? <img src={group.imageURL} alt={'Photo de ' + group.name} className="absolute inset-0 h-full w-full object-cover"/> : <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-300 text-6xl font-bold text-slate-400">{(group?.name || 'G').slice(0,1).toUpperCase()}</div>}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/15 to-transparent"/>
            <div className="relative w-full p-5 sm:p-7">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/75">Invitation à une cotisation</p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">{group?.name || 'Tu as été invité à rejoindre un groupe'}</h1>
              {group && <div className="mt-3 flex items-center gap-2 text-sm text-white/90"><Avatar photoURL={group.ownerPhotoURL} name={group.ownerName} size="h-8 w-8"/><span>Organisé par <strong>{group.ownerName}</strong></span><span className="rounded-full bg-emerald-500/90 px-2 py-1 text-[9px] font-bold text-white">Chef</span></div>}
            </div>
          </div>

          <div className="space-y-5 p-4 sm:p-6">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 size={18} className="animate-spin"/>Chargement de l’invitation…</div>
            ) : error ? (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle size={16} className="mr-2 inline"/>{error}</div>
            ) : group && (
              <>
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-slate-950">À propos de cette cotisation</h2>
                    <span className={'rounded-full px-3 py-1 text-[10px] font-bold ' + (group.startedAt ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700')}>{group.startedAt ? 'Cotisation démarrée' : 'Groupe en préparation'}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{group.description || 'Aucune description n’a été ajoutée par le chef de groupe.'}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-500">Contribution</p><p className="mt-1 text-sm font-bold text-slate-950">{money(group.contributionAmount)}</p><p className="text-[10px] text-slate-500">par membre</p></div>
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-500">Fréquence</p><p className="mt-1 text-sm font-bold text-slate-950">{frequencies[group.frequency] || group.frequency}</p></div>
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-500">Participants</p><p className="mt-1 text-sm font-bold text-slate-950">{group.memberCount}/{group.expectedMembers}</p><p className="text-[10px] text-slate-500">inscrits / prévus</p></div>
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-500">Échéance</p><p className="mt-1 text-sm font-bold text-slate-950">{group.frequency === 'monthly' ? 'Le ' + group.dueDay + ' du mois' : 'À chaque période'}</p></div>
                </div>

                <div className="space-y-2 rounded-xl border border-slate-100 p-3">
                  <p className="flex items-center gap-2 text-xs text-slate-600"><CalendarDays size={14} className="shrink-0"/> Début prévu : <strong className="text-slate-900">{group.startDate}</strong></p>
                  <p className="flex items-start gap-2 text-xs leading-5 text-slate-600"><ShieldCheck size={14} className="mt-0.5 shrink-0"/> Délai de grâce : <strong className="text-slate-900">{group.graceDays} jour(s)</strong>. Majoration après retard : <strong className="text-slate-900">{group.lateFeeLabel}</strong>.</p>
                  <p className="flex items-start gap-2 text-xs leading-5 text-slate-600"><Wallet size={14} className="mt-0.5 shrink-0"/> Frais de paiement Pata : <strong className="text-slate-900">5 % par versement</strong>. Aucun frais de retrait supplémentaire Pata.</p>
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div><h2 className="text-base font-bold text-slate-950">Les membres du groupe</h2><p className="mt-0.5 text-xs text-slate-500">Consulte les personnes déjà inscrites avant de rejoindre.</p></div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700"><Users size={13}/>{group.memberCount}</span>
                  </div>
                  {group.members?.length ? (
                    <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
                      {group.members.map((member, index) => (
                        <div key={member.uid} className="flex items-center gap-3 p-3">
                          <Avatar photoURL={member.photoURL} name={member.displayName}/>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">{member.displayName}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className={'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold ' + (member.isOwner ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600')}>
                                {member.isOwner && <Crown size={10}/>} {member.roleLabel || (member.isOwner ? 'Chef de la cotisation' : 'Membre')}
                              </span>
                              {member.turnOrder && <span className="text-[10px] text-slate-500">Position {member.turnOrder}</span>}
                            </div>
                          </div>
                          {member.isOwner ? <span className="text-[10px] font-semibold text-emerald-700">Organisateur</span> : <span className="text-[10px] text-slate-400">Membre {index + 1}</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500"><UserRound size={20} className="mx-auto mb-2"/>Aucun membre supplémentaire n’est inscrit pour le moment.</div>
                  )}
                </div>

                <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3">
                  <p className="flex items-center gap-2 text-xs font-bold text-blue-950"><Clock3 size={14}/> Avant de rejoindre</p>
                  <p className="mt-1 text-xs leading-5 text-blue-900">Le numéro WhatsApp est facultatif. Tu peux rejoindre le groupe même sans utiliser WhatsApp. Tu pourras ajouter une photo de profil dans les paramètres de ton compte afin que les autres membres te reconnaissent plus facilement.</p>
                </div>

                {!group.canJoin ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{group.startedAt ? 'Cette cotisation a déjà démarré et n’accepte plus de nouveaux membres.' : 'Le nombre de participants prévu est déjà atteint. Le chef ne peut plus ajouter de membre.'}</div>
                ) : (
                  <div className="space-y-3 border-t border-slate-100 pt-4">
                    <p className="text-sm leading-6 text-slate-600">En acceptant, tu rejoins ce groupe et acceptes ses paramètres de contribution et de retard. Vérifie les membres, les montants et les règles avant de continuer.</p>
                    <button type="button" onClick={acceptInvitation} disabled={authLoading || joining} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
                      {joining ? <Loader2 size={17} className="animate-spin"/> : <ArrowRight size={17}/>}
                      Accepter l’invitation et rejoindre
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 text-center text-xs text-slate-500">
            {user ? 'Connecté à Pata.' : <>Tu as déjà un compte ? <a className="font-semibold text-brand-700 underline" href={'/login?returnTo=' + encodeURIComponent(returnTo)}>Connecte-toi</a>. Tu n’as pas encore de compte ? L’inscription avec Google est disponible.</>}
          </div>
        </section>
        <p className="mt-5 text-center text-[11px] text-slate-400">Ne verse aucun argent en dehors du parcours de paiement sécurisé affiché dans Pata.</p>
      </div>
    </main>
  );
}
