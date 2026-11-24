/* eslint-disable react/no-unescaped-entities */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, Trash2, Wallet, Pencil, Landmark, Calendar, Repeat, Clock3, MapPin, FolderPlus, Info, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { CategoryManager } from '@/components/ui/CategoryManager';
import { CategoryImage } from '@/components/ui/CategoryImage';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/context/LanguageContext';
import { useProfile } from '@/hooks/useProfile';
import { useProjects } from '@/hooks/useProjects';
import { createProject, updateProject, deleteProject } from '@/lib/firestore/projects';
import { useExpenses } from '@/hooks/useExpenses';
import { countExpenseOperations, getExpenseOperationKeys } from '@/lib/finance/expenseOperations.mjs';
import { useIncomes } from '@/hooks/useIncomes';
import { useDebts } from '@/hooks/useDebts';
import { ScheduledTransactionsPanel } from '@/components/transactions/ScheduledTransactionsPanel';
import { createScheduledTransaction } from '@/lib/firestore/scheduledTransactions';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { createExpense, updateExpense, deleteExpense } from '@/lib/firestore/expenses';
import { createAutomation } from '@/lib/firestore/automations';
import { formatCurrency, formatDate, resolveCategory, getFirstOfMonth, getLastOfMonth, getLocalMonth, normalizeExpenseCategoryId } from '@/lib/utils';
import { OptionalTransactionFields } from '@/components/transactions/OptionalTransactionFields';
import { DebtCounterpartyField } from '@/components/debts/DebtCounterpartyField';
import { AssistantShortcut } from '@/components/ai/AssistantShortcut';
import { checkFinancialOperation } from '@/lib/firestore/financialTargets';
import { translateText } from '@/lib/i18n/translations';
import { EXPENSE_CATEGORIES } from '@/lib/constants';
import { NextBestAction } from '@/components/NextBestAction';
import { DateRangePicker } from '@/components/layout/NativeDatePicker';
import { usePersistentPageState } from '@/hooks/usePersistentPageState';

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
  expenseType: 'consumption',
  projectId: '',
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
  flowType: 'normal', person: '', phone: '', dueDate: '', repaymentDebtId: '', counterpartyUid: '',
  scheduleEnabled: false, recurrenceEnabled: false, scheduleFrequency: 'monthly', futureIncomeSourceName: '',
});

