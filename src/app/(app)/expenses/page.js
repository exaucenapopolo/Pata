/* eslint-disable react/no-unescaped-entities */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Wallet, Pencil, Landmark, Calendar, Repeat, Clock3, MapPin } from 'lucide-react';
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
import { OptionalTransactionFields } from '@/components/transactions/OptionalTransactionFields';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const currentTime = () => {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

const emptyForm = () => ({
  id: null,
  amount: '',
  categoryId: 'food',
  date: todayIso(),
  time: currentTime(),
  note: '',
  locationLabel: '',
  latitude: null,
  longitude: null,
  locationAccuracy: null,
  paymentMethod: '',
  details: '',
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
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [recurringExpense, setRecurringExpense] = useState(null);
  const [recurringFrequency, setRecurringFrequency] = useState('daily');
  const [recurringSaving, setRecurringSaving] = useState(false);
  const [recurringError, setRecurringError] = useState('');

  useEffect(() => {
    const openFromShortcut = () => { setForm(emptyForm()); setError(''); setOpen(true); };
    window.addEventListener('pata:expense-new', openFromShortcut);
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === '1') {
      openFromShortcut();
      window.history.replaceState(null, '', window.location.pathname);
    }
    return () => window.removeEventListener('pata:expense-new', openFromShortcut);
  }, []);

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
      time: exp.time || '',
      note: exp.note || '',
      locationLabel: exp.locationLabel || '',
      latitude: exp.latitude ?? null,
      longitude: exp.longitude ?? null,
      locationAccuracy: exp.locationAccuracy ?? null,
      paymentMethod: exp.paymentMethod || '',
      details: exp.details || '',
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
        time: form.time,
        locationLabel: form.locationLabel,
        latitude: form.latitude,
        longitude: form.longitude,
        locationAccuracy: form.locationAccuracy,
        paymentMethod: form.paymentMethod,
        details: form.details,
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
                    <li key={e.id} className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
                      <button type="button" onClick={() => setSelectedExpense(e)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-200">
                        <CategoryImage categoryId={e.categoryId} image={cat?.image} size="md" />
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-sm text-slate-800">{cat?.label || 'Autre'}</strong>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                            {e.note && <span className="max-w-[160px] truncate">{e.note}</span>}
                            {e.time && <span className="inline-flex items-center gap-1"><Clock3 size={11}/>{e.time}</span>}
                            {e.locationLabel && <span className="inline-flex max-w-[150px] items-center gap-1 truncate"><MapPin size={11}/>{e.locationLabel}</span>}
                          </span>
                          {e.incomeSourceId && e.incomeSourceId !== 'all' && <span className="mt-1 block truncate text-[10px] text-slate-400">Payé depuis : {e.incomeSourceName}</span>}
                        </span>
                        <span className="shrink-0 text-right"><strong className="block text-sm font-bold text-slate-900">{formatCurrency(e.amount)}</strong><span className="text-[10px] font-medium text-brand-700">Voir le détail</span></span>
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button type="button" onClick={() => openEdit(e)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Modifier la dépense" title="Modifier"><Pencil size={15}/></button>
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

          <OptionalTransactionFields value={form} onChange={(next) => setForm(next)} kind="expense" />
          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Enregistrement…' : form.id ? 'Mettre à jour' : 'Ajouter'}
          </Button>
        </form>
      </Modal>

      <Modal open={!!selectedExpense} onClose={() => setSelectedExpense(null)} title="Détail de la dépense">
        {selectedExpense && (() => {
          const category = resolveCategory(selectedExpense.categoryId, 'expense', customCategories);
          const paymentLabels = { cash: 'Espèces', mtn_momo: 'MTN Mobile Money', orange_money: 'Orange Money', bank_transfer: 'Virement bancaire', card: 'Carte bancaire', other: 'Autre moyen' };
          return (
            <div className="space-y-4">
              <div className="rounded-2xl bg-brand-50 p-4 text-center">
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-white"><CategoryImage categoryId={selectedExpense.categoryId} image={category?.image} size="md" /></div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">{category?.label || 'Dépense'}</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{formatCurrency(selectedExpense.amount)}</p>
              </div>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3">
                <div className="flex justify-between gap-4 py-3 text-sm"><span className="text-slate-500">Date</span><strong className="text-right text-slate-800">{formatDate(selectedExpense.date)}</strong></div>
                <div className="flex justify-between gap-4 py-3 text-sm"><span className="text-slate-500">Heure</span><strong className="text-right text-slate-800">{selectedExpense.time || 'Non renseignée'}</strong></div>
                <div className="flex justify-between gap-4 py-3 text-sm"><span className="text-slate-500">Lieu</span><strong className="max-w-[60%] text-right text-slate-800">{selectedExpense.locationLabel || 'Non renseigné'}</strong></div>
                <div className="flex justify-between gap-4 py-3 text-sm"><span className="text-slate-500">Paiement</span><strong className="text-right text-slate-800">{paymentLabels[selectedExpense.paymentMethod] || 'Non précisé'}</strong></div>
                <div className="flex justify-between gap-4 py-3 text-sm"><span className="text-slate-500">Commerce / bénéficiaire</span><strong className="max-w-[60%] text-right text-slate-800">{selectedExpense.details || 'Non renseigné'}</strong></div>
                <div className="flex justify-between gap-4 py-3 text-sm"><span className="text-slate-500">Financé depuis</span><strong className="max-w-[60%] text-right text-slate-800">{selectedExpense.incomeSourceName || 'Tous les revenus'}</strong></div>
                <div className="py-3 text-sm"><p className="text-slate-500">Note</p><p className="mt-1 whitespace-pre-wrap text-slate-800">{selectedExpense.note || 'Aucune note'}</p></div>
              </div>
              {selectedExpense.latitude != null && selectedExpense.longitude != null && <a href={'https://www.google.com/maps?q=' + selectedExpense.latitude + ',' + selectedExpense.longitude} target="_blank" rel="noreferrer" className="block rounded-xl border border-slate-200 px-3 py-2.5 text-center text-xs font-semibold text-brand-800 hover:bg-brand-50">Voir la position sur la carte</a>}
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => { setSelectedExpense(null); openEdit(selectedExpense); }}><Pencil size={14}/> Modifier</Button>
                <Button type="button" variant="outline" onClick={() => { setDeleteId(selectedExpense.id); setSelectedExpense(null); }} className="border-red-200 text-red-700 hover:bg-red-50"><Trash2 size={14}/> Supprimer</Button>
              </div>
              <Button type="button" className="w-full" onClick={() => { setRecurringExpense(selectedExpense); setRecurringFrequency('daily'); setRecurringError(''); setSelectedExpense(null); }}><Repeat size={14}/> Rendre récurrente</Button>
            </div>
          );
        })()}
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
