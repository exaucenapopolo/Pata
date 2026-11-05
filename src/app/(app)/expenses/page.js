/* eslint-disable react/no-unescaped-entities */
'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, Wallet, Pencil, Landmark, Calendar, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { CategoryManager } from '@/components/ui/CategoryManager';
import { CategoryImage } from '@/components/ui/CategoryImage';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/hooks/useAuth';
import { useExpenses } from '@/hooks/useExpenses';
import { useIncomes } from '@/hooks/useIncomes';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { createExpense, updateExpense, deleteExpense } from '@/lib/firestore/expenses';
import { createAutomation } from '@/lib/firestore/automations';
import { formatCurrency, formatDate, resolveCategory, getFirstOfMonth, getLastOfMonth, getLocalMonth } from '@/lib/utils';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const emptyForm = () => ({
  id: null,
  amount: '',
  categoryId: 'food',
  date: todayIso(),
  note: '',
  incomeSourceId: 'all',
  incomeSourceName: 'Tous les revenus',
});

export default function ExpensesPage() {
  const { user } = useAuth();
  const { expenses, loading } = useExpenses();
  const { incomes } = useIncomes();
  const { customCategories } = useCustomCategories('expense');
  
  const [showCustomPeriod, setShowCustomPeriod] = useState(false);
  const [customStart, setCustomStart] = useState(getFirstOfMonth());
  const [customEnd, setCustomEnd] = useState(todayIso());
  
  const [filterCategory, setFilterCategory] = useState('all');
  const [form, setForm] = useState(emptyForm());
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [recurringExpense, setRecurringExpense] = useState(null);
  const [recurringFrequency, setRecurringFrequency] = useState('daily');
  const [recurringSaving, setRecurringSaving] = useState(false);
  const [recurringError, setRecurringError] = useState('');

  const startDate = showCustomPeriod ? customStart : getFirstOfMonth();
  const endDate = showCustomPeriod ? customEnd : getLastOfMonth();

  const incomesWithBalance = useMemo(() => {
    return incomes.map((inc) => {
      const linkedExpenses = expenses.filter((e) => e.incomeSourceId === inc.id);
      const spent = linkedExpenses.reduce((s, e) => s + (e.amount || 0), 0);
      const remaining = Math.max(0, (inc.amount || 0) - spent);
      return { ...inc, spent, remaining, isExhausted: remaining === 0 && spent > 0 };
    });
  }, [incomes, expenses]);

  const totalGlobalBalance = useMemo(
    () => incomesWithBalance.reduce((s, i) => s + i.remaining, 0),
    [incomesWithBalance]
  );

  const sortedIncomesForSelect = useMemo(() => {
    return [...incomesWithBalance].sort((a, b) => {
      if (a.isExhausted && !b.isExhausted) return 1;
      if (!a.isExhausted && b.isExhausted) return -1;
      return new Date(b.date) - new Date(a.date);
    });
  }, [incomesWithBalance]);

  const filtered = useMemo(() => {
    return expenses
      .filter((e) => e.date >= startDate && e.date <= endDate)
      .filter((e) => filterCategory === 'all' || e.categoryId === filterCategory)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [expenses, startDate, endDate, filterCategory]);

  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach((e) => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return Object.entries(map).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [filtered]);

  const total = filtered.reduce((s, e) => s + (e.amount || 0), 0);

  const openNew = () => {
    setForm(emptyForm());
    setError('');
    setOpen(true);
  };

  const openEdit = (exp) => {
    setForm({
      id: exp.id,
      amount: String(exp.amount),
      categoryId: exp.categoryId,
      date: exp.date,
      note: exp.note || '',
      incomeSourceId: exp.incomeSourceId || 'all',
      incomeSourceName: exp.incomeSourceName || 'Tous les revenus',
    });
    setError('');
    setOpen(true);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return setError('Montant invalide.');
    
    setSaving(true);
    try {
      const payload = {
        amount,
        categoryId: form.categoryId,
        date: form.date,
        note: form.note,
        incomeSourceId: form.incomeSourceId,
        incomeSourceName: form.incomeSourceName,
      };

      if (form.id) {
        let result = await updateExpense(user.uid, form.id, payload);
        if (result.confirmationRequired) {
          const accepted = window.confirm(`${result.message}\n\nSouhaites-tu continuer ?`);
          if (!accepted) return;
          result = await updateExpense(user.uid, form.id, { ...payload, confirmBudgetOverrun: true });
        }
      } else {
        let result = await createExpense(user.uid, payload);
        if (result.confirmationRequired) {
          const accepted = window.confirm(`${result.message}\n\nSouhaites-tu continuer ?`);
          if (!accepted) return;
          result = await createExpense(user.uid, { ...payload, confirmBudgetOverrun: true });
        }
      }
      setOpen(false);
    } catch (err) {
      setError(err.message || 'Erreur lors de l\u2019enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteExpense(user.uid, deleteId);
      setDeleteId(null);
    } catch (err) {
      window.alert(err.message || 'Impossible de supprimer cette dépense.');
    }
  };

  const makeExpenseRecurring = async (event) => {
    event.preventDefault();
    if (!recurringExpense || !user) return;
    setRecurringSaving(true);
    setRecurringError('');
    try {
      const baseDate = new Date(`${recurringExpense.date || todayIso()}T12:00:00`);
      const anchorDay = baseDate.getDate();
      if (recurringFrequency === 'daily') baseDate.setDate(baseDate.getDate() + 1);
      else if (recurringFrequency === 'weekly') baseDate.setDate(baseDate.getDate() + 7);
      else {
        baseDate.setDate(1);
        baseDate.setMonth(baseDate.getMonth() + 1);
        baseDate.setDate(Math.min(anchorDay, new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).getDate()));
      }
      await createAutomation(user.uid, {
        amount: recurringExpense.amount,
        categoryId: recurringExpense.categoryId,
        note: recurringExpense.note || 'Dépense récurrente',
        frequency: recurringFrequency,
        nextRun: baseDate.toISOString(),
        anchorDay,
        endDate: null,
        active: true,
        incomeSourceId: recurringExpense.incomeSourceId || 'all',
        incomeSourceName: recurringExpense.incomeSourceName || 'Tous les revenus',
      });
      setRecurringExpense(null);
    } catch (error) {
      setRecurringError(error.message || 'Impossible de programmer cette dépense.');
    } finally {
      setRecurringSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dépenses</h1>
          <p className="text-sm text-slate-500">
            Total affiché : <span className="font-semibold text-slate-800">{formatCurrency(total)}</span>
          </p>
        </div>
        <Button onClick={openNew} className="shadow-sm">
          <Plus size={16} /> Nouvelle dépense
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <button
          onClick={() => setShowCustomPeriod(false)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${!showCustomPeriod ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
        >
          Ce mois
        </button>
        <button
          onClick={() => setShowCustomPeriod(true)}
          className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${showCustomPeriod ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
        >
          <Calendar size={14} /> Personnalisée
        </button>
        
        {showCustomPeriod && (
          <div className="flex flex-wrap gap-2 items-center">
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
            <span className="text-slate-400">→</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
          </div>
        )}

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm ml-auto"
        >
          <option value="all">Toutes catégories</option>
          {customCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Aucune dépense"
          description="Aucune dépense trouvée pour cette période."
          action={<Button onClick={openNew}><Plus size={16} /> Ajouter</Button>}
        />
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, items]) => (
            <div key={date} className="rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 bg-slate-50/50 rounded-t-2xl">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {formatDate(date, { weekday: 'long', day: '2-digit', month: 'long' })}
                </p>
                <p className="text-xs font-semibold text-slate-700">
                  {formatCurrency(items.reduce((s, e) => s + e.amount, 0))}
                </p>
              </div>
              <ul className="divide-y divide-slate-100">
                {items.map((e) => {
                  const cat = resolveCategory(e.categoryId, 'expense', customCategories);
                  return (
                    <li key={e.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <CategoryImage categoryId={e.categoryId} image={cat?.image} size="md" />
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{cat?.label || 'Autre'}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {e.note && <p className="text-xs text-slate-500">{e.note}</p>}
                            {e.incomeSourceId && e.incomeSourceId !== 'all' && (
                              <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                <Landmark size={10} /> {e.incomeSourceName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">
                          {formatCurrency(e.amount)}
                        </span>
                        <button type="button" onClick={() => { setRecurringExpense(e); setRecurringFrequency('daily'); setRecurringError(''); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-700" aria-label="Rendre cette dépense récurrente" title="Rendre récurrente">
                          <Repeat size={15} />
                        </button>
                        <button
                          onClick={() => openEdit(e)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label="Modifier"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setDeleteId(e.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Supprimer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Modifier la dépense' : 'Nouvelle dépense'}>
        <form onSubmit={onSubmit} className="space-y-4">
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
            <p className="mb-2 text-sm font-medium text-slate-700">Catégorie</p>
            <CategoryManager
              type="expense"
              value={form.categoryId}
              onChange={(id) => setForm({ ...form, categoryId: id })}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">D'où vient cet argent ?</label>
            <select
              value={form.incomeSourceId}
              onChange={(e) => {
                const selectedId = e.target.value;
                const selectedInc = incomesWithBalance.find(i => i.id === selectedId);
                setForm({ 
                  ...form, 
                  incomeSourceId: selectedId, 
                  incomeSourceName: selectedInc ? selectedInc.source : 'Tous les revenus' 
                });
              }}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              {/* 🟢 AFFICHAGE DU VRAI SOLDE TOTAL */}
              <option value="all">Tous les revenus (Total: {formatCurrency(totalGlobalBalance)})</option>
              {sortedIncomesForSelect.map((inc) => (
                <option 
                  key={inc.id} 
                  value={inc.id}
                  disabled={inc.isExhausted && form.incomeSourceId !== inc.id}
                  className={inc.isExhausted ? 'text-slate-400' : ''}
                >
                  {inc.source} ({formatCurrency(inc.remaining)} restant) {inc.isExhausted ? '— Épuisé' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
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
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Enregistrement…' : form.id ? 'Mettre à jour' : 'Ajouter'}
          </Button>
        </form>
      </Modal>

      <Modal open={!!recurringExpense} onClose={() => setRecurringExpense(null)} title="Programmer cette dépense">
        {recurringExpense && (
          <form onSubmit={makeExpenseRecurring} className="space-y-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">{formatCurrency(recurringExpense.amount)} · {resolveCategory(recurringExpense.categoryId, 'expense', customCategories)?.label || 'Dépense'}</p>
              <p className="mt-1 text-xs text-slate-500">{recurringExpense.note || 'Sans note'}</p>
            </div>
            <label className="block text-sm font-medium text-slate-700">Fréquence
              <select value={recurringFrequency} onChange={(event) => setRecurringFrequency(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                <option value="daily">Chaque jour</option><option value="weekly">Chaque semaine</option><option value="monthly">Chaque mois</option>
              </select>
            </label>
            <p className="text-xs leading-5 text-slate-500">La première occurrence sera programmée après la dépense choisie. Tu pourras ensuite gérer cette opération dans les automatisations.</p>
            <button type="button" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700" onClick={() => {
              const prompt = `Je souhaite rendre cette dépense récurrente. Montant : ${recurringExpense.amount} FCFA. Catégorie : ${recurringExpense.categoryId}. Note : ${recurringExpense.note || 'aucune'}. Fréquence choisie : ${recurringFrequency}. Explique les avantages, les risques de solde insuffisant et comment modifier ou arrêter cette programmation. Ne crée rien sans mon accord.`;
              window.dispatchEvent(new CustomEvent('pata:assistant-open', { detail: { prompt } }));
            }}>Demander conseil à Mč</button>
            {recurringError && <p role="alert" className="text-sm text-red-600">{recurringError}</p>}
            <Button type="submit" className="w-full" disabled={recurringSaving}>{recurringSaving ? 'Programmation…' : 'Confirmer la programmation'}</Button>
          </form>
        )}
      </Modal>

      <ConfirmDialog 
        open={!!deleteId} 
        onClose={() => setDeleteId(null)} 
        onConfirm={handleDelete} 
        title="Supprimer cette dépense ?" 
        message="Cette action est irréversible." 
        confirmWord="SUPPRIMER" 
        confirmLabel="Supprimer" 
        variant="danger" 
      />
    </div>
  );
    }