export default function ExpensesPage() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const t = (value) => translateText(value, language);
  const { profile } = useProfile();
  const { projects } = useProjects();
  const [projectFinancials, setProjectFinancials] = useState({});
  const premiumDate = profile?.premiumUntil?.toDate ? profile.premiumUntil.toDate() : new Date(profile?.premiumUntil || 0);
  const isPremium = Number.isFinite(premiumDate.getTime()) && premiumDate > new Date();
  const expenseMonthKey = getLocalMonth();
  const expenseMonthlyStats = profile?.monthlyStats || {};
  const usedExpenseQuota = expenseMonthlyStats.lastResetMonth === expenseMonthKey
    ? Math.max(0, Number(expenseMonthlyStats.expenses) || 0)
    : 0;
  const expenseFreeLimit = 60;
  const expenseQuotaReached = !isPremium && usedExpenseQuota >= expenseFreeLimit;
  const showExpenseQuota = !isPremium && usedExpenseQuota >= 48;
  const { incomes, balancesReady } = useIncomes();
  const { debts } = useDebts();
  const activePayableDebts = debts.filter((debt) => debt.type === 'i_owe' && ['active', 'partial', 'late'].includes(debt.status) && Number(debt.remaining) > 0);
  const { customCategories } = useCustomCategories('expense');
  
  const [showCustomPeriod, setShowCustomPeriod] = usePersistentPageState('expenses', 'showCustomPeriod', false, user?.uid);
  const [customStart, setCustomStart] = usePersistentPageState('expenses', 'customStart', getFirstOfMonth(), user?.uid);
  const [customEnd, setCustomEnd] = usePersistentPageState('expenses', 'customEnd', todayIso(), user?.uid);
  
  const [filterCategory, setFilterCategory] = usePersistentPageState('expenses', 'filterCategory', 'all', user?.uid);
  const [filterType, setFilterType] = usePersistentPageState('expenses', 'filterType', 'all', user?.uid);
  const [filterSort, setFilterSort] = usePersistentPageState('expenses', 'filterSort', 'date_desc', user?.uid);
  const [filterSearch, setFilterSearch] = usePersistentPageState('expenses', 'filterSearch', '', user?.uid);
  const [filterPaymentMethod, setFilterPaymentMethod] = usePersistentPageState('expenses', 'filterPaymentMethod', 'all', user?.uid);
  const [filterIncomeSource, setFilterIncomeSource] = usePersistentPageState('expenses', 'filterIncomeSource', 'all', user?.uid);
  const [filterMinAmount, setFilterMinAmount] = usePersistentPageState('expenses', 'filterMinAmount', '', user?.uid);
  const [filterMaxAmount, setFilterMaxAmount] = usePersistentPageState('expenses', 'filterMaxAmount', '', user?.uid);
  const [form, setForm] = usePersistentPageState('expenses', 'form', emptyForm(), user?.uid);
  const [showTypeHelp, setShowTypeHelp] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: '', description: '', targetAmount: '' });
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [projectActionId, setProjectActionId] = useState('');
  const [projectActionError, setProjectActionError] = useState('');
  const [showCompletedProjects, setShowCompletedProjects] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [projectDeleteMode, setProjectDeleteMode] = useState('detach');
  const [projectDeleting, setProjectDeleting] = useState(false);
  const [open, setOpen] = usePersistentPageState('expenses', 'editorOpen', false, user?.uid);
  const [recoveryChecklistOpen, setRecoveryChecklistOpen] = useState(false);
  const [recoveryChecks, setRecoveryChecks] = useState([false, false, false, false]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [selectedExpense, setSelectedExpense] = usePersistentPageState('expenses', 'selectedExpense', null, user?.uid);
  const [recurringExpense, setRecurringExpense] = useState(null);
  const [recurringFrequency, setRecurringFrequency] = useState('daily');
  const [recurringSaving, setRecurringSaving] = useState(false);
  const [recurringError, setRecurringError] = useState('');
  const [nextAction, setNextAction] = useState(null);

  useEffect(() => {
    const openFromShortcut = () => { setForm(emptyForm()); setError(''); setOpen(true); };
    window.addEventListener('pata:expense-new', openFromShortcut);
    const params = new URLSearchParams(searchParams.toString());
    if (searchParams.get('recovery') === '1') {
      setRecoveryChecks([false, false, false, false]);
      setRecoveryChecklistOpen(true);
    }
    if (searchParams.get('new') === '1') {
      const flowType = params.get('flowType') || 'normal';
      const incomeSourceId = params.get('incomeSourceId') || '';
      const incomeSourceName = params.get('incomeSourceName') || 'Tous les revenus';
      const validIncomeSourceId = incomeSourceId && !incomeSourceId.includes('/') && incomeSourceId !== 'all' ? incomeSourceId : 'all';
      setForm({
        ...emptyForm(),
        flowType: ['loan_given', 'repayment'].includes(flowType) ? flowType : 'normal',
        repaymentDebtId: params.get('debtId') || '',
        categoryId: flowType === 'loan_given' ? 'loan_given' : flowType === 'repayment' ? 'debt_repayment' : 'food',
        incomeSourceId: validIncomeSourceId,
        incomeSourceName: validIncomeSourceId !== 'all' ? incomeSourceName : 'Tous les revenus',
      });
      setError(''); setOpen(true);
    }
    if (params.has('new') || params.has('recovery')) {
      params.delete('new');
      params.delete('recovery');
      params.delete('incomeSourceId');
      params.delete('incomeSourceName');
      const remaining = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (remaining ? '?' + remaining : ''));
    }
    return () => window.removeEventListener('pata:expense-new', openFromShortcut);
  }, [searchParams]);

  const projectIdSignature = projects.map((project) => project.id).filter(Boolean).sort().join('|');
  useEffect(() => {
    let active = true;
    if (!user?.uid || !projectIdSignature) {
      setProjectFinancials({});
      return () => { active = false; };
    }
    const loadProjectFinancials = async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/projects/financial-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ projectIds: projectIdSignature.split('|') }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de charger les totaux des projets.');
        if (!active) return;
        setProjectFinancials(Object.fromEntries((result.summaries || []).map((item) => [item.projectId, item])));
      } catch (error) {
        console.warn('[PATA PROJECT SUMMARY]', error.message || error);
        if (active) setProjectFinancials({});
      }
    };
    loadProjectFinancials();
    return () => { active = false; };
  }, [user, projectIdSignature]);

  const startDate = showCustomPeriod ? customStart : getFirstOfMonth();
  const endDate = showCustomPeriod ? customEnd : getLastOfMonth();
  const { expenses, loading } = useExpenses({ startDate, endDate, limit: 1000 });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const highlightedId = params.get('highlight');
    if (!highlightedId || !expenses.length) return;
    const match = expenses.find((item) => item.id === highlightedId);
    if (match) setSelectedExpense(match);
    params.delete('highlight');
    const query = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : ''));
  }, [expenses]);

  const incomesWithBalance = useMemo(() => incomes.map((income) => {
    const balanceAvailable = income.balanceAvailable === true;
    const spent = balanceAvailable ? Math.max(0, Number(income.spent) || 0) : null;
    const remaining = balanceAvailable ? Math.max(0, Number(income.remaining) || 0) : null;
    return {
      ...income,
      spent,
      remaining,
      balanceAvailable,
      isExhausted: balanceAvailable && remaining <= 0 && spent > 0,
    };
  }), [incomes]);

  const totalGlobalBalance = useMemo(
    () => balancesReady && incomesWithBalance.every((income) => income.balanceAvailable)
      ? incomesWithBalance.filter((income) => !income.neutralFlow || (income.flowType === 'debt_borrowed' && income.availableAsFunding === true))
        .reduce((sum, income) => sum + income.remaining, 0)
      : null,
    [balancesReady, incomesWithBalance]
  );

  const sortedIncomesForSelect = useMemo(() => {
    return [...incomesWithBalance].sort((a, b) => {
      if (a.isExhausted && !b.isExhausted) return 1;
      if (!a.isExhausted && b.isExhausted) return -1;
      return new Date(b.date) - new Date(a.date);
    });
  }, [incomesWithBalance]);

  const filtered = useMemo(() => {
    const search = filterSearch.trim().toLocaleLowerCase();
    const minimum = filterMinAmount === '' ? null : Number(filterMinAmount);
    const maximum = filterMaxAmount === '' ? null : Number(filterMaxAmount);
    const rows = expenses
      .filter((item) => item.date >= startDate && item.date <= endDate)
      .filter((item) => filterCategory === 'all' || normalizeExpenseCategoryId(item.categoryId) === filterCategory)
      .filter((item) => filterType === 'all' || (filterType === 'neutral' ? item.neutralFlow === true : !item.neutralFlow && (item.expenseType || 'consumption') === filterType))
      .filter((item) => filterPaymentMethod === 'all' || item.paymentMethod === filterPaymentMethod)
      .filter((item) => filterIncomeSource === 'all' || item.incomeSourceId === filterIncomeSource)
      .filter((item) => {
        const amount = Number(item.amount) || 0;
        if (minimum !== null && (!Number.isFinite(minimum) || amount < minimum)) return false;
        if (maximum !== null && (!Number.isFinite(maximum) || amount > maximum)) return false;
        if (!search) return true;
        const category = resolveCategory(item.categoryId, 'expense', customCategories);
        const searchableText = [item.note, item.details, item.locationLabel, item.incomeSourceName, item.person, category?.label, category?.name]
          .filter(Boolean).join(' ').toLocaleLowerCase();
        return searchableText.includes(search);
      });
    rows.sort((a, b) => {
      if (filterSort === 'date_asc') return String(a.date || '').localeCompare(String(b.date || ''));
      if (filterSort === 'amount_desc') return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      if (filterSort === 'amount_asc') return (Number(a.amount) || 0) - (Number(b.amount) || 0);
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
    return rows;
  }, [expenses, startDate, endDate, filterCategory, filterType, filterSort, filterSearch, filterPaymentMethod, filterIncomeSource, filterMinAmount, filterMaxAmount, customCategories]);

  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach((e) => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return Object.entries(map).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [filtered]);

  const periodExpenseRows = expenses.filter((expense) =>
    !expense.neutralFlow && expense.date >= startDate && expense.date <= endDate
  );
  const total = periodExpenseRows.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  const expenseDays = new Set(periodExpenseRows.map((expense) => String(expense.date || '').slice(0, 10)).filter(Boolean)).size;
  const expenseOperations = countExpenseOperations(periodExpenseRows);
  const typeTotals = useMemo(() => expenses
    .filter((e) => !e.neutralFlow && e.date >= startDate && e.date <= endDate)
    .reduce((totals, e) => {
      const type = ['consumption', 'project', 'savings', 'investment'].includes(e.expenseType) ? e.expenseType : 'consumption';
      totals[type] += Number(e.amount) || 0;
      return totals;
    }, { consumption: 0, project: 0, savings: 0, investment: 0 }), [expenses, startDate, endDate]);
  const projectTotals = useMemo(() => projects.map((project) => {
    const summary = projectFinancials[project.id] || {};
    const income = Math.max(0, Number(summary.income) || 0);
    const borrowedFunding = Math.max(0, Number(summary.borrowedFunding) || 0);
    return {
      ...project,
      spent: Math.max(0, Number(summary.spent) || 0),
      income,
      borrowedFunding,
      totalFunding: income + borrowedFunding,
    };
  }), [projects, projectFinancials]);
  const activeProjects = projectTotals.filter((project) => project.status !== 'completed' && project.status !== 'archived');
  const completedProjects = projectTotals.filter((project) => project.status === 'completed' || project.status === 'archived');
  const displayedProjects = showCompletedProjects ? [...activeProjects, ...completedProjects] : activeProjects;
  const eligibleIncomesForExpense = sortedIncomesForSelect.filter((income) =>
    income.balanceAvailable
    && (!income.neutralFlow || (income.flowType === 'debt_borrowed' && income.availableAsFunding === true))
    && (!income.projectId || income.projectId === (form.expenseType === 'project' ? form.projectId : ''))
  );

  const openNew = () => {
    setForm(emptyForm());
    setError('');
    setOpen(true);
  };

  const openEdit = useCallback((exp) => {
    const operationKeys = getExpenseOperationKeys(expenses);
    const rowIndex = expenses.findIndex((item) => item.id === exp?.id);
    const parentId = rowIndex >= 0 ? operationKeys[rowIndex] : (exp?.splitFromExpenseId || exp?.sharedExpenseId || '');
    const operation = parentId ? (expenses.find((item) => item.id === parentId) || exp) : exp;
    setForm({
      id: operation.id,
      amount: String(operation.amount),
      categoryId: operation.categoryId,
      expenseType: operation.expenseType || 'consumption',
      projectId: operation.projectId || '',
      date: operation.date,
      time: operation.time || '',
      note: operation.note || '',
      locationLabel: operation.locationLabel || '',
      latitude: operation.latitude ?? null,
      longitude: operation.longitude ?? null,
      locationAccuracy: operation.locationAccuracy ?? null,
      paymentMethod: operation.paymentMethod || '',
      details: operation.details || '',
      incomeSourceId: operation.incomeSourceId || 'all',
      incomeSourceName: operation.incomeSourceName || 'Tous les revenus',
      futureIncomeSourceName: operation.pendingIncomeSourceName || '',
      flowType: operation.flowType || 'normal', person: operation.person || '', phone: operation.phone || '', dueDate: operation.dueDate || '', repaymentDebtId: operation.repaymentDebtId || '', counterpartyUid: operation.counterpartyUid || '',
    });
    setError('');
    setOpen(true);
  }, [expenses]);


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkSourceId = params.get('linkSource');
    if (!linkSourceId || !expenses.length) return;
    const pendingExpense = expenses.find((item) => item.id === linkSourceId && item.awaitingIncomeSource === true);
    if (!pendingExpense) return;
    openEdit(pendingExpense);
    setError('Cette dépense a déjà été enregistrée. Choisis maintenant la source de revenu à laquelle la rattacher, puis enregistre.');
    params.delete('linkSource');
    const query = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : ''));
  }, [expenses, openEdit]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return setError('Montant invalide.');
    if (form.flowType === 'loan_given' && (!form.person.trim() || !form.dueDate)) return setError('Indique la personne et la date d’échéance du prêt.');
    if (form.flowType === 'repayment' && !form.repaymentDebtId) return setError('Choisis la dette à rembourser.');
    if (form.flowType === 'normal' && form.expenseType === 'project' && (!isPremium || !form.projectId)) return setError(isPremium ? 'Sélectionne un projet.' : 'La gestion des dépenses par projet nécessite Pata Premium.');
    
    setSaving(true);
    try {
      if (!form.id && !form.scheduleEnabled && form.flowType !== 'repayment' && form.expenseType !== 'project') {
        const operationType = form.flowType === 'loan_given' ? 'loan_given' : 'expense';
        try {
          const check = await checkFinancialOperation({
            operationType, amount, date: form.date, categoryId: form.categoryId,
            expenseType: form.expenseType || 'consumption',
          });
          if (check.warnings?.length) {
            const warningDetails = check.warnings.map((warning) => t(warning)).join('\n\n');
            const reminder = isEnglish
              ? 'A reminder from Pata:\n\n' + warningDetails + '\n\nYou can keep your commitment and cancel, or continue anyway. Would you like to continue?'
              : 'Petit rappel de Pata :\n\n' + warningDetails + '\n\nTu peux respecter ton engagement et annuler, ou continuer quand même. Souhaites-tu poursuivre ?';
            if (!window.confirm(reminder)) return;
          }
        } catch {
          if (!window.confirm(isEnglish ? 'Pata could not check your commitments right now. You can try again or continue without this check. Would you like to continue?' : 'Pata n’a pas pu vérifier tes engagements pour le moment. Tu peux réessayer ou continuer sans cette vérification. Souhaites-tu poursuivre ?')) return;
        }
      }
      const payload = {
        amount,
        categoryId: form.flowType === 'loan_given' ? 'loan_given' : form.flowType === 'repayment' ? 'debt_repayment' : form.categoryId,
        flowType: form.flowType || 'normal', person: form.person, phone: form.phone, dueDate: form.dueDate,
        counterpartyUid: form.counterpartyUid || '',
        repaymentDebtId: form.flowType === 'repayment' ? form.repaymentDebtId : '',
        expenseType: form.flowType === 'normal' ? (form.expenseType || 'consumption') : 'consumption',
        projectId: form.flowType === 'normal' && form.expenseType === 'project' ? form.projectId : '',
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

      if (!form.id && form.scheduleEnabled) {
        const kind = form.flowType === 'loan_given' ? 'loan_given' : form.flowType === 'repayment' ? 'debt_repayment' : 'expense';
        await createScheduledTransaction(user.uid, {
          ...payload,
          kind,
          scheduleDate: form.date,
          recurrenceEnabled: form.flowType === 'normal' && form.recurrenceEnabled === true,
          frequency: form.scheduleFrequency || 'monthly',
          futureIncomeSourceName: form.futureIncomeSourceName || '',
        });
        setOpen(false);
        setForm(emptyForm());
        return;
      }
      if (form.id) {
        let result = await updateExpense(user.uid, form.id, payload);
        if (result.confirmationRequired) {
          const accepted = window.confirm(t(`${result.message}\n\nSouhaites-tu continuer ?`));
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
        if (result.pendingConfirmation) {
          window.alert(t('Remboursement enregistré en attente. Le créancier doit confirmer la réception avant la mise à jour des deux comptes.'));
        }
        if (result.linkedDebt?.status === 'quota_reached') {
          window.alert(t('Ta dette est bien enregistrée. Le quota gratuit de 2 liaisons de comptes par mois est atteint ; elle reste suivie normalement dans ton compte.'));
        }
      }
      setOpen(false);
      setNextAction({ sequence: Date.now() });
    } catch (err) {
      setError(err.message || 'Erreur lors de l\u2019enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  const handleProjectDelete = async () => {
    if (!projectToDelete) return;
    setProjectDeleting(true); setProjectActionError('');
    try { await deleteProject(user.uid, projectToDelete.id, projectDeleteMode); setProjectToDelete(null); setProjectDeleteMode('detach'); }
    catch (err) { setProjectActionError(err.message || 'Impossible de supprimer ce projet.'); }
    finally { setProjectDeleting(false); }
  };

  const handleProjectStatusChange = async (project, status) => {
    setProjectActionId(project.id);
    setProjectActionError('');
    try {
      await updateProject(user.uid, project.id, { status });
    } catch (err) {
      setProjectActionError(err.message || 'Impossible de mettre à jour le projet.');
    } finally {
      setProjectActionId('');
    }
  };

  const handleCreateProject = async (event) => {
    event.preventDefault();
    setProjectError('');
    if (!isPremium) return setProjectError('La création de projets est réservée à Pata Premium.');
    if (!projectForm.name.trim()) return setProjectError('Donne un nom à ton projet.');
    setProjectSaving(true);
    try {
      await createProject(user.uid, {
        name: projectForm.name.trim(),
        description: projectForm.description.trim(),
        targetAmount: projectForm.targetAmount ? Number(projectForm.targetAmount) : null,
      });
      setProjectForm({ name: '', description: '', targetAmount: '' });
      setProjectModalOpen(false);
    } catch (err) {
      setProjectError(err.message || 'Impossible de créer ce projet.');
    } finally {
      setProjectSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteExpense(user.uid, deleteId);
      setDeleteId(null);
    } catch (err) {
      window.alert(t(err.message || 'Impossible de supprimer cette dépense.'));
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
      {nextAction && <NextBestAction key={nextAction.sequence} actionKey="expense-saved" title={isEnglish ? 'Expense saved' : 'Dépense enregistrée'} description={isEnglish ? 'Check what remains in the budget for this category so you can adjust your next expenses.' : 'Vérifie ce qu’il te reste dans le budget de cette catégorie pour mieux préparer tes prochaines dépenses.'} href="/budgets" cta={isEnglish ? 'View my budgets' : 'Voir mes budgets'} />}
      <div className="pata-page-heading flex flex-wrap items-center justify-between gap-3">
        <h1 className="pata-page-title text-2xl font-bold text-slate-900">Dépenses</h1>
        <div className="flex flex-wrap items-center gap-2">
          <AssistantShortcut label="Analyser mes dépenses" prompt="Analyse mes dépenses enregistrées dans Pata. Mets en évidence les catégories qui pèsent le plus, les évolutions utiles et les pistes réalistes pour mieux gérer mon argent. Ne modifie aucune opération sans me demander confirmation." promptEn="Analyze my recorded expenses in Pata. Highlight the categories that cost me the most, useful spending trends and realistic ways to manage my money better. Do not change any transaction without asking for my confirmation." />
          <Button onClick={openNew} data-pata-tour="expense-create" className="shadow-sm">
            <Plus size={16} /> Nouvelle dépense
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><p className="text-[10px] leading-4 text-slate-500">Total dépensé</p><p className="mt-1 break-words text-sm font-extrabold tabular-nums text-slate-950 sm:text-base">{formatCurrency(total)}</p></div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><p className="text-[10px] leading-4 text-slate-500">Jours actifs</p><p className="mt-1 text-sm font-extrabold tabular-nums text-slate-950 sm:text-base">{expenseDays}</p></div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><p className="text-[10px] leading-4 text-slate-500">Opérations</p><p className="mt-1 text-sm font-extrabold tabular-nums text-slate-950 sm:text-base">{expenseOperations}</p></div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Dépenses courantes', typeTotals.consumption],
          ['Projets', typeTotals.project],
          ['Épargne', typeTotals.savings],
          ['Investissements', typeTotals.investment],
        ].map(([label, amount]) => <div key={label} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2"><p className="text-[10px] leading-4 text-slate-500">{label}</p><p className="mt-1 break-words text-xs font-bold tabular-nums text-slate-900 sm:text-sm">{formatCurrency(amount)}</p></div>)}
      </div>

      {showExpenseQuota && (
        <section role="status" className={'rounded-2xl border p-3.5 ' + (expenseQuotaReached ? 'border-amber-200 bg-amber-50/90' : 'border-emerald-100 bg-white/90')}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-slate-800">{isEnglish ? 'Free expense entries this month' : 'Dépenses enregistrées ce mois-ci'}</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-600">
                {expenseQuotaReached
                  ? (isEnglish ? 'You have reached the 60 free entries for this month. Your existing expenses remain available.' : 'Tu as atteint les 60 créations gratuites de ce mois. Tes dépenses déjà enregistrées restent accessibles.')
                  : (isEnglish ? 'You are approaching your free monthly limit. Premium removes the monthly expense creation cap.' : 'Tu approches de ta limite gratuite du mois. Premium supprime le plafond mensuel de créations de dépenses.')}
              </p>
            </div>
            <span className="shrink-0 text-xs font-extrabold tabular-nums text-slate-700">{Math.min(usedExpenseQuota, expenseFreeLimit)}/{expenseFreeLimit}</span>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200/80" role="progressbar" aria-label={isEnglish ? 'Monthly free expense entries' : 'Créations de dépenses gratuites du mois'} aria-valuemin={0} aria-valuemax={expenseFreeLimit} aria-valuenow={Math.min(usedExpenseQuota, expenseFreeLimit)}>
            <div className={'h-full rounded-full transition-all ' + (expenseQuotaReached ? 'bg-amber-500' : 'bg-brand-600')} style={{ width: (Math.min(usedExpenseQuota, expenseFreeLimit) / expenseFreeLimit * 100) + '%' }} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] leading-4 text-slate-500">{expenseQuotaReached ? (isEnglish ? 'You can still view and edit existing entries.' : 'Tu peux toujours consulter et modifier tes dépenses existantes.') : (isEnglish ? 'Your free plan remains active and useful.' : 'Ton compte gratuit reste actif et continue de fonctionner normalement.')}</p>
            <Button type="button" size="sm" onClick={() => window.location.assign('/premium')}>{expenseQuotaReached ? (isEnglish ? 'Continue with Premium' : 'Continuer avec Premium') : (isEnglish ? 'Discover Premium' : 'Découvrir Premium')}</Button>
          </div>
        </section>
      )}

      <section className="pata-surface-card rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-base font-bold text-slate-900">Projets et financements</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Suis les revenus affectés, les emprunts réservés à un projet et les sorties correspondantes, sans confondre financement et revenu gagné.</p></div>
          {isPremium ? <Button onClick={() => { setProjectError(''); setProjectModalOpen(true); }} variant="outline"><FolderPlus size={15}/> Créer un projet</Button> : <a href="/premium" className="inline-flex h-10 items-center rounded-xl border border-brand-200 px-3 text-xs font-semibold text-brand-700 hover:bg-brand-50">Découvrir cette fonction Premium</a>}
        </div>
        {projectActionError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{projectActionError}</p>}
        {projectTotals.length ? <>
          {completedProjects.length > 0 && <div className="mt-4">
            <button type="button" onClick={() => setShowCompletedProjects((current) => !current)} aria-expanded={showCompletedProjects}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-brand-300 hover:text-brand-700">
              {showCompletedProjects ? 'Masquer les projets terminés' : `Afficher les projets terminés et archivés (${completedProjects.length})`}
            </button>
          </div>}
          {displayedProjects.length > 0 ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {displayedProjects.map((project) => {
            const target = Number(project.targetAmount) || 0;
            const balance = project.totalFunding - project.spent;
            const prompt = isEnglish
              ? `Analyze my Pata project "${project.name}". Estimated budget: ${target} XAF. Regular income reserved: ${project.income} XAF. Loans assigned to the project (debts to repay, not earned income): ${project.borrowedFunding} XAF. Total assigned funds: ${project.totalFunding} XAF. Related outflows: ${project.spent} XAF. Theoretical assigned balance: ${balance} XAF. Explain the progress and what I should monitor. Distinguish project outflows from everyday expenses and borrowed funds from regular income. Do not change any data.`
              : `Analyse mon projet « ${project.name} » dans Pata. Budget indicatif : ${target} FCFA. Revenus ordinaires réservés : ${project.income} FCFA. Emprunts affectés (dettes à rembourser, pas des revenus gagnés) : ${project.borrowedFunding} FCFA. Total des fonds affectés : ${project.totalFunding} FCFA. Sorties liées : ${project.spent} FCFA. Solde affecté théorique : ${balance} FCFA. Explique la progression et les points à surveiller. Distingue ces sorties des dépenses courantes et les emprunts des revenus ordinaires. Ne modifie aucune donnée.`;
            return <article key={project.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-bold text-slate-900">{project.name}</h3><p className="mt-1 line-clamp-2 text-xs text-slate-500">{project.description || 'Projet personnel'}</p><span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{project.status === 'completed' ? 'Terminé' : project.status === 'archived' ? 'Archivé' : 'En cours'}</span></div><Briefcase size={17} className="shrink-0 text-slate-400"/></div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><span className="block text-slate-500">Sorties liées</span><strong>{formatCurrency(project.spent)}</strong></div><div><span className="block text-slate-500">Revenus ordinaires</span><strong>{formatCurrency(project.income)}</strong></div><div><span className="block text-slate-500">Emprunts affectés</span><strong>{formatCurrency(project.borrowedFunding)}</strong></div><div><span className="block text-slate-500">Total financé</span><strong>{formatCurrency(project.totalFunding)}</strong></div></div>
              {target > 0 && <p className="mt-2 text-[11px] text-slate-500">Budget indicatif : {formatCurrency(target)}</p>}
              <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setProjectToDelete(project)} className="inline-flex h-9 items-center rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50">Supprimer</button><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('pata:assistant-open', { detail: { prompt } }))} className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-brand-700 hover:bg-brand-50">Analyser avec Mč</button>{isPremium && project.status === 'active' && <button type="button" onClick={() => handleProjectStatusChange(project, 'completed')} disabled={projectActionId === project.id} className="inline-flex h-9 items-center rounded-lg border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-700 disabled:opacity-50">{projectActionId === project.id ? 'Mise à jour…' : 'Marquer comme terminé'}</button>}{isPremium && project.status === 'completed' && <button type="button" onClick={() => handleProjectStatusChange(project, 'active')} disabled={projectActionId === project.id} className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 disabled:opacity-50">Réouvrir</button>}</div>
            </article>;
          })}
          </div> : <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-500">Aucun projet en cours. Les projets terminés restent accessibles depuis le bouton ci-dessus.</p>}
        </> : <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-500">Aucun projet enregistré. Crée un projet Premium pour suivre les dépenses d’une construction, d’un équipement ou d’un achat important.</p>}
      </section>

      <ScheduledTransactionsPanel kinds={['expense', 'loan_given', 'debt_repayment']} isPremium={isPremium} compact />

      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setShowCustomPeriod(false)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${!showCustomPeriod ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Ce mois</button>
          <button type="button" onClick={() => setShowCustomPeriod(true)} className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${showCustomPeriod ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}><Calendar size={14}/> Personnalisée</button>
          <span className="ml-auto text-[10px] font-medium text-slate-500">{filtered.length} résultat(s)</span>
        </div>
        {showCustomPeriod && <div className="mt-3">
          <DateRangePicker startDate={customStart} endDate={customEnd} onChange={({ startDate, endDate }) => { setCustomStart(startDate); setCustomEnd(endDate); }} language={isEnglish ? 'en' : 'fr'} />
        </div>}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input type="search" value={filterSearch} onChange={(event) => setFilterSearch(event.target.value)} placeholder="Rechercher un motif, un lieu, une source…" aria-label="Rechercher une dépense" className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-brand-400"/>
          <select value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)} aria-label="Filtrer par catégorie" className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs">
            <option value="all">Toutes les catégories</option>
            {EXPENSE_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
            {customCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select value={filterType} onChange={(event) => setFilterType(event.target.value)} aria-label="Filtrer par nature" className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs">
            <option value="all">Toutes les natures</option><option value="consumption">Dépenses courantes</option><option value="project">Projets</option><option value="savings">Épargne</option><option value="investment">Investissements</option><option value="neutral">Prêts accordés / transferts neutres</option>
          </select>
          <select value={filterSort} onChange={(event) => setFilterSort(event.target.value)} aria-label="Trier les dépenses" className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs">
            <option value="date_desc">Plus récentes</option><option value="date_asc">Plus anciennes</option><option value="amount_desc">Montant : plus élevé</option><option value="amount_asc">Montant : moins élevé</option>
          </select>
          <select value={filterPaymentMethod} onChange={(event) => setFilterPaymentMethod(event.target.value)} aria-label="Filtrer par moyen de paiement" className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs">
            <option value="all">Tous les paiements</option><option value="cash">Espèces</option><option value="mtn_momo">MTN Mobile Money</option><option value="orange_money">Orange Money</option><option value="bank_transfer">Virement bancaire</option><option value="card">Carte bancaire</option><option value="other">Autre moyen</option>
          </select>
          <select value={filterIncomeSource} onChange={(event) => setFilterIncomeSource(event.target.value)} aria-label="Filtrer par source de financement" className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs">
            <option value="all">Toutes les sources</option>
            {incomes.map((income) => <option key={income.id} value={income.id}>{income.source || 'Revenu'} </option>)}
          </select>
          <input type="number" min="0" step="1" value={filterMinAmount} onChange={(event) => setFilterMinAmount(event.target.value)} placeholder="Montant min." aria-label="Montant minimum" className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs"/>
          <input type="number" min="0" step="1" value={filterMaxAmount} onChange={(event) => setFilterMaxAmount(event.target.value)} placeholder="Montant max." aria-label="Montant maximum" className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs"/>
          <button type="button" onClick={() => { setFilterCategory('all'); setFilterType('all'); setFilterSort('date_desc'); setFilterSearch(''); setFilterPaymentMethod('all'); setFilterIncomeSource('all'); setFilterMinAmount(''); setFilterMaxAmount(''); }} className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-brand-700 hover:bg-brand-50">Réinitialiser les filtres</button>
        </div>
      </section>

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
                  {formatCurrency(items.filter((expense) => !expense.neutralFlow).reduce((s, e) => s + e.amount, 0))}
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
                          <strong className="block truncate text-sm text-slate-800">{e.cashWithdrawal ? 'Retrait Mobile Money vers espèces' : cat?.label || 'Autre'}</strong>
                          <span className="mt-0.5 block text-[10px] font-semibold text-brand-700">{e.cashWithdrawal ? 'Mouvement neutre · Transfert vers espèces' : e.neutralFlow ? 'Mouvement neutre · Prêt accordé' : e.repaymentDebtId ? 'Remboursement de dette' : ({ consumption: 'Dépense courante', project: 'Sortie de projet', savings: 'Versement d’épargne', investment: 'Investissement' })[e.expenseType || 'consumption']}{e.projectName ? ` · ${e.projectName}` : ''}</span>
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
                        {e.neutralFlow || e.debtId || e.repaymentDebtId ? <span className="px-2 text-[10px] text-slate-400">Suivi protégé</span> : <button type="button" onClick={() => openEdit(e)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Modifier la dépense" title="Modifier"><Pencil size={15}/></button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Modal open={recoveryChecklistOpen} onClose={() => setRecoveryChecklistOpen(false)} title="Vérifier les dépenses oubliées">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Parcours ces quatre points. Coche seulement ce que tu as vérifié ; Pata ne crée aucune opération automatiquement.</p>
          {[
            'Repas, boissons et achats au marché',
            'Déplacements : taxi, moto, bus ou carburant',
            'Forfaits, mégas et petits achats du quotidien',
            'Factures, paiements et autres sorties d’argent',
          ].map((label, index) => (
            <label key={label} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
              <input type="checkbox" checked={recoveryChecks[index]} onChange={(event) => setRecoveryChecks((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.checked : value))} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
              <span>{label}</span>
            </label>
          ))}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setRecoveryChecklistOpen(false)}>J’ai terminé</Button>
            <Button onClick={() => { setRecoveryChecklistOpen(false); openNew(); }}>Ajouter une dépense oubliée</Button>
          </div>
        </div>
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Modifier la dépense' : 'Nouvelle dépense'}>
        <form onSubmit={onSubmit} className="space-y-4">
          <div><label className="mb-1 block text-sm font-medium text-slate-700">Type d’opération</label><select value={form.flowType || 'normal'} disabled={!!form.id} onChange={(event) => { const flowType = event.target.value; setForm({ ...form, flowType, categoryId: flowType === 'loan_given' ? 'loan_given' : flowType === 'repayment' ? 'debt_repayment' : 'food', repaymentDebtId: flowType === 'repayment' ? form.repaymentDebtId : '', expenseType: 'consumption', projectId: '' }); }} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="normal">Dépense normale</option><option value="loan_given">Prêt accordé (on me doit)</option><option value="repayment">Remboursement d’une dette</option></select></div>
          {form.flowType === 'loan_given' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><DebtCounterpartyField label="Personne à qui tu prêtes" value={form.person} selectedUid={form.counterpartyUid} onNameChange={(person) => setForm({ ...form, person, counterpartyUid: '' })} onSelect={(account) => setForm({ ...form, person: account.displayName, counterpartyUid: account.uid })} onContactSelect={(contact) => setForm({ ...form, person: contact.displayName, phone: contact.phone, counterpartyUid: '' })}/></div><Input label="Téléphone (facultatif)" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })}/><Input label="Date d’échéance" type="date" required value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })}/></div>}
          {form.flowType === 'repayment' && <div><label className="mb-1 block text-sm font-medium text-slate-700">Dette à rembourser</label><select required value={form.repaymentDebtId} onChange={(event) => setForm({ ...form, repaymentDebtId: event.target.value })} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Choisir une dette</option>{activePayableDebts.map((debt) => <option key={debt.id} value={debt.id}>{debt.person} · {formatCurrency(Number(debt.remaining) || 0)} restant</option>)}</select>{!activePayableDebts.length && <p className="mt-1 text-xs text-slate-500">Aucune dette active à rembourser.</p>}</div>}
          <Input
            label="Montant (FCFA)"
            type="number"
            min="0"
            step="1"
            required
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          
          {form.flowType === 'normal' ? <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nature de cette sortie d’argent</label>
            <select value={form.expenseType || 'consumption'} onChange={(event) => setForm({ ...form, expenseType: event.target.value, projectId: event.target.value === 'project' ? form.projectId : '', incomeSourceId: 'all', incomeSourceName: 'Tous les revenus' })} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="consumption">Dépense courante (consommation)</option>
              <option value="project">Dépense liée à un projet</option>
              <option value="savings">Versement d’épargne</option>
              <option value="investment">Investissement</option>
            </select>
            <button type="button" onClick={() => setShowTypeHelp((value) => !value)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline"><Info size={13}/> Comprendre les différents types</button>
            {showTypeHelp && <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              <p><strong>Dépense courante :</strong> argent consommé pour le quotidien : nourriture, transport, loyer ou loisirs.</p>
              <p><strong>Projet :</strong> argent utilisé pour une réalisation identifiée : construire une maison, acheter un téléphone ou un ordinateur.</p>
              <p><strong>Épargne :</strong> argent mis de côté pour être conservé et utilisé plus tard. Il sort de ton argent disponible, mais ce n’est pas une consommation.</p>
              <p><strong>Investissement :</strong> argent affecté à un actif ou à une activité dans l’espoir d’en tirer une valeur future. Ce n’est pas une dépense courante.</p>
            </div>}
            {form.expenseType === 'project' && <div className="mt-3">
              <label className="mb-1 block text-sm font-medium text-slate-700">Projet concerné</label>
              <select required value={form.projectId || ''} onChange={(event) => setForm({ ...form, projectId: event.target.value, incomeSourceId: 'all', incomeSourceName: 'Tous les revenus' })} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                <option value="">Choisir un projet</option>
                {projects.filter((item) => item.status === 'active').map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              {!isPremium && <p className="mt-1 text-xs text-amber-700">La création et l’association de projets nécessitent Pata Premium.</p>}
              {isPremium && !projects.length && <p className="mt-1 text-xs text-slate-500">Crée d’abord un projet dans la rubrique ci-dessus.</p>}
            </div>}
          </div> : <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{form.flowType === 'loan_given' ? 'Prêt accordé : le montant diminue ton solde disponible, mais ne constitue pas une dépense budgétaire.' : 'Remboursement : il reste une dépense normale et peut être suivi dans tes budgets.'}</p>}

          {form.flowType === 'normal' ? <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Catégorie</p>
            <CategoryManager type="expense" value={form.categoryId} onChange={(id) => setForm({ ...form, categoryId: id })}/>
          </div> : <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Catégorie : <strong>{form.flowType === 'loan_given' ? 'Prêt accordé (mouvement neutre)' : 'Remboursement de dette (dépense normale)'}</strong></p>}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">D'où vient cet argent ?</label>
            {!balancesReady && <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">Les soldes des revenus ne sont pas encore vérifiés. Les sources individuelles seront affichées dès que le calcul sera disponible ; Pata vérifiera toujours les fonds avant d’enregistrer la dépense.</p>}
            <select
              value={form.incomeSourceId}
              onChange={(e) => {
                const selectedId = e.target.value;
                const selectedInc = incomesWithBalance.find(i => i.id === selectedId);
                setForm({ 
                  ...form, 
                  incomeSourceId: selectedId, 
                  incomeSourceName: selectedInc ? selectedInc.source : selectedId === 'future' ? '' : 'Tous les revenus',
                  futureIncomeSourceName: selectedId === 'future' ? form.futureIncomeSourceName : '',
                });
              }}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              {/* 🟢 AFFICHAGE DU VRAI SOLDE TOTAL */}
              <option value="all">Toutes les sources disponibles ({balancesReady ? formatCurrency(eligibleIncomesForExpense.reduce((sum, income) => sum + income.remaining, 0)) : 'solde indisponible'})</option>
              {form.scheduleEnabled && form.flowType === 'normal' && <option value="future">Source de revenu future — à relier ensuite</option>}
              {String(form.incomeSourceId || '').startsWith('pending_source_') && <option value={form.incomeSourceId} disabled>À relier : {form.futureIncomeSourceName || 'source future'}</option>}
              {eligibleIncomesForExpense.map((inc) => (
                <option 
                  key={inc.id} 
                  value={inc.id}
                  disabled={inc.isExhausted && form.incomeSourceId !== inc.id}
                  className={inc.isExhausted ? 'text-slate-400' : ''}
                >
                  {inc.cashPocket ? 'Espèces · ' + (inc.cashPocketProvider === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money') : inc.flowType === 'debt_borrowed' ? 'Emprunt reçu · ' + (inc.source || inc.person || 'Créancier') : inc.source} ({formatCurrency(inc.remaining)} restant) {inc.isExhausted ? '— Épuisé' : ''}
                </option>
              ))}
            </select>
            {form.scheduleEnabled && form.incomeSourceId === 'future' && <Input label="Nom de la future source de revenu" value={form.futureIncomeSourceName || ''} onChange={(event) => setForm({ ...form, futureIncomeSourceName: event.target.value })} placeholder="Ex. Salaire de décembre, contrat KDO…" required />}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Input
              label={form.scheduleEnabled ? 'Date prévue de l’opération' : 'Date'}
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

          <div className="rounded-xl border border-slate-200 p-3">
            <label className="flex cursor-pointer items-start gap-2 text-sm font-semibold text-slate-800">
              <input type="checkbox" checked={form.scheduleEnabled === true} disabled={!isPremium} onChange={(event) => setForm({ ...form, scheduleEnabled: event.target.checked, incomeSourceId: !event.target.checked && form.incomeSourceId === 'future' ? 'all' : form.incomeSourceId, incomeSourceName: !event.target.checked && form.incomeSourceId === 'future' ? 'Tous les revenus' : form.incomeSourceName })} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"/>
              <span>Programmer cette opération pour une date future</span>
            </label>
            {!isPremium && <p className="mt-2 text-xs leading-5 text-slate-500">Cette fonctionnalité est réservée à Pata Premium. <a href="/premium" className="font-semibold text-brand-700 underline">Découvrir Premium</a></p>}
            {form.scheduleEnabled && <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
              <p className="text-xs leading-5 text-slate-500">La dépense ne sera ajoutée à tes comptes qu’à la date prévue. Tu peux aussi automatiser sa répétition.</p>
              {form.flowType === 'normal' && <>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700"><input type="checkbox" checked={form.recurrenceEnabled === true} onChange={(event) => setForm({ ...form, recurrenceEnabled: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600"/>Rendre cette dépense récurrente</label>
                {form.recurrenceEnabled && <select value={form.scheduleFrequency || 'monthly'} onChange={(event) => setForm({ ...form, scheduleFrequency: event.target.value })} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="daily">Tous les jours</option><option value="weekly">Chaque semaine</option><option value="monthly">Chaque mois</option></select>}
              </>}
              {form.flowType !== 'normal' && <p className="text-xs text-slate-500">Les prêts et remboursements programmés sont exécutés une seule fois à la date choisie.</p>}
            </div>}
          </div>
          <OptionalTransactionFields value={form} onChange={(next) => setForm(next)} kind="expense" />
          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Enregistrement…' : form.id ? 'Mettre à jour' : 'Ajouter'}
          </Button>
        </form>
      </Modal>

      <Modal open={!!projectToDelete} onClose={() => { if (!projectDeleting) { setProjectToDelete(null); setProjectDeleteMode('detach'); } }} title="Supprimer ce projet">
        {projectToDelete && <div className="space-y-4">
          <p className="text-sm leading-5 text-slate-600">Tu vas supprimer « {projectToDelete.name} ». Que souhaites-tu faire des opérations associées ?</p>
          <label className="flex cursor-pointer gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><input type="radio" name="project-delete-mode" checked={projectDeleteMode === 'detach'} onChange={() => setProjectDeleteMode('detach')} className="mt-1"/><span><strong className="block text-sm text-emerald-900">Détacher les opérations (recommandé)</strong><span className="mt-1 block text-xs leading-5 text-emerald-800">Les opérations restent dans l’historique et perdent simplement le lien avec le projet.</span></span></label>
          <label className="flex cursor-pointer gap-3 rounded-xl border border-red-200 bg-red-50 p-3"><input type="radio" name="project-delete-mode" checked={projectDeleteMode === 'delete'} onChange={() => setProjectDeleteMode('delete')} className="mt-1"/><span><strong className="block text-sm text-red-900">Supprimer aussi les opérations liées</strong><span className="mt-1 block text-xs leading-5 text-red-800">Les revenus et dépenses associés seront supprimés définitivement.</span></span></label>
          <div className="flex gap-2"><Button type="button" variant="outline" className="flex-1" disabled={projectDeleting} onClick={() => { setProjectToDelete(null); setProjectDeleteMode('detach'); }}>Annuler</Button><Button type="button" className="flex-1" disabled={projectDeleting} onClick={handleProjectDelete}>{projectDeleting ? 'Suppression…' : 'Confirmer la suppression'}</Button></div>
        </div>}
      </Modal>

      <Modal open={projectModalOpen} onClose={() => setProjectModalOpen(false)} title="Créer un projet">
        <form onSubmit={handleCreateProject} className="space-y-3">
          <Input label="Nom du projet" required maxLength={100} value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} placeholder="Ex. Construction de ma maison"/>
          <div><label className="mb-1 block text-sm font-medium text-slate-700">Description (facultatif)</label><textarea value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} maxLength={500} rows={3} className="w-full rounded-lg border border-slate-300 p-3 text-sm" placeholder="Décris ce que tu souhaites réaliser."/></div>
          <Input label="Budget indicatif (FCFA, facultatif)" type="number" min="0" step="1" value={projectForm.targetAmount} onChange={(e) => setProjectForm({ ...projectForm, targetAmount: e.target.value })} placeholder="Ex. 2500000"/>
          {projectError && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{projectError}</p>}
          <Button type="submit" className="w-full" disabled={projectSaving}>{projectSaving ? 'Création…' : 'Créer le projet'}</Button>
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
              <AssistantShortcut label="Analyser cette dépense avec Mč" prompt={`Analyse cette dépense dans Pata : ${selectedExpense.amount} FCFA, catégorie ${category?.label || selectedExpense.categoryId}, date ${selectedExpense.date || 'non précisée'}, lieu ${selectedExpense.locationLabel || 'non renseigné'}, note ${selectedExpense.note || 'aucune'}. Explique son impact sur mon budget et donne un conseil concret sans modifier mes données.`} promptEn={`Analyze this expense in Pata: ${selectedExpense.amount} XAF, category ${category?.label || selectedExpense.categoryId}, date ${selectedExpense.date || 'not specified'}, location ${selectedExpense.locationLabel || 'not provided'}, note ${selectedExpense.note || 'none'}. Explain its impact on my budget and give me one practical recommendation without changing any data.`}/>
              {selectedExpense.cashWithdrawal ? <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Ce mouvement a transféré de l’argent du portefeuille Mobile Money vers ta poche espèces. Il est neutre : il ne représente ni une consommation ni une dépense budgétaire. Les dépenses ultérieures payées en espèces doivent être rattachées à la source Espèces.</p> : selectedExpense.neutralFlow || selectedExpense.debtId || selectedExpense.repaymentDebtId ? <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Ce mouvement est lié au module Dettes & prêts. Sa modification et sa suppression sont protégées pour conserver le solde et l’historique des remboursements.</p> : <><div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => { setSelectedExpense(null); openEdit(selectedExpense); }}><Pencil size={14}/> Modifier</Button>
                <Button type="button" variant="outline" onClick={() => { setDeleteId(selectedExpense.id); setSelectedExpense(null); }} className="border-red-200 text-red-700 hover:bg-red-50"><Trash2 size={14}/> Supprimer</Button>
              </div>
              <Button type="button" className="w-full" onClick={() => { setRecurringExpense(selectedExpense); setRecurringFrequency('daily'); setRecurringError(''); setSelectedExpense(null); }}><Repeat size={14}/> Rendre récurrente</Button></>}
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
              const prompt = isEnglish
                ? `I am considering making this expense recurring. Amount: ${recurringExpense.amount} XAF. Category: ${recurringExpense.categoryId}. Note: ${recurringExpense.note || 'none'}. Selected frequency: ${recurringFrequency}. Explain the benefits, the risk of insufficient funds and how to change or stop the schedule. Do not create anything without my approval.`
                : `Je souhaite rendre cette dépense récurrente. Montant : ${recurringExpense.amount} FCFA. Catégorie : ${recurringExpense.categoryId}. Note : ${recurringExpense.note || 'aucune'}. Fréquence choisie : ${recurringFrequency}. Explique les avantages, les risques de solde insuffisant et comment modifier ou arrêter cette programmation. Ne crée rien sans mon accord.`;
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
