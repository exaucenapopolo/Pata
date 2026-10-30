/* eslint-disable react/no-unescaped-entities */
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Target, Trash2, AlertTriangle, Banknote, Pencil, Lightbulb,
  Info, CheckCircle2, TrendingUp, ShieldAlert, ArrowDownToLine, Landmark,
  MessageCircle, CalendarDays, PiggyBank, Lock, Unlock
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { CategoryManager } from '@/components/ui/CategoryManager';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useGoals, useDeposits } from '@/hooks/useGoals';
import { useIncomes } from '@/hooks/useIncomes';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { createGoal, updateGoal, deleteGoal } from '@/lib/firestore/goals';
import {
  computeGoalPlan, resolveFrequencyDays, MIN_PENALTY,
} from '@/lib/goalCalc';
import { adviceIconColor } from '@/lib/advisor';
import { formatCurrency, formatDate, resolveCategory } from '@/lib/utils';

const todayIso = () => new Date().toISOString().slice(0, 10);
const todayMonth = () => new Date().toISOString().slice(0, 7);

const FREQUENCY_PRESETS = [
  { v: '1',  label: 'Chaque jour' }, { v: '3',  label: 'Tous les 3 j' },
  { v: '7',  label: 'Chaque sem.' }, { v: '14', label: 'Toutes les 2 sem.' },
  { v: '30', label: 'Chaque mois' },
];

const ADVICE_ICONS = { success: CheckCircle2, danger: AlertTriangle, warning: AlertTriangle, tip: Lightbulb, info: Info };

function ProgressCircle({ value = 0, size = 100 }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safe = Math.min(100, Math.max(0, value));
  const offset = circumference - (safe / 100) * circumference;
  const color = safe >= 100 ? '#10b981' : safe >= 60 ? '#3b82f6' : safe >= 30 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e2e8f0" strokeWidth={strokeWidth} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth} fill="none" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold" style={{ color }}>{safe.toFixed(0)}%</span>
      </div>
    </div>
  );
}

function buildGoalAdvices(plan, balance, goalName) {
  if (!plan) return [];
  if (plan.type === 'piggybank') {
    return [{
      type: 'info',
      message: `C'est ta caisse libre. Tu peux y déposer de l'argent à tout moment sans engagement. Ton total actuel est de ${formatCurrency(plan.totalDeposited)}.`,
    }];
  }

  const advices = [];

  if (plan.notStarted) {
    advices.push({
      type: 'info',
      message: `Cet objectif est programmé pour commencer le ${formatDate(plan.startDate)}. Prépare-toi !`,
    });
    return advices;
  }

  if (plan.isReached) {
    advices.push({
      type: 'success',
      message: `Ton objectif « ${goalName} » est atteint. Tu peux retirer ton argent à tout moment.`,
    });
    return advices;
  }

  if (plan.isLate && plan.totalDebt === 0) {
    advices.push({
      type: 'danger',
      message: `Tu as ${plan.missedPayments} paiement${plan.missedPayments > 1 ? 's' : ''} manqué${plan.missedPayments > 1 ? 's' : ''}. Amende cumulée : ${formatCurrency(plan.penalty)}. Verse ${formatCurrency(plan.shortfall)} pour la stopper ou demande un micro-prêt.`,
    });
  } else if (plan.totalDeposited >= plan.expectedAmount) {
    advices.push({
      type: 'success',
      message: `Tu es à jour : ${formatCurrency(plan.totalDeposited)} versés. Continue comme ça.`,
    });
  } else {
    advices.push({
      type: 'info',
      message: `Il te reste ${formatCurrency(plan.expectedAmount - plan.totalDeposited)} à verser pour être à jour sur ton plan.`,
    });
  }

  if (balance >= plan.amountPerPayment) {
    advices.push({
      type: 'tip',
      message: `Ton solde couvre le prochain paiement de ${formatCurrency(plan.amountPerPayment)}. Verse directement.`,
    });
  } else if (balance === 0) {
    advices.push({
      type: 'tip',
      message: 'Recharge ton portefeuille pour financer cet objectif en un clic.',
    });
  }

  return advices;
}

