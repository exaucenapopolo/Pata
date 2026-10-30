'use client';

import { useState } from 'react';
import {
  Plus, Target, Trash2, AlertTriangle, CheckCircle2,
  Banknote, Wallet, Pencil, Lightbulb, Info, TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { CategoryManager } from '@/components/ui/CategoryManager';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useGoals, useDeposits } from '@/hooks/useGoals';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import {
  createGoal, updateGoal, deleteGoal, addDeposit, deleteDeposit,
} from '@/lib/firestore/goals';
import {
  computeGoalPlan, resolveDurationDays, resolveFrequencyDays,
} from '@/lib/goalCalc';
import { formatCurrency, formatDate, resolveCategory } from '@/lib/utils';

/* ═══════════════ Constantes locales ═══════════════ */

const todayIso = () => new Date().toISOString().slice(0, 10);

const DURATION_PRESETS = [
  { v: '7',   label: '1 sem.' },
  { v: '14',  label: '2 sem.' },
  { v: '30',  label: '1 mois' },
  { v: '90',  label: '3 mois' },
  { v: '180', label: '6 mois' },
  { v: '365', label: '1 an' },
  { v: '730', label: '2 ans' },
];

const FREQUENCY_PRESETS = [
  { v: '1',  label: 'Chaque jour' },
  { v: '3',  label: 'Tous les 3 j' },
  { v: '7',  label: 'Chaque sem.' },
  { v: '14', label: 'Toutes les 2 sem.' },
  { v: '30', label: 'Chaque mois' },
];

/* ═══════════════ Utilitaires intelligents ═══════════════ */

function getGoalStatus(plan) {
  if (!plan) return { key: 'unknown', label: '—', color: '#94a3b8' };
  if (plan.progress >= 100) return { key: 'achieved', label: 'Atteint', color: '#10b981' };
  if (plan.isLate) return { key: 'late', label: 'En retard', color: '#ef4444' };
  if (plan.totalDeposited >= plan.expectedAmount) return { key: 'ahead', label: 'À jour', color: '#3b82f6' };
  if (plan.totalDeposited >= plan.expectedAmount * 0.6) return { key: 'onTrack', label: 'Bientôt à jour', color: '#f59e0b' };
  return { key: 'behind', label: 'En retard', color: '#ef4444' };
}

function buildAdvice(plan, balance) {
  if (!plan) return [];

  const advices = [];

  if (plan.progress >= 100) {
    advices.push({
      type: 'success',
      title: 'Objectif atteint',
      message: `Félicitations ! Tu as réuni ${formatCurrency(plan.totalDeposited)}. Tu peux maintenant retirer ou clôturer cet objectif.`,
    });
    return advices;
  }

  if (plan.isLate) {
    advices.push({
      type: 'danger',
      title: 'Amende en cours',
      message: `Tu as ${plan.missedPayments} paiement${plan.missedPayments > 1 ? 's' : ''} manqué${plan.missedPayments > 1 ? 's' : ''} (${formatCurrency(plan.penalty)} d'amende). Verse ${formatCurrency(plan.shortfall)} rapidement pour éviter que l'amende n'augmente.`,
    });
  } else if (plan.totalDeposited >= plan.expectedAmount) {
    advices.push({
      type: 'success',
      title: 'Tu es à jour',
      message: `Bravo, tu as versé ${formatCurrency(plan.totalDeposited)} sur les ${formatCurrency(plan.expectedAmount)} attendus. Continue à ce rythme.`,
    });
  } else {
    const gap = plan.expectedAmount - plan.totalDeposited;
    advices.push({
      type: 'info',
      title: 'Il te reste un peu à verser',
      message: `Verse ${formatCurrency(gap)} pour être à jour sur ton plan actuel.`,
    });
  }

  if (plan.daysLeft === 0 && plan.progress < 100) {
    advices.push({
      type: 'warning',
      title: 'Échéance dépassée',
      message: `La date limite est passée. Il te manque ${formatCurrency(plan.remaining)} pour terminer.`,
    });
  } else if (plan.daysLeft > 0 && plan.daysLeft <= 3 && plan.progress < 100) {
    advices.push({
      type: 'warning',
      title: 'Bientôt la fin',
      message: `Il te reste ${plan.daysLeft} jour${plan.daysLeft > 1 ? 's' : ''} pour boucler l'objectif. Il manque ${formatCurrency(plan.remaining)}.`,
    });
  }

  if (balance >= plan.amountPerPayment && plan.progress < 100) {
    advices.push({
      type: 'tip',
      title: 'Financement rapide possible',
      message: `Ton solde (${formatCurrency(balance)}) couvre le prochain paiement de ${formatCurrency(plan.amountPerPayment)}. Verse directement depuis le solde.`,
    });
  } else if (balance === 0 && plan.progress < 100) {
    advices.push({
      type: 'tip',
      title: 'Recharge ton solde',
      message: 'Ton solde est vide. Recharge depuis le Portefeuille pour financer tes objectifs en un clic.',
    });
  }

  return advices;
}

