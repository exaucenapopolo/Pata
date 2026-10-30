'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2, Wallet, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import { useExpenses } from '@/hooks/useExpenses';
import { createExpense, updateExpense, deleteExpense } from '@/lib/firestore/expenses';
import { EXPENSE_CATEGORIES } from '@/lib/constants';
import { formatCurrency, formatDate } from '@/lib/utils';

const todayMonth = () => new Date().toISOString().slice(0, 7);
const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyForm = () => ({
  id: null,
  amount: '',
  categoryId: 'food',
  date: todayIso(),
  note: '',
});

export default function ExpensesPage() {
  const { user } = useAuth();
  const { expenses, loading } = useExpenses();
  const [month, setMonth] = useState(todayMonth());
  const [filterCategory, setFilterCategory] = useState('all');
  const [form, setForm] = useState(emptyForm());
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    return expenses
      .filter((e) => e.date?.startsWith(month))
      .filter((e) => filterCategory === 'all' || e.categoryId === filterCategory)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [expenses, month, filterCategory]);

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
      if (form.id) {
        await updateExpense(user.uid, form.id, {
          amount,
          categoryId: form.categoryId,
          date: form.date,
          note: form.note,
        });
      } else {
        await createExpense(user.uid, {
          amount,
          categoryId: form.categoryId,
          date: form.date,
          note: form.note,
        });
      }
      setOpen(false);
    } catch {
      setError('Erreur lors de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id) => {
    if (!confirm('Supprimer cette dépense ?')) return;
    await deleteExpense(user.uid, id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dépenses</h1>
          <p className="text-sm text-slate-500">
            Total affiché : <span className="font-semibold text-slate-800">{formatCurrency(total)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="all">Toutes catégories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Aucune dépense"
          description="Ajoute ta première dépense pour commencer le suivi."
          action={<Button onClick={openNew}><Plus size={16} /> Ajouter</Button>}
        />
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, items]) => (
            <div key={date} className="rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {formatDate(date, { weekday: 'long', day: '2-digit', month: 'long' })}
                </p>
                <p className="text-xs font-semibold text-slate-700">
                  {formatCurrency(items.reduce((s, e) => s + e.amount, 0))}
                </p>
              </div>
              <ul className="divide-y divide-slate-100">
                {items.map((e) => {
                  const cat = EXPENSE_CATEGORIES.find((c) => c.id === e.categoryId);
                  return (
                    <li key={e.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: cat?.color || '#94a3b8' }}
                        />
                        <div>
                          <p className="text-sm font-medium text-slate-800">{cat?.label || 'Autre'}</p>
                          {e.note && <p className="text-xs text-slate-500">{e.note}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">
                          {formatCurrency(e.amount)}
                        </span>
                        <button
                          onClick={() => openEdit(e)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label="Modifier"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => onDelete(e.id)}
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

      <button
        onClick={openNew}
        className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition hover:bg-brand-700 md:bottom-6"
        aria-label="Ajouter une dépense"
      >
        <Plus size={24} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Modifier la dépense' : 'Nouvelle dépense'}>
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
          <Select
            label="Catégorie"
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
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
            {saving ? 'Enregistrement…' : form.id ? 'Mettre à jour' : 'Ajouter'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
