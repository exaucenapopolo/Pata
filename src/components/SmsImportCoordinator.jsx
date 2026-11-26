'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { PataSms } from '@/lib/sms/nativePlugin';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Check, FileText, MessageSquareText, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useDebts } from '@/hooks/useDebts';
import { useIncomes } from '@/hooks/useIncomes';
import { useExpenses } from '@/hooks/useExpenses';
import { getWithdrawalFundingSuggestion } from '@/lib/finance/cashWithdrawal.mjs';
import { subscribeProjects } from '@/lib/firestore/projects';
import { subscribeBills } from '@/lib/firestore/bills';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants';
import { parseMobileMoneySms } from '@/lib/sms/parseMobileMoneySms.mjs';
import { getAvailableSmsBillsForPayment, resolveSmsBillChoice, smsBillCategory } from '@/lib/sms/smsBillChoice.mjs';
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

function getSmsChoiceForItem(item, savedChoice = {}) {
  const persistedBillChoice = item?.billPayment === true ? {
    recordBill: true,
    billId: item.billId || 'new',
    billName: item.billName ?? undefined,
    billType: item.billType ?? undefined,
    billFrequency: item.billFrequency ?? undefined,
    billNextDueDate: item.billNextDueDate || '',
    billExpenseCategoryId: item.billExpenseCategoryId || item.categoryId || undefined,
  } : {};
  return { ...persistedBillChoice, ...(savedChoice || {}) };
}

function getSelectedBillForSms(item, selectedBillId, bills) {
  const id = String(selectedBillId || '').trim();
  if (!id || id === 'new') return null;
  const persistedForThisImport = item?.billPayment === true && item.billId === id && item.billDueDate;
  const available = (Array.isArray(bills) ? bills : []).find((bill) => bill.id === id);
  if (available) {
    return persistedForThisImport ? {
      ...available,
      name: item.billName || available.name,
      expenseCategoryId: item.billExpenseCategoryId || item.categoryId || available.expenseCategoryId,
      nextDueDate: item.billDueDate,
    } : available;
  }
  if (!persistedForThisImport) return null;
  return {
    id,
    name: item.billName || 'Facture associée',
    expenseCategoryId: item.billExpenseCategoryId || item.categoryId || 'other',
    nextDueDate: item.billDueDate,
    amount: null,
    isVariable: false,
    persistedPayment: true,
  };
}

