/* eslint-disable react/no-unescaped-entities */
'use client';

import { useMemo, useState } from 'react';
import {
  Plus, Trash2, TrendingUp, CheckCircle2, Landmark, Save, RotateCcw, Percent,
  PiggyBank, Target, Pencil, AlertTriangle, Calculator, CalendarDays, ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/hooks/useAuth';
import { useIncomes } from '@/hooks/useIncomes';
import { useExpenses } from '@/hooks/useExpenses';
import { useProfile } from '@/hooks/useProfile';
import { useBudgetRules } from '@/hooks/useBudgetRules';
import { createIncome, deleteIncome } from '@/lib/firestore/incomes';
import { upsertBudget } from '@/lib/firestore/budgets';
import { computeBudgetBreakdown } from '@/lib/budgetRules';
import { INCOME_CATEGORIES } from '@/lib/constants';
import { formatCurrency, formatDate } from '@/lib/utils';

const todayMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const todayIso = () => new Date().toISOString().slice(0, 10);

const VITAL_CATEGORIES = [
  { id: 'food', label: 'Nourriture', icon: '🍽️' },
  { id: 'transport', label: 'Transport', icon: '🚌' },
  { id: 'housing', label: 'Loyer', icon: '🏠' },
  { id: 'telecom', label: 'Télécom/Internet', icon: '📱' },
  { id: 'other', label: 'Autres besoins', icon: '📦' },
];

const FREQUENCIES = [
  { id: 'daily', label: 'Par jour', multiplier: 30 },
  { id: 'weekly', label: 'Par semaine', multiplier: 4 },
  { id: 'monthly', label: 'Par mois', multiplier: 1 },
];

export default function IncomePage() {
  const { user } = useAuth();
  const { incomes } = useIncomes();
  const { expenses } = useExpenses();
  const { profile, save } = useProfile();
  const { rules, updatePercent, saveRules, resetRules, total, isValid, loading: rulesLoading } = useBudgetRules();

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
  const [deleteId, setDeleteId] = useState(null);

  // 🟢 Nouveaux états pour les prévisions
  const [vitalOpen, setVitalOpen] = useState(false);
  const [vitalForm, setVitalForm] = useState({});
  const [budgetName, setBudgetName] = useState('');
  const [totalBudget, setTotalBudget] = useState('');
  const [savingVital, setSavingVital] = useState(false);

  const incomesWithBalance = useMemo(() => {
    return incomes.map((inc) => {
      const linkedExpenses = expenses.filter((e) => e.incomeSourceId === inc.id);
      const spent = linkedExpenses.reduce((s, e) => s + (e.amount || 0), 0);
      const remaining = Math.max(0, (inc.amount || 0) - spent);
      return { ...inc, spent, remaining, isExhausted: remaining === 0 && spent > 0 };
    });
  }, [incomes, expenses]);

  const activeIncomes = useMemo(() => incomesWithBalance.filter(i => !i.isExhausted), [incomesWithBalance]);
  const totalAvailable = activeIncomes.reduce((s, i) => s + i.remaining, 0);

  const monthIncomes = useMemo(() => incomesWithBalance.filter((i) => i.month === month).sort((a, b) => (a.date < b.date ? 1 : -1)), [incomesWithBalance, month]);
  const totalIncome = monthIncomes.reduce((s, i) => s + (i.amount || 0), 0);
  const breakdown = useMemo(() => computeBudgetBreakdown(totalIncome, rules), [totalIncome, rules]);

  // 🟢 Calculs dynamiques des prévisions
  const vitalNeeds = profile?.vitalNeeds || {};
  
  const totalVitalMonthly = useMemo(() => {
    let total = 0;
    VITAL_CATEGORIES.forEach(cat => {
      const need = vitalNeeds[cat.id];
      if (need && need.amount && need.frequency) {
        const freq = FREQUENCIES.find(f => f.id === need.frequency);
        total += (need.amount || 0) * (freq ? freq.multiplier : 1);
      }
    });
    return total;
  }, [vitalNeeds]);

  const isOverBudget = totalBudget && totalVitalMonthly > Number(totalBudget);

  const openVitalModal = () => {
    const initial = {};
    VITAL_CATEGORIES.forEach(k => { 
      const existing = vitalNeeds[k.id];
      initial[k.id] = { 
        amount: existing?.amount || '', 
        frequency: existing?.frequency || 'monthly' 
      };
    });
    setVitalForm(initial);
    setBudgetName(profile?.vitalBudgetName || 'Budget mensuel');
    setTotalBudget(profile?.vitalTotalBudget || '');
    setVitalOpen(true);
  };

  const onSaveVital = async (e) => {
    e.preventDefault();
    setSavingVital(true);
    try {
      const cleaned = {};
      VITAL_CATEGORIES.forEach(k => { 
        const val = vitalForm[k.id];
        if (val && val.amount && Number(val.amount) > 0) {
          cleaned[k.id] = { amount: Number(val.amount), frequency: val.frequency };
        }
      });
      
      await save({ 
        vitalNeeds: cleaned,
        vitalBudgetName: budgetName,
        vitalTotalBudget: Number(totalBudget) || 0
      });
      
      setVitalOpen(false);
    } finally { setSavingVital(false); }
  };

  // 🟢 Transformer les prévisions en Revenu + Budgets
  const applyVitalToBudget = async () => {
    if (!totalVitalMonthly) return;
    setSavingApplied(true);
    try {
      const currentMonth = todayMonth();
      const sourceName = budgetName || 'Budget Prévisionnel';
      
      // 1. Créer le revenu
      const incomeRes = await createIncome(user.uid, {
        amount: Number(totalBudget) || totalVitalMonthly,
        source: sourceName,
        categoryId: 'salary',
        note: 'Généré depuis les prévisions vitales',
        date: todayIso(),
        month: currentMonth,
      });

      // 2. Créer les budgets
      for (const cat of VITAL_CATEGORIES) {
        const need = vitalNeeds[cat.id];
        if (need && need.amount) {
          const freq = FREQUENCIES.find(f => f.id === need.frequency);
          const monthlyAmount = (need.amount || 0) * (freq ? freq.multiplier : 1);
          if (monthlyAmount > 0) {
            await upsertBudget(user.uid, {
              categoryId: cat.id,
              amount: Math.round(monthlyAmount),
              month: currentMonth,
              incomeSourceId: incomeRes.id,
            });
          }
        }
      }
      alert('Prévisions enregistrées avec succès comme Revenu et Budgets !');
    } catch (err) {
      alert('Erreur: ' + err.message);
    } finally { setSavingApplied(false); }
  };

  // ... (Le reste des fonctions onSubmit, onSaveRules, etc. est identique)
  const onSubmit = async (e) => {
    e.preventDefault(); setError('');
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return setError('Montant invalide.');
    setSaving(true);
    try {
      await createIncome(user.uid, { amount, source: form.source, categoryId: form.categoryId, note: form.note, date: form.date, month: form.date.slice(0, 7) });
      setOpen(false);
      setForm({ amount: '', source: 'Salaire', categoryId: 'salary', note: '', date: todayIso() });
    } catch { setError('Erreur.'); } finally { setSaving(false); }
  };

  const onSaveRules = async () => {
    if (!isValid) return;
    setSavingRules(true);
    try { await saveRules(rules); setRulesSavedAt(new Date()); } finally { setSavingRules(false); }
  };

  const onResetRules = async () => {
    if (!confirm('Réinitialiser les pourcentages par défaut ?')) return;
    await resetRules(); setRulesSavedAt(new Date());
  };

  const onApplyBudgets = async () => {
    if (!breakdown.length || !isValid) return;
    setSavingApplied(true);
    try {
      for (const item of breakdown) {
        await upsertBudget(user.uid, { categoryId: item.key, amount: item.amount, month, incomeSourceId: selectedIncomeToApply });
      }
      setApplied(true);
    } finally { setSavingApplied(false); }
  };

  const handleDelete = async () => {
    if (deleteId) { await deleteIncome(user.uid, deleteId); setDeleteId(null); }
  };

  return (
    <div className="space-y-4">
      {/* ... (L'en-tête, les cartes de revenus et les règles sont identiques) ... */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Revenus</h1>
          <p className="text-sm text-slate-500">
            {activeIncomes.length} source(s) active(s) — Disponible : <span className="font-semibold text-brand-600">{formatCurrency(totalAvailable)}</span>
          </p>
        </div>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
      </div>

      <Card className={totalVitalMonthly > 0 && Number(totalBudget) >= totalVitalMonthly ? 'border-brand-200' : isOverBudget ? 'border-red-200' : ''}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator size={16} className="text-slate-400" />
            <CardTitle>Prévisions Vitales</CardTitle>
          </div>
          <Button size="sm" variant="outline" onClick={openVitalModal}>
            <Pencil size={12} /> Configurer
          </Button>
        </div>

        {totalVitalMonthly === 0 ? (
          <p className="text-sm text-slate-500">
            Calcule ton budget de survie (nourriture, transport, loyer, etc.) et transforme-le en revenus et budgets en un clic.
          </p>
        ) : (
          <>
            <div className="mb-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-slate-800">{profile?.vitalBudgetName || 'Budget'}</span>
                <span className="text-sm font-bold text-slate-800">{formatCurrency(Number(totalBudget))}</span>
              </div>
              <ul className="space-y-1">
                {VITAL_CATEGORIES.map(k => {
                  const need = vitalNeeds[k.id];
                  if (!need || !need.amount) return null;
                  const freq = FREQUENCIES.find(f => f.id === need.frequency);
                  const monthly = (need.amount || 0) * (freq ? freq.multiplier : 1);
                  return (
                    <li key={k.id} className="flex justify-between text-xs text-slate-600">
                      <span>{k.icon} {k.label}</span>
                      <span>{formatCurrency(Math.round(monthly))}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-slate-200 mt-2 pt-2 flex justify-between text-sm font-bold">
                <span>Total prévisions</span>
                <span className={isOverBudget ? 'text-red-600' : 'text-brand-600'}>
                  {formatCurrency(totalVitalMonthly)}
                </span>
              </div>
            </div>

            {isOverBudget && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 border border-red-200 mb-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
                <p className="text-xs text-red-700">
                  Tes prévisions dépassent ton budget total de <strong>{formatCurrency(totalVitalMonthly - Number(totalBudget))}</strong>. Réduis certaines catégories ou augmente ton budget total.
                </p>
              </div>
            )}

            <Button onClick={applyVitalToBudget} className="w-full" disabled={savingApplied || isOverBudget}>
              <ArrowRight size={14} /> {savingApplied ? 'Enregistrement...' : 'Transformer en Revenu & Budgets'}
            </Button>
          </>
        )}
      </Card>

      {/* ... (Le reste de la page : sources de revenus, règles, modals) ... */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <CardTitle>Toutes mes sources de revenus</CardTitle>
          <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> Ajouter</Button>
        </div>
        {incomesWithBalance.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Aucun revenu enregistré" description="Ajoute ton salaire ou une source de revenu." />
        ) : (
          <ul className="space-y-3">
            {incomesWithBalance.map((inc) => (
              <li key={inc.id} className={`rounded-xl border p-3 ${inc.isExhausted ? 'border-slate-100 bg-slate-50/50 opacity-60' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Landmark size={16} /></div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-800">{inc.source}</p>
                        {inc.isExhausted && (<span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">Épuisé</span>)}
                      </div>
                      <p className="text-xs text-slate-500">{formatDate(inc.date)} — {INCOME_CATEGORIES.find(c => c.id === inc.categoryId)?.label || 'Revenu'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-800">{formatCurrency(inc.amount)}</p>
                      <p className="text-[10px] text-slate-500">Total</p>
                    </div>
                    <button onClick={() => setDeleteId(inc.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
                  </div>
                </div>
                {!inc.isExhausted && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs"><span className="text-slate-500">Dépensé</span><span className="text-red-500">- {formatCurrency(inc.spent)}</span></div>
                    <div className="flex justify-between items-center border-t border-slate-100 pt-1.5"><span className="text-xs font-semibold text-slate-700">Solde restant</span><span className="text-base font-bold text-brand-600">{formatCurrency(inc.remaining)}</span></div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <CardTitle>Règles de répartition</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onResetRules} disabled={rulesLoading}><RotateCcw size={12} /> Défauts</Button>
            <Button size="sm" onClick={onSaveRules} disabled={!isValid || savingRules}><Save size={12} /> {savingRules ? '…' : 'Enregistrer'}</Button>
          </div>
        </div>
        <p className="mb-3 text-xs text-slate-500">Modifie les pourcentages. Total doit faire 100%.{rulesSavedAt && <span className="ml-1 text-brand-600">Enregistré.</span>}</p>
        <ul className="space-y-2">
          {rules.map((r) => (
            <li key={r.key} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{r.label}</span>
              <div className="flex items-center gap-1">
                <input type="number" min="0" max="100" step="1" value={r.percent} onChange={(e) => updatePercent(r.key, e.target.value)} className="h-9 w-16 rounded-lg border border-slate-300 bg-white px-2 text-right text-sm" />
                <Percent size={12} className="text-slate-400" />
              </div>
              <span className="w-24 text-right text-xs font-medium text-slate-500">{totalIncome > 0 ? formatCurrency(Math.round((totalIncome * (Number(r.percent) || 0)) / 100)) : '—'}</span>
            </li>
          ))}
        </ul>
        <div className={`mt-4 flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium ${isValid ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-700'}`}>
          <span>Total</span><span>{total.toFixed(0)} % {isValid ? '✓' : '— doit faire 100%'}</span>
        </div>
      </Card>

      {totalIncome > 0 && breakdown.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <CardTitle>Appliquer aux budgets</CardTitle>
            {applied && (<span className="flex items-center gap-1 text-xs font-medium text-brand-600"><CheckCircle2 size={14} /> Appliqué</span>)}
          </div>
          <div className="mb-4 space-y-2">
            <label className="block text-sm font-medium text-slate-700">Sur quel revenu appliquer ?</label>
            <select value={selectedIncomeToApply} onChange={(e) => { setSelectedIncomeToApply(e.target.value); setApplied(false); }} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="all">Tous les revenus (Global)</option>
              {activeIncomes.map(inc => (<option key={inc.id} value={inc.id}>{inc.source} ({formatCurrency(inc.remaining)} dispo)</option>))}
            </select>
          </div>
          <div className="space-y-2 mb-4">
            {breakdown.map((b) => (<div key={b.key} className="flex items-center justify-between text-sm"><div className="flex items-center gap-2"><span className="w-12 text-xs font-semibold text-slate-400">{b.percent}%</span><span className="text-slate-700">{b.label}</span></div><span className="font-semibold text-slate-800">{formatCurrency(b.amount)}</span></div>))}
          </div>
          <Button onClick={onApplyBudgets} className="w-full" variant={applied ? 'secondary' : 'primary'} disabled={savingApplied || applied || !isValid}>{applied ? 'Budgets appliqués' : savingApplied ? 'Application…' : 'Appliquer'}</Button>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nouveau revenu">
        <form onSubmit={onSubmit} className="space-y-3">
          <Input label="Montant (FCFA)" type="number" min="0" step="1" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Type de revenu</label>
            <select value={form.categoryId} onChange={(e) => { const catId = e.target.value; const cat = INCOME_CATEGORIES.find(c => c.id === catId); setForm({ ...form, categoryId: catId, source: cat.label }); }} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
              {INCOME_CATEGORIES.map((c) => (<option key={c.id} value={c.id}>{c.label}</option>))}
            </select>
          </div>
          <Input label="Nom / Source" required value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          <Input label="Date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Input label="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={saving}>{saving ? 'Enregistrement…' : 'Ajouter'}</Button>
        </form>
      </Modal>

      {/* 🟢 NOUVELLE MODALE DES PRÉVISIONS */}
      <Modal open={vitalOpen} onClose={() => setVitalOpen(false)} title="Calculer mes prévisions">
        <form onSubmit={onSaveVital} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Input 
              label="Nom du budget" 
              placeholder="Ex: Salaire Novembre" 
              value={budgetName} 
              onChange={(e) => setBudgetName(e.target.value)} 
              required
            />
            <Input 
              label="Budget total alloué" 
              type="number" 
              placeholder="Ex: 100000" 
              value={totalBudget} 
              onChange={(e) => setTotalBudget(e.target.value)} 
              required
            />
          </div>

          <p className="text-xs text-slate-500">Dis-nous combien tu dépenses pour chaque catégorie et à quelle fréquence.</p>
          
          {VITAL_CATEGORIES.map(k => {
            const val = vitalForm[k.id] || { amount: '', frequency: 'monthly' };
            return (
              <div key={k.id} className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                <p className="text-sm font-semibold text-slate-700 mb-2">{k.icon} {k.label}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input 
                    label="Montant (FCFA)" 
                    type="number" 
                    min="0" 
                    value={val.amount} 
                    onChange={(e) => setVitalForm({ ...vitalForm, [k.id]: { ...val, amount: e.target.value } })}
                    placeholder="0"
                  />
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Fréquence</label>
                    <select 
                      value={val.frequency} 
                      onChange={(e) => setVitalForm({ ...vitalForm, [k.id]: { ...val, frequency: e.target.value } })}
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                    >
                      {FREQUENCIES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}

          <div className={`rounded-xl p-3 text-sm border ${isOverBudget ? 'bg-red-50 border-red-200' : 'bg-brand-50 border-brand-100'}`}>
            <div className="flex justify-between items-center mb-1">
              <span className="font-medium">Total prévisions (mensuel) :</span>
              <strong className={isOverBudget ? 'text-red-700' : 'text-brand-800'}>{formatCurrency(totalVitalMonthly)}</strong>
            </div>
            {totalBudget && (
              <p className={`text-xs ${isOverBudget ? 'text-red-600' : 'text-brand-600'}`}>
                {isOverBudget ? `Dépassement de ${formatCurrency(totalVitalMonthly - Number(totalBudget))}` : `Il te reste ${formatCurrency(Number(totalBudget) - totalVitalMonthly)}`}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={savingVital}>{savingVital ? 'Calcul...' : 'Enregistrer les prévisions'}</Button>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Supprimer ce revenu ?" message="Cette action est irréversible." confirmWord="SUPPRIMER" confirmLabel="Supprimer" variant="danger" />
    </div>
  );
        }
