'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { PataSms } from '@/lib/sms/nativePlugin';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Check, MessageSquareText, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useDebts } from '@/hooks/useDebts';
import { useIncomes } from '@/hooks/useIncomes';
import { useExpenses } from '@/hooks/useExpenses';
import { getWithdrawalFundingSuggestion } from '@/lib/finance/cashWithdrawal.mjs';
import { subscribeProjects } from '@/lib/firestore/projects';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants';
import { parseMobileMoneySms } from '@/lib/sms/parseMobileMoneySms.mjs';
function normalizeDebtMatch(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchingDebtsForSms(item, debts) {
  const counterparty = normalizeDebtMatch(item?.counterparty);
  if (counterparty.length < 3) return [];
  const expectedType = item.direction === 'income' ? 'owed_to_me' : 'i_owe';
  return debts.filter((debt) => debt.type === expectedType && ['active', 'partial', 'late'].includes(debt.status) && Number(debt.remaining) > 0)
    .filter((debt) => [normalizeDebtMatch(debt.person), normalizeDebtMatch(debt.phone)]
      .filter((candidate) => candidate.length >= 3)
      .some((candidate) => candidate === counterparty || candidate.includes(counterparty) || counterparty.includes(candidate)));
}

function availableRepaymentDebtsForSms(item, debts) {
  if (item?.direction === 'withdrawal') return [];
  const expectedType = item?.direction === 'income' ? 'owed_to_me' : 'i_owe';
  return debts
    .filter((debt) => debt.type === expectedType && ['active', 'partial', 'late'].includes(debt.status) && Number(debt.remaining) > 0)
    .sort((a, b) => String(a.person || '').localeCompare(String(b.person || ''), 'fr'));
}

async function hashTransaction(provider, transactionId) {
  const input = new TextEncoder().encode(provider + ':' + transactionId);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function SmsImportCoordinator() {
  const { user } = useAuth();
  const { debts } = useDebts();
  const { incomes } = useIncomes();
  const { expenses } = useExpenses();
  const [projects, setProjects] = useState([]);
  const [pending, setPending] = useState([]);
  const [choices, setChoices] = useState({});
  const [warnings, setWarnings] = useState({});
  const [workingId, setWorkingId] = useState('');
  const [notice, setNotice] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const needsProjectOptions = pending.some((item) => choices[item.id]?.expenseType === 'project');

  useEffect(() => {
    if (!user || !needsProjectOptions) {
      setProjects([]);
      return undefined;
    }
    return subscribeProjects(user.uid, setProjects);
  }, [user, needsProjectOptions]);

  const loadPending = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const response = await fetch('/api/sms-import', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || 'Imports SMS indisponibles.');
    let hints = {};
    if (Capacitor.isNativePlatform()) {
      try {
        const local = await PataSms.getLocalHints();
        hints = JSON.parse(local.hintsJson || '{}');
      } catch { hints = {}; }
    }
    setPending((result.pending || []).map((item) => ({ ...item, ...(hints[item.id] || {}) })));
  }, [user]);

  const stageParsed = useCallback(async (parsed, sourceMode = 'automatic') => {
    if (!user || !parsed) return false;
    const transactionHash = parsed.transactionHash || await hashTransaction(parsed.provider, parsed.transactionId);
    const token = await user.getIdToken();
    const response = await fetch('/api/sms-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({
        action: 'stage', source: sourceMode, provider: parsed.provider, transactionHash,
        amount: parsed.amount, eventType: parsed.eventType, direction: parsed.direction,
        date: parsed.date, time: parsed.time, counterparty: parsed.counterparty || null,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) throw new Error(result.error || 'La transaction SMS n’a pas pu être enregistrée.');
    return transactionHash;
  }, [user]);

  const syncDeviceInbox = useCallback(async () => {
    if (!user || !Capacitor.isNativePlatform()) return;
    try {
      // Les SMS reçus en arrière-plan sont envoyés par WorkManager directement
      // au serveur ; on ne les remet plus en attente de confirmation manuelle ici.
      await PataSms.retryPendingSync().catch(() => {});
      const native = await PataSms.getPendingSms();
      const ownPending = (native.items || []).filter((item) => !item.ownerUid || item.ownerUid === user.uid);
      if (ownPending.length) {
        setNotice('Pata synchronise ' + ownPending.length + ' SMS reconnu(s) en arrière-plan. Les opérations sont enregistrées automatiquement dès que la connexion revient.');
      }

      const shared = await PataSms.getSharedSms();
      if (shared?.text) {
        const parsed = parseMobileMoneySms(shared.text);
        if (parsed) {
          try {
            const transactionHash = await stageParsed(parsed, 'sharesheet');
            if (parsed.counterparty || parsed.balance != null) {
              await PataSms.saveLocalHints({
                transactionHash,
                counterparty: parsed.counterparty || '',
                balance: parsed.balance == null ? null : Number(parsed.balance),
              });
            }
            await PataSms.clearSharedSms();
            setNotice('SMS partagé analysé sur cet appareil. Vérifie les informations puis confirme l’opération.');
          } catch (error) {
            setNotice(error.message || 'Impossible d’importer ce SMS partagé.');
          }
        } else {
          await PataSms.clearSharedSms();
          setNotice('Ce message ne correspond pas à une confirmation Mobile Money reconnue. Aucune opération n’a été ajoutée.');
        }
      }
      await loadPending();
    } catch (error) {
      console.warn('[PATA SMS SYNC]', error?.message || error);
    }
  }, [user, stageParsed, loadPending]);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    let appListener = null;
    const run = () => { if (active) syncDeviceInbox(); };
    run();
    const onFocus = () => run();
    const onVisibility = () => { if (document.visibilityState === 'visible') run(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    if (Capacitor.isNativePlatform()) {
      App.addListener('appStateChange', ({ isActive }) => { if (isActive) run(); }).then((listener) => { appListener = listener; }).catch(() => {});
    }
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      appListener?.remove?.();
    };
  }, [user, syncDeviceInbox]);

  useEffect(() => { if (pending.length > 0) setModalOpen(true); }, [pending.length]);

  const updateChoice = (id, patch) => setChoices((current) => ({ ...current, [id]: { ...(current[id] || {}), ...patch } }));

  const confirm = async (item) => {
    setWorkingId(item.id);
    setNotice('');
    try {
      const choice = choices[item.id] || {};
      const isIncome = item.direction === 'income';
      const isCashWithdrawal = item.eventType === 'withdrawal';
      const withdrawalSuggestion = isCashWithdrawal ? getWithdrawalFundingSuggestion(incomes, expenses, item.provider, item.amount) : null;
      const withdrawalSourceIncomeId = isCashWithdrawal ? (choice.withdrawalSourceIncomeId || withdrawalSuggestion.defaultSourceId) : '';
      const debtCandidates = matchingDebtsForSms(item, debts);
      const repaymentDebtId = Object.prototype.hasOwnProperty.call(choice, 'repaymentDebtId') ? choice.repaymentDebtId : (debtCandidates.length === 1 ? debtCandidates[0].id : '');
      if (item.direction === 'withdrawal' && choice.confirmWithdrawal !== true) {
        throw new Error('Confirme explicitement que tu souhaites comptabiliser ce retrait comme une sortie.');
      }
      if (!isIncome && !isCashWithdrawal && !['consumption', 'project', 'savings', 'investment'].includes(choice.expenseType || '')) {
        throw new Error('Choisis la nature réelle de cette sortie avant de confirmer.');
      }
      if (!isIncome && !isCashWithdrawal && choice.expenseType === 'project' && !choice.projectId) {
        throw new Error('Choisis le projet concerné avant de confirmer.');
      }
      const token = await user.getIdToken();
      const response = await fetch('/api/sms-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          action: 'confirm', id: item.id,
          operationType: isIncome ? 'income' : 'expense',
          eventType: item.eventType,
          categoryId: isCashWithdrawal ? 'other' : choice.categoryId || (isIncome ? 'other_income' : item.suggestedCategoryId || 'other'),
          expenseType: isCashWithdrawal ? 'consumption' : choice.expenseType || '',
          projectId: choice.projectId || '',
          confirmWithdrawal: choice.confirmWithdrawal === true,
          withdrawalSourceIncomeId: isCashWithdrawal ? withdrawalSourceIncomeId : 'external',
          confirmBudgetOverrun: warnings[item.id] === true,
          repaymentDebtId,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (result.confirmationRequired) {
        setWarnings((current) => ({ ...current, [item.id]: true }));
        setNotice(result.message || 'Cette dépense dépasse un budget. Confirme une seconde fois pour continuer.');
        return;
      }
      if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de confirmer cette opération.');
      setPending((current) => current.filter((row) => row.id !== item.id));
      if (Capacitor.isNativePlatform()) {
        await PataSms.clearLocalHints({ transactionHash: item.id }).catch(() => {});
      }
      setWarnings((current) => { const next = { ...current }; delete next[item.id]; return next; });
      setNotice('Opération enregistrée dans Pata.');
    } catch (error) {
      setNotice(error.message || 'Confirmation impossible.');
    } finally {
      setWorkingId('');
    }
  };

  const refuse = async (item) => {
    setWorkingId(item.id);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/sms-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action: 'refuse', id: item.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de refuser cet import.');
      setPending((current) => current.filter((row) => row.id !== item.id));
      if (Capacitor.isNativePlatform()) {
        await PataSms.clearLocalHints({ transactionHash: item.id }).catch(() => {});
      }
    } catch (error) {
      setNotice(error.message || 'Refus impossible.');
    } finally {
      setWorkingId('');
    }
  };

  const money = useMemo(() => new Intl.NumberFormat('fr-FR'), []);
  if (!user) return null;

  return (
    <>
      <Modal open={pending.length > 0 && modalOpen} onClose={() => setModalOpen(false)} title="Opération Mobile Money détectée" className="max-w-xl">
        <div className="space-y-4">
          <p className="text-xs leading-5 text-slate-600">Vérifie chaque opération détectée avant son enregistrement. Le SMS original reste sur le téléphone.</p>
          {pending.map((item) => {
            const incoming = item.direction === 'income';
            const choice = choices[item.id] || {};
            const label = item.provider === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money';
            const baseCategories = incoming
              ? INCOME_CATEGORIES.filter((category) => !['debt_borrowed', 'debt_repayment_received'].includes(category.id))
              : EXPENSE_CATEGORIES.filter((category) => !['loan_given', 'debt_repayment'].includes(category.id));
            const selectedExpenseType = choice.expenseType || '';
            const debtCandidates = matchingDebtsForSms(item, debts);
            const repaymentOptions = availableRepaymentDebtsForSms(item, debts);
            const suggestedDebtId = Object.prototype.hasOwnProperty.call(choice, 'repaymentDebtId') ? choice.repaymentDebtId : (debtCandidates.length === 1 ? debtCandidates[0].id : '');
            const repaymentCategoryId = incoming ? 'debt_repayment_received' : 'debt_repayment';
            const withdrawalSuggestion = item.eventType === 'withdrawal' ? getWithdrawalFundingSuggestion(incomes, expenses, item.provider, item.amount) : null;
            const selectedWithdrawalSource = choice.withdrawalSourceIncomeId || withdrawalSuggestion?.defaultSourceId || 'external';
            const categories = suggestedDebtId
              ? [...baseCategories, { id: repaymentCategoryId, label: incoming ? 'Remboursement reçu' : 'Remboursement de dette' }]
              : baseCategories;
            return (
              <section key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3.5">
                <div className="flex items-start gap-3">
                  <span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' + (incoming ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
                    {incoming ? <ArrowDownLeft size={19}/> : <ArrowUpRight size={19}/>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label} · {item.eventType === 'withdrawal' ? 'Retrait' : incoming ? 'Réception' : item.eventType === 'payment' ? 'Paiement' : 'Envoi'}</p>
                    <p className="mt-1 text-xl font-bold tracking-tight text-slate-900">{money.format(item.amount)} FCFA</p>
                    <p className="mt-1 text-[10px] text-slate-500">{item.date} à {item.time}</p>
                    {item.counterparty && <p className="mt-1 text-xs font-medium text-slate-700">Contrepartie : {item.counterparty}</p>}
                    {item.balance != null && <p className="mt-1 text-[10px] text-slate-500">Solde après opération : {money.format(Number(item.balance))} FCFA (visible sur cet appareil uniquement)</p>}
                  </div>
                </div>
                {item.direction === 'withdrawal' && <div className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <label className="flex items-start gap-2 text-xs leading-5 text-amber-950">
                    <input type="checkbox" checked={choice.confirmWithdrawal === true} onChange={(event) => updateChoice(item.id, { confirmWithdrawal: event.target.checked })} className="mt-0.5"/>
                    Je confirme ce retrait et veux transférer cet argent de mon solde Mobile Money vers mes espèces.
                  </label>
                  <label className="block text-xs font-semibold text-slate-800">
                    D’où provient l’argent retiré ?
                    <select value={selectedWithdrawalSource} onChange={(event) => updateChoice(item.id, { withdrawalSourceIncomeId: event.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800">
                      {withdrawalSuggestion?.totalAvailable >= Number(item.amount) && withdrawalSuggestion.candidates.length > 1 && <option value="all">Combiner mes entrées {item.provider === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money'} suivies ({money.format(withdrawalSuggestion.totalAvailable)} FCFA disponibles)</option>}
                      {(withdrawalSuggestion?.candidates || []).map((source) => <option key={source.id} value={source.id}>{source.source || 'Revenu Mobile Money'} · {source.date || 'Date inconnue'} · {money.format(source.remaining)} FCFA disponibles</option>)}
                      <option value="external">Solde {item.provider === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money'} non suivi dans Pata</option>
                    </select>
                  </label>
                  {withdrawalSuggestion?.candidates.length > 0
                    ? <p className="text-[10px] leading-4 text-emerald-800">Pata propose les entrées du même opérateur. Vérifie la source avant de confirmer. Total disponible suivi : {money.format(withdrawalSuggestion.totalAvailable)} FCFA.</p>
                    : <p className="text-[10px] leading-4 text-slate-600">Aucun revenu correspondant n’est disponible dans Pata. Le retrait sera suivi depuis un solde externe, sans inventer un revenu.</p>}
                </div>}
                {repaymentOptions.length > 0 && <label className="mt-3 block rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">
                  {incoming ? 'Ce revenu correspond-il au remboursement d’une somme que tu avais prêtée ?' : 'Cette opération rembourse-t-elle une dette que tu as enregistrée ?'}
                  <select value={suggestedDebtId} onChange={(event) => updateChoice(item.id, { repaymentDebtId: event.target.value, categoryId: event.target.value ? repaymentCategoryId : (incoming ? 'other_income' : item.suggestedCategoryId || 'other') })} className="mt-2 h-10 w-full rounded-lg border border-emerald-200 bg-white px-3 text-sm font-normal text-slate-800">
                    <option value="">Non, ce n’est pas un remboursement</option>
                    {repaymentOptions.map((debt) => <option key={debt.id} value={debt.id}>{debt.person || debt.bankName || 'Créancier'} · {money.format(Number(debt.remaining) || 0)} FCFA restant{debtCandidates.some((match) => match.id === debt.id) ? ' · nom correspondant' : ''}</option>)}
                  </select>
                  <span className="mt-1.5 block text-[10px] font-normal leading-4 text-emerald-800">
                    {debtCandidates.length > 0 ? 'Pata a repéré une correspondance possible. Vérifie le nom et le montant avant de confirmer.' : 'Tu peux choisir une dette active même si le nom du bénéficiaire n’est pas présent dans le message.'}
                  </span>
                </label>}
                {!incoming && item.eventType !== 'withdrawal' && <label className="mt-3 block text-xs font-semibold text-slate-700">
                  Nature de la sortie
                  <select value={selectedExpenseType} onChange={(event) => updateChoice(item.id, { expenseType: event.target.value, projectId: '' })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800">
                    <option value="">Choisir la nature réelle…</option>
                    <option value="consumption">Dépense courante (consommation)</option>
                    <option value="project">Dépense liée à un projet</option>
                    <option value="savings">Versement d’épargne</option>
                    <option value="investment">Investissement</option>
                  </select>
                </label>}
                {!incoming && selectedExpenseType === 'project' && <label className="mt-3 block text-xs font-semibold text-slate-700">
                  Projet concerné
                  <select value={choice.projectId || ''} onChange={(event) => updateChoice(item.id, { projectId: event.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800">
                    <option value="">Choisir un projet…</option>
                    {projects.filter((project) => project.status === 'active').map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                  {!projects.some((project) => project.status === 'active') && <span className="mt-1 block font-normal text-amber-700">Aucun projet actif. Crée d’abord un projet dans la rubrique Projets ou choisis une autre nature.</span>}
                </label>}
                {item.eventType !== 'withdrawal' && <label className="mt-3 block text-xs font-semibold text-slate-700">
                  Catégorie
                  <select value={choice.categoryId || (incoming ? 'other_income' : item.suggestedCategoryId || 'other')} onChange={(event) => updateChoice(item.id, { categoryId: event.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800">
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                  </select>
                </label>}
                {item.direction === 'withdrawal' && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Le retrait est un transfert entre deux formes d’argent : il diminue le solde Mobile Money choisi et crée une poche espèces du même montant. Il ne sera pas ajouté aux dépenses de consommation ni aux revenus.</p>}
                {warnings[item.id] && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Le budget sera dépassé. Confirme une seconde fois uniquement si tu souhaites enregistrer cette opération.</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" disabled={workingId === item.id
                    || (item.direction === 'withdrawal' && choice.confirmWithdrawal !== true)
                    || (!incoming && item.eventType !== 'withdrawal' && (!selectedExpenseType || (selectedExpenseType === 'project' && !choice.projectId)))} onClick={() => confirm(item)}>
                    <Check size={14}/>{workingId === item.id ? 'Enregistrement…' : warnings[item.id] ? 'Confirmer malgré le budget' : item.eventType === 'withdrawal' ? 'Confirmer le transfert vers espèces' : 'Confirmer l’opération'}
                  </Button>
                  <Button size="sm" variant="outline" disabled={workingId === item.id} onClick={() => refuse(item)}><X size={14}/> Refuser</Button>
                </div>
              </section>
            );
          })}
          {notice && <p role="status" className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-700">{notice}</p>}
          <button type="button" onClick={() => setModalOpen(false)} className="text-xs font-semibold text-slate-500 underline underline-offset-2">Fermer pour le moment</button>
        </div>
      </Modal>
      {pending.length > 0 && <button type="button" onClick={() => setModalOpen(true)} className="fixed bottom-24 right-3 z-40 flex items-center gap-2 rounded-full bg-[#075b43] px-4 py-3 text-xs font-semibold text-white shadow-lg lg:bottom-6">
        <MessageSquareText size={15}/> {pending.length} import{pending.length > 1 ? 's' : ''} à confirmer
      </button>}
      {notice && pending.length === 0 && <div role="status" className="fixed bottom-24 left-3 right-3 z-[80] flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-lg lg:bottom-6 lg:left-auto lg:max-w-sm">
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-brand-700"/><span className="flex-1">{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Fermer"><X size={14}/></button>
      </div>}
    </>
  );
}
