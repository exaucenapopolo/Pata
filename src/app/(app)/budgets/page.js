/* eslint-disable react/no-unescaped-entities */
'use client';

import { useMemo, useState } from 'react';
import { PiggyBank, Pencil, Landmark } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import { useBudgets } from '@/hooks/useBudgets';
import { useExpenses } from '@/hooks/useExpenses';
import { useIncomes } from '@/hooks/useIncomes';
import { upsertBudget, deleteBudget } from '@/lib/firestore/budgets';
import { EXPENSE_CATEGORIES } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';

const todayMonth = () => new Date().toISOString().slice(0, 7);

export default function BudgetsPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(todayMonth());
  const [selectedIncome, setSelectedIncome] = useState('all');
  
  const { incomes } = useIncomes();
  const { budgets } = useBudgets(month, selectedIncome);
  const { expenses } = useExpenses();

  const [editing, setEditing] = useState(null);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const monthIncomes = useMemo(() => incomes.filter(i => i.month === month), [incomes, month]);

  const monthExpenses = useMemo(() => {
    let filtered = expenses.filter((e) => e.date?.startsWith(month));
    if (selectedIncome === 'all') {
      filtered = filtered.filter(e => !e.incomeSourceId || e.incomeSourceId === 'all');
    } else {
      filtered = filtered.filter(e => e.incomeSourceId === selectedIncome);
    }
    return filtered;
  }, [expenses, month, selectedIncome]);

  const spentByCategory = useMemo(() => {
    const map = {};
    monthExpenses.forEach((e) => {
      map[e.categoryId] = (map[e.categoryId] || 0) + (e.amount || 0);
    });
    return map;
  }, [monthExpenses]);

  const enriched = useMemo(() => {
    return EXPENSE_CATEGORIES.map((c) => {
      const budget = budgets.find((b) => b.categoryId === c.id);
      const spent = spentByCategory[c.id] || 0;
      const allocated = budget?.amount || 0;
      const usage = allocated > 0 ? (spent / allocated) * 100 : spent > 0 ? 100 : 0;
      return { ...c, budgetId: budget?.id, allocated, spent, usage, remaining: allocated - spent };
    });
  }, [budgets, spentByCategory]);

  const totalAllocated = enriched.reduce((s, c) => s + c.allocated, 0);
  const totalSpent = enriched.reduce((s, c) => s + c.spent, 0);

  const openEdit = (category) => {
    setEditing(category);
    setAmount(String(category.allocated || ''));
  };

  const onSave = async (e) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value < 0) return;
    setSaving(true);
    try {
      if (value === 0 && editing.budgetId) {
        await deleteBudget(user.uid, editing.budgetId);
      } else if (value > 0) {
        await upsertBudget(user.uid, {
          categoryId: editing.id,
          amount: value,
          month,
          incomeSourceId: selectedIncome,
        });
      }
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Budgets</h1>
          <p className="text-sm text-slate-500">
            {formatCurrency(totalSpent)} dépensés sur {formatCurrency(totalAllocated)} alloués
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          />
          <select
            value={selectedIncome}
            onChange={(e) => setSelectedIncome(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm max-w-[200px]"
          >
            <option value="all">Tous les revenus (Global)</option>
            {monthIncomes.map(inc => (
              <option key={inc.id} value={inc.id}>{inc.source}</option>
            ))}
          </select>
        </div>
      </div>

      {totalAllocated === 0 && (
        <EmptyState
          icon={PiggyBank}
          title="Aucun budget défini"
          description="Va dans Revenus et applique la répartition suggérée, ou définis un budget manuellement ici."
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {enriched.map((c) => (
          <Card key={c.id}>
            <div className="mb-2 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                <p className="text-sm font-semibold text-slate-800">{c.label}</p>
              </div>
              <button
                onClick={() => openEdit(c)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Modifier"
              >
                <Pencil size={14} />
              </button>
            </div>
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-lg font-bold text-slate-900">
                {formatCurrency(c.spent)}
                <span className="ml-1 text-xs font-normal text-slate-500">
                  / {formatCurrency(c.allocated)}
                </span>
              </p>
              <p
                className={
                  c.remaining < 0
                    ? 'text-xs font-semibold text-red-600'
                    : 'text-xs font-semibold text-brand-600'
                }
              >
                {c.remaining < 0
                  ? `${formatCurrency(Math.abs(c.remaining))} dépassé`
                  : `${formatCurrency(c.remaining)} restant`}
              </p>
            </div>
            <ProgressBar
              value={Math.min(100, c.usage)}
              color={c.usage > 100 ? '#ef4444' : c.usage > 80 ? '#f59e0b' : c.color}
            />
          </Card>
        ))}
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Budget — ${editing.label}` : ''}
      >
        {editing && (
          <form onSubmit={onSave} className="space-y-3">
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 flex items-center gap-2">
              <Landmark size={16} />
              <span>
                {selectedIncome === 'all' 
                  ? 'Budget Global (Tous les revenus)' 
                  : `Revenu : ${monthIncomes.find(i => i.id === selectedIncome)?.source}`}
              </span>
            </div>
            <Input
              label="Montant alloué (FCFA)"
              type="number"
              min="0"
              step="1"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              Mets 0 pour supprimer le budget de cette catégorie.
            </p>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </form>
        )}
      </Modal>
    </div>
  );
                                  }
