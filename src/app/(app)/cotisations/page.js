'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { getPreferredLocale } from '@/lib/utils';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { CloudinaryImageField } from '@/components/ui/CloudinaryImageField';
import { Users, Plus, Copy, RefreshCw, Wallet, CalendarDays, ArrowDownToLine, Clock3, CheckCircle2, AlertCircle, ArrowUp, ArrowDown, PlayCircle, Save, Pin, MessageCircle, Send, Crown, Settings } from 'lucide-react';

const currency = (value) => new Intl.NumberFormat(getPreferredLocale(), { maximumFractionDigits: 0 }).format(Number(value) || 0) + ' FCFA';
const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const frequencyLabels = { daily: 'Chaque jour', weekly: 'Chaque semaine', monthly: 'Chaque mois' };
const statusLabels = {
  NOT_STARTED: 'En attente du lancement', OPEN: 'En cours', READY: 'Cotisation complète', PENDING_REVIEW: 'Retrait en vérification',
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
  const [responsibilityAccepted, setResponsibilityAccepted] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState('');
  const [pinnedGroups, setPinnedGroups] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [photoEditingGroup, setPhotoEditingGroup] = useState(null);
  const [groupPhotoDraft, setGroupPhotoDraft] = useState('');
  const [chatGroup, setChatGroup] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState('');
  const [chatQuota, setChatQuota] = useState({ freeLimit: 10, freeUsed: 0, freeRemaining: 10, bonusPurchased: 0, bonusUsed: 0, bonusRemaining: 0, remaining: 10 });
  const [chatQuotaBlocked, setChatQuotaBlocked] = useState(false);
  const [roleDrafts, setRoleDrafts] = useState({});
  const chatScrollRef = useRef(null);
  const chatLastMessageIdRef = useRef('');
  const [whatsappForms, setWhatsappForms] = useState({});
  const [groupForm, setGroupForm] = useState({ name: '', description: '', contributionAmount: '', expectedMembers: '5', frequency: 'monthly', startDate: today(), dueDay: '30', graceDays: '1', lateFeeType: 'none', lateFeeValue: '' });
  const [orderDrafts, setOrderDrafts] = useState({});
  const [payForms, setPayForms] = useState({});
  const [withdrawForms, setWithdrawForms] = useState({});
  const autoVerifiedPayments = useRef(new Set());

  const api = useCallback(async (path, method = 'GET', payload) => {
    if (!user) throw new Error('Connecte-toi pour continuer.');
    const token = await user.getIdToken();
    const response = await fetch('/api/' + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      const requestError = new Error(data.error || 'Une erreur est survenue.');
      requestError.status = response.status;
      requestError.data = data;
      throw requestError;
    }
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
      setPinnedGroups((groupsResult.groups || []).filter((group) => group.isPinned).map((group) => group.id));
      setHistory((historyResult.withdrawals || []).filter((item) => item.withdrawalType === 'cotisation'));
    } catch (err) {
      setError(err.message || 'Impossible de charger les cotisations.');
    } finally {
      setLoading(false);
    }
  }, [api, user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (typeof window === 'undefined' || !groups.length) return;
    const groupId = new URLSearchParams(window.location.search).get('group');
    if (!groupId || !groups.some((group) => group.id === groupId)) return;
    setExpandedGroups((current) => ({ ...current, [groupId]: true }));
    document.getElementById('cotisation-' + groupId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (new URLSearchParams(window.location.search).get('chat') === '1') {
      const targetGroup = groups.find((item) => item.id === groupId);
      if (targetGroup) {
        setChatGroup(targetGroup);
        setChatMessages([]);
        chatLastMessageIdRef.current = '';
        setChatDraft('');
        setChatError('');
        setChatQuotaBlocked(false);
        setChatQuota({ freeLimit: 10, freeUsed: 0, freeRemaining: 10, bonusPurchased: 0, bonusUsed: 0, bonusRemaining: 0, remaining: 10 });
        setChatLoading(true);
      }
      const params = new URLSearchParams(window.location.search);
      params.delete('chat');
      window.history.replaceState(null, '', window.location.pathname + (params.toString() ? '?' + params.toString() : ''));
    }
  }, [groups]);
  const orderedGroups = useMemo(() => [...groups].sort((x,y)=>{const xp=pinnedGroups.includes(x.id)?1:0,yp=pinnedGroups.includes(y.id)?1:0;if(xp!==yp)return yp-xp;return (Date.parse(y.createdAt||0)||0)-(Date.parse(x.createdAt||0)||0);}),[groups,pinnedGroups]);
  const togglePinned = async (group) => {
    const pinned = !pinnedGroups.includes(group.id);
    setBusy('pin-' + group.id);
    try {
      await api('cotisations/pin', 'POST', { groupId: group.id, pinned });
      setPinnedGroups((current) => pinned ? [...current, group.id] : current.filter((id) => id !== group.id));
    } catch (err) { setError(err.message || 'Impossible de modifier cet épinglage.'); }
    finally { setBusy(''); }
  };

  useEffect(() => {
    if (loading || !user || !groups.length) return;
    let active = true;
    const pending = groups
      .map((group) => ({ group, payment: group.currentCycle?.pendingPayment }))
      .filter((entry) => entry.payment?.transId && !autoVerifiedPayments.current.has(entry.payment.transId));
    pending.forEach(({ group, payment }) => {
      autoVerifiedPayments.current.add(payment.transId);
      (async () => {
        try {
          let result = null;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            result = await api('fapshi/status', 'POST', { transId: payment.transId });
            if (result.status !== 'PENDING') break;
            if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 5000));
          }
          if (!active) return;
          if (result?.status === 'CONFIRMED') {
            setNotice('Le paiement de ' + currency(payment.amount) + ' a été vérifié et ajouté à la cotisation.');
            await load();
          } else if (result?.status === 'FAILED') {
            setNotice('Le paiement n’a pas abouti. Tu peux recommencer le versement.');
            await load();
          }
        } catch (error) {
          if (active) console.warn('[PATA COTISATION AUTO VERIFY]', group.id, error.message || error);
        }
      })();
    });
    return () => { active = false; };
  }, [groups, loading, user, api, load]);

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
  const saveWhatsApp=async(group)=>{const whatsappPhone=String(whatsappForms[group.id]??group.members.find((m)=>m.uid===user?.uid)?.whatsappPhone??'').trim();setBusy('whatsapp-'+group.id);setError('');try{const result=await api('cotisations/contact','POST',{groupId:group.id,whatsappPhone});setNotice(result.message||'Numéro WhatsApp enregistré.');await load();}catch(err){setError(err.message||'Impossible d’enregistrer ce numéro.');}finally{setBusy('');}};
  const openGroupChat = (group) => {
    setChatGroup(group);
    setChatMessages([]);
    chatLastMessageIdRef.current = '';
    setChatDraft('');
    setChatError('');
    setChatQuotaBlocked(false);
    setChatQuota({ freeLimit: 10, freeUsed: 0, freeRemaining: 10, bonusPurchased: 0, bonusUsed: 0, bonusRemaining: 0, remaining: 10 });
    setChatLoading(true);
  };

  const applyChatQuotaError = (error) => {
    if (error?.status !== 402) return false;
    setChatQuota(error.data?.quota || { freeLimit: 10, freeRemaining: 0, remaining: 0 });
    setChatQuotaBlocked(true);
    setChatMessages([]);
    chatLastMessageIdRef.current = '';
    setChatError('');
    return true;
  };

  const refreshChatMessages = async (groupId = chatGroup?.id) => {
    if (!groupId) return;
    setChatLoading(true);
    try {
      const result = await api('cotisations/chat/messages?groupId=' + encodeURIComponent(groupId));
      setChatMessages(result.messages || []);
      chatLastMessageIdRef.current = result.messages?.length ? result.messages[result.messages.length - 1].id : '';
      setChatQuota(result.quota || chatQuota);
      setChatQuotaBlocked(false);
      setChatError('');
    } catch (error) {
      if (!applyChatQuotaError(error)) setChatError(error.message || 'Impossible d’actualiser la discussion.');
    } finally {
      setChatLoading(false);
    }
  };

  const purchaseExtraChatMessages = async () => {
    if (!chatGroup) return;
    setChatBusy(true);
    setChatError('');
    try {
      const result = await api('cotisations/chat/purchase', 'POST', { groupId: chatGroup.id });
      setChatQuota(result.quota);
      setChatQuotaBlocked(false);
      setNotice(result.message || '10 messages supplémentaires ont été ajoutés.');
      await refreshChatMessages(chatGroup.id);
    } catch (error) {
      setChatError(error.message || 'Impossible d’acheter des messages supplémentaires.');
    } finally {
      setChatBusy(false);
    }
  };

  const sendGroupChatMessage = async (event) => {
    event.preventDefault();
    if (!chatGroup || !chatDraft.trim() || chatQuotaBlocked) return;
    setChatBusy(true);
    setChatError('');
    try {
      const result = await api('cotisations/chat/send', 'POST', { groupId: chatGroup.id, text: chatDraft });
      setChatQuota(result.quota || chatQuota);
      setChatDraft('');
      if (Number(result.quota?.remaining) <= 0) {
        setChatQuotaBlocked(true);
        setChatMessages([]);
        chatLastMessageIdRef.current = '';
      } else if (result.message) {
        setChatMessages((current) => [...current, result.message].slice(-50));
        chatLastMessageIdRef.current = result.message.id;
      }
    } catch (error) {
      if (!applyChatQuotaError(error)) setChatError(error.message || 'Impossible d’envoyer ce message.');
    } finally {
      setChatBusy(false);
    }
  };

  useEffect(() => {
    if (!chatGroup?.id || !user) return undefined;
    let active = true;
    const refresh = async (replace = false) => {
      try {
        const afterId = replace ? '' : chatLastMessageIdRef.current;
        const suffix = afterId ? '&afterId=' + encodeURIComponent(afterId) : '';
        const result = await api('cotisations/chat/messages?groupId=' + encodeURIComponent(chatGroup.id) + suffix);
        if (!active) return;
        if (result.reset || !afterId) setChatMessages(result.messages || []);
        else if (result.messages?.length) setChatMessages((current) => [...current, ...result.messages].slice(-50));
        if (result.messages?.length) chatLastMessageIdRef.current = result.messages[result.messages.length - 1].id;
        setChatQuota(result.quota || chatQuota);
        setChatQuotaBlocked(false);
        setChatError('');
      } catch (error) {
        if (active && error?.status === 402) {
          setChatQuota(error.data?.quota || { freeLimit: 10, freeRemaining: 0, remaining: 0 });
          setChatQuotaBlocked(true);
          setChatMessages([]);
          chatLastMessageIdRef.current = '';
          setChatError('');
        } else if (active) setChatError(error.message || 'Impossible d’actualiser la discussion.');
      } finally {
        if (active) setChatLoading(false);
      }
    };
    refresh(true);
    const interval = window.setInterval(() => refresh(false), 15000);
    return () => { active = false; window.clearInterval(interval); };
  }, [chatGroup?.id, user, api]);

  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages.length, chatGroup?.id]);

  const openGroupPhotoEditor = (group) => {
    setPhotoEditingGroup(group);
    setGroupPhotoDraft(group.imageURL || '');
    setError('');
  };

  const saveGroupPhoto = async () => {
    if (!photoEditingGroup) return;
    setBusy('group-photo');
    setError('');
    try {
      const result = await api('cotisations/photo', 'POST', {
        groupId: photoEditingGroup.id,
        imageURL: groupPhotoDraft || '',
      });
      setGroups((current) => current.map((group) => group.id === photoEditingGroup.id ? { ...group, imageURL: groupPhotoDraft } : group));
      setPhotoEditingGroup((current) => current ? { ...current, imageURL: groupPhotoDraft } : current);
      setNotice(result.message || 'Photo du groupe mise à jour.');
      setPhotoEditingGroup(null);
      await load();
    } catch (photoError) {
      setError(photoError.message || 'Impossible de modifier la photo du groupe.');
    } finally {
      setBusy('');
    }
  };

  const saveMemberRole = async (group) => {
    const roleLabel = String(roleDrafts[group.id] ?? group.members.find((member) => member.uid === user?.uid)?.roleLabel ?? 'Membre').trim();
    if (!roleLabel) return setError('Indique une étiquette de membre.');
    setBusy('role-' + group.id);
    try {
      const result = await api('cotisations/role', 'POST', { groupId: group.id, roleLabel });
      setNotice(result.message || 'Ton étiquette a été enregistrée.');
      await load();
    } catch (roleError) {
      setError(roleError.message || 'Impossible d’enregistrer cette étiquette.');
    } finally {
      setBusy('');
    }
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
      const result = await api(editingGroupId ? 'cotisations/update' : 'cotisations/create', 'POST', {
        ...(editingGroupId ? { groupId: editingGroupId } : {}),
        ...groupForm, responsibilityAccepted,
        contributionAmount: Number(groupForm.contributionAmount),
        expectedMembers: Number(groupForm.expectedMembers),
        dueDay: groupForm.frequency === 'monthly' ? Number(groupForm.dueDay) : null,
        graceDays: Number(groupForm.graceDays),
        lateFeeType: groupForm.lateFeeType,
        lateFeeValue: Number(groupForm.lateFeeValue || 0),
      });
      if (!editingGroupId) setCreatedInvite(result.inviteUrl || ''); else setCreatedInvite('');
      setEditingGroupId(''); setResponsibilityAccepted(false);
      setNotice(result.message || (editingGroupId ? 'Paramètres mis à jour.' : 'Ton groupe de cotisation a été créé. Tu peux maintenant inviter les membres.'));
      setShowCreate(false);
      setGroupForm({ name: '', description: '', contributionAmount: '', expectedMembers: '5', frequency: 'monthly', startDate: today(), dueDay: '30', graceDays: '1', lateFeeType: 'none', lateFeeValue: '' });
      await load();
    } catch (err) {
      setError(err.message || 'Impossible de créer le groupe.');
    } finally {
      setBusy('');
    }
  };

  const shareInvite = async (group) => {
    const inviteUrl = group.inviteToken ? window.location.origin + '/invitation/cotisation/' + group.inviteToken : createdInvite;
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

  const moveMember = (group, memberUid, direction) => {
    const current = orderDrafts[group.id] || group.members.map((member) => member.uid);
    const next = [...current];
    const index = next.indexOf(memberUid);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrderDrafts((value) => ({ ...value, [group.id]: next }));
  };

  const saveMemberOrder = async (group) => {
    const memberIds = orderDrafts[group.id] || group.members.map((member) => member.uid);
    setBusy('order-' + group.id);
    setError('');
    try {
      await api('cotisations/reorder', 'POST', { groupId: group.id, memberIds });
      setOrderDrafts((value) => ({ ...value, [group.id]: undefined }));
      setNotice('L’ordre de passage a été enregistré.');
      await load();
    } catch (err) {
      setError(err.message || 'Impossible d’enregistrer les positions.');
    } finally { setBusy(''); }
  };

  const startGroup = async (group) => {
    setBusy('start-' + group.id);
    setError('');
    setNotice('');
    try {
      if (!group.orderDefined) throw new Error('Confirme d’abord les positions de tous les membres.');
      if (orderDrafts[group.id]) throw new Error('Tu as modifié l’ordre. Enregistre les nouvelles positions avant de lancer la cotisation.');
      const result = await api('cotisations/start', 'POST', { groupId: group.id });
      setNotice(result.message || 'La cotisation est lancée.');
      setOrderDrafts((value) => ({ ...value, [group.id]: undefined }));
      await load();
    } catch (err) {
      setError(err.message || 'Impossible de lancer ce groupe.');
    } finally { setBusy(''); }
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
      setNotice(result.status === 'CONFIRMED' ? 'Ton versement a été confirmé.' : result.status === 'FAILED' ? 'Le paiement a échoué. Tu peux maintenant réessayer.' : 'Le paiement est toujours en attente de confirmation.');
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
    <div className="mx-auto min-w-0 max-w-6xl space-y-5 overflow-x-hidden px-0.5 pb-10">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Organisation collective</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Cotisations et tontines</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Crée un groupe, invite les membres et suis chaque versement. Chaque paiement est vérifié avant d’être ajouté à la cagnotte.</p>
          </div>
          <Button onClick={() => setShowCreate((value) => !value)}><Plus size={16}/> Créer un groupe</Button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Mes groupes</p><p className="mt-1 text-lg font-bold text-slate-900">{totalInGroups}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Frais sur les versements</p><p className="mt-1 text-lg font-bold text-slate-900">5 %</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Frais de retrait Pata</p><p className="mt-1 text-lg font-bold text-slate-900">0 %</p></div>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">Les frais de 5 % sont calculés automatiquement sur chaque versement. Aucun frais de retrait supplémentaire n’est ajouté par Pata.</p>
      </header>

      {error && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle size={17} className="mt-0.5 shrink-0"/>{error}<button type="button" onClick={() => setError('')} className="ml-auto text-xs font-semibold">Fermer</button></div>}
      {notice && <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={17} className="mt-0.5 shrink-0"/>{notice}<button type="button" onClick={() => setNotice('')} className="ml-auto text-xs font-semibold">Fermer</button></div>}

      {createdInvite && <section className="rounded-xl border border-brand-200 bg-brand-50 p-4"><p className="text-sm font-bold text-brand-900">Lien d’invitation prêt</p><p className="mt-1 break-all text-xs text-brand-800">{createdInvite}</p><Button variant="outline" className="mt-3" onClick={copyCreatedInvite}><Copy size={15}/> Copier le lien</Button></section>}

      {showCreate && <Modal open={showCreate} onClose={() => { if (busy !== 'create') { setShowCreate(false); setEditingGroupId(''); } }} title={editingGroupId ? 'Paramètres du groupe' : 'Créer une cotisation'} className="max-w-2xl">
        <div><h2 className="text-base font-bold text-slate-900">{editingGroupId ? 'Modifier les paramètres du groupe' : 'Créer une cotisation'}</h2><p className="mt-1 text-xs leading-5 text-slate-500">Tu seras le chef du groupe. Choisis le nombre de participants, les échéances et les règles de retard ; tu définiras les positions avant le lancement.</p></div>
        <form onSubmit={createGroup} className="grid gap-3 sm:grid-cols-2">
          <Input label="Nom du groupe" required maxLength={90} value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} placeholder="Ex. Tontine des collègues"/>
          <label className="sm:col-span-2 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Description du groupe</span>
            <textarea value={groupForm.description || ''} onChange={(event) => setGroupForm({ ...groupForm, description: event.target.value.slice(0, 500) })} maxLength={500} rows={3} placeholder="Présente l’objectif de cette cotisation, son fonctionnement et les informations utiles aux membres…" className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"/>
            <span className="mt-1 block text-right text-[10px] text-slate-400">{(groupForm.description || '').length}/500</span>
          </label>
          <Input label="Montant par membre et par période (FCFA)" type="number" min="100" max="250000" step="100" required value={groupForm.contributionAmount} onChange={(e) => setGroupForm({ ...groupForm, contributionAmount: e.target.value })} placeholder="Ex. 10000"/>
          <Input label="Nombre de participants prévus" type="number" min="2" max="50" step="1" required value={groupForm.expectedMembers} onChange={(e) => setGroupForm({ ...groupForm, expectedMembers: e.target.value })} placeholder="Ex. 5"/>
          <div><label className="mb-1 block text-sm font-medium text-slate-700">Fréquence</label><select value={groupForm.frequency} onChange={(e) => setGroupForm({ ...groupForm, frequency: e.target.value })} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="daily">Chaque jour</option><option value="weekly">Chaque semaine</option><option value="monthly">Chaque mois</option></select></div>
          <Input label="Date de début" type="date" min={today()} required value={groupForm.startDate} onChange={(e) => setGroupForm({ ...groupForm, startDate: e.target.value })}/>
          {groupForm.frequency === 'monthly' && <Input label="Jour limite de paiement dans le mois" type="number" min="1" max="31" step="1" required value={groupForm.dueDay} onChange={(e) => setGroupForm({ ...groupForm, dueDay: e.target.value })} placeholder="30"/>}
          <Input label="Délai de grâce après l’échéance (jours)" type="number" min="0" max="30" step="1" required value={groupForm.graceDays} onChange={(e) => setGroupForm({ ...groupForm, graceDays: e.target.value })}/>
          <div><label className="mb-1 block text-sm font-medium text-slate-700">Majoration en cas de retard</label><select value={groupForm.lateFeeType} onChange={(e) => setGroupForm({ ...groupForm, lateFeeType: e.target.value, lateFeeValue: '' })} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="none">Aucune majoration</option><option value="fixed">Montant fixe (FCFA)</option><option value="percent">Pourcentage de la contribution</option></select></div>
          {groupForm.lateFeeType !== 'none' && <Input label={groupForm.lateFeeType === 'fixed' ? 'Majoration fixe (FCFA)' : 'Pourcentage de majoration (%)'} type="number" min="1" max={groupForm.lateFeeType === 'percent' ? '100' : '250000'} step="1" required value={groupForm.lateFeeValue} onChange={(e) => setGroupForm({ ...groupForm, lateFeeValue: e.target.value })}/>}
          {Number(groupForm.contributionAmount) > 0 && Number(groupForm.expectedMembers) >= 2 && <p className="sm:col-span-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">Montant collectif de base : <strong>{currency(Number(groupForm.contributionAmount) * Number(groupForm.expectedMembers))}</strong>. Les frais de service de 5 % sont calculés automatiquement. Le montant total du tour, majorations comprises, ne peut pas dépasser 500 000 FCFA.</p>}
          {!responsibilityAccepted && <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><p className="font-bold">Responsabilité du chef de groupe</p><p className="mt-1">Pata assure le suivi des versements, la vérification des paiements et l’application des pénalités prévues. Pata ne garantit pas le comportement des membres et ne peut pas poursuivre à ta place une personne qui refuse de rembourser ou qui utilise l’argent reçu. En tant que chef, tu restes responsable du choix des participants et de leur suivi jusqu’au paiement. Informe clairement les membres des règles avant leur adhésion.</p><label className="mt-3 flex items-start gap-2 font-semibold"><input type="checkbox" checked={responsibilityAccepted} onChange={(event) => setResponsibilityAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0"/><span>J’ai lu et j’accepte ces responsabilités. Je comprends que Pata n’est pas responsable du défaut de paiement ou du comportement d’un membre.</span></label></div>}<div className="sm:col-span-2"><Button type="submit" disabled={busy === 'create' || !responsibilityAccepted}>{busy === 'create' ? 'Enregistrement…' : editingGroupId ? 'Enregistrer les paramètres' : 'Créer le groupe'}</Button><button type="button" onClick={() => { setShowCreate(false); setEditingGroupId(''); }} className="ml-3 text-sm font-semibold text-slate-500">Annuler</button></div>
        </form>
      </Modal>}

      <Modal open={Boolean(chatGroup)} onClose={() => { if (!chatBusy) { setChatGroup(null); setChatMessages([]); setChatError(''); setChatQuotaBlocked(false); } }} title="Discussion du groupe" className="h-[92dvh] max-h-[92dvh] max-w-3xl">
        {chatGroup && (
          <div className="flex h-full min-h-[65dvh] flex-col">
            <header className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-bold text-slate-600">{chatGroup.imageURL ? <img src={chatGroup.imageURL} alt="" className="h-full w-full object-cover"/> : (chatGroup.name || 'G').slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold text-slate-900">{chatGroup.name}</h3><p className="text-[11px] text-slate-500">{chatGroup.memberCount} membre(s) · Discussion du groupe</p></div>
              <button type="button" onClick={() => refreshChatMessages(chatGroup.id)} disabled={chatLoading} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50" aria-label="Actualiser la discussion"><RefreshCw size={15}/></button>
            </header>
            <div className="my-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
              <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-emerald-950">Ton quota de messages</p><p className="mt-0.5 text-[11px] text-emerald-800">{chatQuota.freeRemaining ?? 10} message(s) gratuit(s) restant(s){chatQuota.bonusRemaining > 0 ? ' · ' + chatQuota.bonusRemaining + ' supplémentaire(s)' : ''}</p></div><span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-800">{chatQuota.remaining ?? 10} restant(s)</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-emerald-100"><div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: Math.max(0, Math.min(100, ((chatQuota.remaining ?? 10) / Math.max(10, 10 + (chatQuota.bonusPurchased || 0))) * 100)) + '%' }}/></div>
              <p className="mt-1.5 text-[10px] text-emerald-800">10 messages gratuits chaque jour. Après épuisement, 10 messages supplémentaires coûtent 100 FCFA depuis ton portefeuille.</p>
            </div>
            {chatQuotaBlocked ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-5 py-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm"><MessageCircle size={25}/></div>
                <h3 className="mt-4 text-base font-bold text-slate-900">Tu as atteint ta limite de messages pour aujourd’hui</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">La discussion est temporairement masquée pour toi. Achète un lot de 10 messages pour retrouver l’accès aux messages et continuer à répondre.</p>
                <Button type="button" className="mt-5 w-full max-w-xs" onClick={purchaseExtraChatMessages} disabled={chatBusy}><Wallet size={15}/>{chatBusy ? 'Paiement en cours…' : 'Obtenir 10 messages · 100 FCFA'}</Button>
                <a href="/wallet" className="mt-3 text-xs font-semibold text-brand-700 underline">Recharger mon portefeuille</a>
                <p className="mt-3 text-[10px] text-slate-400">Le paiement est débité uniquement lorsque tu achètes ce lot. Le quota gratuit reste sans frais.</p>
              </div>
            ) : (
              <>
                <div ref={chatScrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-2xl bg-[#efeae2] p-3 sm:p-4">
                  {chatLoading && !chatMessages.length ? <p className="py-8 text-center text-xs text-slate-600">Chargement des messages…</p>
                    : !chatMessages.length ? <div className="mx-auto my-8 max-w-xs rounded-xl bg-white/85 px-4 py-3 text-center text-xs leading-5 text-slate-600 shadow-sm">Bienvenue dans la discussion de {chatGroup.name}. Présente-toi et échange avec les autres membres.</div>
                    : chatMessages.map((message) => {
                      const mine = message.authorUid === user?.uid;
                      const author = chatGroup.members?.find((member) => member.uid === message.authorUid);
                      const authorPhoto = message.authorPhotoURL || author?.photoURL || '';
                      return (
                        <div key={message.id} className={'flex items-end gap-2 ' + (mine ? 'justify-end' : 'justify-start')}>
                          {!mine && <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/70 bg-white text-xs font-bold text-slate-600 shadow-sm">{authorPhoto ? <img src={authorPhoto} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer"/> : (message.authorName || 'M').slice(0, 1).toUpperCase()}</span>}
                          <div className={'max-w-[86%] rounded-2xl px-3 py-2 shadow-sm ' + (mine ? 'rounded-br-md bg-[#d9fdd3] text-slate-900' : 'rounded-bl-md bg-white text-slate-800')}>
                            <div className="mb-1 flex flex-wrap items-center gap-1.5"><span className="text-[11px] font-bold">{mine ? 'Toi' : message.authorName}</span><span className={'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ' + (message.authorRoleLabel === 'Chef de la cotisation' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600')}>{message.authorRoleLabel === 'Chef de la cotisation' && <Crown size={9}/>}{message.authorRoleLabel || 'Membre'}</span></div>
                            <p className="whitespace-pre-wrap break-words text-sm leading-5">{message.text}</p>
                            <p className="mt-1 text-right text-[9px] text-slate-400">{message.createdAt ? new Date(message.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'À l’instant'}</p>
                          </div>
                          {mine && <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/70 bg-white text-xs font-bold text-slate-600 shadow-sm">{message.authorPhotoURL ? <img src={message.authorPhotoURL} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer"/> : (user?.displayName || 'T').slice(0, 1).toUpperCase()}</span>}
                        </div>
                      );
                    })}
                </div>
                <form onSubmit={sendGroupChatMessage} className="mt-3 flex items-end gap-2 border-t border-slate-100 pt-3">
                  <textarea value={chatDraft} onChange={(event) => setChatDraft(event.target.value.slice(0, 1000))} maxLength={1000} rows={2} placeholder="Écris un message…" className="min-h-11 max-h-28 min-w-0 flex-1 resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"/>
                  <Button type="submit" className="h-11 shrink-0 rounded-full px-4" disabled={chatBusy || !chatDraft.trim()}>{chatBusy ? '…' : <Send size={16}/>}</Button>
                </form>
                <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400"><span>{chatDraft.length}/1000 caractères</span><span>{chatQuota.remaining ?? 10} message(s) encore disponible(s)</span></div>
              </>
            )}
            {chatError && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{chatError}</p>}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(photoEditingGroup)} onClose={() => { if (busy !== 'group-photo') setPhotoEditingGroup(null); }} title={photoEditingGroup?.name || 'Photo du groupe'} className="max-w-5xl">
        {photoEditingGroup && (
          <div className="space-y-3">
            {photoEditingGroup.isOwner ? (
              <CloudinaryImageField value={groupPhotoDraft} onChange={setGroupPhotoDraft} folder={'pata/cotisations/' + photoEditingGroup.id} clickablePreview hideActions label="Photo de la cotisation" previewClassName="relative block aspect-video max-h-[72dvh] min-h-[220px] w-full overflow-hidden rounded-2xl bg-slate-100"/>
            ) : (
              <div className="overflow-hidden rounded-2xl bg-slate-100">{photoEditingGroup.imageURL ? <img src={photoEditingGroup.imageURL} alt={'Photo de ' + photoEditingGroup.name} className="mx-auto max-h-[75dvh] w-full object-contain"/> : <div className="flex min-h-[240px] items-center justify-center text-4xl font-bold text-slate-400">{(photoEditingGroup.name || 'G').slice(0, 1).toUpperCase()}</div>}</div>
            )}
            {photoEditingGroup.isOwner && <div className="flex items-center justify-end gap-2"><Button type="button" variant="outline" onClick={() => setPhotoEditingGroup(null)} disabled={busy === 'group-photo'}>Annuler</Button><Button type="button" onClick={saveGroupPhoto} disabled={busy === 'group-photo'}>{busy === 'group-photo' ? 'Enregistrement…' : 'Enregistrer la photo'}</Button></div>}
          </div>
        )}
      </Modal>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-900">Mes groupes</h2><button type="button" onClick={load} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700"><RefreshCw size={13}/> Actualiser</button></div>
        {loading ? <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Chargement des groupes…</div>
          : groups.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center"><Users size={28} className="mx-auto text-slate-400"/><h3 className="mt-3 text-sm font-bold text-slate-900">Aucun groupe pour le moment</h3><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">Crée ton premier groupe ou rejoins celui d’un proche à partir de son lien d’invitation.</p></div>
          : orderedGroups.map((group) => {
            const cycle = group.currentCycle;
            const progress = cycle.targetAmount > 0 ? Math.min(100, Math.round((cycle.totalCollected / cycle.targetAmount) * 100)) : 0;
            const form = payForms[group.id] || {};
            const withdraw = withdrawForms[group.id] || {};
            return <article id={'cotisation-' + group.id} key={group.id} className="min-w-0 scroll-mt-20 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 bg-white">
                <button type="button" onClick={() => openGroupPhotoEditor(group)} aria-label={'Afficher la photo de ' + group.name} className="group relative block h-40 w-full overflow-hidden bg-slate-100 text-left sm:h-52">
                  {group.imageURL ? <img src={group.imageURL} alt={'Photo de ' + group.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" referrerPolicy="no-referrer"/> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-5xl font-bold text-slate-400">{(group.name || 'G').slice(0, 1).toUpperCase()}</div>}
                  <span className="absolute bottom-3 right-3 rounded-full bg-slate-950/55 px-3 py-1.5 text-[10px] font-semibold text-white">{group.isOwner ? 'Appuyer pour afficher ou changer la photo' : 'Afficher la photo'}</span>
                </button>
                <button type="button" onClick={() => setExpandedGroups((current) => ({ ...current, [group.id]: true }))} className="block w-full p-4 text-left transition hover:bg-slate-50 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold tracking-tight text-slate-950">{group.name}</h3>{group.isOwner && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800"><Crown size={11}/> Chef de la cotisation</span>}{group.startedAt && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">En cours</span>}</div>
                      {group.description && <p className="mt-2 line-clamp-3 text-sm leading-5 text-slate-600">{group.description}</p>}
                      <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1.5 text-[10px] font-semibold text-slate-700">{currency(group.contributionAmount)} / membre</span><span className="rounded-full bg-slate-100 px-2.5 py-1.5 text-[10px] font-semibold text-slate-700">{frequencyLabels[group.frequency] || group.frequency}</span><span className="rounded-full bg-slate-100 px-2.5 py-1.5 text-[10px] font-semibold text-slate-700">{group.memberCount}/{group.expectedMembers} participants</span></div>
                    </div>
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500"><Settings size={16}/></span>
                  </div>
                </button>
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
                  <button type="button" onClick={() => openGroupChat(group)} className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-brand-700 px-3.5 text-xs font-semibold text-white hover:bg-brand-800"><MessageCircle size={14}/> Discussion</button>
                  <button type="button" onClick={() => togglePinned(group)} aria-label={pinnedGroups.includes(group.id) ? 'Désépingler ce groupe' : 'Épingler ce groupe'} className={'inline-flex h-9 w-9 items-center justify-center rounded-xl border ' + (pinnedGroups.includes(group.id) ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500')}><Pin size={14}/></button>
                  {group.isOwner && !group.startedAt && <button type="button" onClick={() => { setEditingGroupId(group.id); setResponsibilityAccepted(Boolean(group.responsibilityAccepted)); setGroupForm({ name: group.name || '', description: group.description || '', contributionAmount: String(group.contributionAmount || ''), expectedMembers: String(group.expectedMembers || 2), frequency: group.frequency || 'monthly', startDate: group.startDate || today(), dueDay: String(group.dueDay || 30), graceDays: String(group.graceDays ?? 1), lateFeeType: group.lateFeeType || 'none', lateFeeValue: String(group.lateFeeValue || '') }); setShowCreate(true); }} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Settings size={14}/> Paramètres</button>}
                  {group.isOwner && <button type="button" onClick={() => shareInvite(group)} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Users size={14}/> Inviter</button>}
                  <span className="ml-auto text-[11px] text-slate-500">{currency(cycle.totalCollected)} réunis · {statusLabels[cycle.status] || cycle.status}</span>
                </div>
                {!group.startedAt && <div className="border-t border-blue-100 bg-blue-50/70 px-4 py-3 text-xs leading-5 text-blue-900 sm:px-5">{group.isOwner ? <><strong>Avant de lancer :</strong> invite {Math.max(0, group.expectedMembers - group.memberCount)} participant(s), puis attribue une position à chacun. Le numéro WhatsApp n’est pas obligatoire.</> : <>Le groupe attend encore {Math.max(0, group.expectedMembers - group.memberCount)} participant(s). Le numéro WhatsApp est facultatif.</>}</div>}
                <div className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Collecté pour ce tour</p><p className="mt-1 text-base font-bold text-slate-900">{currency(cycle.totalCollected)}</p></div>
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Objectif collectif</p><p className="mt-1 text-base font-bold text-slate-900">{currency(cycle.targetAmount)}</p></div>
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                    <p className="text-[11px] text-emerald-800">Bénéficiaire actuel · Tour {cycle.cycleIndex + 1}</p>
                    <div className="mt-2 flex items-center gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-xs font-bold text-emerald-800">{cycle.beneficiaryPhotoURL ? <img src={cycle.beneficiaryPhotoURL} alt="" className="h-full w-full object-cover"/> : (cycle.beneficiaryName || 'M').slice(0, 1).toUpperCase()}</span><span className="min-w-0"><strong className="block truncate text-sm text-slate-900">{cycle.beneficiaryName}</strong><span className="text-[10px] text-slate-500">Position {cycle.beneficiaryPosition || '—'}{cycle.isMyTurn ? ' · C’est ton tour' : ''}</span></span></div>
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                    <p className="text-[11px] text-blue-800">Prochain bénéficiaire</p>
                    <div className="mt-2 flex items-center gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-xs font-bold text-blue-800">{cycle.nextBeneficiaryPhotoURL ? <img src={cycle.nextBeneficiaryPhotoURL} alt="" className="h-full w-full object-cover"/> : (cycle.nextBeneficiaryName || 'M').slice(0, 1).toUpperCase()}</span><span className="min-w-0"><strong className="block truncate text-sm text-slate-900">{cycle.nextBeneficiaryName || 'À déterminer'}</strong><span className="text-[10px] text-slate-500">Position {cycle.nextBeneficiaryPosition || '—'}</span></span></div>
                  </div>
                </div>
                <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                  <div className="mb-1 flex justify-between text-[11px] text-slate-500"><span>Progression du cycle · {statusLabels[cycle.status] || cycle.status}</span><strong>{progress}%</strong></div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: progress + '%' }}/></div>
                  <p className="mt-1 text-[11px] text-slate-500">Reste à réunir : {currency(cycle.remainingTotal)} · Échéance : {cycle.dueAt}</p>
                </div>
              </div>
              {expandedGroups[group.id] && <Modal open onClose={() => setExpandedGroups((old) => ({ ...old, [group.id]: false }))} title={group.name + ' — Détails'} className="h-full max-h-full max-w-none rounded-t-3xl sm:h-auto sm:max-h-[90dvh] sm:max-w-4xl sm:rounded-3xl">
              <div className="grid min-w-0 gap-4 overflow-x-hidden p-0.5 sm:p-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Users size={15}/> Ordre et suivi des membres</h4>{group.isOwner && !group.startedAt && <Button size="sm" variant="outline" onClick={() => saveMemberOrder(group)} disabled={busy === 'order-' + group.id || group.memberCount < 2}><Save size={13}/>{busy === 'order-' + group.id ? 'Enregistrement…' : 'Confirmer l’ordre choisi'}</Button>}</div>
                  <div className="min-w-0 space-y-2 rounded-xl"><div className="grid grid-cols-3 gap-2 px-1 text-[10px] font-semibold text-slate-500"><span>Membre</span><span className="text-right">Cotisé / reste</span><span className="text-right">Versements</span></div><div className="space-y-2">{group.members.map((member)=>{const currentOrder=orderDrafts[group.id]||group.members.map((item)=>item.uid),position=currentOrder.indexOf(member.uid)+1,displayedPosition=orderDrafts[group.id]?position:(member.turnOrder||'—');return <div key={member.uid} className="min-w-0 rounded-xl border border-slate-100 bg-white p-3"><div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2"><div className="flex min-w-0 items-center gap-2"><span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold">{displayedPosition}</span><span className="min-w-0 break-words text-xs font-semibold text-slate-800">{member.displayName}<span className="ml-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">{member.isOwner && <Crown size={9}/>} {member.roleLabel || (member.isOwner ? 'Chef de la cotisation' : 'Membre')}</span>{member.uid===cycle.beneficiaryUid&&group.startedAt?' · Bénéficiaire':''}</span>{group.isOwner&&!group.startedAt&&<span className="flex shrink-0 gap-1"><button type="button" aria-label="Monter" onClick={()=>moveMember(group,member.uid,-1)} disabled={position===1} className="rounded border border-slate-200 p-1 disabled:opacity-30"><ArrowUp size={12}/></button><button type="button" aria-label="Descendre" onClick={()=>moveMember(group,member.uid,1)} disabled={position===group.memberCount} className="rounded border border-slate-200 p-1 disabled:opacity-30"><ArrowDown size={12}/></button></span>}</div><span className="text-right text-[11px] font-semibold text-slate-700">{currency(member.paid)}<br/><span className="font-normal text-slate-500">Reste {currency(member.remaining)}</span></span><span className="text-right text-xs text-slate-700">{member.installments||0}</span></div>{member.whatsappPhone&&group.isOwner&&<a className="mt-2 inline-block text-[11px] font-semibold text-emerald-700" href={'https://wa.me/'+member.whatsappPhone.replace(/[^0-9]/g,'')} target="_blank" rel="noreferrer">Contacter sur WhatsApp · {member.whatsappPhone}</a>} {member.uid===user?.uid&&<div className="mt-3 space-y-2"><p className="text-[10px] text-slate-500">WhatsApp est facultatif. Tu peux laisser ce champ vide ; il sert uniquement à faciliter les contacts entre membres.</p><div className="flex flex-col gap-2 sm:flex-row"><input value={whatsappForms[group.id]??member.whatsappPhone??''} onChange={(event)=>setWhatsappForms((old)=>({...old,[group.id]:event.target.value}))} placeholder="Numéro WhatsApp avec indicatif (facultatif)" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-xs"/><Button size="sm" variant="outline" onClick={()=>saveWhatsApp(group)} disabled={busy==='whatsapp-'+group.id}>{busy==='whatsapp-'+group.id?'Enregistrement…':'Enregistrer'}</Button></div><div className="flex flex-col gap-2 sm:flex-row"><input value={roleDrafts[group.id]??member.roleLabel??'Membre'} onChange={(event)=>setRoleDrafts((old)=>({...old,[group.id]:event.target.value.slice(0,36)}))} maxLength={36} placeholder="Mon étiquette dans le groupe" className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-xs"/><Button size="sm" variant="outline" onClick={()=>saveMemberRole(group)} disabled={busy==='role-'+group.id}>Enregistrer mon étiquette</Button></div><p className="text-[10px] text-slate-500">Les autres membres verront cette étiquette à côté de ton nom. Le chef conserve automatiquement son rôle de chef.</p></div>}</div>;})}</div></div>
                </div>

                <div className="space-y-3">
                  {!group.startedAt && group.isOwner && group.orderDefined && group.memberCount === group.expectedMembers && !group.canStart && group.startDate > today() && <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">L’ordre des membres est enregistré. Tu pourras lancer la cotisation à partir du {group.startDate}, date de début choisie.</p>}
                  {!group.startedAt && group.isOwner && group.memberCount === group.expectedMembers && !group.canStart && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><h4 className="text-sm font-bold text-amber-900">Attribue les positions avant le lancement</h4><p className="mt-1 text-xs leading-5 text-amber-800">Le groupe est complet. Déplace les membres dans l’ordre souhaité, puis appuie sur « Confirmer l’ordre choisi ». Le chef ne reçoit pas automatiquement le premier tour.</p></div>}
                  {!group.startedAt && group.canStart && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><h4 className="text-sm font-bold text-emerald-900">Le groupe est complet</h4><p className="mt-1 text-xs leading-5 text-emerald-800">Tu as réuni les {group.expectedMembers} participants. Vérifie les positions puis lance la cotisation.</p><Button className="mt-3 w-full" onClick={() => startGroup(group)} disabled={busy === 'start-' + group.id || Boolean(orderDrafts[group.id])}><PlayCircle size={15}/>{busy === 'start-' + group.id ? 'Lancement…' : 'Lancer la cotisation'}</Button></div>}
                  {cycle.pendingPayment && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <h4 className="text-sm font-bold text-amber-900">Un paiement est en attente</h4>
                    <p className="mt-1 text-xs leading-5 text-amber-800">Un versement de {currency(cycle.pendingPayment.amount)}{cycle.pendingPayment.penaltyAmount > 0 ? ' + ' + currency(cycle.pendingPayment.penaltyAmount) + ' de majoration' : ''} + {currency(cycle.pendingPayment.fee)} de frais a été initié. Termine le paiement déjà ouvert ; un second versement ne peut pas être lancé tant que celui-ci n’est pas confirmé ou refusé.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a href={cycle.pendingPayment.checkoutUrl} className="inline-flex h-9 items-center rounded-lg bg-brand-700 px-3 text-xs font-semibold text-white">Reprendre le paiement</a>
                      <Button size="sm" variant="outline" onClick={() => verifyPendingPayment(group)} disabled={busy === 'verify-' + group.id}>{busy === 'verify-' + group.id ? 'Vérification…' : 'Vérifier le paiement'}</Button>
                    </div>
                  </div>}
                  {group.startedAt && cycle.myRemaining > 0 && cycle.status === 'OPEN' && !cycle.pendingPayment && <div className="rounded-xl border border-slate-200 p-3">
                    <h4 className="text-sm font-bold text-slate-900">Verser ma cotisation</h4>
                    <p className="mt-1 text-xs text-slate-500">Il te reste {currency(cycle.myRemaining)} pour cette période. Tu peux payer en plusieurs fois.</p>
                    <div className="mt-3 space-y-2">
                      <Input label="Montant de ce versement (FCFA)" type="number" min="100" step="100" value={form.amount ?? String(cycle.myRemaining)} onChange={(e) => setPayField(group.id, 'amount', e.target.value)}/>
                      {cycle.lateFeeDue > 0 && <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Majoration de retard prévue : <strong>{currency(cycle.lateFeeDue)}</strong>. Elle sera ajoutée une seule fois à ta contribution.</div>}
                      <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">Frais de service (5 %) : <strong>{currency(Math.round((Number(form.amount || cycle.myRemaining) + cycle.lateFeeDue) * 0.05))}</strong> · Total à payer : <strong>{currency(Number(form.amount || cycle.myRemaining) + cycle.lateFeeDue + Math.round((Number(form.amount || cycle.myRemaining) + cycle.lateFeeDue) * 0.05))}</strong></div>
                      <Button className="w-full" onClick={() => payContribution(group)} disabled={busy === 'pay-' + group.id}><Wallet size={15}/>{busy === 'pay-' + group.id ? 'Préparation…' : 'Effectuer le versement'}</Button>
                    </div>
                  </div>}

                  {!group.startedAt && !group.canStart && <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">Le groupe doit compter exactement {group.expectedMembers} participants avant de pouvoir être lancé. {Math.max(0, group.expectedMembers - group.memberCount)} place(s) restante(s).</p>}
                  {cycle.canWithdraw && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <h4 className="text-sm font-bold text-emerald-900">C’est ton tour de recevoir</h4><p className="mt-1 text-xs leading-5 text-emerald-800">Tous les membres ont terminé leur part. Tu peux demander le versement de {currency(cycle.totalCollected)}. La demande sera vérifiée par l’administration avant le versement ; Pata n’ajoute pas de frais de retrait.</p>
                    <div className="mt-3 space-y-2"><Input label="Ton numéro Mobile Money" value={withdraw.phone || ''} onChange={(e) => setWithdrawField(group.id, 'phone', e.target.value)} placeholder="6XXXXXXXX"/><select value={withdraw.network || 'mtn'} onChange={(e) => setWithdrawField(group.id, 'network', e.target.value)} className="h-10 w-full rounded-lg border border-emerald-200 bg-white px-3 text-sm"><option value="mtn">MTN Mobile Money</option><option value="orange">Orange Money</option></select><Button className="w-full" onClick={() => requestWithdrawal(group)} disabled={busy === 'withdraw-' + group.id}><ArrowDownToLine size={15}/>{busy === 'withdraw-' + group.id ? 'Envoi…' : 'Demander le retrait'}</Button></div>
                  </div>}

                  {cycle.status === 'PENDING_REVIEW' && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800"><Clock3 size={15} className="mr-1 inline"/>La demande du bénéficiaire est en cours de vérification par l’administration.</div>}
                  {cycle.status === 'PAID' && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800"><CheckCircle2 size={15} className="mr-1 inline"/>Le retrait du bénéficiaire de ce tour a été confirmé.</div>}
                  {cycle.myRemaining === 0 && !cycle.canWithdraw && cycle.status === 'OPEN' && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Ta part de ce cycle est complète. Le groupe attend les autres membres.</p>}
                </div>
              </div>
            </Modal>}
            </article>;
          })}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="text-base font-bold text-slate-900">Historique des retraits</h2><p className="mt-1 text-xs text-slate-500">Demandes que tu as faites comme bénéficiaire d’un groupe.</p></div><CalendarDays size={18} className="text-slate-400"/></div>
        {history.length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Aucune demande de retrait pour le moment.</p>
          : <div className="divide-y divide-slate-100">{history.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="text-sm font-semibold text-slate-800">{item.goalName || 'Cotisation'}</p><p className="mt-0.5 text-[11px] text-slate-500">{item.createdAt ? new Date(item.createdAt).toLocaleString(getPreferredLocale()) : 'Date non disponible'}</p></div><div className="text-right"><p className="text-sm font-bold text-slate-900">{currency(item.amount)}</p><span className="text-[10px] font-semibold text-slate-500">{statusLabels[item.status] || item.status}</span></div></div>)}</div>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
        <p className="font-bold text-slate-800">Comment fonctionne la tontine ?</p>
        <p className="mt-1">Le chef choisit le nombre de participants, définit la position de chacun et lance le groupe lorsque tous les membres prévus ont rejoint. Il fixe aussi le jour d’échéance mensuel, le délai de grâce et une éventuelle majoration fixe ou en pourcentage. Les membres peuvent cotiser en plusieurs fois depuis Pata. Les frais de 5 % sont appliqués à chaque versement ; une majoration de retard éventuelle est ajoutée au pot du bénéficiaire. L’ordre est verrouillé après le lancement. Le retrait reste soumis à la validation administrative et à la confirmation du prestataire.</p>
      </section>
    </div>
  );
}
