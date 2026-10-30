/* eslint-disable react/no-unescaped-entities */
'use client';

import { useState } from 'react';
import {
  Plus, Target, Trash2, AlertTriangle, Banknote, Pencil, Lightbulb,
  Info, CheckCircle2, TrendingUp, ShieldAlert, ArrowDownToLine, Landmark,
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
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { createGoal, updateGoal, deleteGoal } from '@/lib/firestore/goals';
import {
  computeGoalPlan, resolveDurationDays, resolveFrequencyDays, MIN_PENALTY,
} from '@/lib/goalCalc';
import { adviceIconColor } from '@/lib/advisor';
import { formatCurrency, formatDate, resolveCategory } from '@/lib/utils';

const todayIso = () => new Date().toISOString().slice(0, 10);

const DURATION_PRESETS = [
  { v: '7',   label: '1 sem.' }, { v: '14',  label: '2 sem.' },
  { v: '30',  label: '1 mois' }, { v: '90',  label: '3 mois' },
  { v: '180', label: '6 mois' }, { v: '365', label: '1 an' },
  { v: '730', label: '2 ans' },
];

const FREQUENCY_PRESETS = [
  { v: '1',  label: 'Chaque jour' }, { v: '3',  label: 'Tous les 3 j' },
  { v: '7',  label: 'Chaque sem.' }, { v: '14', label: 'Toutes les 2 sem.' },
  { v: '30', label: 'Chaque mois' },
];

const ADVICE_ICONS = { success: CheckCircle2, danger: AlertTriangle, warning: AlertTriangle, tip: Lightbulb, info: Info };

function ProgressCircle({ value = 0, size = 140 }) {
  const strokeWidth = 12;
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
        <span className="text-2xl font-bold" style={{ color }}>{safe.toFixed(0)}%</span>
        <span className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-400">Progression</span>
      </div>
    </div>
  );
}

