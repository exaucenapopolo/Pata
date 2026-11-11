/* eslint-disable react/no-unescaped-entities */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Plus, Trash2, TrendingUp, CheckCircle2, Landmark, Save, RotateCcw, Percent,
  PiggyBank, Target, Pencil, AlertTriangle, Calculator, ArrowRight, Clock3, MapPin
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CategoryManager } from '@/components/ui/CategoryManager';
import { CategoryImage } from '@/components/ui/CategoryImage';
import { useAuth } from '@/hooks/useAuth';
import { useIncomes } from '@/hooks/useIncomes';
import { useDebts } from '@/hooks/useDebts';
import { useExpenses } from '@/hooks/useExpenses';
import { useProfile } from '@/hooks/useProfile';
import { useProjects } from '@/hooks/useProjects';
import { useBudgetRules } from '@/hooks/useBudgetRules';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { createIncome, updateIncome, deleteIncome } from '@/lib/firestore/incomes';
import { upsertBudget } from '@/lib/firestore/budgets';
import { computeBudgetBreakdown } from '@/lib/budgetRules';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES, CAMEROON_BANKS } from '@/lib/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import { saveVitalForecast, deleteVitalForecast, saveDurationForecast as saveDurationForecastRecord, deleteDurationForecast } from '@/lib/firestore/forecasts';
import { useBudgets } from '@/hooks/useBudgets';
import { OptionalTransactionFields } from '@/components/transactions/OptionalTransactionFields';
import { DebtCounterpartyField } from '@/components/debts/DebtCounterpartyField';
import { AssistantShortcut } from '@/components/ai/AssistantShortcut';
import { checkFinancialOperation } from '@/lib/firestore/financialTargets';

// 🟢 DATES LOCALES (Pas de décalage UTC)
const todayMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const currentTime = () => {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};
const emptyIncomeForm = () => ({ id: null, amount: '', source: 'Salaire', categoryId: 'salary', note: '', date: todayIso(), projectId: '', time: currentTime(), locationLabel: '', latitude: null, longitude: null, locationAccuracy: null, paymentMethod: '', details: '', flowType: 'normal', person: '', phone: '', dueDate: '', repaymentDebtId: '', counterpartyUid: '', counterpartyType: 'person', bankName: '', bankChoice: '', bankCustomName: '' });

const FREQUENCIES = [
  { id: 'daily', label: 'Par jour', multiplier: 30 },
  { id: 'weekly', label: 'Par semaine', multiplier: 4 },
  { id: 'monthly', label: 'Par mois', multiplier: 1 },
];

