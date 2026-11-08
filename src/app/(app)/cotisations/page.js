'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Users, Plus, Copy, RefreshCw, Wallet, CalendarDays, ArrowDownToLine, Clock3, CheckCircle2, AlertCircle } from 'lucide-react';

const currency = (value) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(value) || 0) + ' FCFA';
const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const frequencyLabels = { daily: 'Chaque jour', weekly: 'Chaque semaine', monthly: 'Chaque mois' };
const statusLabels = {
  OPEN: 'En cours', READY: 'Cotisation complète', PENDING_REVIEW: 'Retrait en vérification',
  PROCESSING: 'Retrait en cours', PAID: 'Tour payé', FAILED: 'Échec de retrait',
  PENDING_REVIEW_USER: 'En attente de validation', REJECTED: 'Refusé', PENDING: 'En attente',
};

export default function CotisationsPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createdInvite, setCreatedInvite] = useState('');
  const [groupForm, setGroupForm] = useState({ name: '', contributionAmount: '', frequency: 'monthly', startDate: today() });
  const [payForms, setPayForms] = useState({});
  const [withdrawForms, setWithdrawForms] = useState({});

  const api = useCallback(async (path, method = 'GET', payload) => {
    if (!user) throw new Error('Connecte-toi pour continuer.');
    const token = await user.getIdToken();
    const response = await fetch('/api/' + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.error || 'Une erreur est survenue.');
    return data;
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [groupsResult, historyResult] = await Promise.all([
        api('cotisations/list'),
        api('withdrawals/list'),
      ]);
      setGroups(groupsResult.groups || []);
      setHistory((historyResult.withdrawals || []).filter((item) => item.withdrawalType === 'cotisation'));
    } catch (err) {
      setError(err.message || 'Impossible de charger les cotisations.');
    } finally {
      setLoading(false);
    }
  }, [api, user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get('invite');
    if (!inviteToken) return;
    let active = true;
    (async () => {
      setBusy('join');
      setError('');
      try {
        const result = await api('cotisations/join', 'POST', { inviteToken });
        if (!active) return;
        setNotice(result.message || 'Tu as rejoint le groupe.');
        await load();
      } catch (err) {
        if (active) setError(err.message || 'Impossible de rejoindre le groupe.');
      } finally {
        if (active) {
          setBusy('');
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    })();
    return () => { active = false; };
  }, [api, load, user]);

  const totalInGroups = useMemo(() => groups.length, [groups]);
  const setPayField = (groupId, field, value) => {
    setPayForms((current) => ({ ...current, [groupId]: { ...(current[groupId] || {}), [field]: value } }));
  };
  const setWithdrawField = (groupId, field, value) => {
    setWithdrawForms((current) => ({ ...current, [groupId]: { ...(current[groupId] || {}), [field]: value } }));
  };

  const createGroup = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy('create');
    try {
      const result = await api('cotisations/create', 'POST', {
        ...groupForm,
        contributionAmount: Number(groupForm.contributionAmount),
      });
      setCreatedInvite(result.inviteUrl || '');
      setNotice('Ton groupe de cotisation a été créé. Tu peux maintenant inviter les membres.');
      setShowCreate(false);
      setGroupForm({ name: '', contributionAmount: '', frequency: 'monthly', startDate: today() });
      await load();
    } catch (err) {
      setError(err.message || 'Impossible de créer le groupe.');
    } finally {
      setBusy('');
    }
  };

  const shareInvite = async (group) => {
    const inviteUrl = group.inviteToken ? window.location.origin + '/cotisations?invite=' + group.inviteToken : createdInvite;
    if (!inviteUrl) return;
    try {
      if (navigator.share) await navigator.share({ title: 'Rejoins mon groupe de cotisation sur Pata', text: 'Voici le lien pour rejoindre notre groupe de cotisation.', url: inviteUrl });
      else {
        await navigator.clipboard.writeText(inviteUrl);
        setNotice('Lien d’invitation copié.');
      }
    } catch (err) {
      if (err.name !== 'AbortError') setError('Impossible de partager le lien. Essaie de le copier.');
    }
  };

  const payContribution = async (group) => {
    const form = payForms[group.id] || {};
    const amount = Number(form.amount || group.currentCycle.myRemaining);
    setError('');
    setNotice('');
    if (!Number.isSafeInteger(amount) || amount < 100 || amount % 100 !== 0) return setError('Entre un versement d’au moins 100 FCFA, par multiples de 100.');
    setBusy('pay-' + group.id);
    try {
      const result = await api('cotisations/pay', 'POST', {
        groupId: group.id,
        amount,
        phone: form.phone || '',
        network: form.network || 'mtn',
      });
      setNotice('Paiement créé : ' + currency(result.amount) + ' de cotisation + ' + currency(result.fee) + ' de frais (5 %).');
      window.location.assign(result.checkoutUrl);
    } catch (err) {
      setError(err.message || 'Impossible de préparer ce paiement.');
      setBusy('');
    }
  };

  const verifyPendingPayment = async (group) => {
    const pending = group.currentCycle.pendingPayment;
    if (!pending?.transId) return;
    setBusy('verify-' + group.id);
    setError('');
    try {
      const result = await api('fapshi/status', 'POST', { transId: pending.transId });
      setNotice(result.status === 'CONFIRMED' ? 'Ton versement a été confirmé.' : result.status === 'FAILED' ? 'Le paiement a échoué. Tu peux maintenant réessayer.' : 'Le paiement est toujours en attente de confirmation Fapshi.');
      await load();
    } catch (err) {
      setError(err.message || 'Impossible de vérifier ce paiement.');
    } finally {
      setBusy('');
    }
  };

  const requestWithdrawal = async (group) => {
    const form = withdrawForms[group.id] || {};
    setError('');
    setNotice('');
    setBusy('withdraw-' + group.id);
    try {
      const result = await api('cotisations/withdraw', 'POST', {
        groupId: group.id,
        phone: form.phone || '',
        network: form.network || 'mtn',
      });
      setNotice(result.message || 'Demande de retrait envoyée à l’administration.');
      await load();
    } catch (err) {
      setError(err.message || 'Impossible d’envoyer la demande.');
    } finally {
      setBusy('');
    }
  };

  const copyCreatedInvite = async () => {
    try {
      await navigator.clipboard.writeText(createdInvite);
      setNotice('Lien d’invitation copié.');
    } catch {
      setError('La copie automatique n’est pas disponible sur cet appareil.');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Organisation collective</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Cotisations et tontines</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Crée un groupe, invite les membres et suis chaque versement. Les paiements passent par Fapshi ; l’argent est versé au bénéficiaire du tour après validation du retrait.</p>
          </div>
          <Button onClick={() => setShowCreate((value) => !value)}><Plus size={16}/> Créer un groupe</Button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Mes groupes</p><p className="mt-1 text-lg font-bold text-slate-900">{totalInGroups}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Frais sur les versements</p><p className="mt-1 text-lg font-bold text-slate-900">5 %</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Frais de retrait Pata</p><p className="mt-1 text-lg font-bold text-slate-900">0 %</p></div>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">Les 5 % sont calculés sur chaque versement et ajoutés au paiement Fapshi. Pata n’ajoute pas de frais de retrait ; les éventuels frais propres au prestataire de paiement restent indépendants.</p>
      </header>

      {error && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle size={17} className="mt-0.5 shrink-0"/>{error}<button type="button" onClick={() => setError('')} className="ml-auto text-xs font-semibold">Fermer</button></div>}
      {notice && <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={17} className="mt-0.5 shrink-0"/>{notice}<button type="button" onClick={() => setNotice('')} className="ml-auto text-xs font-semibold">Fermer</button></div>}

      {createdInvite && <section className="rounded-xl border border-brand-200 bg-brand-50 p-4"><p className="text-sm font-bold text-brand-900">Lien d’invitation prêt</p><p className="mt-1 break-all text-xs text-brand-800">{createdInvite}</p><Button variant="outline" className="mt-3" onClick={copyCreatedInvite}><Copy size={15}/> Copier le lien</Button></section>}

      {showCreate && <Card className="space-y-4 p-4 sm:p-5">
        <div><h2 className="text-base font-bold text-slate-900">Créer une cotisation</h2><p className="mt-1 text-xs leading-5 text-slate-500">Tu seras le chef du groupe. Les membres seront servis dans l’ordre où ils rejoignent le groupe.</p></div>
        <form onSubmit={createGroup} className="grid gap-3 sm:grid-cols-2">
          <Input label="Nom du groupe" required maxLength={90} value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} placeholder="Ex. Tontine des collègues"/>
          <Input label="Montant par membre et par période (FCFA)" type="number" min="100" step="100" required value={groupForm.contributionAmount} onChange={(e) => setGroupForm({ ...groupForm, contributionAmount: e.target.value })} placeholder="Ex. 10000"/>
          <div><label className="mb-1 block text-sm font-medium text-slate-700">Fréquence</label><select value={groupForm.frequency} onChange={(e) => setGroupForm({ ...groupForm, frequency: e.target.value })} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="daily">Chaque jour</option><option value="weekly">Chaque semaine</option><option value="monthly">Chaque mois</option></select></div>
          <Input label="Date de début" type="date" min={today()} required value={groupForm.startDate} onChange={(e) => setGroupForm({ ...groupForm, startDate: e.target.value })}/>
          <div className="sm:col-span-2"><Button type="submit" disabled={busy === 'create'}>{busy === 'create' ? 'Création…' : 'Créer le groupe'}</Button><button type="button" onClick={() => setShowCreate(false)} className="ml-3 text-sm font-semibold text-slate-500">Annuler</button></div>
        </form>
      </Card>}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-900">Mes groupes</h2><button type="button" onClick={load} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700"><RefreshCw size={13}/> Actualiser</button></div>
        {loading ? <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Chargement des groupes…</div>
          : groups.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center"><Users size={28} className="mx-auto text-slate-400"/><h3 className="mt-3 text-sm font-bold text-slate-900">Aucun groupe pour le moment</h3><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">Crée ton premier groupe ou rejoins celui d’un proche à partir de son lien d’invitation.</p></div>
          : groups.map((group) => {
            const cycle = group.currentCycle;
            const progress = cycle.targetAmount > 0 ? Math.min(100, Math.round((cycle.totalCollected / cycle.targetAmount) * 100)) : 0;
            const form = payForms[group.id] || {};
            const withdraw = withdrawForms[group.id] || {};
            return <article key={group.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><div className="flex items-center gap-2"><h3 className="text-base font-bold text-slate-950">{group.name}</h3>{group.isOwner && <span className="rounded-full bg-brand-50 px-2 py-1 text-[10px] font-semibold text-brand-700">Chef de groupe</span>}</div><p className="mt-1 text-xs text-slate-500">{currency(group.contributionAmount)} par membre · {frequencyLabels[group.frequency] || group.frequency} · Début {group.startDate}</p></div>
                  <div className="flex items-center gap-2">{group.isOwner && <Button variant="outline" onClick={() => shareInvite(group)}><Users size={14}/> Inviter</Button>}<span className="rounded-full bg-slate-100 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600">{group.memberCount}/{group.maxMembers} membres</span></div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Collecté pour ce tour</p><p className="mt-1 text-base font-bold text-slate-900">{currency(cycle.totalCollected)}</p></div>
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Objectif collectif</p><p className="mt-1 text-base font-bold text-slate-900">{currency(cycle.targetAmount)}</p></div>
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Bénéficiaire du tour</p><p className="mt-1 text-sm font-bold text-slate-900">{cycle.beneficiaryName}{cycle.isMyTurn ? ' · Toi' : ''}</p></div>
                </div>
                <div className="mt-3"><div className="mb-1 flex justify-between text-[11px] text-slate-500"><span>Progression du cycle · {statusLabels[cycle.status] || cycle.status}</span><strong>{progress}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: progress + '%' }}/></div><p className="mt-1 text-[11px] text-slate-500">Reste à réunir : {currency(cycle.remainingTotal)} · Échéance de la période : {cycle.dueAt}</p></div>
              </div>

              <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_0.85fr]">
                <div>
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900"><Users size={15}/> Suivi des membres</h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full min-w-[460px] text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2.5 font-semibold">Membre</th><th className="px-3 py-2.5 font-semibold">Cotisé</th><th className="px-3 py-2.5 font-semibold">Reste</th><th className="px-3 py-2.5 font-semibold">Versements</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">{group.members.map((member) => <tr key={member.uid}><td className="px-3 py-2.5 font-medium text-slate-800">{member.displayName}{member.isOwner ? ' · Chef' : ''}{member.uid === cycle.beneficiaryUid ? ' · Reçoit ce tour' : ''}</td><td className="px-3 py-2.5 text-slate-700">{currency(member.paid)}</td><td className="px-3 py-2.5 text-slate-700">{currency(member.remaining)}</td><td className="px-3 py-2.5 text-slate-700">{member.installments || 0}</td></tr>)}</tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-3">
                  {cycle.pendingPayment && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <h4 className="text-sm font-bold text-amber-900">Un paiement est en attente</h4>
                    <p className="mt-1 text-xs leading-5 text-amber-800">Un versement de {currency(cycle.pendingPayment.amount)} + {currency(cycle.pendingPayment.fee)} de frais a été initié. Termine le paiement déjà ouvert ; un second versement ne peut pas être lancé tant que celui-ci n’est pas confirmé ou refusé.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a href={cycle.pendingPayment.checkoutUrl} className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-3 text-xs font-semibold text-white">Reprendre le paiement</a>
                      <Button size="sm" variant="outline" onClick={() => verifyPendingPayment(group)} disabled={busy === 'verify-' + group.id}>{busy === 'verify-' + group.id ? 'Vérification…' : 'Vérifier le paiement'}</Button>
                    </div>
                  </div>}
                  {cycle.myRemaining > 0 && cycle.status === 'OPEN' && !cycle.pendingPayment && group.memberCount >= 2 && <div className="rounded-xl border border-slate-200 p-3">
                    <h4 className="text-sm font-bold text-slate-900">Verser ma cotisation</h4>
                    <p className="mt-1 text-xs text-slate-500">Il te reste {currency(cycle.myRemaining)} pour cette période. Tu peux payer en plusieurs fois.</p>
                    <div className="mt-3 space-y-2">
                      <Input label="Montant de ce versement (FCFA)" type="number" min="100" step="100" value={form.amount ?? String(cycle.myRemaining)} onChange={(e) => setPayField(group.id, 'amount', e.target.value)}/>
                      <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">Frais 5 % : <strong>{currency(Math.round(Number(form.amount || cycle.myRemaining) * 0.05))}</strong> · Total Fapshi : <strong>{currency(Number(form.amount || cycle.myRemaining) + Math.round(Number(form.amount || cycle.myRemaining) * 0.05))}</strong></div>
                      <Input label="Numéro Mobile Money" value={form.phone || ''} onChange={(e) => setPayField(group.id, 'phone', e.target.value)} placeholder="6XXXXXXXX"/>
                      <select value={form.network || 'mtn'} onChange={(e) => setPayField(group.id, 'network', e.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="mtn">MTN Mobile Money</option><option value="orange">Orange Money</option></select>
                      <Button className="w-full" onClick={() => payContribution(group)} disabled={busy === 'pay-' + group.id}><Wallet size={15}/>{busy === 'pay-' + group.id ? 'Préparation…' : 'Payer avec Fapshi'}</Button>
                    </div>
                  </div>}

                  {group.memberCount < 2 && <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">Invite au moins un autre membre avant de commencer les versements. Le tour de cotisation ne démarre qu’à partir de deux participants.</p>}
                  {cycle.canWithdraw && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <h4 className="text-sm font-bold text-emerald-900">C’est ton tour de recevoir</h4><p className="mt-1 text-xs leading-5 text-emerald-800">Tous les membres ont terminé leur part. Tu peux demander le versement de {currency(cycle.totalCollected)}. La demande sera vérifiée par l’administration avant le paiement Fapshi ; Pata n’ajoute pas de frais de retrait.</p>
                    <div className="mt-3 space-y-2"><Input label="Ton numéro Mobile Money" value={withdraw.phone || ''} onChange={(e) => setWithdrawField(group.id, 'phone', e.target.value)} placeholder="6XXXXXXXX"/><select value={withdraw.network || 'mtn'} onChange={(e) => setWithdrawField(group.id, 'network', e.target.value)} className="h-10 w-full rounded-lg border border-emerald-200 bg-white px-3 text-sm"><option value="mtn">MTN Mobile Money</option><option value="orange">Orange Money</option></select><Button className="w-full" onClick={() => requestWithdrawal(group)} disabled={busy === 'withdraw-' + group.id}><ArrowDownToLine size={15}/>{busy === 'withdraw-' + group.id ? 'Envoi…' : 'Demander le retrait'}</Button></div>
                  </div>}

                  {cycle.status === 'PENDING_REVIEW' && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800"><Clock3 size={15} className="mr-1 inline"/>La demande du bénéficiaire est en cours de vérification par l’administration.</div>}
                  {cycle.status === 'PAID' && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800"><CheckCircle2 size={15} className="mr-1 inline"/>Le retrait du bénéficiaire de ce tour a été confirmé.</div>}
                  {cycle.myRemaining === 0 && !cycle.canWithdraw && cycle.status === 'OPEN' && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Ta part de ce cycle est complète. Le groupe attend les autres membres.</p>}
                </div>
              </div>
            </article>;
          })}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="text-base font-bold text-slate-900">Historique des retraits</h2><p className="mt-1 text-xs text-slate-500">Demandes que tu as faites comme bénéficiaire d’un groupe.</p></div><CalendarDays size={18} className="text-slate-400"/></div>
        {history.length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Aucune demande de retrait pour le moment.</p>
          : <div className="divide-y divide-slate-100">{history.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="text-sm font-semibold text-slate-800">{item.goalName || 'Cotisation'}</p><p className="mt-0.5 text-[11px] text-slate-500">{item.createdAt ? new Date(item.createdAt).toLocaleString('fr-FR') : 'Date non disponible'}</p></div><div className="text-right"><p className="text-sm font-bold text-slate-900">{currency(item.amount)}</p><span className="text-[10px] font-semibold text-slate-500">{statusLabels[item.status] || item.status}</span></div></div>)}</div>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
        <p className="font-bold text-slate-800">Comment fonctionne la tontine ?</p>
        <p className="mt-1">Le chef crée le groupe et partage le lien. L’ordre de passage suit l’ordre d’adhésion. Chaque membre verse sa part en une ou plusieurs transactions Fapshi. Lorsque toutes les parts sont complètes, le bénéficiaire du tour peut demander le retrait. L’administration vérifie puis transmet le paiement. Un nouveau membre ne peut plus modifier le cycle après le début des versements, afin de protéger l’ordre et le montant attendus.</p>
      </section>
    </div>
  );
}
