'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, TrendingUp, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import { useIncomes } from '@/hooks/useIncomes';
import { createIncome, deleteIncome } from '@/lib/firestore/incomes';
import { upsertBudget } from '@/lib/firestore/budgets';
import { computeBudgetBreakdown } from '@/lib/budgetRules';
import { formatCurrency, formatDate } from '@/lib/utils';

const todayMonth = () => new Date().toISOString().slice(0, 7);
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function IncomePage() {
  const { user } = useAuth();
  const { incomes } = useIncomes();
  const [month, setMonth] = useState(todayMonth());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ amount: '', source: 'Salaire', note: '', date: todayIso() });
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState('');

  const monthIncomes = useMemo(
    () => incomes.filter((i) => i.month === month).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [incomes, month]
  );
  const total = monthIncomes.reduce((s, i) => s + (i.amount || 0), 0);
  const breakdown = useMemo(() => computeBudgetBreakdown(total), [total]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return setError('Montant invalide.');
    setSaving(true);
    try {
      await createIncome(user.uid, {
        amount,
        source: form.source,
        note: form.note,
        date: form.date,
        month: form.date.slice(0, 7),
      });
      setOpen(false);
      setForm({ amount: '', source: 'Salaire', note: '', date: todayIso() });
      setApplied(false);
    } catch {
      setError('Erreur lors de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  const applyBudget = async () => {
    if (!breakdown.length) return;
    setApplying(true);
    try {
      for (const item of breakdown) {
        await upsertBudget(user.uid, {
          categoryId: item.key,
          amount: item.amount,
          month,
        });
      }
      setApplied(true);
    } finally {
      setApplying(false);
    }
  };

  const onDelete = async (id) => {
    if (!confirm('Supprimer ce revenu ?')) return;
    await deleteIncome(user.uid, id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Revenus</h1>
          <p className="text-sm text-slate-500">
            Total du mois : <span className="font-semibold text-slate-800">{formatCurrency(total)}</span>
          </p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => { setMonth(e.target.value); setApplied(false); }}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
        />
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <CardTitle>Détail du mois</CardTitle>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus size={14} /> Ajouter
          </Button>
        </div>
        {monthIncomes.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="Aucun revenu enregistré"
            description="Ajoute ton salaire ou une source de revenu pour ce mois."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {monthIncomes.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-800">{i.source}</p>
                  <p className="text-xs text-slate-500">
                    {formatDate(i.date)}{i.note ? ` — ${i.note}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-brand-600">
                    + {formatCurrency(i.amount)}
                  </span>
                  <button
                    onClick={() => onDelete(i.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Supprimer"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {total > 0 && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <CardTitle>Répartition suggérée</CardTitle>
            {applied && (
              <span className="flex items-center gap-1 text-xs font-medium text-brand-600">
                <CheckCircle2 size={14} /> Appliqué
              </span>
            )}
          </div>
          <p className="mb-4 text-xs text-slate-500">
            Basé sur les règles de gestion : 20% logement, 20% épargne, 20% nourriture, etc.
          </p>
          <div className="space-y-2.5">
            {breakdown.map((b) => (
              <div key={b.key} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-14 text-xs font-semibold text-slate-400">{b.percent}%</span>
                  <span className="text-slate-700">{b.label}</span>
                </div>
                <span className="font-semibold text-slate-800">{formatCurrency(b.amount)}</span>
              </div>
            ))}
          </div>
          <Button
            onClick={applyBudget}
            className="mt-4 w-full"
            variant={applied ? 'secondary' : 'primary'}
            disabled={applying || applied}
          >
            {applied
              ? 'Budgets déjà appliqués ce mois'
              : applying
              ? 'Application…'
              : 'Appliquer comme budgets du mois'}
          </Button>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nouveau revenu">
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            label="Montant (FCFA)"
            type="number"
            min="0"
            step="1"
            required
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          <Input
            label="Source"
            required
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
          />
          <Input
            label="Date"
            type="date"
            required
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          />
          <Input
            label="Note (optionnel)"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Ajouter'}
          </Button>
        </form>
      </Modal>
    </div>
  );
  }