function ConfirmWithdrawModal({ goal, actionType, onClose, onConfirm, busy }) {
  const deposits = useDeposits(goal.id);
  const plan = computeGoalPlan(goal, deposits);
  const isPiggybank = goal.type === 'piggybank';
  
  const isCancel = actionType === 'cancel';
  const cancelPenalty = isCancel && !isPiggybank ? Math.round(plan.totalDeposited * 0.10) : 0;
  const netRefund = Math.max(0, plan.totalDeposited - plan.totalDebt - cancelPenalty);

  const waNumber = '14236752034';
  const waMessage = encodeURIComponent(
    `Bonjour l’équipe Pata,\n\nJe souhaite ${isCancel ? 'annuler' : 'clôturer'} mon ${isPiggybank ? 'épargne libre' : 'objectif'} "${goal.name}".\n\n` +
    `- Total épargné : ${formatCurrency(plan.totalDeposited)}\n` +
    (plan.totalDebt > 0 ? `- Dettes (prêts) : ${formatCurrency(plan.totalDebt)}\n` : '') +
    (cancelPenalty > 0 ? `- Pénalité d’annulation (10%) : ${formatCurrency(cancelPenalty)}\n` : '') +
    `- Net à recevoir : ${formatCurrency(netRefund)}\n\n` +
    `Merci de traiter ma demande.`
  );

  return (
    <Modal open onClose={onClose} title={isPiggybank ? "Casser la tirelire" : (isCancel ? "Annuler l’objectif" : "Retirer mon épargne")}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
          <Info className="mt-0.5 shrink-0 text-slate-500" size={18} />
          <p className="text-sm text-slate-700">
            {isPiggybank
              ? "Vous êtes sur le point de casser votre tirelire. Tout l'argent épargné sera reversé sur votre portefeuille (sans pénalité)."
              : isCancel 
              ? "Attention : annuler l’objectif entraîne une pénalité de 10% sur votre épargne totale pour non-respect de l’engagement." 
              : "Vous êtes sur le point de clôturer cet objectif atteint. Le montant net sera reversé sur votre portefeuille."}
          </p>
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Total épargné</span>
            <span className="font-medium text-slate-800">{formatCurrency(plan.totalDeposited)}</span>
          </div>
          {plan.totalDebt > 0 && (
            <div className="flex justify-between text-sm text-red-600">
              <span>Dettes (prêts + intérêts)</span>
              <span className="font-medium">- {formatCurrency(plan.totalDebt)}</span>
            </div>
          )}
          {cancelPenalty > 0 && (
            <div className="flex justify-between text-sm text-red-600">
              <span>Pénalité d’annulation (10%)</span>
              <span className="font-medium">- {formatCurrency(cancelPenalty)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
            <span className="text-slate-800">Net à recevoir</span>
            <span className="text-brand-600">{formatCurrency(netRefund)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button onClick={() => onConfirm(actionType)} disabled={busy || netRefund <= 0} className="w-full">
            {busy ? 'Traitement…' : `Confirmer`}
          </Button>
          <Button variant="outline" onClick={() => window.open(`https://wa.me/${waNumber}?text=${waMessage}`, '_blank')} className="w-full text-green-600 border-green-200 hover:bg-green-50">
            <MessageCircle size={16} /> Envoyer le récapitulatif sur WhatsApp
          </Button>
          <Button variant="ghost" onClick={onClose} className="w-full">Fermer</Button>
        </div>
      </div>
    </Modal>
  );
}

function GoalDetail({ goal, onClose, onAskWithdraw }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { customCategories } = useCustomCategories('goal');
  const deposits = useDeposits(goal.id);
  const plan = computeGoalPlan(goal, deposits);
  const category = resolveCategory(goal.categoryId, 'goal', customCategories);
  const advices = buildGoalAdvices(plan, profile?.balance || 0, goal.name);
  const isPiggybank = goal.type === 'piggybank';

  const { incomes } = useIncomes();
  const currentMonthIncomes = useMemo(() => incomes.filter((i) => i.month === todayMonth()), [incomes]);
  const [selectedIncomeId, setSelectedIncomeId] = useState(currentMonthIncomes[0]?.id || '');
  const router = useRouter();

  const [amount, setAmount] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showLoan, setShowLoan] = useState(false);

  const balance = profile?.balance || 0;

  const handleAction = async (endpoint, payload, successMsg) => {
    setError('');
    setBusy(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/goals/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ goalId: goal.id, ...payload }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Erreur.');
      setAmount(''); setRepayAmount('');
      onClose();
      if (successMsg) alert(successMsg);
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  const onFundFromWallet = async (e) => {
    e.preventDefault();
    setError(''); setSaving(true);
    const selectedIncome = currentMonthIncomes.find(i => i.id === selectedIncomeId);
    
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/wallet/fund-goal', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
          goalId: goal.id, 
          amount: Number(amount),
          incomeSourceId: selectedIncomeId,
          incomeSourceName: selectedIncome?.source || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setAmount('');
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={goal.name} className="max-w-lg">
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-1">
          {isPiggybank ? (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <PiggyBank size={48} />
            </div>
          ) : (
            <ProgressCircle value={plan.progress} size={120} />
          )}
          <div className="mt-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} />
            <span className="text-xs font-medium text-slate-500">{category.label}</span>
          </div>
        </div>

        {isPiggybank ? (
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 mb-1">Total dans la tirelire</p>
            <p className="text-3xl font-bold text-brand-700">{formatCurrency(plan.totalDeposited)}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-50 px-2 py-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Objectif</p>
              <p className="mt-0.5 text-sm font-bold text-slate-800">{formatCurrency(goal.targetAmount)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-2 py-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Épargné</p>
              <p className="mt-0.5 text-sm font-bold text-brand-600">{formatCurrency(plan.totalDeposited)}</p>
            </div>
            <div className={`rounded-xl px-2 py-3 text-center ${plan.totalDebt > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
              <p className={`text-[10px] font-semibold uppercase tracking-wide ${plan.totalDebt > 0 ? 'text-red-600' : 'text-slate-500'}`}>Dette</p>
              <p className={`mt-0.5 text-sm font-bold ${plan.totalDebt > 0 ? 'text-red-600' : 'text-slate-800'}`}>{formatCurrency(plan.totalDebt)}</p>
            </div>
          </div>
        )}

        {!isPiggybank && plan.notStarted && (
          <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
            <CalendarDays size={16} />
            <span>Démarre le {formatDate(plan.startDate)}</span>
          </div>
        )}

        {!isPiggybank && plan.totalDebt > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
             <div className="flex items-start gap-2">
                <Landmark size={16} className="mt-0.5 shrink-0 text-red-600" />
                <p className="text-sm text-red-700">Tu as une dette de <strong>{formatCurrency(plan.totalDebt)}</strong> (incluant 5% d’intérêts). Elle sera déduite si tu retires.</p>
             </div>
             <div className="flex gap-2 items-end mt-2">
                <Input label="Montant à rembourser" type="number" min="1" value={repayAmount} onChange={e => setRepayAmount(e.target.value)} className="flex-1" />
                <Button onClick={() => handleAction('repay', { amount: Number(repayAmount) }, 'Prêt remboursé.')} disabled={busy || !repayAmount || Number(repayAmount) > balance}>
                  Rembourser
                </Button>
             </div>
          </div>
        )}

        {advices.length > 0 && (
          <div className="rounded-xl border border-slate-200 p-3.5">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <Lightbulb size={12} /> Assistant
            </div>
            <div className="space-y-2">
              {advices.map((a, i) => {
                const Icon = ADVICE_ICONS[a.type] || Info;
                return (
                  <div key={i} className="flex items-start gap-2">
                    <Icon size={14} className={`mt-0.5 shrink-0 ${adviceIconColor(a.type)}`} />
                    <p className="text-sm leading-relaxed text-slate-700">{a.message}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(!plan.isReached || isPiggybank) && !showLoan && (
          <form onSubmit={onFundFromWallet} className="rounded-xl border border-slate-200 p-3.5">
            <div className="mb-3 flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2">
              <span className="text-xs text-slate-600">Solde disponible</span>
              <span className="text-sm font-semibold text-brand-700">{formatCurrency(balance)}</span>
            </div>
            
            <div className="space-y-3 mb-3">
              <Input label="Montant à verser" type="number" min="1" required value={amount} onChange={(e) => setAmount(e.target.value)} />
              
              {currentMonthIncomes.length > 0 ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Depuis quel revenu ?</label>
                  <select value={selectedIncomeId} onChange={(e) => setSelectedIncomeId(e.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                    {currentMonthIncomes.map((inc) => (
                      <option key={inc.id} value={inc.id}>{inc.source} ({formatCurrency(inc.amount)})</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-center">
                  <p className="text-xs text-amber-700 mb-2">Aucun revenu enregistré ce mois-ci.</p>
                  <Button type="button" size="sm" onClick={() => router.push('/income')} className="w-full bg-amber-600 hover:bg-amber-700">
                    Créer un revenu d’abord
                  </Button>
                </div>
              )}
            </div>

            {currentMonthIncomes.length > 0 && (
              <div className="flex justify-end">
                <Button type="submit" disabled={saving || balance === 0}><Banknote size={14} /> Verser</Button>
              </div>
            )}
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            
            {!isPiggybank && currentMonthIncomes.length > 0 && (
              <div className="mt-3 text-center">
                <button type="button" onClick={() => setShowLoan(true)} className="text-xs font-semibold text-brand-600 hover:underline">
                  Solde insuffisant ? Demander un micro-prêt (5% d’intérêts)
                </button>
              </div>
            )}
          </form>
        )}

        {showLoan && !plan.isReached && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
            <h4 className="text-sm font-semibold text-amber-800 mb-1">Micro-prêt d’urgence</h4>
            <p className="text-xs text-amber-700 mb-3">Emprunte pour éviter l’amende. 5% d’intérêts seront ajoutés.</p>
            <div className="flex gap-2 items-end">
              <Input label="Montant" type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} className="flex-1" />
              <Button onClick={() => handleAction('borrow', { amount: Number(amount) }, 'Prêt accordé.')} disabled={busy || !amount} className="bg-amber-600 hover:bg-amber-700">
                Emprunter
              </Button>
            </div>
            <button onClick={() => setShowLoan(false)} className="text-xs text-amber-800 mt-3 hover:underline">Annuler</button>
          </div>
        )}

        <div className="space-y-2">
          {plan.isReached || isPiggybank ? (
            <Button onClick={() => { onClose(); onAskWithdraw(goal, isPiggybank ? 'cancel' : 'withdraw'); }} className="w-full" disabled={busy}>
              <ArrowDownToLine size={16} /> {isPiggybank ? 'Casser la tirelire (Tout retirer)' : 'Retirer l’épargne nette'}
            </Button>
          ) : (
            <Button onClick={() => { onClose(); onAskWithdraw(goal, 'cancel'); }} variant="outline" className="w-full text-red-600 hover:bg-red-50" disabled={busy}>
              <ShieldAlert size={16} /> Annuler l’objectif (10% pénalité)
            </Button>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Historique</p>
          {deposits.length === 0 ? (
            <p className="text-xs text-slate-500">Aucun dépôt enregistré.</p>
          ) : (
            <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto">
              {deposits.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-xs text-slate-500">{formatDate(d.date)}</span>
                    {d.incomeSourceName && <span className="text-[10px] text-slate-400 ml-1">({d.incomeSourceName})</span>}
                    {d.source === 'loan' && <span className="text-[10px] text-amber-600 font-bold ml-1">(PRÊT)</span>}
                  </div>
                  <span className={`text-sm font-semibold ${d.source === 'loan' ? 'text-amber-600' : 'text-brand-600'}`}>+ {formatCurrency(d.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

function GoalFormModal({ open, onClose, goal }) {
  const { user } = useAuth();
  const editing = !!goal;

  const initial = editing
    ? { 
        name: goal.name || '', 
        type: goal.type || 'goal',
        targetAmount: String(goal.targetAmount || ''), 
        categoryId: goal.categoryId || 'savings', 
        startDate: goal.startDate || todayIso(), 
        deadline: goal.deadline || todayIso(), 
        frequencyDays: String(goal.frequencyDays || 7), 
        penaltyAmount: String(Math.max(MIN_PENALTY, goal.penaltyAmount || MIN_PENALTY)) 
      }
    : { 
        name: '', 
        type: 'goal',
        targetAmount: '', 
        categoryId: 'savings', 
        startDate: todayIso(), 
        deadline: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
        frequencyDays: '7', 
        penaltyAmount: String(MIN_PENALTY) 
      };

  const [type, setType] = useState(initial.type);
  const [name, setName] = useState(initial.name);
  const [targetAmount, setTargetAmount] = useState(initial.targetAmount);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [deadline, setDeadline] = useState(initial.deadline);
  const [frequencyPreset, setFrequencyPreset] = useState(String(initial.frequencyDays));
  const [frequencyCustom, setFrequencyCustom] = useState('');
  const [penaltyAmount, setPenaltyAmount] = useState(initial.penaltyAmount);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const start = new Date(startDate);
  const end = new Date(deadline);
  const durationDays = Math.max(1, Math.ceil((end - start) / 86400000));
  const frequencyDays = resolveFrequencyDays(frequencyPreset, frequencyCustom);
  const totalPayments = Math.max(1, Math.ceil(durationDays / frequencyDays));
  const amountPerPayment = targetAmount ? Math.round(Number(targetAmount) / totalPayments) : 0;

  const onSubmit = async (e) => {
    e.preventDefault(); setError('');
    if (!name.trim()) return setError('Le nom est requis.');
    
    let payload = { name: name.trim(), type, categoryId };

    if (type === 'goal') {
      const target = Math.round(Number(targetAmount));
      if (!target) return setError('Le montant cible est requis pour un objectif.');
      if (end <= start) return setError('La date de fin doit être après la date de début.');
      
      payload = { ...payload, targetAmount: target, startDate, deadline, frequencyDays, penaltyAmount: Math.max(MIN_PENALTY, Number(penaltyAmount)) };
    }

    setSaving(true);
    try {
      if (editing) {
        await updateGoal(user.uid, goal.id, payload);
      } else {
        await createGoal(user.uid, payload);
      }
      onClose();
    } catch { setError('Erreur.'); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Modifier" : "Nouvelle épargne"} className="max-w-lg">
      <form onSubmit={onSubmit} className="space-y-4">
        
        {/* 🟢 SÉLECTEUR DE TYPE */}
        {!editing && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              type="button"
              onClick={() => setType('goal')}
              className={`flex flex-col items-center justify-center rounded-xl border p-3 transition ${type === 'goal' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <Target size={20} className={type === 'goal' ? 'text-brand-600' : 'text-slate-400'} />
              <span className={`mt-1 text-xs font-bold ${type === 'goal' ? 'text-brand-700' : 'text-slate-600'}`}>Objectif (dates)</span>
            </button>
            <button
              type="button"
              onClick={() => setType('piggybank')}
              className={`flex flex-col items-center justify-center rounded-xl border p-3 transition ${type === 'piggybank' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <PiggyBank size={20} className={type === 'piggybank' ? 'text-brand-600' : 'text-slate-400'} />
              <span className={`mt-1 text-xs font-bold ${type === 'piggybank' ? 'text-brand-700' : 'text-slate-600'}`}>Tirelire (libre)</span>
            </button>
          </div>
        )}

        <Input label="Nom de l'épargne" required value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'goal' ? "Ex : Acheter un ordinateur" : "Ex : Ma caisse de secours"} />
        
        <div><p className="mb-2 text-sm font-medium text-slate-700">Catégorie</p><CategoryManager type="goal" value={categoryId} onChange={setCategoryId} /></div>

        {/* CHAMPS SPÉCIFIQUES À L'OBJECTIF CLASSIQUE */}
        {type === 'goal' && (
          <>
            <Input label="Montant cible (FCFA)" type="number" min="0" required value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} />
            
            <div className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
              <p className="mb-2 text-sm font-medium text-slate-700 flex items-center gap-2">
                <CalendarDays size={16} className="text-brand-600" /> Période
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Date de début" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <Input label="Date de fin" type="date" required value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </div>
              <p className="mt-2 text-xs text-slate-500">Durée : <strong className="text-slate-700">{durationDays} jours</strong>.</p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Fréquence</p>
              <div className="flex flex-wrap gap-2">
                {FREQUENCY_PRESETS.map(({ v, label }) => (
                  <button type="button" key={v} onClick={() => setFrequencyPreset(v)} className={`rounded-full border px-3 py-1 text-xs font-medium ${frequencyPreset === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-700'}`}>{label}</button>
                ))}
                <button type="button" onClick={() => setFrequencyPreset('custom')} className={`rounded-full border px-3 py-1 text-xs font-medium ${frequencyPreset === 'custom' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-700'}`}>Perso.</button>
              </div>
              {frequencyPreset === 'custom' && <div className="mt-2"><Input label="Tous les X jours" type="number" min="1" value={frequencyCustom} onChange={(e) => setFrequencyCustom(e.target.value)} /></div>}
            </div>

            <div className="rounded-xl bg-brand-50/50 border border-brand-100 p-3 text-sm">
              <span className="text-brand-700 font-medium">Aperçu :</span> <span className="text-slate-800 font-bold">{totalPayments} paiements</span> de <strong className="text-brand-700">{formatCurrency(amountPerPayment)}</strong>
            </div>

            <Input label={`Amende par retard (min. ${formatCurrency(MIN_PENALTY)})`} type="number" min={MIN_PENALTY} value={penaltyAmount} onChange={(e) => setPenaltyAmount(e.target.value)} />
          </>
        )}

        {type === 'piggybank' && (
          <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4 text-sm text-slate-700">
            <p className="flex items-center gap-2 font-medium text-brand-700 mb-1"><PiggyBank size={16} /> Mode Tirelire</p>
            <p className="text-xs">Aucun montant fixe, aucune date limite. Vous déposez ce que vous voulez, quand vous voulez.</p>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={saving}>{saving ? 'Enregistrement…' : editing ? 'Mettre à jour' : "Créer"}</Button>
      </form>
    </Modal>
  );
}

function GoalCard({ goal, onOpen, onEdit, onAskWithdraw }) {
  const { customCategories } = useCustomCategories('goal');
  const deposits = useDeposits(goal.id);
  const plan = computeGoalPlan(goal, deposits);
  const category = resolveCategory(goal.categoryId, 'goal', customCategories);
  const isPiggybank = goal.type === 'piggybank';
  
  let statusColor = '#3b82f6';
  let statusLabel = 'En cours';
  
  if (isPiggybank) { statusColor = '#14b8a6'; statusLabel = 'Tirelire'; }
  else if (plan.notStarted) { statusColor = '#94a3b8'; statusLabel = 'Programmé'; }
  else if (plan.isReached) { statusColor = '#10b981'; statusLabel = 'Atteint'; }
  else if (plan.isLate) { statusColor = '#ef4444'; statusLabel = 'En retard'; }

  return (
    <Card className="flex flex-col">
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category?.color || '#94a3b8' }} />
            <p className="truncate text-lg font-bold text-slate-900">{goal.name}</p>
          </div>
          {!isPiggybank && (
            <p className="mt-1 text-xs text-slate-500">
              {formatCurrency(goal.targetAmount)} — {formatCurrency(plan.amountPerPayment)} / {plan.frequencyDays} j
            </p>
          )}
        </div>
        <button onClick={onEdit} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><Pencil size={16} /></button>
      </div>
      
      <div className="mb-2">
        <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white" style={{ backgroundColor: statusColor }}>
          {statusLabel}
        </span>
      </div>

      {isPiggybank ? (
        <div className="mb-4 flex items-center justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <PiggyBank size={24} />
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">Total épargné</p>
            <p className="text-xl font-bold text-brand-600">{formatCurrency(plan.totalDeposited)}</p>
          </div>
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-4">
          <ProgressCircle value={plan.progress} size={70} />
          <div className="flex-1 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Épargné</span>
              <span className="font-semibold text-brand-600">{formatCurrency(plan.totalDeposited)}</span>
            </div>
            {plan.totalDebt > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-red-500">Dettes</span>
                <span className="font-semibold text-red-600">{formatCurrency(plan.totalDebt)}</span>
              </div>
            )}
            {plan.isLate && (
              <div className="flex justify-between text-sm">
                <span className="text-red-500">Amende</span>
                <span className="font-semibold text-red-600">{formatCurrency(plan.penalty)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs pt-1 border-t border-slate-100">
              <span className="text-slate-400">Échéance</span>
              <span className="font-medium text-slate-600">{formatDate(goal.deadline)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="mt-auto space-y-2">
        <Button variant="outline" className="w-full" onClick={onOpen}>
          <TrendingUp size={16} /> {isPiggybank ? 'Ouvrir la caisse' : 'Voir les détails et verser'}
        </Button>
        {isPiggybank ? (
           <Button className="w-full bg-slate-900 text-white hover:bg-slate-800" onClick={() => onAskWithdraw(goal, 'cancel')}>
           <Unlock size={16} /> Casser la tirelire
         </Button>
        ) : plan.isReached ? (
          <Button className="w-full bg-brand-600 hover:bg-brand-700 text-white" onClick={() => onAskWithdraw(goal, 'withdraw')}>
            <ArrowDownToLine size={16} /> Retirer mon argent
          </Button>
        ) : (
          <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50" onClick={() => onAskWithdraw(goal, 'cancel')}>
            <ShieldAlert size={16} /> Annuler l’objectif
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function GoalsPage() {
  const { user } = useAuth();
  const { goals } = useGoals();
  const [open, setOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [selected, setSelected] = useState(null);
  
  const [confirmGoal, setConfirmGoal] = useState(null);
  const [confirmType, setConfirmType] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const openCreate = () => { setEditingGoal(null); setOpen(true); };
  const openEdit = (goal) => { setEditingGoal(goal); setOpen(true); };
  const closeForm = () => { setOpen(false); setEditingGoal(null); };

  const askWithdraw = (goal, type) => {
    setConfirmGoal(goal);
    setConfirmType(type);
  };

  const handleConfirmAction = async () => {
    if (!confirmGoal || !confirmType) return;
    setConfirmBusy(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/goals/${confirmType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ goalId: confirmGoal.id }),
      });
      const data = await res.json();
      if (data.success) {
        alert(confirmGoal.type === 'piggybank' ? 'Tirelire cassée, argent récupéré.' : (confirmType === 'cancel' ? 'Objectif annulé avec succès.' : 'Argent récupéré avec succès.'));
        setConfirmGoal(null);
        setConfirmType(null);
        setSelected(null);
      } else {
        alert(data.error);
      }
    } catch {
      alert('Erreur lors de la transaction.');
    } finally {
      setConfirmBusy(false);
    }
  };

  const onDelete = async (id) => {
    if (window.confirm("Supprimer cet objectif ? L’argent sera perdu (préférez Annuler).")) {
      await deleteGoal(user.uid, id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Épargne & Objectifs</h1>
          <p className="text-sm text-slate-500">Gère tes objectifs datés ou ta tirelire libre.</p>
        </div>
        <Button onClick={openCreate}><Plus size={16} /> Créer une épargne</Button>
      </div>

      {goals.length === 0 ? (
        <EmptyState icon={Target} title="Aucune épargne" description="Crée un objectif ou une tirelire pour commencer." action={<Button onClick={openCreate}><Plus size={16} /> Créer</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
          {goals.map((g) => (
            <GoalCard 
              key={g.id} 
              goal={g} 
              onOpen={() => setSelected(g)} 
              onEdit={() => openEdit(g)} 
              onAskWithdraw={askWithdraw}
            />
          ))}
        </div>
      )}

      {open && <GoalFormModal key={editingGoal?.id || 'new'} open={open} onClose={closeForm} goal={editingGoal} />}
      
      {selected && (
        <GoalDetail 
          goal={selected} 
          onClose={() => setSelected(null)} 
          onAskWithdraw={(g, type) => { setSelected(null); askWithdraw(g, type); }}
        />
      )}

      {confirmGoal && confirmType && (
        <ConfirmWithdrawModal 
          goal={confirmGoal} 
          actionType={confirmType} 
          onClose={() => { setConfirmGoal(null); setConfirmType(null); }} 
          onConfirm={handleConfirmAction}
          busy={confirmBusy}
        />
      )}
    </div>
  );
}