function adviceStyle(type) {
  switch (type) {
    case 'success':
      return { bg: 'bg-brand-50', border: 'border-brand-200', icon: CheckCircle2, iconColor: 'text-brand-600', titleColor: 'text-brand-700' };
    case 'danger':
      return { bg: 'bg-red-50', border: 'border-red-200', icon: AlertTriangle, iconColor: 'text-red-600', titleColor: 'text-red-700' };
    case 'warning':
      return { bg: 'bg-amber-50', border: 'border-amber-200', icon: AlertTriangle, iconColor: 'text-amber-600', titleColor: 'text-amber-700' };
    case 'tip':
      return { bg: 'bg-blue-50', border: 'border-blue-200', icon: Lightbulb, iconColor: 'text-blue-600', titleColor: 'text-blue-700' };
    default:
      return { bg: 'bg-slate-50', border: 'border-slate-200', icon: Info, iconColor: 'text-slate-600', titleColor: 'text-slate-700' };
  }
}

/* ═══════════════ Détail objectif ═══════════════ */

function GoalDetail({ goal, onClose }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { customCategories } = useCustomCategories('goal');
  const deposits = useDeposits(goal.id);
  const plan = computeGoalPlan(goal, deposits);
  const category = resolveCategory(goal.categoryId, 'goal', customCategories);
  const status = getGoalStatus(plan);
  const adviceList = buildAdvice(plan, profile?.balance || 0);

  const [mode, setMode] = useState('wallet');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const balance = profile?.balance || 0;

  const onFundFromWallet = async (e) => {
    e.preventDefault();
    setError('');
    const value = Math.round(Number(amount));
    if (!value || value <= 0) return setError('Montant invalide.');
    if (value > balance) return setError('Solde insuffisant.');
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/wallet/fund-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ goalId: goal.id, amount: value }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Erreur.');
      setAmount('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const onExternalDeposit = async (e) => {
    e.preventDefault();
    setError('');
    const value = Math.round(Number(amount));
    if (!value || value <= 0) return setError('Montant invalide.');
    setSaving(true);
    try {
      await addDeposit(user.uid, goal.id, { amount: value, date });
      setAmount('');
    } catch {
      setError('Erreur.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={goal.name} className="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: category.color }} />
            <span className="text-xs font-medium text-slate-600">{category.label}</span>
          </div>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
            style={{ backgroundColor: status.color }}
          >
            {status.label}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-[10px] font-semibold uppercase text-slate-500">Par paiement</p>
            <p className="text-sm font-bold text-slate-800">{formatCurrency(plan.amountPerPayment)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-[10px] font-semibold uppercase text-slate-500">Fréquence</p>
            <p className="text-sm font-bold text-slate-800">/ {plan.frequencyDays} j</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-[10px] font-semibold uppercase text-slate-500">Paiements</p>
            <p className="text-sm font-bold text-slate-800">
              {Math.min(deposits.length, plan.totalPayments)}/{plan.totalPayments}
            </p>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">Progression</span>
            <span className="font-semibold text-slate-800">
              {formatCurrency(plan.totalDeposited)} / {formatCurrency(plan.totalDue)}
            </span>
          </div>
          <ProgressBar value={plan.progress} color={plan.isLate ? '#ef4444' : undefined} />
          <div className="mt-1 flex justify-between text-xs text-slate-500">
            <span>{plan.daysLeft} jours restants</span>
            <span>{plan.progress.toFixed(0)}%</span>
          </div>
        </div>

        {adviceList.length > 0 && (
          <div className="space-y-2">
            {adviceList.map((advice, i) => {
              const s = adviceStyle(advice.type);
              const Icon = s.icon;
              return (
                <div key={i} className={`flex items-start gap-2 rounded-xl border ${s.border} ${s.bg} p-3`}>
                  <Icon size={16} className={`mt-0.5 shrink-0 ${s.iconColor}`} />
                  <div>
                    <p className={`text-sm font-semibold ${s.titleColor}`}>{advice.title}</p>
                    <p className="text-xs text-slate-600">{advice.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => { setMode('wallet'); setError(''); }}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                mode === 'wallet' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Depuis le solde
            </button>
            <button
              onClick={() => { setMode('external'); setError(''); }}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                mode === 'external' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Dépôt externe
            </button>
          </div>

          {mode === 'wallet' ? (
            <form onSubmit={onFundFromWallet} className="space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2">
                <span className="text-xs text-slate-600">Solde disponible</span>
                <span className="text-sm font-semibold text-brand-700">{formatCurrency(balance)}</span>
              </div>
              <Input
                label="Montant à verser"
                type="number"
                min="0"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" size="sm" className="w-full" disabled={saving || balance === 0}>
                <Banknote size={14} /> {saving ? 'Transaction…' : 'Financer depuis le solde'}
              </Button>
            </form>
          ) : (
            <form onSubmit={onExternalDeposit} className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Montant"
                  type="number"
                  min="0"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <Input
                  label="Date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" size="sm" className="w-full" disabled={saving}>
                <Wallet size={14} /> {saving ? 'Enregistrement…' : 'Ajouter le dépôt'}
              </Button>
            </form>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-800">Historique</p>
          {deposits.length === 0 ? (
            <p className="text-xs text-slate-500">Aucun dépôt enregistré.</p>
          ) : (
            <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto">
              {deposits.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-xs text-slate-500">{formatDate(d.date)}</span>
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">
                      {d.source === 'wallet' ? 'Solde' : 'Externe'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-brand-600">
                      + {formatCurrency(d.amount)}
                    </span>
                    {d.source !== 'wallet' && (
                      <button
                        onClick={() => deleteDeposit(user.uid, goal.id, d.id)}
                        className="rounded p-1 text-slate-400 hover:text-red-600"
                        aria-label="Supprimer"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ═══════════════ Formulaire création / édition ═══════════════ */

function GoalFormModal({ open, onClose, goal }) {
  const { user } = useAuth();
  const editing = !!goal;

  const initial = editing
    ? {
        name: goal.name || '',
        targetAmount: String(goal.targetAmount || ''),
        categoryId: goal.categoryId || 'savings',
        durationDays: String(goal.durationDays || 90),
        frequencyDays: String(goal.frequencyDays || 7),
        penaltyAmount: String(goal.penaltyAmount || 500),
      }
    : {
        name: '',
        targetAmount: '',
        categoryId: 'savings',
        durationDays: '90',
        frequencyDays: '7',
        penaltyAmount: '500',
      };

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
  const amountPerPayment = targetAmount
    ? Math.round(Number(targetAmount) / totalPayments)
    : 0;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const target = Math.round(Number(targetAmount));
    if (!name.trim()) return setError('Nom requis.');
    if (!target || target <= 0) return setError('Montant cible invalide.');
    if (durationDays < frequencyDays) {
      return setError('La durée doit être au moins égale à la fréquence.');
    }
    setSaving(true);
    try {
      if (editing) {
        const startDate = goal.startDate || todayIso();
        const deadline = new Date(
          new Date(startDate).getTime() + durationDays * 86400000
        ).toISOString().slice(0, 10);
        await updateGoal(user.uid, goal.id, {
          name: name.trim(),
          targetAmount: target,
          categoryId,
          durationDays,
          frequencyDays,
          penaltyAmount: Number(penaltyAmount) || 0,
          deadline,
        });
      } else {
        await createGoal(user.uid, {
          name: name.trim(),
          targetAmount: target,
          categoryId,
          durationDays,
          frequencyDays,
          penaltyAmount: Number(penaltyAmount) || 0,
        });
      }
      onClose();
    } catch {
      setError('Erreur lors de l\u2019enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Modifier l'objectif" : "Nouvel objectif d'épargne"}
      className="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Nom de l'objectif"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Acheter un ordinateur"
        />

        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Catégorie</p>
          <CategoryManager
            type="goal"
            value={categoryId}
            onChange={(id) => setCategoryId(id)}
          />
        </div>

        <Input
          label="Montant cible (FCFA)"
          type="number"
          min="0"
          required
          value={targetAmount}
          onChange={(e) => setTargetAmount(e.target.value)}
        />

        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Durée d&apos;épargne</p>
          <div className="flex flex-wrap gap-2">
            {DURATION_PRESETS.map(({ v, label }) => (
              <button
                type="button"
                key={v}
                onClick={() => setDurationPreset(v)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  durationPreset === v
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-300 text-slate-700 hover:border-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDurationPreset('custom')}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                durationPreset === 'custom'
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-slate-300 text-slate-700 hover:border-slate-400'
              }`}
            >
              Personnalisée
            </button>
          </div>
          {durationPreset === 'custom' && (
            <div className="mt-2">
              <Input
                label="Nombre de jours"
                type="number"
                min="1"
                value={durationCustom}
                onChange={(e) => setDurationCustom(e.target.value)}
                placeholder="Ex : 45"
              />
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Fréquence de paiement</p>
          <div className="flex flex-wrap gap-2">
            {FREQUENCY_PRESETS.map(({ v, label }) => (
              <button
                type="button"
                key={v}
                onClick={() => setFrequencyPreset(v)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  frequencyPreset === v
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-300 text-slate-700 hover:border-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFrequencyPreset('custom')}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                frequencyPreset === 'custom'
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-slate-300 text-slate-700 hover:border-slate-400'
              }`}
            >
              Personnalisée
            </button>
          </div>
          {frequencyPreset === 'custom' && (
            <div className="mt-2">
              <Input
                label="Tous les combien de jours ?"
                type="number"
                min="1"
                value={frequencyCustom}
                onChange={(e) => setFrequencyCustom(e.target.value)}
                placeholder="Ex : 10"
              />
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Aperçu du plan</p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {totalPayments} paiement{totalPayments > 1 ? 's' : ''}
            {amountPerPayment > 0 && (
              <> de <span className="text-brand-600">{formatCurrency(amountPerPayment)}</span></>
            )}{' '}
            tous les <span className="text-brand-600">{frequencyDays} jour{frequencyDays > 1 ? 's' : ''}</span>.
          </p>
          <p className="mt-1 text-xs text-slate-500">Durée totale : {durationDays} jours.</p>
        </div>

        <Input
          label="Amende par paiement manqué (FCFA)"
          type="number"
          min="0"
          value={penaltyAmount}
          onChange={(e) => setPenaltyAmount(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? 'Enregistrement…' : editing ? 'Mettre à jour' : "Créer l'objectif"}
        </Button>
      </form>
    </Modal>
  );
}

/* ═══════════════ Carte objectif ═══════════════ */

function GoalCard({ goal, onOpen, onDelete, onEdit }) {
  const { customCategories } = useCustomCategories('goal');
  const deposits = useDeposits(goal.id);
  const plan = computeGoalPlan(goal, deposits);
  const category = resolveCategory(goal.categoryId, 'goal', customCategories);
  const status = getGoalStatus(plan);

  return (
    <Card>
      <div className="mb-2 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: category?.color || '#94a3b8' }}
            />
            <p className="truncate text-base font-semibold text-slate-900">{goal.name}</p>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatCurrency(goal.targetAmount)} — {formatCurrency(plan.amountPerPayment)} / {plan.frequencyDays} j
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Modifier"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
            aria-label="Supprimer"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="mb-2">
        <span
          className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
          style={{ backgroundColor: status.color }}
        >
          {status.label}
        </span>
      </div>

      <div className="mb-3">
        <ProgressBar value={plan.progress} color={plan.isLate ? '#ef4444' : undefined} />
        <div className="mt-1 flex justify-between text-xs text-slate-500">
          <span>{formatCurrency(plan.totalDeposited)} / {formatCurrency(plan.totalDue)}</span>
          <span>{plan.progress.toFixed(0)}%</span>
        </div>
      </div>

      {plan.isLate && (
        <div className="mb-3 flex items-center gap-1 text-xs font-medium text-red-600">
          <AlertTriangle size={12} /> Amende : {formatCurrency(plan.penalty)}
        </div>
      )}

      <Button variant="outline" size="sm" className="w-full" onClick={onOpen}>
        <TrendingUp size={14} /> Ouvrir le suivi
      </Button>
    </Card>
  );
}

/* ═══════════════ Page principale ═══════════════ */

export default function GoalsPage() {
  const { user } = useAuth();
  const { goals } = useGoals();
  const [open, setOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [selected, setSelected] = useState(null);

  const openCreate = () => {
    setEditingGoal(null);
    setOpen(true);
  };

  const openEdit = (goal) => {
    setEditingGoal(goal);
    setOpen(true);
  };

  const closeForm = () => {
    setOpen(false);
    setEditingGoal(null);
  };

  const onDelete = async (id) => {
    if (!confirm('Supprimer cet objectif et tous ses dépôts ?')) return;
    await deleteGoal(user.uid, id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Objectifs d&apos;épargne</h1>
          <p className="text-sm text-slate-500">
            Choisis la durée, la fréquence et la pénalité. On calcule le reste.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} /> Nouvel objectif
        </Button>
      </div>

      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Aucun objectif"
          description="Crée un objectif d'épargne pour visualiser tes paiements et tenir la discipline."
          action={<Button onClick={openCreate}><Plus size={16} /> Créer</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              onOpen={() => setSelected(g)}
              onEdit={() => openEdit(g)}
              onDelete={() => onDelete(g.id)}
            />
          ))}
        </div>
      )}

      {open && (
        <GoalFormModal
          key={editingGoal?.id || 'new'}
          open={open}
          onClose={closeForm}
          goal={editingGoal}
        />
      )}
      {selected && <GoalDetail goal={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}