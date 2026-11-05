/* eslint-disable react/no-unescaped-entities */
'use client';

import { useMemo, useState } from 'react';
import { PiggyBank, Pencil, Landmark, ChevronRight, MessageCircle, CalendarDays } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useBudgets } from '@/hooks/useBudgets';
import { useExpenses } from '@/hooks/useExpenses';
import { useIncomes } from '@/hooks/useIncomes';
import { upsertBudget, deleteBudget } from '@/lib/firestore/budgets';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { formatCurrency, getLocalMonth } from '@/lib/utils';

const todayMonth = () => getLocalMonth();

export default function BudgetsPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [month, setMonth] = useState(todayMonth());
  const [selectedIncome, setSelectedIncome] = useState('all');
  
  const { incomes } = useIncomes();
  const { budgets } = useBudgets(month, selectedIncome);
  const { expenses } = useExpenses();
  const { categories: expenseCategories } = useCustomCategories('expense');

  const [editing, setEditing] = useState(null);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [details, setDetails] = useState(null);
  const [saveError, setSaveError] = useState('');

  const monthIncomes = useMemo(() => incomes.filter(i => i.month === month), [incomes, month]);

  const monthExpenses = useMemo(() => {
    let filtered = expenses.filter((e) => e.date?.startsWith(month));
    // En vue globale, inclure toutes les parts des dépenses réparties entre plusieurs revenus.
    if (selectedIncome !== 'all') {
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
    return expenseCategories.map((c) => {
      const budget = budgets.find((b) => b.categoryId === c.id);
      const spent = spentByCategory[c.id] || 0;
      const allocated = budget?.amount || 0;
      const usage = allocated > 0 ? (spent / allocated) * 100 : spent > 0 ? 100 : 0;
      return { ...c, budgetId: budget?.id, allocated, spent, usage, remaining: allocated - spent, expenses: monthExpenses.filter((expense) => expense.categoryId === c.id) };
    });
  }, [budgets, spentByCategory, monthExpenses, expenseCategories]);

  const currentMonthKey = todayMonth();
  const budgetExpiry = profile?.premiumUntil?.toDate ? profile.premiumUntil.toDate() : new Date(profile?.premiumUntil || 0);
  const budgetPremium = Number.isFinite(budgetExpiry.getTime()) && budgetExpiry > new Date();
  const usedBudgetQuota = profile?.monthlyStats?.lastResetMonth === currentMonthKey ? Number(profile?.monthlyStats?.budgets) || 0 : 0;
  const budgetQuotaReached = !budgetPremium && usedBudgetQuota >= 2;

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
    setSaveError('');
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
    } catch (error) {
      setSaveError(error.message || 'Impossible d’enregistrer ce budget.');
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
          {!budgetPremium && <p className="mt-1 text-xs text-slate-500">Créations de budgets : {usedBudgetQuota} / 2 ce mois-ci.</p>}
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
            <button type="button" onClick={() => setDetails(c)} className="mb-2 flex w-full items-start justify-between text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                <p className="text-sm font-semibold text-slate-800">{c.label}</p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs text-slate-400">Détails <ChevronRight size={14} /></span>
            </button>
            <div className="mb-2 flex items-start justify-end">
              <button
                onClick={(event) => { event.stopPropagation(); setSaveError(''); openEdit(c); }}
                disabled={!c.budgetId && budgetQuotaReached}
                className={`rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 ${!c.budgetId && budgetQuotaReached ? 'cursor-not-allowed opacity-30' : ''}`}
                aria-label="Modifier ou définir le budget"
                title={!c.budgetId && budgetQuotaReached ? 'Limite gratuite atteinte' : 'Modifier le budget'}
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

      {budgetQuotaReached && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs text-amber-800">Tu as utilisé tes deux créations de budget gratuites ce mois-ci. Les enveloppes déjà créées restent modifiables.</p><Button size="sm" onClick={() => window.location.assign('/premium')}>Passer à Premium</Button></div>}

      <Modal open={!!details} onClose={() => setDetails(null)} title={details ? `Détail du budget — ${details.label}` : ''}>
        {details && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Alloué</p><p className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(details.allocated)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Dépensé</p><p className="mt-1 text-sm font-bold text-red-600">{formatCurrency(details.spent)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Restant</p><p className={`mt-1 text-sm font-bold ${details.remaining < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatCurrency(details.remaining)}</p></div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex justify-between text-xs text-slate-500"><span>Consommation</span><strong>{details.usage.toFixed(0)} %</strong></div>
              <ProgressBar value={Math.min(100, details.usage)} color={details.usage > 100 ? '#ef4444' : details.usage > 80 ? '#f59e0b' : details.color} />
              <p className="mt-2 text-xs leading-5 text-slate-500">{details.remaining < 0 ? `Tu as dépassé cette enveloppe de ${formatCurrency(Math.abs(details.remaining))}.` : `Il te reste ${formatCurrency(details.remaining)} pour cette catégorie.`}</p>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-800">Dépenses enregistrées</h3><span className="text-xs text-slate-500">{details.expenses.length} opération(s)</span></div>
              {details.expenses.length === 0 ? <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Aucune dépense dans cette catégorie pour ce mois.</p> : (
                <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100">
                  {details.expenses.slice().sort((a,b) => String(b.date || '').localeCompare(String(a.date || ''))).map((expense) => (
                    <li key={expense.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{expense.note || details.label}</p><p className="text-xs text-slate-500">{expense.date || 'Date inconnue'}{expense.incomeSourceName ? ` · ${expense.incomeSourceName}` : ''}</p></div>
                      <strong className="shrink-0 text-sm text-slate-900">{formatCurrency(expense.amount)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button type="button" className="w-full" onClick={() => { const prompt = `Aide-moi à améliorer mon budget ${details.label} pour ${month}. Montant prévu : ${details.allocated} FCFA. Dépenses enregistrées : ${details.spent} FCFA. Reste : ${details.remaining} FCFA. Analyse les opérations et propose des changements réalistes sans modifier mes données.`; window.dispatchEvent(new CustomEvent('pata:assistant-open', { detail: { prompt } })); setDetails(null); }}>
              <MessageCircle size={15} /> Demander conseil à Mč
            </Button>
          </div>
        )}
      </Modal>

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
            {saveError && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{saveError}</p>}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </form>
        )}
      </Modal>
    </div>
  );
                                  }
