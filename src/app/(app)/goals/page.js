'use client';

import { useState } from 'react';
import { Plus, Target, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import { useGoals, useDeposits } from '@/hooks/useGoals';
import {
  createGoal, deleteGoal, addDeposit, deleteDeposit,
} from '@/lib/firestore/goals';
import { computeGoalPlan } from '@/lib/goalCalc';
import { formatCurrency, formatDate } from '@/lib/utils';
import { GOAL_CATEGORIES } from '@/lib/constants';

const todayIso = () => new Date().toISOString().slice(0, 10);

function GoalDetail({ goal, onClose }) {
  const { user } = useAuth();
  const deposits = useDeposits(goal.id);
  const plan = computeGoalPlan(goal, deposits);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  const onAdd = async (e) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) return;
    setSaving(true);
    try {
      await addDeposit(user.uid, goal.id, { amount: value, date });
      setAmount('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={goal.name} className="max-w-lg">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-[10px] font-semibold uppercase text-slate-500">Jour</p>
            <p className="text-sm font-bold text-slate-800">{formatCurrency(plan.perDay)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-[10px] font-semibold uppercase text-slate-500">Semaine</p>
            <p className="text-sm font-bold text-slate-800">{formatCurrency(plan.perWeek)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-[10px] font-semibold uppercase text-slate-500">Mois</p>
            <p className="text-sm font-bold text-slate-800">{formatCurrency(plan.perMonth)}</p>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">Progression</span>
            <span className="font-semibold text-slate-800">
              {formatCurrency(plan.totalDeposited)} / {formatCurrency(plan.totalDue)}
            </span>
          </div>
          <ProgressBar value={plan.progress} />
          <div className="mt-1 flex justify-between text-xs text-slate-500">
            <span>{plan.daysLeft} jours restants</span>
            <span>{plan.progress.toFixed(0)}%</span>
          </div>
        </div>

        {plan.isLate && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-semibold text-red-700">
                Amende : {formatCurrency(plan.penalty)}
              </p>
              <p className="text-xs text-red-600">
                Tu as manqué {formatCurrency(Math.round(plan.expectedSoFar - plan.totalDeposited))} de dépôts. Total dû : {formatCurrency(plan.totalDue)}.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={onAdd} className="space-y-2 rounded-xl border border-slate-200 p-3">
          <p className="text-sm font-semibold text-slate-800">Nouveau dépôt</p>
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
          <Button type="submit" size="sm" className="w-full" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Ajouter le dépôt'}
          </Button>
        </form>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-800">Historique</p>
          {deposits.length === 0 ? (
            <p className="text-xs text-slate-500">Aucun dépôt enregistré.</p>
          ) : (
            <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto">
              {deposits.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2">
                  <span className="text-xs text-slate-500">{formatDate(d.date)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-brand-600">
                      + {formatCurrency(d.amount)}
                    </span>
                    <button
                      onClick={() => deleteDeposit(user.uid, goal.id, d.id)}
                      className="rounded p-1 text-slate-400 hover:text-red-600"
                      aria-label="Supprimer"
                    >
                      <Trash2 size={13} />
                    </button>
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

export default function GoalsPage() {
  const { user } = useAuth();
  const { goals } = useGoals();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({
    name: '',
    targetAmount: '',
    deadline: '',
    penaltyAmount: '500',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const onCreate = async (e) => {
    e.preventDefault();
    setError('');
    const target = Number(form.targetAmount);
    if (!form.name.trim()) return setError('Nom requis.');
    if (!target || target <= 0) return setError('Montant cible invalide.');
    if (!form.deadline) return setError('Date limite requise.');
    setSaving(true);
    try {
      await createGoal(user.uid, {
        name: form.name.trim(),
        targetAmount: target,
        deadline: form.deadline,
        penaltyAmount: Number(form.penaltyAmount) || 0,
      });
      setForm({ name: '', targetAmount: '', deadline: '', penaltyAmount: '500' });
      setOpen(false);
    } catch {
      setError('Erreur lors de la création.');
    } finally {
      setSaving(false);
    }
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
            Discipline-toi. Rate un dépôt, paie une amende.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} /> Nouvel objectif
        </Button>
      </div>

      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Aucun objectif"
          description="Crée un objectif (ex : acheter un ordinateur) et définis tes cotisations."
          action={<Button onClick={() => setOpen(true)}><Plus size={16} /> Créer</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((g) => {
            const daysLeft = Math.max(
              0,
              Math.ceil((new Date(g.deadline) - new Date()) / 86400000)
            );
            return (
              <Card key={g.id}>
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{g.name}</p>
                    <p className="text-xs text-slate-500">
                      Objectif : {formatCurrency(g.targetAmount)} — {daysLeft} j restants
                    </p>
                  </div>
                  <button
                    onClick={() => onDelete(g.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Supprimer"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="mb-3 flex items-baseline justify-between text-sm">
                  <span className="text-slate-500">Échéance</span>
                  <span className="font-medium text-slate-800">{formatDate(g.deadline)}</span>
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => setSelected(g)}>
                  <CheckCircle2 size={14} /> Ouvrir le suivi
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nouvel objectif">
        <form onSubmit={onCreate} className="space-y-3">
          <Input
            label="Nom de l'objectif"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ex : Acheter un ordinateur"
          />
          <Input
            label="Montant cible (FCFA)"
            type="number"
            min="0"
            required
            value={form.targetAmount}
            onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
          />
          <Input
            label="Date limite"
            type="date"
            required
            value={form.deadline}
            onChange={(e) => setForm({ ...form, deadline: e.target.value })}
          />
          <Input
            label="Amende par dépôt manqué (FCFA)"
            type="number"
            min="0"
            value={form.penaltyAmount}
            onChange={(e) => setForm({ ...form, penaltyAmount: e.target.value })}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Création…' : 'Créer l\u2019objectif'}
          </Button>
        </form>
      </Modal>

      {selected && <GoalDetail goal={selected} onClose={() => setSelected(null)} />}
    </div>
  );
                }
