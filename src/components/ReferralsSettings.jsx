'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Gift, Share2, Wallet, PiggyBank, Users, ArrowRightLeft, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useGoals } from '@/hooks/useGoals';

const money = (value) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(value) || 0) + ' FCFA';

async function request(user, path, method = 'GET', payload) {
  if (!user) throw new Error('Connecte-toi pour continuer.');
  const token = await user.getIdToken();
  const response = await fetch('/api/' + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.error || 'Une erreur est survenue.');
  return data;
}

export function ReferralsSettings() {
  const { user } = useAuth();
  const { goals } = useGoals();
  const [data, setData] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [destination, setDestination] = useState('wallet');
  const [goalId, setGoalId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [network, setNetwork] = useState('mtn');

  const activeGoals = useMemo(() => goals.filter((goal) => !goal.closed && !goal.withdrawnAt), [goals]);
  const referralBalance = Number(data?.referralBalance) || 0;
  const referralLink = data?.referralLink || '';

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const [referralData, groupData] = await Promise.all([
        request(user, 'referrals/status'),
        request(user, 'cotisations/list').catch(() => ({ groups: [] })),
      ]);
      setData(referralData);
      setGroups(groupData.groups || []);
      setGoalId((current) => current || activeGoals[0]?.id || '');
      setGroupId((current) => current || groupData.groups?.[0]?.id || '');
    } catch (err) {
      setError(err.message || 'Impossible de charger le parrainage.');
    } finally {
      setLoading(false);
    }
  }, [user, activeGoals]);

  useEffect(() => { refresh(); }, [refresh]);

  const shareMessage = useMemo(() => {
    if (!referralLink) return '';
    return 'Je t’invite à découvrir Pata, une application pour mieux organiser tes dépenses, tes revenus, ton budget et ton épargne. En créant ton compte avec mon lien, tu peux profiter de ton premier mois Pata Premium à 1 250 FCFA au lieu de 2 500 FCFA. Tu pourras ainsi découvrir les fonctions Premium à moitié prix dès ton arrivée.\n\nInscris-toi ici : ' + referralLink;
  }, [referralLink]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setNotice('Lien de parrainage copié.');
      setError('');
    } catch {
      setError('La copie automatique n’est pas disponible sur cet appareil.');
    }
  };

  const shareInvite = async () => {
    if (!shareMessage) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Invitation à rejoindre Pata', text: shareMessage });
      } else {
        window.open('https://wa.me/?text=' + encodeURIComponent(shareMessage), '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      if (err?.name !== 'AbortError') setError('Le partage n’a pas pu être ouvert.');
    }
  };

  const transfer = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    const numericAmount = Math.round(Number(amount));
    if (!Number.isSafeInteger(numericAmount) || numericAmount < 100 || numericAmount > referralBalance) {
      setError('Indique un montant valide, dans la limite de ton solde de parrainage.');
      return;
    }
    if (destination === 'goal' && !goalId) return setError('Choisis l’épargne à alimenter.');
    if (destination === 'cotisation' && !groupId) return setError('Choisis le groupe de cotisation.');
    if (destination === 'withdrawal' && (!/^6[0-9]{8}$/.test(phone.replace(/\\D/g, '').replace(/^237/, '')) || !['mtn', 'orange'].includes(network))) return setError('Entre un numéro MTN ou Orange Money camerounais valide.');
    if (destination === 'withdrawal' && numericAmount > 500000) return setError('Le retrait Mobile Money est limité à 500 000 FCFA par demande.');
    setBusy(true);
    try {
      if (destination === 'cotisation') {
        await request(user, 'cotisations/pay-referral', 'POST', { groupId, amount: numericAmount });
        setNotice('Versement de cotisation confirmé depuis ton solde de parrainage.');
      } else if (destination === 'withdrawal') {
        await request(user, 'referrals/withdraw', 'POST', { amount: numericAmount, phone, network });
        setNotice('Demande de retrait enregistrée. Le transfert Mobile Money sera effectué après vérification.');
      } else {
        await request(user, 'referrals/transfer', 'POST', {
          destination,
          amount: numericAmount,
          ...(destination === 'goal' ? { goalId } : {}),
        });
        setNotice(destination === 'wallet'
          ? 'Bonus transféré vers ton portefeuille Pata.'
          : 'Bonus ajouté à ton épargne.');
      }
      setAmount('');
      await refresh();
    } catch (err) {
      setError(err.message || 'Le transfert n’a pas pu être effectué.');
    } finally {
      setBusy(false);
    }
  };

  const referralItems = data?.referrals || [];
  const statusLabel = (status) => status === 'REWARDED' ? 'Bonus crédité' : status === 'PENDING_PREMIUM' ? 'En attente de Premium' : 'En cours de vérification';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800"><Gift size={19}/></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900">Parrainage Pata</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">Invite une personne à rejoindre Pata. Elle bénéficie de son premier mois Premium à moitié prix. Tu reçois 1 000 FCFA lorsque son abonnement Premium est effectivement payé et activé.</p>
        </div>
      </div>

      {loading ? <p className="mt-4 text-xs text-slate-400">Chargement de ton lien de parrainage…</p> : data && <>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Solde de parrainage</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{money(referralBalance)}</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">Séparé de ton portefeuille Pata. Tu décides quand et où le transférer.</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Récompense par filleul</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">1 000 FCFA</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">Crédités uniquement après confirmation de son premier abonnement Premium.</p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <label className="block text-xs font-semibold text-slate-700">Ton lien personnel</label>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <input readOnly value={referralLink} className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700"/>
            <button type="button" onClick={copyLink} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Copy size={14}/> Copier</button>
            <button type="button" onClick={shareInvite} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0b5c46] px-4 text-xs font-semibold text-white hover:bg-[#084735]"><Share2 size={14}/> Partager</button>
          </div>
          <p className="text-[11px] leading-5 text-slate-500">Le message de partage explique l’offre Premium à 1 250 FCFA et inclut automatiquement ton lien.</p>
        </div>

        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="mb-3 flex items-center gap-2"><ArrowRightLeft size={16} className="text-slate-500"/><h4 className="text-sm font-bold text-slate-900">Utiliser mon bonus</h4></div>
          {referralBalance > 0 ? (
            <form onSubmit={transfer} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Destination</label>
                  <select value={destination} onChange={(event) => setDestination(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
                    <option value="wallet">Mon portefeuille Pata</option>
                    <option value="goal">Une épargne</option>
                    <option value="cotisation">Une cotisation</option>
                    <option value="withdrawal">Retirer par Mobile Money</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Montant (FCFA)</label>
                  <input type="number" min="100" max={referralBalance} step="100" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={String(referralBalance)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/>
                </div>
              </div>
              {destination === 'goal' && <div><label className="mb-1 block text-xs font-semibold text-slate-600">Épargne à alimenter</label><select value={goalId} onChange={(event) => setGoalId(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Choisir une épargne</option>{activeGoals.map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}</select></div>}
              {destination === 'cotisation' && <div><label className="mb-1 block text-xs font-semibold text-slate-600">Groupe de cotisation</label><select value={groupId} onChange={(event) => setGroupId(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Choisir un groupe</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><p className="mt-1 text-[11px] text-slate-500">Le paiement est limité au reste de ta part et suit les règles de la cotisation. Aucun frais du prestataire n’est appliqué à ce transfert interne.</p></div>}
              {destination === 'withdrawal' && <div className="grid gap-2 sm:grid-cols-2"><div><label className="mb-1 block text-xs font-semibold text-slate-600">Numéro Mobile Money</label><input inputMode="numeric" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="6XXXXXXXX" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/></div><div><label className="mb-1 block text-xs font-semibold text-slate-600">Réseau</label><select value={network} onChange={(event) => setNetwork(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="mtn">MTN Mobile Money</option><option value="orange">Orange Money</option></select></div><p className="sm:col-span-2 text-[11px] leading-5 text-slate-500">La demande est vérifiée par l’administration avant le transfert. Le montant réservé est restitué si le retrait est refusé ou échoue.</p></div>}
              <button type="submit" disabled={busy || !amount || Number(amount) > referralBalance} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white disabled:opacity-50"><Wallet size={14}/>{busy ? 'Traitement…' : 'Confirmer le transfert'}</button>
            </form>
          ) : <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Ton solde de parrainage est encore vide. Les bonus confirmés apparaîtront ici.</p>}
        </div>

        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="mb-3 flex items-center gap-2"><Users size={16} className="text-slate-500"/><h4 className="text-sm font-bold text-slate-900">Mes invitations</h4></div>
          {referralItems.length ? <div className="divide-y divide-slate-100">
            {referralItems.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{item.invitedName || 'Nouveau membre'}</p><p className="mt-0.5 text-[11px] text-slate-500">{item.status === 'REWARDED' ? 'Abonnement Premium confirmé' : 'Inscription enregistrée'}</p></div>
              <span className={'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold '+(item.status === 'REWARDED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}>{item.status === 'REWARDED' ? <CheckCircle2 size={12}/> : null}{statusLabel(item.status)}</span>
            </div>)}
          </div> : <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Tu n’as pas encore d’invitation enregistrée.</p>}
        </div>
      </>}

      {notice && <p role="status" className="mt-3 text-xs leading-5 text-emerald-700">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-xs leading-5 text-red-600">{error}</p>}
      {!loading && <p className="mt-4 text-[10px] leading-4 text-slate-400">Une personne ne peut être rattachée qu’une seule fois à un parrain. Les comptes déjà existants et les tentatives d’auto-parrainage sont refusés.</p>}
    </section>
  );
}