export default function IncomePage() {
  const { user } = useAuth();
  const { incomes } = useIncomes();
  const { debts } = useDebts();
  const activeReceivableDebts = debts.filter((debt) => debt.type === 'owed_to_me' && ['active', 'partial', 'late'].includes(debt.status) && Number(debt.remaining) > 0);
  const { expenses } = useExpenses();
  const { profile, save } = useProfile();
  const { projects } = useProjects();
  const premiumExpiry = profile?.premiumUntil?.toDate ? profile.premiumUntil.toDate() : new Date(profile?.premiumUntil || 0);
  const isPremium = Number.isFinite(premiumExpiry.getTime()) && premiumExpiry > new Date();
  const { customCategories } = useCustomCategories('expense');
  const { customCategories: customIncomeCategories } = useCustomCategories('income');
  const { rules, updatePercent, saveRules, resetRules, total, isValid, loading: rulesLoading } = useBudgetRules();

  const [month, setMonth] = useState(todayMonth());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyIncomeForm());
  const [selectedIncome, setSelectedIncome] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [savingApplied, setSavingApplied] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState('');
  const [rulesSavedAt, setRulesSavedAt] = useState(null);
  const [selectedIncomeToApply, setSelectedIncomeToApply] = useState('all');
  const { budgets: appliedBudgets } = useBudgets(month, selectedIncomeToApply);
  const [deleteId, setDeleteId] = useState(null);
  const [showCotisationReminder, setShowCotisationReminder] = useState(false);

  // 🟢 États des prévisions
  const [vitalOpen, setVitalOpen] = useState(false);
  const [vitalForm, setVitalForm] = useState({});
  const [budgetName, setBudgetName] = useState('');
  const [totalBudget, setTotalBudget] = useState('');
  const [savingVital, setSavingVital] = useState(false);
  const [showVerification, setShowVerification] = useState(false); // Pour le bouton "Vérifier"
  const [durationName, setDurationName] = useState('');
  const [durationCapital, setDurationCapital] = useState('');
  const [durationExpense, setDurationExpense] = useState('');
  const [durationFrequency, setDurationFrequency] = useState('daily');
  const [durationError, setDurationError] = useState('');
  const [savingDuration, setSavingDuration] = useState(false);

  useEffect(() => {
    const openFromShortcut = (flowType = 'normal', debtId = '') => {
      const categoryId = flowType === 'debt_borrowed' ? 'debt_borrowed' : flowType === 'repayment_received' ? 'debt_repayment_received' : 'salary';
      setForm({ ...emptyIncomeForm(), flowType: ['debt_borrowed', 'repayment_received'].includes(flowType) ? flowType : 'normal', repaymentDebtId: debtId, categoryId });
      setError('');
      setOpen(true);
    };
    const eventHandler = () => openFromShortcut();
    window.addEventListener('pata:income-new', eventHandler);
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === '1') {
      openFromShortcut(params.get('flowType') || 'normal', params.get('debtId') || '');
      window.history.replaceState(null, '', window.location.pathname);
    }
    return () => window.removeEventListener('pata:income-new', eventHandler);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const highlightedId = params.get('highlight');
    if (!highlightedId || !incomes.length) return;
    const match = incomes.find((item) => item.id === highlightedId);
    if (match) setSelectedIncome(match);
    params.delete('highlight');
    const query = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : ''));
  }, [incomes]);

  const incomesWithBalance = useMemo(() => {
    return incomes.map((inc) => {
      const linkedExpenses = expenses.filter((e) => e.incomeSourceId === inc.id).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
      const spent = linkedExpenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
      const remaining = Math.max(0, (Number(inc.amount) || 0) - spent);
      let cumulative = 0;
      let exhaustedDate = null;
      for (const expense of linkedExpenses) {
        cumulative += Number(expense.amount) || 0;
        if (cumulative >= Number(inc.amount) && Number(inc.amount) > 0) { exhaustedDate = expense.date || null; break; }
      }
      const createdDate = inc.date || (inc.createdAt?.toDate ? inc.createdAt.toDate().toISOString().slice(0, 10) : null);
      const endDate = exhaustedDate || todayIso();
      const durationDays = createdDate ? Math.max(0, Math.floor((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${createdDate}T00:00:00`).getTime()) / 86400000)) : null;
      return { ...inc, spent, remaining, createdDate, exhaustedDate, durationDays, isExhausted: remaining === 0 && spent > 0 };
    });
  }, [incomes, expenses]);

  const activeIncomes = useMemo(() => incomesWithBalance.filter(i => !i.neutralFlow && !i.isExhausted), [incomesWithBalance]);
  const totalAvailable = activeIncomes.reduce((s, i) => s + i.remaining, 0);
  const currentMonthKey = todayMonth();
  const premiumUntilDate = profile?.premiumUntil?.toDate ? profile.premiumUntil.toDate() : new Date(profile?.premiumUntil || 0);
  const premiumActive = Number.isFinite(premiumUntilDate.getTime()) && premiumUntilDate > new Date();
  const monthlyStats = profile?.monthlyStats || {};
  const usedIncomeQuota = monthlyStats.lastResetMonth === currentMonthKey ? Number(monthlyStats.incomes) || 0 : 0;
  const incomeQuotaReached = !premiumActive && usedIncomeQuota >= 2;


  const durationForecasts = Array.isArray(profile?.durationForecasts) ? profile.durationForecasts : [];
  const frequencyDays = durationFrequency === 'weekly' ? 7 : durationFrequency === 'monthly' ? 30.4375 : 1;
  const dailyRate = Math.max(0, Number(durationExpense) || 0) / frequencyDays;
  const capitalValue = Math.max(0, Number(durationCapital) || 0);
  const expenseValue = Math.max(0, Number(durationExpense) || 0);
  const canCoverOnePeriod = capitalValue > 0 && expenseValue > 0 && capitalValue >= expenseValue;
  const calculatedDurationDays = dailyRate > 0 && canCoverOnePeriod
    ? Math.max(1, Math.floor((capitalValue / expenseValue) * frequencyDays))
    : null;
  const expensePerPeriodExceedsCapital = capitalValue > 0 && expenseValue > capitalValue;
  const formatDuration = (days) => {
    if (!Number.isFinite(Number(days)) || days < 0) return '—';
    if (days < 1) return 'Moins d’un jour';
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    const remainingDays = days % 30;
    const parts = [];
    if (years) parts.push(`${years} an${years > 1 ? 's' : ''}`);
    if (months) parts.push(`${months} mois`);
    if (remainingDays && parts.length < 2) parts.push(`${remainingDays} jour${remainingDays > 1 ? 's' : ''}`);
    return parts.join(' et ') || 'Moins d’un jour';
  };

  const saveDurationForecast = async (event) => {
    event.preventDefault();
    setDurationError('');
    const capital = Math.round(Number(durationCapital));
    if (!capital || capital <= 0 || dailyRate <= 0) return setDurationError('Indique un capital positif et une dépense estimée.');
    setSavingDuration(true);
    try {
      const result = await saveDurationForecastRecord({
        name: durationName.trim(),
        capital,
        expense: Math.round(Number(durationExpense) || 0),
        frequency: durationFrequency,
      });
      if (!result?.forecast) throw new Error('L’estimation n’a pas été enregistrée.');
      setDurationName(''); setDurationCapital(''); setDurationExpense(''); setDurationFrequency('daily');
    } catch (error) {
      setDurationError(error.message || 'Impossible d’enregistrer cette prévision.');
    } finally {
      setSavingDuration(false);
    }
  };

  const removeDurationForecast = async (id) => {
    if (!confirm('Supprimer cette prévision ? Cette suppression ne te rendra pas une création gratuite pour ce mois.')) return;
    await deleteDurationForecast(id);
  };

  const analyzeWithAssistant = (prompt) => {
    window.dispatchEvent(new CustomEvent('pata:assistant-open', { detail: { prompt } }));
  };

  const monthIncomes = useMemo(() => incomesWithBalance.filter((i) => i.month === month).sort((a, b) => (a.date < b.date ? 1 : -1)), [incomesWithBalance, month]);
  const totalIncome = monthIncomes.filter((income) => !income.neutralFlow).reduce((s, i) => s + (Number(i.remaining) || 0), 0);
  const breakdown = useMemo(() => computeBudgetBreakdown(totalIncome, rules), [totalIncome, rules]);

  const vitalNeeds = profile?.vitalNeeds || {};
  const allCategories = useMemo(() => {
    const defaults = EXPENSE_CATEGORIES.filter((category) => category.id !== 'loan_given').map(c => ({...c, isCustom: false}));
    const customs = customCategories.map(c => ({...c, isCustom: true, label: c.name}));
    return [...defaults, ...customs];
  }, [customCategories]);

  // 🟢 Calcul du total des prévisions ENREGISTRÉES
  const savedTotalVital = useMemo(() => {
    let total = 0;
    allCategories.forEach(cat => {
      const need = vitalNeeds[cat.id];
      if (need && need.amount && need.frequency) {
        const freq = FREQUENCIES.find(f => f.id === need.frequency);
        total += (need.amount || 0) * (freq ? freq.multiplier : 1);
      }
    });
    return total;
  }, [vitalNeeds, allCategories]);

  // 🟢 Calcul du total des prévisions EN COURS DE SAISIE (Temps réel dans la modale)
  const draftTotalVital = useMemo(() => {
    let total = 0;
    allCategories.forEach(cat => {
      const val = vitalForm[cat.id];
      if (val && val.amount && Number(val.amount) > 0) {
        const freq = FREQUENCIES.find(f => f.id === val.frequency);
        total += (Number(val.amount) || 0) * (freq ? freq.multiplier : 1);
      }
    });
    return total;
  }, [vitalForm, allCategories]);

  const isSavedOverBudget = totalBudget && savedTotalVital > Number(totalBudget);
  const isDraftOverBudget = totalBudget && draftTotalVital > Number(totalBudget);

  const openVitalModal = () => {
    const initial = {};
    allCategories.forEach(k => { 
      const existing = vitalNeeds[k.id];
      initial[k.id] = { 
        amount: existing?.amount || '', 
        frequency: existing?.frequency || 'monthly' 
      };
    });
    setVitalForm(initial);
    setBudgetName(profile?.vitalBudgetName || 'Budget mensuel');
    setTotalBudget(profile?.vitalTotalBudget || '');
    setShowVerification(false);
    setVitalOpen(true);
  };

  const onSaveVital = async (e) => {
    e.preventDefault();
    
    // 🟢 Si on clique sur "Enregistrer" et que c'est over budget, on bloque
    if (isDraftOverBudget) {
      setShowVerification(true);
      return;
    }

    setSavingVital(true);
    try {
      const cleaned = {};
      allCategories.forEach(k => { 
        const val = vitalForm[k.id];
        if (val && val.amount && Number(val.amount) > 0) {
          cleaned[k.id] = { amount: Number(val.amount), frequency: val.frequency };
        }
      });
      
      const result = await saveVitalForecast({
        name: budgetName || 'Prévision vitale',
        totalBudget: Number(totalBudget) || draftTotalVital || 0,
        needs: cleaned,
      });
      if (!result?.success) throw new Error('La prévision n’a pas été enregistrée.');
      
      setVitalOpen(false);
    } finally { setSavingVital(false); }
  };

  const deleteVital = async () => {
    if (!confirm('Voulez-vous vraiment supprimer toutes vos prévisions vitales ?')) return;
    await deleteVitalForecast();
  };

  const applyVitalToBudget = async () => {
    if (!savedTotalVital) return;
    const premiumUntilDate = profile?.premiumUntil?.toDate ? profile.premiumUntil.toDate() : new Date(profile?.premiumUntil || 0);
  const premiumActive = Number.isFinite(premiumUntilDate.getTime()) && premiumUntilDate > new Date();
    const requiredBudgets = allCategories.filter((category) => Number(vitalNeeds[category.id]?.amount) > 0).length;
    const currentMonthKey = todayMonth();
    const stats = profile?.monthlyStats || {};
    const usedBudgets = stats.lastResetMonth === currentMonthKey ? Number(stats.budgets) || 0 : 0;
    if (!premiumActive && usedBudgets + requiredBudgets > 2) {
      alert(`Ton compte gratuit peut créer 2 budgets par mois. Cette répartition en nécessite ${requiredBudgets} et il t’en reste ${Math.max(0, 2 - usedBudgets)}. Passe à Premium ou réduis le nombre de catégories avant de transformer cette prévision.`);
      return;
    }
    setSavingApplied(true);
    try {
      const currentMonth = todayMonth();
      const sourceName = budgetName || 'Budget Prévisionnel';
      
      const plannedIncomeAmount = Math.round(Number(totalBudget) > 0 ? Number(totalBudget) : Number(savedTotalVital));
      if (!plannedIncomeAmount || plannedIncomeAmount <= 0) throw new Error('Le montant total de la prévision est nul. Vérifie les montants des catégories avant de transformer cette prévision.');
      const incomeRes = await createIncome(user.uid, {
        amount: plannedIncomeAmount,
        source: sourceName,
        categoryId: 'salary',
        note: 'Généré depuis les prévisions vitales',
        date: todayIso(),
        month: currentMonth,
      });

      for (const cat of allCategories) {
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
      alert('Prévisions enregistrées avec succès !');
    } catch (err) {
      alert('Erreur: ' + err.message);
    } finally { setSavingApplied(false); }
  };

  const openNewIncome = () => {
    setForm(emptyIncomeForm());
    setError('');
    setOpen(true);
  };

  const openEditIncome = (income) => {
    setSelectedIncome(null);
    setForm({
      id: income.id,
      amount: String(income.amount || ''),
      source: income.source || 'Revenu',
      categoryId: income.categoryId || 'other_income',
      note: income.note || '',
      date: income.date || todayIso(),
      projectId: income.projectId || '',
      time: income.time || '',
      locationLabel: income.locationLabel || '',
      latitude: income.latitude ?? null,
      longitude: income.longitude ?? null,
      locationAccuracy: income.locationAccuracy ?? null,
      paymentMethod: income.paymentMethod || '',
      details: income.details || '',
      flowType: income.flowType || 'normal', person: income.person || '', phone: income.phone || '', dueDate: income.dueDate || '', repaymentDebtId: income.repaymentDebtId || '', counterpartyUid: income.counterpartyUid || '', counterpartyType: income.counterpartyType || 'person', bankName: income.bankName || '', bankChoice: income.counterpartyType === 'bank' ? (CAMEROON_BANKS.includes(income.bankName) ? income.bankName : '__other__') : '', bankCustomName: income.counterpartyType === 'bank' && !CAMEROON_BANKS.includes(income.bankName) ? (income.bankName || income.person || '') : '',
    });
    setError('');
    setOpen(true);
  };

  const onSubmit = async (e) => {
    e.preventDefault(); setError('');
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return setError('Montant invalide.');
    const debtCreditorName = form.counterpartyType === 'bank' ? String(form.bankName || form.bankCustomName || '').trim() : String(form.person || '').trim();
    if (form.flowType !== 'debt_borrowed' && !form.source.trim()) return setError('Indique le nom ou la source de ce revenu.');
    if (form.flowType === 'debt_borrowed' && (!debtCreditorName || !form.dueDate)) return setError(form.counterpartyType === 'bank' ? 'Choisis une banque ou saisis son nom, puis indique la date d’échéance.' : 'Indique la personne et la date d’échéance de la dette.');
    if (form.flowType === 'repayment_received' && !form.repaymentDebtId) return setError('Choisis la créance remboursée.');
    setSaving(true);
    try {
      if (!form.id && form.flowType === 'debt_borrowed') {
        try {
          const check = await checkFinancialOperation({
            operationType: 'debt_borrowed', amount, date: form.date, categoryId: 'debt_borrowed',
          });
          if (check.warnings?.length && !window.confirm(
            'Petit rappel de Pata :\n\n' + check.warnings.join('\n\n')
            + '\n\nTu peux respecter ton engagement et annuler, ou continuer quand même. Souhaites-tu poursuivre ?'
          )) return;
        } catch {
          if (!window.confirm('Pata n’a pas pu vérifier tes engagements pour le moment. Tu peux réessayer ou continuer sans cette vérification. Souhaites-tu poursuivre ?')) return;
        }
      }
      const payload = {
        amount, source: form.flowType === 'debt_borrowed' ? debtCreditorName : form.source,
        categoryId: form.flowType === 'debt_borrowed' ? 'debt_borrowed' : form.flowType === 'repayment_received' ? 'debt_repayment_received' : form.categoryId,
        flowType: form.flowType || 'normal', person: form.flowType === 'debt_borrowed' ? debtCreditorName : form.person, phone: form.phone, dueDate: form.dueDate,
        counterpartyType: form.flowType === 'debt_borrowed' ? (form.counterpartyType || 'person') : '',
        bankName: form.flowType === 'debt_borrowed' && form.counterpartyType === 'bank' ? debtCreditorName : '',
        counterpartyUid: form.flowType === 'debt_borrowed' && form.counterpartyType !== 'bank' ? (form.counterpartyUid || '') : '',
        repaymentDebtId: form.flowType === 'repayment_received' ? form.repaymentDebtId : '', note: form.note,
        date: form.date, month: form.date.slice(0, 7), projectId: ['normal', 'debt_borrowed'].includes(form.flowType) && isPremium ? form.projectId : '', time: form.time,
        locationLabel: form.locationLabel, latitude: form.latitude, longitude: form.longitude,
        locationAccuracy: form.locationAccuracy, paymentMethod: form.paymentMethod, details: form.details,
      };
      if (form.id) {
        if (form.flowType === 'debt_borrowed') await updateIncome(user.uid, form.id, { projectId: isPremium ? (form.projectId || '') : '' });
        else await updateIncome(user.uid, form.id, payload);
      } else {
        const result = await createIncome(user.uid, payload);
        if (result.linkedDebt?.status === 'quota_reached') {
          window.alert('Ta dette est bien enregistrée. Le quota gratuit de 2 liaisons de comptes par mois est atteint ; elle reste suivie normalement dans ton compte.');
        }
        setShowCotisationReminder(true);
      }
      setOpen(false);
      setForm(emptyIncomeForm());
    } catch (err) { setError(err.message || 'Impossible d’enregistrer ce revenu.'); } finally { setSaving(false); }
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
    const premiumUntilDate = profile?.premiumUntil?.toDate ? profile.premiumUntil.toDate() : new Date(profile?.premiumUntil || 0);
  const premiumActive = Number.isFinite(premiumUntilDate.getTime()) && premiumUntilDate > new Date();
    const newBudgetCount = breakdown.filter((item) => !appliedBudgets.some((budget) => budget.categoryId === item.key && (budget.incomeSourceId || 'all') === selectedIncomeToApply)).length;
    const currentMonthKey = todayMonth();
    const stats = profile?.monthlyStats || {};
    const usedBudgets = stats.lastResetMonth === currentMonthKey ? Number(stats.budgets) || 0 : 0;
    if (!premiumActive && usedBudgets + newBudgetCount > 2) {
      alert(`Il te reste ${Math.max(0, 2 - usedBudgets)} création(s) de budget sur ton compte gratuit ce mois-ci, mais cette répartition en nécessite ${newBudgetCount}. Les budgets déjà existants peuvent être modifiés sans consommer une nouvelle création.`);
      return;
    }
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
      {showCotisationReminder && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3"><div><p className="text-sm font-semibold text-brand-900">Revenu enregistré.</p><p className="mt-0.5 text-xs text-brand-800">Pense à vérifier ta prochaine cotisation si tu participes à un groupe.</p></div><div className="flex items-center gap-3"><Link href="/cotisations" className="text-xs font-bold text-brand-800 underline">Voir mes cotisations</Link><button type="button" onClick={() => setShowCotisationReminder(false)} className="text-xs text-brand-700">Fermer</button></div></div>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Revenus</h1>
          <p className="text-sm text-slate-500">
            {activeIncomes.length} source(s) active(s) — Disponible : <span className="font-semibold text-brand-600">{formatCurrency(totalAvailable)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AssistantShortcut label="Analyser mes revenus" prompt="Analyse mes sources de revenus dans Pata. Aide-moi à comprendre leur régularité, leur répartition et les risques de dépendance à une seule source. Propose des pistes adaptées sans modifier mes opérations." />
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" />
        </div>
      </div>
      {!premiumActive && (
        <div className={`rounded-xl border p-3 ${incomeQuotaReached ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-sm font-semibold text-slate-800">Revenus créés ce mois-ci</p><p className="text-xs text-slate-500">{usedIncomeQuota} sur 2 autorisés avec le compte gratuit.</p></div>
            <span className="text-sm font-bold text-slate-700">{Math.min(usedIncomeQuota, 2)}/2</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.min(100, usedIncomeQuota / 2 * 100)}%` }} /></div>
          {incomeQuotaReached && <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-amber-800">Tu as utilisé tes deux créations de revenus pour ce mois.</p><Button type="button" size="sm" onClick={() => window.location.assign('/premium')}>Passer à Premium</Button></div>}
        </div>
      )}

      {Array.isArray(profile?.vitalForecastHistory) && profile.vitalForecastHistory.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center justify-between"><CardTitle>Historique des prévisions vitales</CardTitle><span className="text-xs text-slate-400">{profile.vitalForecastHistory.length} enregistrée(s)</span></div>
          <div className="space-y-2">
            {profile.vitalForecastHistory.slice().reverse().slice(0, 8).map((forecast) => (
              <div key={forecast.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2.5">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{forecast.name}</p><p className="text-xs text-slate-500">{forecast.month} · {Object.keys(forecast.needs || {}).length} catégorie(s)</p></div>
                <strong className="shrink-0 text-sm text-slate-900">{formatCurrency(forecast.totalBudget)}</strong>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 🟢 CARTE DES PRÉVISIONS ENREGISTRÉES */}
      <Card className={savedTotalVital > 0 && Number(totalBudget) >= savedTotalVital ? 'border-brand-200' : isSavedOverBudget ? 'border-red-200' : ''}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator size={16} className="text-slate-400" />
            <CardTitle>Prévisions Vitales</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {savedTotalVital > 0 && (
              <Button size="sm" variant="ghost" onClick={deleteVital} className="text-red-600 hover:bg-red-50 hover:text-red-700">
                <Trash2 size={14} /> Supprimer
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={openVitalModal}>
              <Pencil size={12} /> {savedTotalVital > 0 ? 'Modifier' : 'Configurer'}
            </Button>
          </div>
        </div>

        {savedTotalVital === 0 ? (
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
                {allCategories.map(k => {
                  const need = vitalNeeds[k.id];
                  if (!need || !need.amount) return null;
                  const freq = FREQUENCIES.find(f => f.id === need.frequency);
                  const monthly = (need.amount || 0) * (freq ? freq.multiplier : 1);
                  return (
                    <li key={k.id} className="flex justify-between text-xs text-slate-600">
                      <span className="flex items-center gap-2">
                        <CategoryImage categoryId={k.id} image={k.image} size="sm" />
                        {k.label}
                      </span>
                      <span>{formatCurrency(Math.round(monthly))}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-slate-200 mt-2 pt-2 flex justify-between text-sm font-bold">
                <span>Total prévisions</span>
                <span className={isSavedOverBudget ? 'text-red-600' : 'text-brand-600'}>
                  {formatCurrency(savedTotalVital)}
                </span>
              </div>
            </div>

            {isSavedOverBudget && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 border border-red-200 mb-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
                <p className="text-xs text-red-700">
                  Tes prévisions dépassent ton budget total de <strong>{formatCurrency(savedTotalVital - Number(totalBudget))}</strong>. Modifie tes prévisions pour rentrer dans ton budget.
                </p>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={applyVitalToBudget} className="w-full" disabled={savingApplied || isSavedOverBudget}>
                <ArrowRight size={14} /> {savingApplied ? 'Enregistrement...' : 'Transformer en Revenu & Budgets'}
              </Button>
              <Button variant="outline" onClick={() => analyzeWithAssistant(`Analyse en profondeur mes Prévisions vitales. Nom : ${profile?.vitalBudgetName || 'Budget'}. Budget total : ${Number(totalBudget) || 0} FCFA. Détail mensuel par catégorie : ${allCategories.map((category) => { const need = vitalNeeds[category.id]; if (!need?.amount) return null; const frequency = FREQUENCIES.find((item) => item.id === need.frequency); return `${category.label}: ${Number(need.amount) * (frequency?.multiplier || 1)} FCFA/mois`; }).filter(Boolean).join('; ')}. Explique les points de vigilance et propose des améliorations concrètes sans modifier mes données.`)} className="w-full">
                Continuer l’analyse avec Mč
              </Button>
            </div>
          </>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Combien de temps mon argent va-t-il durer ?</CardTitle>
            <p className="mt-1 text-xs leading-5 text-slate-500">Indique la somme dont tu disposes et ton rythme de dépenses. Pata estime le nombre de jours avant épuisement du capital.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{profile?.premiumUntil && new Date(profile.premiumUntil) > new Date() ? 'Prévisions illimitées' : '1 nouvelle prévision / mois en gratuit'}</span>
        </div>
        <form onSubmit={saveDurationForecast} className="grid gap-3 sm:grid-cols-2">
          <Input label="Capital disponible (FCFA)" type="number" min="1" value={durationCapital} onChange={(event) => setDurationCapital(event.target.value)} required />
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Fréquence de la dépense</label>
            <select value={durationFrequency} onChange={(event) => setDurationFrequency(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="daily">Par jour</option><option value="weekly">Par semaine</option><option value="monthly">Par mois</option>
            </select>
          </div>
          <Input label={`Dépense ${durationFrequency === 'daily' ? 'par jour' : durationFrequency === 'weekly' ? 'par semaine' : 'par mois'} (FCFA)`} type="number" min="1" value={durationExpense} onChange={(event) => setDurationExpense(event.target.value)} required />
          <div className="flex flex-col justify-center rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] text-slate-500">Durée estimée</p>
            <p className="mt-1 text-lg font-bold text-slate-900">{calculatedDurationDays === null ? (expensePerPeriodExceedsCapital ? 'Capital insuffisant' : 'À calculer') : formatDuration(calculatedDurationDays)}</p>
            {calculatedDurationDays !== null && <p className="text-[11px] text-slate-500">Environ {calculatedDurationDays} jour(s), au rythme indiqué.</p>}
            {expensePerPeriodExceedsCapital && <p className="text-[11px] font-medium text-amber-700">Ton capital ne couvre pas une échéance complète de {formatCurrency(expenseValue)}. Augmente le capital ou ajuste la dépense avant d’estimer la durée.</p>}
          </div>
          
          {durationError && <p className="sm:col-span-2 text-xs text-red-600">{durationError}</p>}
          <div className="sm:col-span-2 flex flex-wrap gap-2"><Button type="submit" disabled={savingDuration} className="w-full sm:w-auto">{savingDuration ? 'Enregistrement…' : 'Enregistrer cette estimation'}</Button><Button type="button" variant="outline" onClick={() => analyzeWithAssistant(`Explique-moi simplement cette estimation de durée du capital. Capital disponible : ${Number(durationCapital) || 0} FCFA. Dépense : ${Number(durationExpense) || 0} FCFA ${durationFrequency === 'daily' ? 'par jour' : durationFrequency === 'weekly' ? 'par semaine' : 'par mois'}. Équivalent quotidien : ${Math.round(dailyRate)} FCFA. Durée estimée : ${calculatedDurationDays ?? 'non calculable'} jour(s). Précise les hypothèses et signale si ma dépense par période dépasse mon capital.`)}>Comprendre avec Mč</Button></div>
        </form>
        {durationForecasts.length > 0 && (
          <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mes prévisions enregistrées</p>
            {durationForecasts.map((forecast) => (
              <div key={forecast.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="text-sm font-semibold text-slate-800">{forecast.name}</p><p className="mt-0.5 text-xs text-slate-500">Capital : {formatCurrency(forecast.capital)} · Moyenne : {formatCurrency(forecast.averageDaily)} / jour</p></div>
                  <button type="button" onClick={() => removeDurationForecast(forecast.id)} className="text-xs text-slate-400 hover:text-red-600">Supprimer</button>
                </div>
                <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
                  <div><p className="text-xs text-slate-500">Durée estimée</p><p className="text-base font-bold text-brand-700">{forecast.canCoverPeriod === false ? 'Capital insuffisant' : formatDuration(forecast.estimatedDays)}</p><p className="text-[11px] text-slate-500">{forecast.canCoverPeriod === false ? 'Une échéance complète ne peut pas être couverte.' : `Jusqu’au ${formatDate(forecast.estimatedEndDate)}`}</p></div>
                  <Button type="button" size="sm" variant="outline" onClick={() => analyzeWithAssistant(`Analyse cette prévision de durée du capital et donne-moi des conseils concrets. Nom : ${forecast.name}. Capital : ${forecast.capital} FCFA. Dépense quotidienne : ${forecast.dailyExpense} FCFA. Hebdomadaire : ${forecast.weeklyExpense} FCFA. Mensuelle : ${forecast.monthlyExpense} FCFA. Moyenne par jour : ${forecast.averageDaily} FCFA. Durée estimée : ${forecast.estimatedDays} jours, jusqu’au ${forecast.estimatedEndDate}.`)}>Analyser avec Mč</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <CardTitle>Toutes mes sources de revenus</CardTitle>
          <Button size="sm" onClick={openNewIncome} disabled={incomeQuotaReached} className={incomeQuotaReached ? "opacity-50 grayscale" : ""}><Plus size={14} /> {incomeQuotaReached ? "Limite atteinte" : "Ajouter"}</Button>
        </div>
        {incomesWithBalance.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Aucun revenu enregistré" description="Ajoute ton salaire ou une source de revenu." />
        ) : (
          <ul className="space-y-3">
            {incomesWithBalance.map((inc) => (
              <li key={inc.id} className={`rounded-2xl border p-3 transition ${inc.isExhausted ? 'border-slate-100 bg-slate-50/50' : 'border-slate-200 bg-white'}`}>
                <button type="button" onClick={() => setSelectedIncome(inc)} className="flex w-full items-center justify-between gap-3 rounded-xl text-left focus:outline-none focus:ring-2 focus:ring-brand-200">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Landmark size={18}/></span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-slate-900">{inc.source}</strong>{inc.isExhausted && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Épuisé</span>}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{formatDate(inc.date)} · {INCOME_CATEGORIES.find(c => c.id === inc.categoryId)?.label || 'Revenu'}</span>
                      {inc.neutralFlow && <span className="mt-1 inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Mouvement neutre · Dette contractée</span>}
                      {inc.repaymentDebtId && <span className="mt-1 inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Remboursement reçu</span>}
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">{inc.time && <span className="inline-flex items-center gap-1"><Clock3 size={10}/>{inc.time}</span>}{inc.locationLabel && <span className="inline-flex max-w-[150px] items-center gap-1 truncate"><MapPin size={10}/>{inc.locationLabel}</span>}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right"><strong className="block text-sm font-bold text-slate-900">{formatCurrency(inc.amount)}</strong><span className="text-[10px] font-medium text-brand-700">Voir le détail</span></span>
                </button>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
                  <span className="text-[11px] text-slate-500">{inc.isExhausted && inc.exhaustedDate ? `Épuisé le ${formatDate(inc.exhaustedDate)}` : `Disponible : ${formatCurrency(inc.remaining)}`}</span>
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => setDeleteId(inc.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Supprimer ce revenu"><Trash2 size={14}/></button>
                  </span>
                </div>
                {!inc.isExhausted && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{width: `${inc.amount > 0 ? Math.min(100, (inc.spent / inc.amount) * 100) : 0}%`}}/></div>}
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

      <Modal open={!!selectedIncome} onClose={() => setSelectedIncome(null)} title="Détail du revenu">
        {selectedIncome && (() => {
          const methodLabels = { cash: 'Espèces', mtn_momo: 'MTN Mobile Money', orange_money: 'Orange Money', bank_transfer: 'Virement bancaire', card: 'Carte bancaire', other: 'Autre moyen' };
          return (
            <div className="space-y-4">
              <div className="rounded-2xl bg-brand-50 p-4 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-brand-700"><TrendingUp size={22}/></span>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-brand-800">{INCOME_CATEGORIES.find((category) => category.id === selectedIncome.categoryId)?.label || 'Revenu'}</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{formatCurrency(selectedIncome.amount)}</p>
                <p className="mt-1 text-xs text-slate-600">{selectedIncome.source}</p>
              </div>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3">
                <div className="flex justify-between gap-4 py-3 text-sm"><span className="text-slate-500">Date</span><strong className="text-right text-slate-800">{formatDate(selectedIncome.date)}</strong></div>
                <div className="flex justify-between gap-4 py-3 text-sm"><span className="text-slate-500">Heure</span><strong className="text-right text-slate-800">{selectedIncome.time || 'Non renseignée'}</strong></div>
                <div className="flex justify-between gap-4 py-3 text-sm"><span className="text-slate-500">Lieu</span><strong className="max-w-[60%] text-right text-slate-800">{selectedIncome.locationLabel || 'Non renseigné'}</strong></div>
                <div className="flex justify-between gap-4 py-3 text-sm"><span className="text-slate-500">Moyen de réception</span><strong className="text-right text-slate-800">{methodLabels[selectedIncome.paymentMethod] || 'Non précisé'}</strong></div>
                <div className="flex justify-between gap-4 py-3 text-sm"><span className="text-slate-500">Client / mission</span><strong className="max-w-[60%] text-right text-slate-800">{selectedIncome.details || 'Non renseigné'}</strong></div>
                <div className="py-3 text-sm"><p className="text-slate-500">Note</p><p className="mt-1 whitespace-pre-wrap text-slate-800">{selectedIncome.note || 'Aucune note'}</p></div>
              </div>
              {selectedIncome.latitude != null && selectedIncome.longitude != null && <a href={'https://www.google.com/maps?q=' + selectedIncome.latitude + ',' + selectedIncome.longitude} target="_blank" rel="noreferrer" className="block rounded-xl border border-slate-200 px-3 py-2.5 text-center text-xs font-semibold text-brand-800 hover:bg-brand-50">Voir la position sur la carte</a>}
              <AssistantShortcut label="Analyser ce revenu avec Mč" prompt={`Analyse ce revenu enregistré dans Pata : source ${selectedIncome.source || 'non précisée'}, montant ${selectedIncome.amount} FCFA, date ${selectedIncome.date || 'non précisée'}, catégorie ${selectedIncome.categoryId || 'non précisée'}. Explique son importance dans mon équilibre financier et propose des conseils concrets. Ne modifie aucune donnée.`}/>
              {selectedIncome.flowType === 'debt_borrowed' && selectedIncome.debtId ? <div className="space-y-2"><p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Cet emprunt reste un mouvement neutre. Tu peux uniquement modifier son affectation à un projet ; le montant, le créancier, l’échéance et le suivi de remboursement restent protégés.</p><Button type="button" variant="outline" className="w-full" onClick={() => openEditIncome(selectedIncome)}><Pencil size={14}/> Modifier l’affectation au projet</Button></div> : selectedIncome.neutralFlow || selectedIncome.debtId || selectedIncome.repaymentDebtId ? <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Ce mouvement est lié au suivi des Dettes & prêts. Pour préserver le solde restant et l’historique, sa modification ou sa suppression se gère dans cette rubrique.</p> : <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => openEditIncome(selectedIncome)}><Pencil size={14}/> Modifier</Button>
                <Button type="button" variant="outline" className="flex-1 border-red-200 text-red-700 hover:bg-red-50" onClick={() => { setDeleteId(selectedIncome.id); setSelectedIncome(null); }}><Trash2 size={14}/> Supprimer</Button>
              </div>}
            </div>
          );
        })()}
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} title={form.id && form.flowType === 'debt_borrowed' ? 'Affecter l’emprunt' : form.id ? 'Modifier le revenu' : 'Nouveau revenu'}>
        <form onSubmit={onSubmit} className="space-y-3">
          {form.id && form.flowType === 'debt_borrowed' ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Emprunt enregistré · informations protégées</p>
                <p className="mt-2 text-xl font-bold text-slate-900">{formatCurrency(Number(form.amount) || 0)}</p>
                <p className="mt-1 text-sm font-semibold text-slate-700">{form.source}</p>
                <p className="mt-1 text-xs text-slate-500">Échéance : {form.dueDate ? formatDate(form.dueDate) : 'Non précisée'}</p>
              </div>
              {isPremium ? <div><label className="mb-1 block text-sm font-medium text-slate-700">Affecter cet emprunt à un projet</label><select value={form.projectId || ''} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Aucun projet — fonds non affectés</option>{projects.filter((item) => item.status === 'active').map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><p className="mt-1 text-[11px] leading-4 text-slate-500">L’affectation réserve cet emprunt au projet choisi sans le transformer en revenu ordinaire.</p></div> : <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">L’affectation à un projet nécessite Pata Premium. Les informations de l’emprunt restent inchangées.</p>}
            </div>
          ) : (
            <>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Type d’opération</label><select value={form.flowType || 'normal'} disabled={!!form.id} onChange={(event) => { const flowType = event.target.value; const categoryId = flowType === 'debt_borrowed' ? 'debt_borrowed' : flowType === 'repayment_received' ? 'debt_repayment_received' : 'salary'; setForm({ ...form, flowType, categoryId, repaymentDebtId: flowType === 'repayment_received' ? form.repaymentDebtId : '', projectId: '', person: '', bankName: '', bankChoice: '', bankCustomName: '', counterpartyUid: '', counterpartyType: 'person' }); }} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="normal">Revenu normal</option><option value="debt_borrowed">Dette contractée (argent emprunté)</option><option value="repayment_received">Remboursement reçu</option></select></div>
              {form.flowType === 'debt_borrowed' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2"><label className="mb-1 block text-sm font-medium text-slate-700">Type de créancier</label><select value={form.counterpartyType || 'person'} onChange={(event) => setForm({ ...form, counterpartyType: event.target.value, person: '', source: '', bankName: '', bankChoice: '', bankCustomName: '', counterpartyUid: '' })} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="person">Une personne physique</option><option value="bank">Une banque</option></select></div>
                {form.counterpartyType === 'bank' ? <div className="sm:col-span-2"><label className="mb-1 block text-sm font-medium text-slate-700">Banque</label><select value={form.bankChoice || ''} onChange={(event) => { const bankChoice = event.target.value; const bankName = bankChoice === '__other__' ? '' : bankChoice; setForm({ ...form, bankChoice, bankName, bankCustomName: '', person: bankName, source: bankName, counterpartyUid: '' }); }} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Choisir une banque camerounaise</option>{CAMEROON_BANKS.map((bank) => <option key={bank} value={bank}>{bank}</option>)}<option value="__other__">Autre banque — saisir son nom</option></select>{form.bankChoice === '__other__' && <div className="mt-2"><Input label="Nom de la banque" required value={form.bankCustomName || ''} onChange={(event) => setForm({ ...form, bankCustomName: event.target.value, bankName: event.target.value, person: event.target.value, source: event.target.value })}/></div>}</div> : <div className="sm:col-span-2"><DebtCounterpartyField label="Personne auprès de qui tu empruntes" value={form.person} selectedUid={form.counterpartyUid} onNameChange={(person) => setForm({ ...form, person, source: person, counterpartyUid: '' })} onSelect={(account) => setForm({ ...form, person: account.displayName, source: account.displayName, counterpartyUid: account.uid })} onContactSelect={(contact) => setForm({ ...form, person: contact.displayName, source: contact.displayName, phone: contact.phone, counterpartyUid: '' })}/></div>}
                <Input label="Téléphone (facultatif)" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })}/>
                <Input label="Date d’échéance" type="date" required value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })}/>
              </div>}
              {form.flowType === 'repayment_received' && <div><label className="mb-1 block text-sm font-medium text-slate-700">Créance remboursée</label><select required value={form.repaymentDebtId} onChange={(event) => setForm({ ...form, repaymentDebtId: event.target.value })} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Choisir une créance</option>{activeReceivableDebts.map((debt) => <option key={debt.id} value={debt.id}>{debt.person} · {formatCurrency(Number(debt.remaining) || 0)} restant</option>)}</select>{!activeReceivableDebts.length && <p className="mt-1 text-xs text-slate-500">Aucune créance active à encaisser.</p>}</div>}
              <Input label="Montant (FCFA)" type="number" min="0" step="1" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              {form.flowType === 'normal' ? <div><p className="mb-2 text-sm font-medium text-slate-700">Catégorie de revenu</p><CategoryManager type="income" value={form.categoryId} onChange={(id) => { const category = [...INCOME_CATEGORIES, ...customIncomeCategories].find((item) => item.id === id); setForm({ ...form, categoryId: id, source: category?.label || category?.name || form.source }); }}/></div> : <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Catégorie : <strong>{form.flowType === 'debt_borrowed' ? 'Dette contractée (mouvement neutre)' : 'Remboursement reçu (revenu normal)'}</strong></p>}
              {form.flowType === 'normal' && <Input label="Nom / Source" required value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />}
              <Input label="Date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              {isPremium && ['normal', 'debt_borrowed'].includes(form.flowType) && <div><label className="mb-1 block text-sm font-medium text-slate-700">{form.flowType === 'debt_borrowed' ? 'Affecter cet emprunt à un projet (facultatif)' : 'Affecter ce revenu à un projet (facultatif)'}</label><select value={form.projectId || ''} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Aucun projet — fonds non affectés</option>{projects.filter((item) => item.status === 'active').map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><p className="mt-1 text-[11px] leading-4 text-slate-500">Les fonds affectés restent réservés au projet choisi et ne sont pas proposés pour les dépenses générales.</p></div>}
              <Input label="Note (facultatif)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              <OptionalTransactionFields value={form} onChange={(next) => setForm(next)} kind="income" />
            </>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={saving}>{saving ? 'Enregistrement…' : form.id && form.flowType === 'debt_borrowed' ? 'Enregistrer l’affectation' : form.id ? 'Enregistrer les modifications' : 'Ajouter le revenu'}</Button>
        </form>
      </Modal>

      {/* 🟢 MODALE DES PRÉVISIONS AVEC CALCUL EN TEMPS RÉEL */}
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
              onChange={(e) => { setTotalBudget(e.target.value); setShowVerification(false); }} 
              required
            />
          </div>

          <p className="text-xs text-slate-500">Sélectionne tes dépenses fréquentes. Le total se calcule en direct.</p>
          
          <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2">
            {allCategories.map(k => {
              const val = vitalForm[k.id] || { amount: '', frequency: 'monthly' };
              return (
                <div key={k.id} className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                  <div className="flex items-center gap-2 mb-2">
                    <CategoryImage categoryId={k.id} image={k.image} size="sm" />
                    <p className="text-sm font-semibold text-slate-700">{k.label}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input 
                      label="Montant (FCFA)" 
                      type="number" 
                      min="0" 
                      value={val.amount} 
                      onChange={(e) => { setVitalForm({ ...vitalForm, [k.id]: { ...val, amount: e.target.value } }); setShowVerification(false); }}
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
          </div>

          {/* 🟢 TOTAL EN TEMPS RÉEL */}
          <div className={`rounded-xl p-3 text-sm border ${isDraftOverBudget ? 'bg-red-50 border-red-200' : 'bg-brand-50 border-brand-100'}`}>
            <div className="flex justify-between items-center mb-1">
              <span className="font-medium">Total prévisions (mensuel) :</span>
              <strong className={isDraftOverBudget ? 'text-red-700' : 'text-brand-800'}>{formatCurrency(draftTotalVital)}</strong>
            </div>
            {totalBudget && (
              <p className={`text-xs ${isDraftOverBudget ? 'text-red-600' : 'text-brand-600'}`}>
                {isDraftOverBudget 
                  ? `Attention, tu dépasses ton budget de ${formatCurrency(draftTotalVital - Number(totalBudget))}` 
                  : `Il te reste ${formatCurrency(Number(totalBudget) - draftTotalVital)}`}
              </p>
            )}
          </div>

          {/* 🟢 ALERTE SI ON DÉPASSE (après vérification) */}
          {showVerification && isDraftOverBudget && (
            <div className="rounded-xl border border-red-300 bg-red-100 p-3">
              <p className="text-sm font-bold text-red-800 flex items-center gap-2">
                <AlertTriangle size={16} /> Budget dépassé !
              </p>
              <p className="text-xs text-red-700 mt-1">
                Tes prévisions dépassent ton budget total de <strong>{formatCurrency(draftTotalVital - Number(totalBudget))}</strong>.
              </p>
              <p className="text-xs text-red-700 mt-1">
                <strong>Suggestion :</strong> Essaie de réduire les loisirs, les sorties, ou les "autres dépenses" pour rentrer dans ton budget.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Button 
              type="button" 
              variant="outline"
              onClick={() => setShowVerification(true)}
              className="flex-1"
            >
              Vérifier le budget
            </Button>
            <Button 
              type="submit" 
              className="flex-1" 
              disabled={savingVital || (showVerification && isDraftOverBudget)}
            >
              {savingVital ? 'Enregistrement...' : (showVerification && isDraftOverBudget ? 'Corrige d\'abord' : 'Enregistrer')}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Supprimer ce revenu ?" message="Cette action est irréversible." confirmWord="SUPPRIMER" confirmLabel="Supprimer" variant="danger" />
    </div>
  );
            }