async function hashTransaction(provider, transactionId) {
  const input = new TextEncoder().encode(provider + ':' + transactionId);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function SmsImportCoordinator() {
  const router = useRouter();
  const { user } = useAuth();
  const { debts } = useDebts();
  const { incomes } = useIncomes();
  const { expenses } = useExpenses();
  const [projects, setProjects] = useState([]);
  const [bills, setBills] = useState([]);
  const [billsLoaded, setBillsLoaded] = useState(false);
  const availableBills = useMemo(() => getAvailableSmsBillsForPayment(bills), [bills]);
  const [pending, setPending] = useState([]);
  const [choices, setChoices] = useState({});
  const [warnings, setWarnings] = useState({});
  const [workingId, setWorkingId] = useState('');
  const [notice, setNotice] = useState('');
  const [budgetPrompt, setBudgetPrompt] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const needsProjectOptions = pending.some((item) => choices[item.id]?.expenseType === 'project');

  useEffect(() => {
    if (!user || !needsProjectOptions) {
      setProjects([]);
      return undefined;
    }
    return subscribeProjects(user.uid, setProjects);
  }, [user, needsProjectOptions]);

  useEffect(() => {
    if (!user?.uid) {
      setBills([]);
      setBillsLoaded(false);
      return undefined;
    }
    setBillsLoaded(false);
    return subscribeBills(
      user.uid,
      (rows) => { setBills(rows); setBillsLoaded(true); },
      () => { setBills([]); setBillsLoaded(true); }
    );
  }, [user?.uid]);

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
      const choice = getSmsChoiceForItem(item, choices[item.id]);
      const { billName, billType, billFrequency, billExpenseCategoryId } = resolveSmsBillChoice(item, choice);
      const isIncome = item.direction === 'income';
      const isCashWithdrawal = item.eventType === 'withdrawal';
      const recordBill = !isIncome && !isCashWithdrawal && choice.recordBill === true;
      const selectedBillId = String(choice.billId || '').trim();
      const selectedSmsBill = recordBill ? getSelectedBillForSms(item, selectedBillId, availableBills) : null;
      const createNewBill = recordBill && selectedBillId === 'new';
      const withdrawalSuggestion = isCashWithdrawal ? getWithdrawalFundingSuggestion(incomes, expenses, item.provider, item.amount) : null;
      const withdrawalSourceIncomeId = isCashWithdrawal ? (choice.withdrawalSourceIncomeId || withdrawalSuggestion.defaultSourceId) : '';
      const debtCandidates = matchingDebtsForSms(item, debts);
      const repaymentDebtId = recordBill ? '' : (Object.prototype.hasOwnProperty.call(choice, 'repaymentDebtId') ? choice.repaymentDebtId : (debtCandidates.length === 1 ? debtCandidates[0].id : ''));
      const selectedCategoryId = recordBill
        ? (selectedSmsBill?.expenseCategoryId || billExpenseCategoryId)
        : choice.categoryId || (isIncome ? 'other_income' : item.suggestedCategoryId || 'other');
      const isDebtRepayment = !isIncome && !isCashWithdrawal && !recordBill
        && (selectedCategoryId === 'debt_repayment' || Boolean(repaymentDebtId));
      const incomeSourceId = !isIncome && !isCashWithdrawal
        ? String(choice.incomeSourceId || 'external').trim()
        : 'external';
      if (item.direction === 'withdrawal' && choice.confirmWithdrawal !== true) {
        throw new Error('Confirme explicitement que tu souhaites comptabiliser ce retrait comme une sortie.');
      }
      if (isDebtRepayment && !repaymentDebtId) {
        throw new Error('Choisis la dette concernée pour enregistrer ce remboursement.');
      }
      if (recordBill) {
        if (!billsLoaded) throw new Error('Pata charge encore tes factures. Réessaie dans un instant.');
        if (!selectedSmsBill && !createNewBill) {
          throw new Error(selectedBillId
            ? 'Cette facture n’est plus disponible ou a déjà été réglée. Actualise la liste avant de confirmer.'
            : 'Choisis la facture impayée à laquelle rattacher ce paiement.');
        }
        if (createNewBill) {
          if (!billName) throw new Error('Indique le nom de la nouvelle facture.');
          if (billFrequency !== 'once' && !String(choice.billNextDueDate || '').trim()) {
            throw new Error('Indique la prochaine échéance pour recevoir un rappel.');
          }
        }
      }
      if (!isIncome && !isCashWithdrawal && !isDebtRepayment && !['consumption', 'project', 'savings', 'investment'].includes(choice.expenseType || '')) {
        throw new Error('Choisis la nature réelle de cette sortie avant de confirmer.');
      }
      if (!isIncome && !isCashWithdrawal && !isDebtRepayment && choice.expenseType === 'project' && !choice.projectId) {
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
          categoryId: isCashWithdrawal ? 'other' : selectedCategoryId,
          expenseType: isCashWithdrawal || isDebtRepayment || recordBill ? 'consumption' : choice.expenseType || '',
          projectId: isDebtRepayment || recordBill ? '' : choice.projectId || '',
          incomeSourceId,
          confirmWithdrawal: choice.confirmWithdrawal === true,
          withdrawalSourceIncomeId: isCashWithdrawal ? withdrawalSourceIncomeId : 'external',
          confirmBudgetOverrun: warnings[item.id] === true,
          repaymentDebtId,
          recordBill,
          billId: selectedSmsBill?.id || (createNewBill ? 'new' : ''),
          billDueDate: selectedSmsBill?.nextDueDate || '',
          billName,
          billType,
          billFrequency,
          billNextDueDate: choice.billNextDueDate || '',
          billExpenseCategoryId: selectedSmsBill?.expenseCategoryId || billExpenseCategoryId,
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
      if (result.budgetRecommendation) setBudgetPrompt(result.budgetRecommendation);
      setNotice(result.alreadyPaid
        ? 'Cette facture était déjà marquée comme payée. Pata n’a ajouté aucune deuxième dépense.'
        : result.budgetRecommendation
          ? (result.budgetRecommendation.isSalary
            ? 'Revenu Mobile Money enregistré. Pata te recommande fortement de créer des budgets pour organiser ce salaire.'
            : 'Revenu Mobile Money enregistré. Pense à le répartir en budgets pour protéger tes priorités.')
          : result.billId
            ? 'Paiement enregistré dans l’historique de la facture et dans tes dépenses. La prochaine échéance a été mise à jour.'
            : 'Opération enregistrée dans Pata.');
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
            const choice = getSmsChoiceForItem(item, choices[item.id]);
            const { billName, billType, billFrequency, billExpenseCategoryId } = resolveSmsBillChoice(item, choice);
            const selectedSmsBill = choice.recordBill ? getSelectedBillForSms(item, choice.billId, availableBills) : null;
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
            const categories = repaymentOptions.length > 0
              ? [...baseCategories, { id: repaymentCategoryId, label: incoming ? 'Remboursement reçu' : 'Remboursement de dette' }]
              : baseCategories;
            const selectedCategoryId = choice.categoryId || (suggestedDebtId ? repaymentCategoryId : incoming ? 'other_income' : item.suggestedCategoryId || 'other');
            const selectedDebtRepayment = !incoming && selectedCategoryId === 'debt_repayment';
            const incomeSourceOptions = incomes
              .filter((income) => income.neutralFlow !== true && income.cashPocket !== true
                && income.balanceAvailable !== false && Number(income.remaining) > 0)
              .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
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
                {!incoming && item.eventType !== 'withdrawal' && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold text-slate-800">Comment classer cette sortie ?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => updateChoice(item.id, {
                      recordBill: false,
                      categoryId: item.suggestedCategoryId || 'other',
                      repaymentDebtId: '',
                      billId: '',
                    })} className={'min-h-10 rounded-lg border px-2 text-xs font-semibold ' + (!choice.recordBill ? 'border-emerald-700 bg-white text-emerald-900' : 'border-slate-200 bg-white text-slate-600')}>Dépense</button>
                    <button type="button" onClick={() => {
                      const defaults = resolveSmsBillChoice(item, choice);
                      updateChoice(item.id, {
                        recordBill: true,
                        billName: defaults.billName,
                        billType: defaults.billType,
                        billFrequency: defaults.billFrequency,
                        billExpenseCategoryId: defaults.billExpenseCategoryId,
                        categoryId: defaults.billExpenseCategoryId,
                        billId: billsLoaded && availableBills.length === 0 ? 'new' : '',
                        expenseType: 'consumption',
                        projectId: '',
                        repaymentDebtId: '',
                      });
                    }} className={'min-h-10 inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-semibold ' + (choice.recordBill ? 'border-emerald-700 bg-white text-emerald-900' : 'border-slate-200 bg-white text-slate-600')}><FileText size={14}/> Paiement de facture</button>
                  </div>
                </div>}
                {choice.recordBill && !incoming && item.eventType !== 'withdrawal' && <>
                  <label className="mt-3 block text-xs font-semibold text-slate-700">
                    Facture impayée à associer à ce paiement
                    <select
                      value={choice.billId || ''}
                      onChange={(event) => {
                        const nextBillId = event.target.value;
                        const selected = availableBills.find((bill) => bill.id === nextBillId);
                        if (nextBillId === 'new') {
                          const defaults = resolveSmsBillChoice(item, choice);
                          updateChoice(item.id, {
                            billId: 'new',
                            billName: defaults.billName,
                            billType: defaults.billType,
                            billFrequency: defaults.billFrequency,
                            billExpenseCategoryId: defaults.billExpenseCategoryId,
                            categoryId: defaults.billExpenseCategoryId,
                          });
                        } else {
                          updateChoice(item.id, {
                            billId: nextBillId,
                            ...(selected ? {
                              billExpenseCategoryId: selected.expenseCategoryId || 'other',
                              categoryId: selected.expenseCategoryId || 'other',
                            } : {}),
                          });
                        }
                      }}
                      className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800"
                    >
                      <option value="">{billsLoaded ? 'Choisir une facture impayée…' : 'Chargement des factures…'}</option>
                      {item.billPayment === true && item.billId && !availableBills.some((bill) => bill.id === item.billId) && <option value={item.billId}>{(item.billName || 'Facture associée') + ' · échéance ' + item.billDueDate + ' · confirmation à reprendre'}</option>}
                      {availableBills.map((bill) => (
                        <option key={bill.id} value={bill.id}>
                          {(bill.name || 'Facture sans nom') + ' · ' + (bill.providerName || bill.billType || 'Facture') + ' · ' + (bill.isVariable ? 'Montant variable' : money.format(Number(bill.amount) || 0) + ' FCFA') + ' · échéance ' + bill.nextDueDate}
                        </option>
                      ))}
                      <option value="new">La facture n’est pas encore enregistrée — créer son suivi</option>
                    </select>
                  </label>
                  {selectedSmsBill ? (
                    <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                      <p className="text-xs font-bold text-emerald-900">Facture sélectionnée : {selectedSmsBill.name}</p>
                      <p className="mt-1 text-[10px] leading-4 text-emerald-800">
                        Prochaine échéance : {selectedSmsBill.nextDueDate}
                        {' · '}
                        Montant prévu : {selectedSmsBill.isVariable ? 'variable' : money.format(Number(selectedSmsBill.amount) || 0) + ' FCFA'}
                      </p>
                      <p className="mt-2 text-[10px] leading-4 text-emerald-900">
                        Le paiement réel de {money.format(item.amount)} FCFA sera ajouté à l’historique de cette facture. Pata mettra à jour son échéance sans créer une seconde dépense.
                      </p>
                    </div>
                  ) : choice.billId === 'new' ? (
                    <>
                      <label className="mt-3 block text-xs font-semibold text-slate-700">Nom de la nouvelle facture
                        <input maxLength={100} value={billName} onChange={(event) => updateChoice(item.id, { billName: event.target.value })} placeholder="Ex. Facture ENEO" className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800"/>
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="mt-2 block text-xs font-semibold text-slate-700">Type de facture
                          <select value={billType} onChange={(event) => {
                            const nextType = event.target.value;
                            const nextCategory = smsBillCategory(nextType);
                            updateChoice(item.id, { billType: nextType, billExpenseCategoryId: nextCategory, categoryId: nextCategory });
                          }} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs font-normal text-slate-800">
                            <option value="electricity">Électricité</option><option value="water">Eau</option><option value="rent">Loyer</option><option value="television">Télévision</option><option value="internet">Internet</option><option value="telephone">Téléphone</option><option value="taxes">Impôts et taxes</option><option value="insurance">Assurance</option><option value="school">Scolarité</option><option value="subscription">Abonnement</option><option value="other">Autre facture</option>
                          </select>
                        </label>
                        <label className="mt-2 block text-xs font-semibold text-slate-700">Catégorie de dépense
                          <select value={billExpenseCategoryId} onChange={(event) => updateChoice(item.id, { billExpenseCategoryId: event.target.value, categoryId: event.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs font-normal text-slate-800">
                            {baseCategories.filter((category) => ['food', 'transport', 'housing', 'internet', 'health', 'leisure', 'gift_donation', 'contribution', 'other'].includes(category.id)).map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                          </select>
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="mt-2 block text-xs font-semibold text-slate-700">Fréquence
                          <select value={billFrequency} onChange={(event) => updateChoice(item.id, { billFrequency: event.target.value, ...(event.target.value === 'once' ? { billNextDueDate: '' } : {}) })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs font-normal text-slate-800">
                            <option value="monthly">Chaque mois</option><option value="weekly">Chaque semaine</option><option value="quarterly">Tous les 3 mois</option><option value="yearly">Chaque année</option><option value="once">Une seule fois</option>
                          </select>
                        </label>
                        {billFrequency !== 'once' && <label className="mt-2 block text-xs font-semibold text-slate-700">Prochaine échéance
                          <input type="date" value={choice.billNextDueDate || ''} onChange={(event) => updateChoice(item.id, { billNextDueDate: event.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs font-normal text-slate-800"/>
                        </label>}
                      </div>
                      <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-[10px] leading-4 text-emerald-900">Pata enregistrera cette facture comme nouvelle facture déjà payée et conservera le paiement dans son historique.</p>
                    </>
                  ) : (
                    <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[10px] leading-4 text-amber-900">
                      {billsLoaded
                        ? 'Sélectionne une facture impayée dans la liste, ou choisis de créer son suivi si elle n’est pas encore enregistrée.'
                        : 'Pata charge les factures de ton compte…'}
                    </p>
                  )}
                </>}
                {repaymentOptions.length > 0 && !choice.recordBill && <label className="mt-3 block rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">
                  {incoming ? 'Ce revenu correspond-il au remboursement d’une somme que tu avais prêtée ?' : 'Cette opération rembourse-t-elle une dette que tu as enregistrée ?'}
                  <select value={suggestedDebtId} onChange={(event) => updateChoice(item.id, { repaymentDebtId: event.target.value, categoryId: event.target.value ? repaymentCategoryId : (incoming ? 'other_income' : item.suggestedCategoryId || 'other') })} className="mt-2 h-10 w-full rounded-lg border border-emerald-200 bg-white px-3 text-sm font-normal text-slate-800">
                    <option value="">Non, ce n’est pas un remboursement</option>
                    {repaymentOptions.map((debt) => <option key={debt.id} value={debt.id}>{debt.person || debt.bankName || 'Créancier'} · {money.format(Number(debt.remaining) || 0)} FCFA restant{debtCandidates.some((match) => match.id === debt.id) ? ' · nom correspondant' : ''}</option>)}
                  </select>
                  <span className="mt-1.5 block text-[10px] font-normal leading-4 text-emerald-800">
                    {debtCandidates.length > 0 ? 'Pata a repéré une correspondance possible. Vérifie le nom et le montant avant de confirmer.' : 'Tu peux choisir une dette active même si le nom du bénéficiaire n’est pas présent dans le message.'}
                  </span>
                </label>}
                {!incoming && item.eventType !== 'withdrawal' && !selectedDebtRepayment && !choice.recordBill && <label className="mt-3 block text-xs font-semibold text-slate-700">
                  Nature de la sortie
                  <select value={selectedExpenseType} onChange={(event) => updateChoice(item.id, { expenseType: event.target.value, projectId: '' })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800">
                    <option value="">Choisir la nature réelle…</option>
                    <option value="consumption">Dépense courante (consommation)</option>
                    <option value="project">Dépense liée à un projet</option>
                    <option value="savings">Versement d’épargne</option>
                    <option value="investment">Investissement</option>
                  </select>
                </label>}
                {!incoming && !choice.recordBill && !selectedDebtRepayment && selectedExpenseType === 'project' && <label className="mt-3 block text-xs font-semibold text-slate-700">
                  Projet concerné
                  <select value={choice.projectId || ''} onChange={(event) => updateChoice(item.id, { projectId: event.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800">
                    <option value="">Choisir un projet…</option>
                    {projects.filter((project) => project.status === 'active').map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                  {!projects.some((project) => project.status === 'active') && <span className="mt-1 block font-normal text-amber-700">Aucun projet actif. Crée d’abord un projet dans la rubrique Projets ou choisis une autre nature.</span>}
                </label>}
                {item.eventType !== 'withdrawal' && !choice.recordBill && <label className="mt-3 block text-xs font-semibold text-slate-700">
                  Catégorie
                  <select value={selectedCategoryId} onChange={(event) => updateChoice(item.id, {
                    categoryId: event.target.value,
                    ...(event.target.value === 'debt_repayment' ? { expenseType: 'consumption', projectId: '' } : {}),
                    ...(event.target.value !== 'debt_repayment' ? { repaymentDebtId: '' } : {}),
                  })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800">
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                  </select>
                </label>}
                {!incoming && item.eventType !== 'withdrawal' && <label className="mt-3 block text-xs font-semibold text-slate-700">
                  Source du montant (facultatif)
                  <select value={choice.incomeSourceId || 'external'} onChange={(event) => updateChoice(item.id, { incomeSourceId: event.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800">
                    <option value="external">Solde externe / non suivi dans Pata</option>
                    <option value="all">Répartir sur mes revenus disponibles</option>
                    {incomeSourceOptions.map((income) => <option key={income.id} value={income.id}>
                      {(income.source || 'Revenu sans nom') + ' · ' + (income.date || 'Date inconnue') + ' · ' + money.format(Number(income.remaining) || 0) + ' FCFA disponibles'}
                    </option>)}
                  </select>
                  <span className="mt-1.5 block text-[10px] font-normal leading-4 text-slate-500">
                    {choice.incomeSourceId && choice.incomeSourceId !== 'external'
                      ? 'La sortie sera déduite du solde du ou des revenus sélectionnés.'
                      : 'Aucun revenu ne sera lié par défaut. Tu peux choisir une source pour suivre précisément le solde restant.'}
                  </span>
                </label>}
                {item.direction === 'withdrawal' && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Le retrait est un transfert entre deux formes d’argent : il diminue le solde Mobile Money choisi et crée une poche espèces du même montant. Il ne sera pas ajouté aux dépenses de consommation ni aux revenus.</p>}
                {selectedDebtRepayment && <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">Cette opération sera enregistrée comme remboursement de dette et ne sera pas comptée comme une dépense de consommation. Sélectionne la dette à rembourser ci-dessus.</p>}
                {warnings[item.id] && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Le budget sera dépassé. Confirme une seconde fois uniquement si tu souhaites enregistrer cette opération.</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" disabled={workingId === item.id
                    || (item.direction === 'withdrawal' && choice.confirmWithdrawal !== true)
                    || (!incoming && selectedDebtRepayment && !suggestedDebtId)
                    || (!incoming && choice.recordBill && (!billsLoaded || !choice.billId || (choice.billId !== 'new' && !selectedSmsBill) || (choice.billId === 'new' && (!String(choice.billName || billName || '').trim() || (billFrequency !== 'once' && !choice.billNextDueDate)))))
                    || (!incoming && item.eventType !== 'withdrawal' && !selectedDebtRepayment && !choice.recordBill && (!selectedExpenseType || (selectedExpenseType === 'project' && !choice.projectId)))} onClick={() => confirm(item)}>
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
        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-brand-700"/>
        <div className="min-w-0 flex-1 space-y-2">
          <p>{notice}</p>
          {budgetPrompt && <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { const target = budgetPrompt.target; setBudgetPrompt(null); if (target) router.push(target); }} className="rounded-lg bg-[#075b43] px-3 py-2 text-[11px] font-semibold text-white">Créer un budget lié</button>
            <button type="button" onClick={() => setBudgetPrompt(null)} className="px-2 py-2 text-[11px] font-semibold text-slate-500 underline">Plus tard</button>
          </div>}
        </div>
        <button type="button" onClick={() => { setNotice(''); setBudgetPrompt(null); }} aria-label="Fermer"><X size={14}/></button>
      </div>}
    </>
  );
}
