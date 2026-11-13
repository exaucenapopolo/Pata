/* eslint-disable react/no-unescaped-entities */
'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { useIncomes } from '@/hooks/useIncomes';
import { useDebts } from '@/hooks/useDebts';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { createExpense, updateExpense, deleteExpense } from '@/lib/firestore/expenses';
import { createAutomation } from '@/lib/firestore/automations';
import { formatCurrency, formatDate, resolveCategory, getFirstOfMonth, getLastOfMonth, getLocalMonth, normalizeExpenseCategoryId } from '@/lib/utils';
import { OptionalTransactionFields } from '@/components/transactions/OptionalTransactionFields';
import { DebtCounterpartyField } from '@/components/debts/DebtCounterpartyField';
import { AssistantShortcut } from '@/components/ai/AssistantShortcut';
import { checkFinancialOperation } from '@/lib/firestore/financialTargets';
import { translateText } from '@/lib/i18n/translations';

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
});

export default function ExpensesPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const t = (value) => translateText(value, language);
  const { profile } = useProfile();
  const { projects } = useProjects();
  const [projectFinancials, setProjectFinancials] = useState({});
  const premiumDate = profile?.premiumUntil?.toDate ? profile.premiumUntil.toDate() : new Date(profile?.premiumUntil || 0);
  const isPremium = Number.isFinite(premiumDate.getTime()) && premiumDate > new Date();
  const { incomes } = useIncomes();
  const { debts } = useDebts();
  const activePayableDebts = debts.filter((debt) => debt.type === 'i_owe' && ['active', 'partial', 'late'].includes(debt.status) && Number(debt.remaining) > 0);
  const { customCategories } = useCustomCategories('expense');
  
  const [showCustomPeriod, setShowCustomPeriod] = useState(false);
  const [customStart, setCustomStart] = useState(getFirstOfMonth());
  const [customEnd, setCustomEnd] = useState(todayIso());
  
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [form, setForm] = useState(emptyForm());
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
      const flowType = params.get('flowType') || 'normal';
      setForm({ ...emptyForm(), flowType: ['loan_given', 'repayment'].includes(flowType) ? flowType : 'normal', repaymentDebtId: params.get('debtId') || '', categoryId: flowType === 'loan_given' ? 'loan_given' : flowType === 'repayment' ? 'debt_repayment' : 'food' });
      setError(''); setOpen(true);
      window.history.replaceState(null, '', window.location.pathname);
    }
    return () => window.removeEventListener('pata:expense-new', openFromShortcut);
  }, []);

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

  const startDate = showCustomPeriod ? customStart : getFirstOfMonth();
  const endDate = showCustomPeriod ? customEnd : getLastOfMonth();
  const { expenses, loading } = useExpenses({ startDate, endDate, limit: 1000 });

  const incomesWithBalance = useMemo(() => incomes.map((income) => ({
    ...income,
    spent: Math.max(0, Number(income.spent) || 0),
    remaining: Math.max(0, Number(income.remaining) || 0),
    isExhausted: Number(income.remaining) <= 0 && Number(income.spent) > 0,
  })), [incomes]);

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
      .filter((e) => filterCategory === 'all' || normalizeExpenseCategoryId(e.categoryId) === filterCategory)
      .filter((e) => filterType === 'all' || (filterType === 'neutral' ? e.neutralFlow === true : !e.neutralFlow && (e.expenseType || 'consumption') === filterType))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [expenses, startDate, endDate, filterCategory, filterType]);

  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach((e) => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return Object.entries(map).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [filtered]);

  const total = filtered.filter((expense) => !expense.neutralFlow).reduce((s, e) => s + (e.amount || 0), 0);
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
  const eligibleIncomesForExpense = sortedIncomesForSelect.filter((income) => !income.projectId || income.projectId === (form.expenseType === 'project' ? form.projectId : ''));

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
      expenseType: exp.expenseType || 'consumption',
      projectId: exp.projectId || '',
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
      flowType: exp.flowType || 'normal', person: exp.person || '', phone: exp.phone || '', dueDate: exp.dueDate || '', repaymentDebtId: exp.repaymentDebtId || '', counterpartyUid: exp.counterpartyUid || '',
    });
    setError('');
    setOpen(true);
  };

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
      if (!form.id && form.flowType !== 'repayment' && form.expenseType !== 'project') {
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dépenses</h1>
          <p className="text-sm text-slate-500">
            Total des dépenses comptabilisées (hors prêts accordés) : <span className="font-semibold text-slate-800">{formatCurrency(total)}</span>
          </p>
          <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">
            Enregistre tes sorties d’argent, retrouve-les par date ou catégorie et repère les postes qui pèsent sur ton budget.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AssistantShortcut label="Analyser mes dépenses" prompt="Analyse mes dépenses enregistrées dans Pata. Mets en évidence les catégories qui pèsent le plus, les évolutions utiles et les pistes réalistes pour mieux gérer mon argent. Ne modifie aucune opération sans me demander confirmation." promptEn="Analyze my recorded expenses in Pata. Highlight the categories that cost me the most, useful spending trends and realistic ways to manage my money better. Do not change any transaction without asking for my confirmation." />
          <Button onClick={openNew} className="shadow-sm">
            <Plus size={16} /> Nouvelle dépense
          </Button>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
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

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Dépenses courantes', typeTotals.consumption],
          ['Projets', typeTotals.project],
          ['Épargne', typeTotals.savings],
          ['Investissements', typeTotals.investment],
        ].map(([label, amount]) => <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"><p className="text-[11px] text-slate-500">{label}</p><p className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(amount)}</p></div>)}
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

        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm">
          <option value="all">Toutes les natures</option>
          <option value="consumption">Dépenses courantes</option>
          <option value="project">Projets</option>
          <option value="savings">Épargne</option>
          <option value="investment">Investissements</option>
          <option value="neutral">Prêts accordés (mouvements neutres)</option>
        </select>
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
              <option value="all">Toutes les sources disponibles ({formatCurrency(eligibleIncomesForExpense.reduce((sum, income) => sum + income.remaining, 0))})</option>
              {eligibleIncomesForExpense.map((inc) => (
                <option 
                  key={inc.id} 
                  value={inc.id}
                  disabled={inc.isExhausted && form.incomeSourceId !== inc.id}
                  className={inc.isExhausted ? 'text-slate-400' : ''}
                >
                  {inc.cashPocket ? 'Espèces · ' + (inc.cashPocketProvider === 'mtn_momo' ? 'MTN MoMo' : 'Orange Money') : inc.source} ({formatCurrency(inc.remaining)} restant) {inc.isExhausted ? '— Épuisé' : ''}
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
