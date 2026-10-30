/* eslint-disable react/no-unescaped-entities */
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, TrendingUp, CheckCircle2, Save, RotateCcw, Percent, Landmark
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import { useIncomes } from '@/hooks/useIncomes';
import { useBudgetRules } from '@/hooks/useBudgetRules';
import { createIncome, deleteIncome } from '@/lib/firestore/incomes';
import { upsertBudget } from '@/lib/firestore/budgets';
import { computeBudgetBreakdown } from '@/lib/budgetRules';
import { INCOME_CATEGORIES } from '@/lib/constants';
import { formatCurrency, formatDate } from '@/lib/utils';

const todayMonth = () => new Date().toISOString().slice(0, 7);
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function IncomePage() {
  const { user } = useAuth();
  const { incomes } = useIncomes();
  const {
    rules, setRules, updatePercent, saveRules, resetRules,
    total, isValid, loading: rulesLoading,
  } = useBudgetRules();

  const [month, setMonth] = useState(todayMonth());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ amount: '', source: 'Salaire', categoryId: 'salary', note: '', date: todayIso() });
  
  const [saving, setSaving] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [savingApplied, setSavingApplied] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState('');
  const [rulesSavedAt, setRulesSavedAt] = useState(null);
  
  const [selectedIncomeToApply, setSelectedIncomeToApply] = useState('all');

  const monthIncomes = useMemo(
    () => incomes.filter((i) => i.month === month).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [incomes, month]
  );
  const totalIncome = monthIncomes.reduce((s, i) => s + (i.amount || 0), 0);
  const breakdown = useMemo(
    () => computeBudgetBreakdown(totalIncome, rules),
    [totalIncome, rules]
  );

  useEffect(() => { setApplied(false); }, [month]);

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
        categoryId: form.categoryId,
        note: form.note,
        date: form.date,
        month: form.date.slice(0, 7),
      });
      setOpen(false);
      setForm({ amount: '', source: 'Salaire', categoryId: 'salary', note: '', date: todayIso() });
    } catch {
      setError('Erreur lors de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  const onSaveRules = async () => {
    if (!isValid) return;
    setSavingRules(true);
    try {
      await saveRules(rules);
      setRulesSavedAt(new Date());
    } finally {
      setSavingRules(false);
    }
  };

  const onResetRules = async () => {
    if (!confirm('Réinitialiser les pourcentages par défaut ?')) return;
    await resetRules();
    setRulesSavedAt(new Date());
  };

  const onApplyBudgets = async () => {
    if (!breakdown.length || !isValid) return;
    setSavingApplied(true);
    try {
      for (const item of breakdown) {
        await upsertBudget(user.uid, {
          categoryId: item.key,
          amount: item.amount,
          month,
          incomeSourceId: selectedIncomeToApply,
        });
      }
      setApplied(true);
    } finally {
      setSavingApplied(false);
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
            Total du mois : <span className="font-semibold text-slate-800">{formatCurrency(totalIncome)}</span>
          </p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
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
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">{i.source}</p>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      {INCOME_CATEGORIES.find(c => c.id === i.categoryId)?.label || 'Revenu'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {formatDate(i.date)}{i.note ? ` — ${i.note}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-brand-600">
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

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <CardTitle>Règles de répartition</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onResetRules}
              disabled={rulesLoading}
            >
              <RotateCcw size={12} /> Défauts
            </Button>
            <Button
              size="sm"
              onClick={onSaveRules}
              disabled={!isValid || savingRules}
            >
              <Save size={12} /> {savingRules ? '…' : 'Enregistrer'}
            </Button>
          </div>
        </div>

        <p className="mb-3 text-xs text-slate-500">
          Modifie librement les pourcentages selon ta vie réelle. Le total doit faire 100 %.
          {rulesSavedAt && <span className="ml-1 text-brand-600">Règles enregistrées.</span>}
        </p>

        <ul className="space-y-2">
          {rules.map((r) => (
            <li key={r.key} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                {r.label}
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={r.percent}
                  onChange={(e) => updatePercent(r.key, e.target.value)}
                  className="h-9 w-16 rounded-lg border border-slate-300 bg-white px-2 text-right text-sm"
                />
                <Percent size={12} className="text-slate-400" />
              </div>
              <span className="w-24 text-right text-xs font-medium text-slate-500">
                {totalIncome > 0
                  ? formatCurrency(Math.round((totalIncome * (Number(r.percent) || 0)) / 100))
                  : '—'}
              </span>
            </li>
          ))}
        </ul>

        <div
          className={`mt-4 flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium ${
            isValid ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-700'
          }`}
        >
          <span>Total</span>
          <span>{total.toFixed(0)} % {isValid ? '✓' : '— doit faire 100 %'}</span>
        </div>
      </Card>

      {totalIncome > 0 && breakdown.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <CardTitle>Appliquer aux budgets</CardTitle>
            {applied && (
              <span className="flex items-center gap-1 text-xs font-medium text-brand-600">
                <CheckCircle2 size={14} /> Appliqué
              </span>
            )}
          </div>
          
          <div className="mb-4 space-y-2">
            <label className="block text-sm font-medium text-slate-700">Sur quel revenu appliquer ces budgets ?</label>
            <select
              value={selectedIncomeToApply}
              onChange={(e) => { setSelectedIncomeToApply(e.target.value); setApplied(false); }}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="all">Tous les revenus (Global)</option>
              {monthIncomes.map(inc => (
                <option key={inc.id} value={inc.id}>{inc.source} ({formatCurrency(inc.amount)})</option>
              ))}
            </select>
          </div>

          <div className="space-y-2 mb-4">
            {breakdown.map((b) => (
              <div key={b.key} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-12 text-xs font-semibold text-slate-400">{b.percent}%</span>
                  <span className="text-slate-700">{b.label}</span>
                </div>
                <span className="font-semibold text-slate-800">{formatCurrency(b.amount)}</span>
              </div>
            ))}
          </div>
          <Button
            onClick={onApplyBudgets}
            className="w-full"
            variant={applied ? 'secondary' : 'primary'}
            disabled={savingApplied || applied || !isValid}
          >
            {applied
              ? 'Budgets déjà appliqués'
              : savingApplied
              ? 'Application…'
              : 'Appliquer ces budgets'}
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
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Type de revenu</label>
            <select
              value={form.categoryId}
              onChange={(e) => {
                const catId = e.target.value;
                const cat = INCOME_CATEGORIES.find(c => c.id === catId);
                setForm({ ...form, categoryId: catId, source: cat.label });
              }}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              {INCOME_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <Input
            label="Nom / Source personnalisée"
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