function buildGoalAdvices(plan, balance, goalName) {
  if (!plan) return [];
  const advices = [];

  if (plan.isReached) {
    advices.push({
      type: 'success',
      message: `Ton objectif « ${goalName} » est atteint. Tu peux retirer ton argent à tout moment depuis cet écran.`,
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
      message: `Tu es à jour : ${formatCurrency(plan.totalDeposited)} versés sur ${formatCurrency(plan.expectedAmount)} attendus. Continue comme ça.`,
    });
  } else {
    advices.push({
      type: 'info',
      message: `Il te reste ${formatCurrency(plan.expectedAmount - plan.totalDeposited)} à verser pour être à jour sur ton plan.`,
    });
  }

  if (plan.daysLeft > 0 && plan.daysLeft <= 3 && plan.progress < 100) {
    advices.push({
      type: 'warning',
      message: `L&apos;objectif se termine dans ${plan.daysLeft} jour${plan.daysLeft > 1 ? 's' : ''}. Il manque ${formatCurrency(plan.remaining)}.`,
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

function GoalDetail({ goal, onClose }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { customCategories } = useCustomCategories('goal');
  const deposits = useDeposits(goal.id);
  const plan = computeGoalPlan(goal, deposits);
  const category = resolveCategory(goal.categoryId, 'goal', customCategories);
  const advices = buildGoalAdvices(plan, profile?.balance || 0, goal.name);

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
      if (successMsg) alert(successMsg);
      setAmount(''); setRepayAmount('');
      if (endpoint === 'withdraw' || endpoint === 'cancel') onClose();
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  const onFundFromWallet = async (e) => {
    e.preventDefault();
    setError(''); setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/wallet/fund-goal', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ goalId: goal.id, amount: Number(amount) }),
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
          <ProgressCircle value={plan.progress} />
          <div className="mt-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} />
            <span className="text-xs font-medium text-slate-500">{category.label}</span>
          </div>
        </div>

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

        {plan.totalDebt > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
             <div className="flex items-start gap-2">
                <Landmark size={16} className="mt-0.5 shrink-0 text-red-600" />
                <p className="text-sm text-red-700">Tu as une dette de <strong>{formatCurrency(plan.totalDebt)}</strong> (incluant 5% d&apos;intérêts). Elle sera déduite de ton épargne si tu retires. Tu peux la rembourser dès maintenant.</p>
             </div>
             <div className="flex gap-2 items-end mt-2">
                <Input label="Montant à rembourser" type="number" min="1" value={repayAmount} onChange={e => setRepayAmount(e.target.value)} className="flex-1" />
                <Button onClick={() => handleAction('repay', { amount: Number(repayAmount) }, 'Prêt remboursé avec succès.')} disabled={busy || !repayAmount || Number(repayAmount) > balance}>
                  Rembourser
                </Button>
             </div>
             {Number(repayAmount) > balance && <p className="text-xs text-red-600 mt-1">Ton solde est insuffisant pour ce montant.</p>}
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

        {!plan.isReached && !showLoan && (
          <form onSubmit={onFundFromWallet} className="rounded-xl border border-slate-200 p-3.5">
            <div className="mb-3 flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2">
              <span className="text-xs text-slate-600">Solde disponible</span>
              <span className="text-sm font-semibold text-brand-700">{formatCurrency(balance)}</span>
            </div>
            <div className="flex gap-2">
              <Input label="Montant à verser" type="number" min="1" required value={amount} onChange={(e) => setAmount(e.target.value)} className="flex-1" />
              <div className="flex items-end"><Button type="submit" disabled={saving || balance === 0}><Banknote size={14} /> Verser</Button></div>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-3 text-center">
              <button type="button" onClick={() => setShowLoan(true)} className="text-xs font-semibold text-brand-600 hover:underline">
                Solde insuffisant ? Demander un micro-prêt (5% d&apos;intérêts)
              </button>
            </div>
          </form>
        )}

        {showLoan && !plan.isReached && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
            <h4 className="text-sm font-semibold text-amber-800 mb-1">Micro-prêt d&apos;urgence</h4>
            <p className="text-xs text-amber-700 mb-3">Emprunte le montant exact de ton paiement pour éviter l&apos;amende. 5% d&apos;intérêts seront ajoutés à ta dette.</p>
            <div className="flex gap-2 items-end">
              <Input label="Montant à emprunter" type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} className="flex-1" />
              <Button onClick={() => handleAction('borrow', { amount: Number(amount) }, 'Prêt accordé. Le montant a été ajouté à ton objectif.')} disabled={busy || !amount} className="bg-amber-600 hover:bg-amber-700">
                Emprunter
              </Button>
            </div>
            <button onClick={() => setShowLoan(false)} className="text-xs text-amber-800 mt-3 hover:underline">Annuler</button>
          </div>
        )}

        <div className="space-y-2">
          {plan.isReached ? (
            <Button onClick={() => handleAction('withdraw', {}, 'Argent récupéré sur ton solde.')} className="w-full" disabled={busy}>
              <ArrowDownToLine size={16} />
              {busy ? 'Traitement…' : `Retirer l&apos;épargne nette`}
            </Button>
          ) : (
            <Button onClick={() => handleAction('cancel', {}, 'Objectif annulé.')} variant="outline" className="w-full text-red-600 hover:bg-red-50" disabled={busy}>
              <ShieldAlert size={16} />
              {busy ? 'Traitement…' : 'Annuler l&apos;objectif (10% pénalité)'}
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
                  <span className="text-xs text-slate-500">{formatDate(d.date)} {d.source === 'loan' && <span className="text-[10px] text-amber-600 font-bold ml-1">(PRÊT)</span>}</span>
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
    ? { name: goal.name || '', targetAmount: String(goal.targetAmount || ''), categoryId: goal.categoryId || 'savings', durationDays: String(goal.durationDays || 90), frequencyDays: String(goal.frequencyDays || 7), penaltyAmount: String(Math.max(MIN_PENALTY, goal.penaltyAmount || MIN_PENALTY)) }
    : { name: '', targetAmount: '', categoryId: 'savings', durationDays: '90', frequencyDays: '7', penaltyAmount: String(MIN_PENALTY) };

  const [name, setName] = useState(initial.name);
  const [targetAmount, setTargetAmount] = useState(initial.targetAmount);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [durationPreset, setDurationPreset] = useState(String(initial.durationDays));
  const [durationCustom, setDurationCustom] = useState('');
  const [frequencyPreset, setFrequencyPreset] = useState(String(initial.frequencyDays));
  const [frequencyCustom, setFrequencyCustom] = useState('');
  const [penaltyAmount, setPenaltyAmount] = useState(initial.penaltyAmount);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const durationDays = resolveDurationDays(durationPreset, durationCustom);
  const frequencyDays = resolveFrequencyDays(frequencyPreset, frequencyCustom);
  const totalPayments = Math.max(1, Math.ceil(durationDays / frequencyDays));
  const amountPerPayment = targetAmount ? Math.round(Number(targetAmount) / totalPayments) : 0;

  const onSubmit = async (e) => {
    e.preventDefault(); setError('');
    const target = Math.round(Number(targetAmount));
    if (!name.trim() || !target || durationDays < frequencyDays) return setError('Vérifie les informations.');
    setSaving(true);
    try {
      const payload = { name: name.trim(), targetAmount: target, categoryId, durationDays, frequencyDays, penaltyAmount: Math.max(MIN_PENALTY, Number(penaltyAmount)) };
      if (editing) {
        await updateGoal(user.uid, goal.id, { ...payload, deadline: new Date(new Date(goal.startDate).getTime() + durationDays * 86400000).toISOString().slice(0, 10) });
      } else {
        await createGoal(user.uid, payload);
      }
      onClose();
    } catch { setError('Erreur.'); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Modifier l'objectif" : "Nouvel objectif"} className="max-w-lg">
      <form onSubmit={onSubmit} className="space-y-4">
        <Input label="Nom de l'objectif" required value={name} onChange={(e) => setName(e.target.value)} />
        <div><p className="mb-2 text-sm font-medium text-slate-700">Catégorie</p><CategoryManager type="goal" value={categoryId} onChange={setCategoryId} /></div>
        <Input label="Montant cible (FCFA)" type="number" min="0" required value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} />
        
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Durée d&apos;épargne</p>
          <div className="flex flex-wrap gap-2">
            {DURATION_PRESETS.map(({ v, label }) => (
              <button type="button" key={v} onClick={() => setDurationPreset(v)} className={`rounded-full border px-3 py-1 text-xs font-medium ${durationPreset === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-700'}`}>{label}</button>
            ))}
            <button type="button" onClick={() => setDurationPreset('custom')} className={`rounded-full border px-3 py-1 text-xs font-medium ${durationPreset === 'custom' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-700'}`}>Perso.</button>
          </div>
          {durationPreset === 'custom' && <div className="mt-2"><Input label="Jours" type="number" min="1" value={durationCustom} onChange={(e) => setDurationCustom(e.target.value)} /></div>}
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

        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <span className="text-slate-500">Aperçu :</span> <strong className="text-slate-800">{totalPayments} paiements de {formatCurrency(amountPerPayment)}</strong>
        </div>

        <Input label={`Amende par retard (min. ${formatCurrency(MIN_PENALTY)})`} type="number" min={MIN_PENALTY} value={penaltyAmount} onChange={(e) => setPenaltyAmount(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={saving}>{saving ? 'Enregistrement…' : editing ? 'Mettre à jour' : "Créer l&apos;objectif"}</Button>
      </form>
    </Modal>
  );
}

function GoalCard({ goal, onOpen, onEdit }) {
  const { customCategories } = useCustomCategories('goal');
  const deposits = useDeposits(goal.id);
  const plan = computeGoalPlan(goal, deposits);
  const category = resolveCategory(goal.categoryId, 'goal', customCategories);
  const statusColor = plan.isReached ? '#10b981' : plan.isLate ? '#ef4444' : '#3b82f6';

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: category?.color || '#94a3b8' }} />
            <p className="truncate text-base font-semibold text-slate-900">{goal.name}</p>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{formatCurrency(goal.targetAmount)} — {formatCurrency(plan.amountPerPayment)} / {plan.frequencyDays} j</p>
        </div>
        <button onClick={onEdit} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><Pencil size={15} /></button>
      </div>
      
      {plan.totalDebt > 0 && (
        <div className="mb-2 inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">
          Dette : {formatCurrency(plan.totalDebt)}
        </div>
      )}

      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, plan.progress)}%`, backgroundColor: statusColor }} />
      </div>

      <Button variant="outline" size="sm" className="w-full" onClick={onOpen}><TrendingUp size={14} /> Ouvrir le suivi</Button>
    </Card>
  );
}

export default function GoalsPage() {
  const { user } = useAuth();
  const { goals } = useGoals();
  const [open, setOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [selected, setSelected] = useState(null);

  const openCreate = () => { setEditingGoal(null); setOpen(true); };
  const openEdit = (goal) => { setEditingGoal(goal); setOpen(true); };
  const closeForm = () => { setOpen(false); setEditingGoal(null); };

  const onDelete = async (id) => {
    if (!confirm("Supprimer cet objectif ? L'argent sera perdu (préférez Annuler dans le suivi).")) return;
    await deleteGoal(user.uid, id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Objectifs d&apos;épargne</h1>
          <p className="text-sm text-slate-500">Épargne intelligemment, avec un filet de sécurité.</p>
        </div>
        <Button onClick={openCreate}><Plus size={16} /> Nouvel objectif</Button>
      </div>

      {goals.length === 0 ? (
        <EmptyState icon={Target} title="Aucun objectif" description="Crée un objectif pour commencer." action={<Button onClick={openCreate}><Plus size={16} /> Créer</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((g) => <GoalCard key={g.id} goal={g} onOpen={() => setSelected(g)} onEdit={() => openEdit(g)} />)}
        </div>
      )}

      {open && <GoalFormModal key={editingGoal?.id || 'new'} open={open} onClose={closeForm} goal={editingGoal} />}
      {selected && <GoalDetail goal={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}