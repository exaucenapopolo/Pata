/* eslint-disable react/no-unescaped-entities */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PiggyBank, Pencil, Landmark, ChevronRight, MessageCircle, BookmarkPlus, Trash2, Layers3, Pin, Plus } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Button } from '@/components/ui/Button';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { useLanguage } from '@/context/LanguageContext';
import { translateText } from '@/lib/i18n/translations';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useBudgets } from '@/hooks/useBudgets';
import { useExpenses } from '@/hooks/useExpenses';
import { useIncomes } from '@/hooks/useIncomes';
import { upsertBudget, upsertBudgets, deleteBudget, getBudgetTemplates, saveBudgetTemplate, applyBudgetTemplate, removeBudgetTemplate, setBudgetPinned } from '@/lib/firestore/budgets';
import { saveCategoryTargets } from '@/lib/firestore/profile';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { formatCurrency, getLocalMonth, normalizeExpenseCategoryId } from '@/lib/utils';
import { buildBudgetSuggestions } from '@/lib/financialPlanning';
import { isIncomeCountedAsSource } from '@/lib/finance/incomeBalances.mjs';
import { usePersistentPageState } from '@/hooks/usePersistentPageState';
import { NextBestAction } from '@/components/NextBestAction';

const todayMonth = () => getLocalMonth();
const getMonthEndDate = (monthKey) => {
  const [year, monthNumber] = String(monthKey).split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return String(monthKey) + '-' + String(lastDay).padStart(2, '0');
};

export default function BudgetsPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const { profile } = useProfile();
  const [month, setMonth] = usePersistentPageState('budgets', 'month', todayMonth(), user?.uid);
  const [selectedIncome, setSelectedIncome] = usePersistentPageState('budgets', 'selectedIncome', 'all', user?.uid);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedMonth = params.get('month') || '';
    const requestedIncomeId = params.get('incomeId') || '';
    if (/^\d{4}-\d{2}$/.test(requestedMonth)) setMonth(requestedMonth);
    if (requestedIncomeId && !requestedIncomeId.includes('/')) setSelectedIncome(requestedIncomeId);
  }, []);

  const { incomes, loading: incomesLoading } = useIncomes();
  const { budgets, loading: budgetsLoading } = useBudgets(month, selectedIncome);
  // Même requête que la page Dépenses pour le mois courant : le listener
  // Firestore partagé évite de relire les mêmes opérations en navigation.
  const { expenses } = useExpenses({ startDate: month + '-01', endDate: getMonthEndDate(month), limit: 1000 });
  const { categories: allExpenseCategories } = useCustomCategories('expense');
  const expenseCategories = useMemo(() => allExpenseCategories.filter((category) => category.id !== 'loan_given'), [allExpenseCategories]);
  const categoryTargets = useMemo(() => (Array.isArray(profile?.categoryTargets) ? profile.categoryTargets : [])
    .filter((item) => item && typeof item.categoryId === 'string' && ['daily', 'weekly', 'monthly'].includes(item.period)
      && Number.isSafeInteger(Number(item.amount)) && Number(item.amount) > 0),
  [profile?.categoryTargets]);

  useEffect(() => {
    if (!targetCategoryId && expenseCategories[0]?.id) setTargetCategoryId(expenseCategories[0].id);
  }, [targetCategoryId, expenseCategories]);

  const [editing, setEditing] = usePersistentPageState('budgets', 'editingCategory', null, user?.uid);
  const [amount, setAmount] = usePersistentPageState('budgets', 'editAmount', '', user?.uid);
  const [saving, setSaving] = useState(false);
  const [details, setDetails] = usePersistentPageState('budgets', 'selectedDetails', null, user?.uid);
  const [saveError, setSaveError] = useState('');
  const [nextAction, setNextAction] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = usePersistentPageState('budgets', 'templateModalOpen', false, user?.uid);
  const [templateName, setTemplateName] = usePersistentPageState('budgets', 'templateName', '', user?.uid);
  const [editingTemplateId, setEditingTemplateId] = usePersistentPageState('budgets', 'editingTemplateId', null, user?.uid);
  const [templateItems, setTemplateItems] = usePersistentPageState('budgets', 'templateItems', [], user?.uid);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState('');
  const [templateMessage, setTemplateMessage] = useState('');
  const [budgetPersona, setBudgetPersona] = usePersistentPageState('budgets', 'budgetPersona', 'employee', user?.uid);
  const [applySuggestedAfterSave, setApplySuggestedAfterSave] = useState(false);
  const [createBudgetOpen, setCreateBudgetOpen] = usePersistentPageState('budgets', 'createBudgetOpen', false, user?.uid);
  const [createBudgetIncomeSourceId, setCreateBudgetIncomeSourceId] = usePersistentPageState('budgets', 'createBudgetIncomeSourceId', '', user?.uid);
  const [createBudgetItems, setCreateBudgetItems] = usePersistentPageState('budgets', 'createBudgetItems', [{ categoryId: '', amount: '' }], user?.uid);
  const [targetCategoryId, setTargetCategoryId] = usePersistentPageState('budgets', 'targetCategoryId', '', user?.uid);
  const [targetPeriod, setTargetPeriod] = usePersistentPageState('budgets', 'targetPeriod', 'monthly', user?.uid);
  const [targetAmount, setTargetAmount] = usePersistentPageState('budgets', 'targetAmount', '', user?.uid);
  const [savingTarget, setSavingTarget] = useState(false);
  const [targetMessage, setTargetMessage] = useState('');
  const [creatingBudget, setCreatingBudget] = useState(false);

  const [pinMenuId, setPinMenuId] = useState(null);
  const [pinSavingId, setPinSavingId] = useState('');
  const pinPressTimerRef = useRef(null);
  const suppressPinClickRef = useRef(false);
  const clearPinPressTimer = () => {
    if (pinPressTimerRef.current) window.clearTimeout(pinPressTimerRef.current);
    pinPressTimerRef.current = null;
  };
  const startBudgetLongPress = (event, category) => {
    if (event.target.closest('button:not([data-pin-long-press]),a,input,select,textarea')) return;
    clearPinPressTimer();
    suppressPinClickRef.current = false;
    pinPressTimerRef.current = window.setTimeout(() => {
      suppressPinClickRef.current = true;
      setPinMenuId(category.id);
    }, 900);
  };
  const openBudgetDetails = (event, category) => {
    if (suppressPinClickRef.current) { suppressPinClickRef.current = false; event.preventDefault(); return; }
    setPinMenuId(null);
    setDetails(category);
  };
  const toggleBudgetPinned = async (category) => {
    setPinSavingId(category.id);
    try {
      await setBudgetPinned(user.uid, category.budgetId, !category.isPinned);
      setPinMenuId(null);
    } catch (pinError) {
      setTemplateMessage(pinError.message || 'Impossible de modifier cet épinglage.');
    } finally { setPinSavingId(''); }
  };

  useEffect(() => {
    let active = true;
    if (!user) return () => { active = false; };
    setTemplatesLoading(true);
    getBudgetTemplates()
      .then((items) => { if (active) setTemplates(items); })
      .catch((error) => { if (active) setTemplateMessage(error.message || 'Impossible de charger les modèles.'); })
      .finally(() => { if (active) setTemplatesLoading(false); });
    return () => { active = false; };
  }, [user]);

  const monthIncomes = useMemo(() => incomes.filter(i => i.month === month), [incomes, month]);
  const budgetIncomeSources = useMemo(() => monthIncomes.filter((income) =>
    isIncomeCountedAsSource(income)
    && !income.cashPocket
    && income.flowType !== 'repayment_received'
    && income.categoryId !== 'debt_repayment_received'
    && income.balanceAvailable === true
    && Number(income.remaining) > 0
  ), [monthIncomes]);

  const monthExpenses = useMemo(() => {
    let filtered = expenses.filter((e) => !e.neutralFlow && e.date?.startsWith(month));
    // En vue globale, inclure toutes les parts des dépenses réparties entre plusieurs revenus.
    if (selectedIncome !== 'all') {
      filtered = filtered.filter(e => e.incomeSourceId === selectedIncome);
    }
    return filtered;
  }, [expenses, month, selectedIncome]);

  const spentByCategory = useMemo(() => {
    const map = {};
    monthExpenses.forEach((e) => {
      const categoryId = normalizeExpenseCategoryId(e.categoryId);
      map[categoryId] = (map[categoryId] || 0) + (e.amount || 0);
    });
    return map;
  }, [monthExpenses]);

  const enriched = useMemo(() => {
    return expenseCategories.map((c) => {
      const budget = budgets.find((b) => normalizeExpenseCategoryId(b.categoryId) === c.id);
      const spent = spentByCategory[c.id] || 0;
      const allocated = budget?.amount || 0;
      const usage = allocated > 0 ? (spent / allocated) * 100 : spent > 0 ? 100 : 0;
      return { ...c, budgetId: budget?.id, isPinned: budget?.isPinned === true, allocated, spent, usage, remaining: allocated - spent, expenses: monthExpenses.filter((expense) => normalizeExpenseCategoryId(expense.categoryId) === c.id) };
    });
  }, [budgets, spentByCategory, monthExpenses, expenseCategories]);

  const currentMonthKey = todayMonth();
  const budgetExpiry = profile?.premiumUntil?.toDate ? profile.premiumUntil.toDate() : new Date(profile?.premiumUntil || 0);
  const budgetPremium = Number.isFinite(budgetExpiry.getTime()) && budgetExpiry > new Date();
  const usedBudgetQuota = profile?.monthlyStats?.lastResetMonth === currentMonthKey ? Number(profile?.monthlyStats?.budgets) || 0 : 0;
  const budgetQuotaReached = !budgetPremium && usedBudgetQuota >= 2;

  // Ne montrer que les catégories qui possèdent réellement une enveloppe pour
  // la source sélectionnée. Les catégories à zéro restent disponibles dans
  // l’éditeur de modèles, mais ne polluent pas la vue du budget actif.
  const budgetedCategories = useMemo(
    () => enriched.filter((category) => category.budgetId && Number(category.allocated) > 0)
      .sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned))),
    [enriched]
  );

  const totalAllocated = enriched.reduce((s, c) => s + c.allocated, 0);
  const totalSpent = enriched.reduce((s, c) => s + c.spent, 0);
  const budgetRemaining = totalAllocated - totalSpent;
  const createBudgetIncome = budgetIncomeSources.find((income) => income.id === createBudgetIncomeSourceId);
  const createBudgetSelectedCategoryIds = new Set(createBudgetItems.map((item) => item.categoryId).filter(Boolean));
  const createBudgetExistingTotal = budgets.reduce((sum, budget) => sum + Math.max(0, Number(budget.amount) || 0), 0);
  const createBudgetReplacementTotal = budgets
    .filter((budget) => createBudgetSelectedCategoryIds.has(String(budget.categoryId || '')))
    .reduce((sum, budget) => sum + Math.max(0, Number(budget.amount) || 0), 0);
  const createBudgetOtherAllocated = Math.max(0, createBudgetExistingTotal - createBudgetReplacementTotal);
  const createBudgetAvailableToAllocate = Math.max(0, Number(createBudgetIncome?.remaining || 0) - createBudgetOtherAllocated);
  const createBudgetItemsTotal = createBudgetItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const spendingInsights = useMemo(
    () => enriched
      .filter((category) => Number(category.spent) > 0)
      .sort((a, b) => Number(b.spent) - Number(a.spent))
      .slice(0, 6),
    [enriched],
  );
  const highestCategorySpend = spendingInsights.length
    ? Math.max(...spendingInsights.map((category) => Number(category.spent) || 0))
    : 0;

  const persistCategoryTargets = async (nextTargets) => {
    setSavingTarget(true);
    setTargetMessage('');
    try {
      await saveCategoryTargets(user.uid, nextTargets);
      setTargetMessage(isEnglish ? 'Category target saved.' : 'Objectif de catégorie enregistré.');
    } catch (error) {
      setTargetMessage(error.message || (isEnglish ? 'Could not save this target.' : 'Impossible d’enregistrer cet objectif.'));
    } finally {
      setSavingTarget(false);
    }
  };

  const saveCategoryTarget = async (event) => {
    event.preventDefault();
    const amountValue = Number(targetAmount);
    if (!targetCategoryId || !Number.isSafeInteger(amountValue) || amountValue <= 0 || amountValue > 1000000000) {
      setTargetMessage(isEnglish ? 'Choose a category and enter a positive whole amount.' : 'Choisis une catégorie et saisis un montant entier positif.');
      return;
    }
    const nextTargets = categoryTargets.filter((item) => !(item.categoryId === targetCategoryId && item.period === targetPeriod));
    nextTargets.push({ categoryId: targetCategoryId, period: targetPeriod, amount: amountValue, updatedAt: new Date().toISOString() });
    await persistCategoryTargets(nextTargets);
    setTargetAmount('');
  };

  const removeCategoryTarget = async (target) => {
    const nextTargets = categoryTargets.filter((item) => !(item.categoryId === target.categoryId && item.period === target.period));
    await persistCategoryTargets(nextTargets);
  };

  const openEdit = (category) => {
    setEditing(category);
    setAmount(String(category.allocated || ''));
  };

  const openCreateBudget = (incomeSourceId = selectedIncome) => {
    const chosenSource = budgetIncomeSources.find((income) => income.id === incomeSourceId)
      || budgetIncomeSources[0];
    if (!chosenSource) {
      setTemplateMessage(isEnglish ? 'Add an income with a verified positive balance before creating a budget.' : 'Ajoute un revenu dont le solde restant est positif et vérifié avant de créer un budget.');
      return;
    }
    setCreateBudgetIncomeSourceId(chosenSource.id);
    setSelectedIncome(chosenSource.id);
    setCreateBudgetItems([{ categoryId: expenseCategories[0]?.id || '', amount: '' }]);
    setSaveError('');
    setCreateBudgetOpen(true);
  };

  const onCreateBudget = async (event) => {
    event.preventDefault();
    const source = budgetIncomeSources.find((income) => income.id === createBudgetIncomeSourceId);
    const normalizedItems = createBudgetItems.map((item) => ({
      categoryId: String(item.categoryId || '').trim(),
      amount: Number(item.amount),
    }));
    const categoryIds = normalizedItems.map((item) => item.categoryId);
    if (!source || source.balanceAvailable !== true || Number(source.remaining) <= 0) {
      setSaveError(isEnglish ? 'This income is no longer available. Choose another source with a positive remaining balance.' : 'Ce revenu n’est plus disponible. Choisis une autre source dont le solde restant est positif.');
      return;
    }
    if (budgetsLoading || selectedIncome !== createBudgetIncomeSourceId) {
      setSaveError(isEnglish ? 'Pata is checking the budgets already assigned to this income. Try again in a moment.' : 'Pata vérifie les budgets déjà rattachés à ce revenu. Réessaie dans un instant.');
      return;
    }
    if (!normalizedItems.length || normalizedItems.length > 30
      || normalizedItems.some((item) => !item.categoryId || !Number.isSafeInteger(item.amount) || item.amount <= 0 || item.amount > 1_000_000_000)
      || new Set(categoryIds).size !== normalizedItems.length) {
      setSaveError(isEnglish ? 'Choose a different expense category for each line and enter a valid positive amount.' : 'Choisis une catégorie différente sur chaque ligne et saisis un montant positif valide.');
      return;
    }
    const newAllocation = normalizedItems.reduce((sum, item) => sum + item.amount, 0);
    if (newAllocation > createBudgetAvailableToAllocate) {
      setSaveError(isEnglish
        ? 'These envelopes exceed the ' + formatCurrency(createBudgetAvailableToAllocate) + ' still available to allocate from this income. Reduce the amounts.'
        : 'Ces enveloppes dépassent les ' + formatCurrency(createBudgetAvailableToAllocate) + ' encore disponibles à répartir sur ce revenu. Réduis les montants pour respecter son solde.');
      return;
    }
    setCreatingBudget(true);
    setSaveError('');
    try {
      await upsertBudgets(user.uid, {
        items: normalizedItems,
        month,
        incomeSourceId: createBudgetIncomeSourceId,
      });
      setSelectedIncome(createBudgetIncomeSourceId);
      setCreateBudgetOpen(false);
      setCreateBudgetItems([{ categoryId: expenseCategories[0]?.id || '', amount: '' }]);
      setNextAction({ sequence: Date.now() });
    } catch (error) {
      setSaveError(error.message || (isEnglish ? 'Could not create this budget.' : 'Impossible de créer ce budget.'));
    } finally {
      setCreatingBudget(false);
    }
  };

  const openSuggestedBudget = () => {
    const items = buildBudgetSuggestions({ incomes, expenses, categories: expenseCategories, persona: budgetPersona, month });
    if (!items.length) {
      setTemplateMessage(isEnglish ? 'Record some income or expenses so Pata can calculate a personalized budget.' : 'Enregistre quelques revenus ou dépenses pour que Pata puisse calculer un budget personnalisé.');
      return;
    }
    const roleLabels = isEnglish ? { employee: 'employee', student: 'student', self_employed: 'self-employed', family: 'household', retired: 'retired' } : { employee: 'salarié', student: 'élève ou étudiant', self_employed: 'indépendant', family: 'foyer', retired: 'retraité' };
    setEditingTemplateId(null);
    setTemplateName((isEnglish ? 'Suggested budget — ' : 'Budget conseillé — ') + roleLabels[budgetPersona]);
    setTemplateItems(items.map((item) => ({ categoryId: item.categoryId, label: item.label, amount: String(item.amount) })));
    setTemplateMessage(isEnglish ? 'Pata has prepared an initial allocation using your history. Adjust the amounts before confirming.' : 'Pata a préparé une première répartition avec ton historique. Modifie librement les montants avant de valider.');
    setApplySuggestedAfterSave(true);
    setTemplateModalOpen(true);
  };

  const openNewTemplate = () => {
    setEditingTemplateId(null);
    setApplySuggestedAfterSave(false);
    setTemplateName('');
    // enriched contient toutes les catégories visibles du budget, y compris celles
    // dont le montant alloué et les dépenses sont à zéro.
    setTemplateItems(enriched.map((category) => ({
      categoryId: category.id,
      label: category.label,
      amount: String(Number(category.allocated) || 0),
    })));
    setTemplateMessage('');
    setTemplateModalOpen(true);
  };

  const openEditTemplate = (template) => {
    setApplySuggestedAfterSave(false);
    setEditingTemplateId(template.id);
    setTemplateName(template.name || '');
    setTemplateItems((template.items || []).map((item) => {
      const category = expenseCategories.find((candidate) => candidate.id === item.categoryId);
      return {
        categoryId: item.categoryId,
        label: category?.label || item.categoryId,
        amount: String(Number(item.amount) || 0),
      };
    }));
    setTemplateMessage('');
    setTemplateModalOpen(true);
  };

  const onSaveTemplate = async (event) => {
    event.preventDefault();
    const items = templateItems.map((item) => ({
      categoryId: item.categoryId,
      amount: Math.max(0, Math.round(Number(item.amount) || 0)),
    }));
    if (!items.length || items.some((item) => !item.categoryId)) {
      setTemplateMessage(isEnglish ? 'The template must contain at least one category.' : 'Le modèle doit contenir au moins une catégorie.');
      return;
    }
    setSavingTemplate(true);
    setTemplateMessage('');
    try {
      const savedTemplateId = await saveBudgetTemplate(templateName, items, editingTemplateId);
      setTemplates(await getBudgetTemplates());
      if (applySuggestedAfterSave && !editingTemplateId) {
        const applied = await applyBudgetTemplate(savedTemplateId, month, selectedIncome);
        setTemplateMessage(isEnglish ? `Suggested budget saved and applied to ${month}: ${applied.createdCount || 0} budget limit(s) created, ${applied.updatedCount || 0} updated. You can still adjust each amount.` : 'Budget conseillé enregistré et appliqué à ' + month + ' : ' + (applied.createdCount || 0) + ' enveloppe(s) créée(s), ' + (applied.updatedCount || 0) + ' mise(s) à jour. Tu peux encore ajuster chaque montant.');
      } else {
        setTemplateMessage(editingTemplateId
          ? (isEnglish ? 'Template updated. Previously applied versions are unchanged.' : 'Modèle mis à jour. Les versions déjà appliquées ne sont pas modifiées.')
          : (isEnglish ? 'Template saved. This creation counts toward the free plan budget limit.' : 'Modèle enregistré. Cette création compte dans le quota de budgets du compte gratuit.'));
      }
      setTemplateModalOpen(false);
      setEditingTemplateId(null);
      setApplySuggestedAfterSave(false);
    } catch (error) {
      setTemplateMessage(isEnglish ? 'Could not save this template.' : (error.message || 'Impossible d’enregistrer ce modèle.'));
    } finally {
      setSavingTemplate(false);
    }
  };

  const applyTemplate = async (template) => {
    if (!Array.isArray(template.items) || !template.items.length) return;
    const existingCount = template.items.filter((item) => budgets.some((budget) => normalizeExpenseCategoryId(budget.categoryId) === normalizeExpenseCategoryId(item.categoryId))).length;
    const confirmed = existingCount > 0
      ? window.confirm(isEnglish ? `Apply “${template.name}” to ${month}? Positive amounts will be created or updated. Categories set to zero will have their budget limit removed for this month. Other budgets will remain unchanged.` : 'Appliquer « ' + template.name + ' » à ' + month + ' ? Les montants positifs seront créés ou mis à jour. Les catégories à zéro supprimeront leur enveloppe de ce mois. Les autres budgets resteront inchangés.')
      : true;
    if (!confirmed) return;
    setApplyingTemplate(template.id);
    setTemplateMessage('');
    try {
      const result = await applyBudgetTemplate(template.id, month, selectedIncome);
      setTemplateMessage(isEnglish ? `Template applied to ${month}: ${result.createdCount || 0} budget limit(s) created, ${result.updatedCount || 0} updated, ${result.deletedCount || 0} zeroed limit(s) removed.` : 'Modèle appliqué à ' + month + ' : ' + (result.createdCount || 0) + ' enveloppe(s) créée(s), ' + (result.updatedCount || 0) + ' mise(s) à jour, ' + (result.deletedCount || 0) + ' mise(s) à zéro retirée(s).');
    } catch (error) {
      setTemplateMessage(isEnglish ? 'The template could not be applied. No partial changes were made.' : (error.message || 'Le modèle n’a pas pu être appliqué. Aucun changement partiel n’a été effectué.'));
    } finally {
      setApplyingTemplate('');
    }
  };

  const deleteTemplate = async (template) => {
    if (!window.confirm(isEnglish ? `Delete the template “${template.name}”? Budgets already applied will not be deleted.` : 'Supprimer le modèle « ' + template.name + ' » ? Cela ne supprimera aucun budget déjà appliqué.')) return;
    try {
      await removeBudgetTemplate(template.id);
      setTemplates((current) => current.filter((item) => item.id !== template.id));
      setTemplateMessage(isEnglish ? 'Template deleted. Budgets already applied have been kept.' : 'Modèle supprimé. Les budgets déjà appliqués sont conservés.');
    } catch (error) {
      setTemplateMessage(isEnglish ? 'Could not delete this template.' : (error.message || 'Impossible de supprimer ce modèle.'));
    }
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
      if (value > 0) setNextAction({ sequence: Date.now() });
      setEditing(null);
    } catch (error) {
      setSaveError(isEnglish ? 'Could not save this budget.' : (error.message || 'Impossible d’enregistrer ce budget.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {nextAction && <NextBestAction key={nextAction.sequence} actionKey="budget-saved" title={isEnglish ? 'Budget ready to follow' : 'Ton budget est prêt à être suivi'} description={isEnglish ? 'As you record expenses, Pata can compare actual spending with the amount you planned.' : 'Au fil de tes dépenses, Pata pourra comparer les montants réels à ce que tu as prévu.'} href="/expenses" cta={isEnglish ? 'View my expenses' : 'Voir mes dépenses'} />}
      <div className="pata-page-heading flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="pata-page-title text-2xl font-bold text-slate-900">Budgets</h1>
          {!budgetPremium && <p className="mt-1 text-xs text-slate-500">Créations de budgets et modèles : {usedBudgetQuota} / 2 ce mois-ci.</p>}
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button type="button" size="sm" onClick={() => openCreateBudget()} disabled={!expenseCategories.length || !budgetIncomeSources.length || budgetQuotaReached}>
            <Plus size={14}/> Créer un budget
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => {
            const prompt = isEnglish
              ? `Analyze my Pata budget for ${month}. Profile: ${budgetPersona}. Recorded income: ${monthIncomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)} XAF. Current allocation: ${enriched.map((item) => `${translateText(item.label, 'en')}: planned ${item.allocated} XAF, spent ${item.spent} XAF`).join('; ')}. Identify the categories with the highest spending, budget limits that are too high or too low, and realistic adjustments for this profile. Do not change anything without my approval.`
              : 'Analyse mon budget Pata du mois ' + month + '. Profil : ' + budgetPersona + '. Revenus enregistrés : ' + monthIncomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) + ' FCFA. Répartition actuelle : ' + enriched.map((item) => item.label + ' : prévu ' + item.allocated + ' FCFA, dépensé ' + item.spent + ' FCFA').join('; ') + '. Repère les catégories qui consomment le plus, les enveloppes trop élevées ou trop basses et propose des ajustements réalistes adaptés à ce profil. Ne modifie rien sans mon accord.';
            window.dispatchEvent(new CustomEvent('pata:assistant-open', { detail: { prompt } }));
          }}><MessageCircle size={15}/> Analyser avec l’IA</Button>
          <select value={budgetPersona} onChange={(event) => setBudgetPersona(event.target.value)} aria-label="Profil pour la proposition de budget" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs">
            <option value="employee">Salarié</option>
            <option value="student">Élève / étudiant</option>
            <option value="self_employed">Indépendant</option>
            <option value="family">Foyer / famille</option>
            <option value="retired">Retraité</option>
          </select>
          <Button type="button" variant="outline" size="sm" onClick={openSuggestedBudget} data-pata-tour="budget-plan" disabled={!enriched.length}><Layers3 size={15}/> Proposer un budget</Button>
          <Button type="button" variant="outline" size="sm" onClick={openNewTemplate} disabled={!enriched.length || (!budgetPremium && budgetQuotaReached)}><BookmarkPlus size={15}/> Enregistrer un modèle</Button>
          <MonthPicker value={month} onChange={setMonth} className="w-full sm:w-auto" />
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
      {!incomesLoading && budgetIncomeSources.length === 0 && (
        <p role="status" className="rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5 text-xs leading-5 text-slate-600">
          Aucun revenu de cette période ne possède un solde restant vérifié et positif. Pata masquera les revenus épuisés lors de la création d’un budget.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><p className="text-[10px] leading-4 text-slate-500">Alloué</p><p className="mt-1 break-words text-sm font-extrabold tabular-nums text-slate-950 sm:text-base">{formatCurrency(totalAllocated)}</p></div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><p className="text-[10px] leading-4 text-slate-500">Dépensé</p><p className="mt-1 break-words text-sm font-extrabold tabular-nums text-slate-950 sm:text-base">{formatCurrency(totalSpent)}</p></div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><p className="text-[10px] leading-4 text-slate-500">Restant</p><p className={'mt-1 break-words text-sm font-extrabold tabular-nums sm:text-base ' + (budgetRemaining < 0 ? 'text-red-700' : 'text-brand-800')}>{formatCurrency(budgetRemaining)}</p></div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><p className="text-[10px] leading-4 text-slate-500">Enveloppes actives</p><p className="mt-1 text-sm font-extrabold tabular-nums text-slate-950 sm:text-base">{budgetedCategories.length}</p></div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h2 className="text-sm font-bold text-slate-900">Objectifs par catégorie (facultatifs)</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Définis une limite quotidienne, hebdomadaire ou mensuelle pour une catégorie. C’est facultatif : Pata ne crée aucun objectif sans ton choix.</p>
        </div>
        <form onSubmit={saveCategoryTarget} className="grid gap-2 sm:grid-cols-4">
          <select value={targetCategoryId} onChange={(event) => setTargetCategoryId(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            {expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <select value={targetPeriod} onChange={(event) => setTargetPeriod(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            <option value="daily">Par jour</option><option value="weekly">Par semaine</option><option value="monthly">Par mois</option>
          </select>
          <Input type="number" min="1" step="1" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} placeholder="Montant en FCFA" />
          <Button type="submit" disabled={savingTarget || !expenseCategories.length}>{savingTarget ? 'Enregistrement…' : 'Définir l’objectif'}</Button>
        </form>
        {targetMessage && <p role="status" className="mt-2 text-xs text-slate-600">{targetMessage}</p>}
        {categoryTargets.length > 0 && <div className="mt-4 flex flex-wrap gap-2">
          {categoryTargets.map((target) => {
            const category = expenseCategories.find((item) => item.id === target.categoryId);
            return <div key={target.categoryId + ':' + target.period} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <span className="font-semibold text-slate-800">{category?.name || target.categoryId}</span>
              <span className="text-slate-600">{target.period === 'daily' ? 'jour' : target.period === 'weekly' ? 'semaine' : 'mois'} · {formatCurrency(target.amount)}</span>
              <button type="button" onClick={() => removeCategoryTarget(target)} disabled={savingTarget} className="font-semibold text-slate-500 hover:text-red-700" aria-label="Supprimer cet objectif">×</button>
            </div>;
          })}
        </div>}
      </section>

      {(templates.length > 0 || templatesLoading) && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div><h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Layers3 size={16} className="text-brand-700"/> Mes modèles de budget</h2><p className="mt-1 text-xs text-slate-500">Réutilise une répartition enregistrée sans ressaisir chaque montant.</p></div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">{templates.length}</span>
          </div>
          {templatesLoading ? <p className="py-3 text-xs text-slate-500">Chargement des modèles…</p> : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {templates.map((template) => (
                <article key={template.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{template.name}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{template.categoryCount || template.items?.length || 0} catégories · {formatCurrency((template.items || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0))}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => openEditTemplate(template)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-brand-700" aria-label={'Modifier ' + template.name} title="Modifier le modèle"><Pencil size={14}/></button>
                      <button type="button" onClick={() => deleteTemplate(template)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={'Supprimer ' + template.name} title="Supprimer le modèle"><Trash2 size={14}/></button>
                    </div>
                  </div>
                  <Button type="button" size="sm" className="mt-3 w-full" onClick={() => applyTemplate(template)} disabled={Boolean(applyingTemplate)}>{applyingTemplate === template.id ? 'Application…' : 'Appliquer à cette période'}</Button>
                </article>
              ))}
            </div>
          )}
          {templateMessage && <p role="status" className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">{templateMessage}</p>}
        </section>
      )}

      {!budgetsLoading && selectedIncome !== 'all' && budgetIncomeSources.some((income) => income.id === selectedIncome) && budgetedCategories.length === 0 && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-100 bg-[#edf6ef]/80 p-4">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">Aucun budget pour {monthIncomes.find((income) => income.id === selectedIncome)?.source || 'ce revenu'}</p>
            <p className="mt-1 text-xs text-slate-600">Crée ses enveloppes ici, sans quitter cette page.</p>
          </div>
          <Button type="button" size="sm" onClick={() => openCreateBudget(selectedIncome)} disabled={budgetQuotaReached || !budgetIncomeSources.length}>
            <Plus size={14}/> Créer son budget
          </Button>
        </section>
      )}

      {totalAllocated === 0 && selectedIncome === 'all' && (
        <EmptyState
          icon={PiggyBank}
          title="Aucun budget défini"
          description="Crée directement ici tes premières enveloppes et relie-les à une source de revenus."
        />
      )}

      {spendingInsights.length > 0 && (
        <section className="pata-surface-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold tracking-tight text-slate-900">{isEnglish ? 'Where does your money go?' : 'Où part ton argent ?'}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">{isEnglish ? 'Your highest spending categories this month.' : 'Les catégories dans lesquelles tu dépenses le plus ce mois-ci.'}</p>
            </div>
            <span className="shrink-0 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold text-emerald-800">{isEnglish ? 'TOP 6' : 'TOP 6'}</span>
          </div>
          <div className="space-y-3">
            {spendingInsights.map((category, index) => {
              const share = totalSpent > 0 ? Math.round((Number(category.spent) / totalSpent) * 100) : 0;
              const barWidth = highestCategorySpend > 0 ? Math.max(3, (Number(category.spent) / highestCategorySpend) * 100) : 0;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setDetails(category)}
                  className="group block w-full rounded-xl px-2 py-2 text-left transition hover:bg-slate-50 active:scale-[.995]"
                  aria-label={(isEnglish ? 'View spending details for ' : 'Voir les dépenses de la catégorie ') + translateText(category.label, language)}
                >
                  <span className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold" style={{ backgroundColor: (category.color || '#075b43') + '18', color: category.color || '#075b43' }}>{index + 1}</span>
                      <span className="truncate text-sm font-semibold text-slate-800">{translateText(category.label, language)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <strong className="block text-sm font-extrabold tabular-nums text-slate-900">{formatCurrency(category.spent)}</strong>
                      <span className="text-[10px] font-medium text-slate-400">{share}% {isEnglish ? 'of spending' : 'des dépenses'}</span>
                    </span>
                  </span>
                  <span className="block h-2 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full rounded-full transition-all duration-300" style={{ width: barWidth + '%', backgroundColor: category.color || '#075b43' }}/>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">{isEnglish ? 'Tap a category to open its transactions and budget details.' : 'Appuie sur une catégorie pour consulter ses opérations et les détails de son budget.'}</p>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {budgetedCategories.map((c) => (
          <Card
            key={c.id}
            onPointerDown={(event) => startBudgetLongPress(event, c)}
            onPointerUp={clearPinPressTimer}
            onPointerLeave={clearPinPressTimer}
            onPointerCancel={clearPinPressTimer}
            onContextMenu={(event) => { event.preventDefault(); suppressPinClickRef.current = true; setPinMenuId(c.id); }}
          >
            <button type="button" data-pin-long-press="true" onClick={(event) => openBudgetDetails(event, c)} className="mb-2 flex w-full items-start justify-between text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                <p className="text-sm font-semibold text-slate-800">{translateText(c.label, language)}</p>{c.isPinned && <Pin size={12} className="fill-current text-brand-600" aria-label="Épinglé"/>}
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
                  ? (isEnglish ? `${formatCurrency(Math.abs(c.remaining))} over budget` : `${formatCurrency(Math.abs(c.remaining))} dépassé`)
                  : (isEnglish ? `${formatCurrency(c.remaining)} remaining` : `${formatCurrency(c.remaining)} restant`)}
              </p>
            </div>
            <ProgressBar
              value={Math.min(100, c.usage)}
              color={c.usage > 100 ? '#ef4444' : c.usage > 80 ? '#f59e0b' : c.color}
            />
          {pinMenuId === c.id && (
              <div className="mt-3 flex justify-end border-t border-slate-100 pt-2">
                <button type="button" onClick={() => toggleBudgetPinned(c)} disabled={pinSavingId === c.id} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 text-xs font-semibold text-brand-800 disabled:opacity-50">
                  <Pin size={13} className={c.isPinned ? 'fill-current' : ''}/>{c.isPinned ? 'Désépingler' : 'Épingler'}
                </button>
              </div>
            )}
          </Card>
        ))}
      </div>

      {budgetQuotaReached && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs text-amber-800">Tu as utilisé les deux créations gratuites de budgets ou de modèles ce mois-ci. Tu peux toujours modifier tes modèles déjà enregistrés et tes enveloppes existantes.</p><Button size="sm" onClick={() => window.location.assign('/premium')}>Passer à Premium</Button></div>}

      <Modal open={templateModalOpen} onClose={() => { setTemplateModalOpen(false); setEditingTemplateId(null); }} title={editingTemplateId ? "Modifier le modèle de budget" : "Enregistrer un modèle de budget"} className="max-w-xl">
        <form onSubmit={onSaveTemplate} className="space-y-3">
          <div className="rounded-xl bg-brand-50 p-3 text-xs leading-5 text-brand-900">Toutes les catégories sont conservées, même celles dont le budget est à zéro. À l’application, un montant nul retire l’enveloppe correspondante du mois choisi. Modifier ce modèle ne change pas les budgets déjà appliqués.</div>
          <Input label="Nom du modèle" placeholder="Ex. Budget personnel mensuel" maxLength="70" required value={templateName} onChange={(event) => setTemplateName(event.target.value)}/>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
            <p className="text-xs text-slate-500">{templateItems.length} catégories conservées</p>
            <strong className="text-xs text-slate-800">Total : {formatCurrency(templateItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0))}</strong>
          </div>
          <div className="max-h-[42dvh] space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {templateItems.map((item, index) => (
              <label key={item.categoryId} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-xs font-semibold text-slate-800">{item.label || item.categoryId}</strong>
                  <span className="text-[10px] text-slate-400">{item.amount === '0' || Number(item.amount) === 0 ? 'Aucune enveloppe' : 'Montant prévu'}</span>
                </span>
                <span className="w-32 shrink-0">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={item.amount}
                    onChange={(event) => setTemplateItems((current) => current.map((value, itemIndex) => itemIndex === index ? { ...value, amount: event.target.value } : value))}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-right text-sm font-semibold text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    aria-label={'Budget ' + item.label}
                  />
                </span>
              </label>
            ))}
          </div>
          {templateMessage && <p role="alert" className="text-xs text-red-600">{templateMessage}</p>}
          <Button type="submit" className="w-full" disabled={savingTemplate || !templateName.trim() || !templateItems.length}>
            {savingTemplate ? 'Enregistrement…' : editingTemplateId ? 'Enregistrer les modifications' : applySuggestedAfterSave ? 'Valider et appliquer ce budget' : 'Enregistrer le modèle'}
          </Button>
        </form>
      </Modal>

      <Modal open={!!details} onClose={() => setDetails(null)} title={details ? (isEnglish ? `Budget details — ${translateText(details.label, 'en')}` : `Détail du budget — ${details.label}`) : ''}>
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
            <Button type="button" className="w-full" onClick={() => { const prompt = isEnglish ? `Help me improve my ${details.label} budget for ${month}. Planned amount: ${details.allocated} XAF. Recorded expenses: ${details.spent} XAF. Remaining: ${details.remaining} XAF. Analyze the transactions and suggest realistic changes without modifying my data.` : `Aide-moi à améliorer mon budget ${details.label} pour ${month}. Montant prévu : ${details.allocated} FCFA. Dépenses enregistrées : ${details.spent} FCFA. Reste : ${details.remaining} FCFA. Analyse les opérations et propose des changements réalistes sans modifier mes données.`; window.dispatchEvent(new CustomEvent('pata:assistant-open', { detail: { prompt } })); setDetails(null); }}>
              <MessageCircle size={15} /> Demander conseil à Mč
            </Button>
          </div>
        )}
      </Modal>

      <Modal
        open={createBudgetOpen}
        onClose={() => { if (!creatingBudget) setCreateBudgetOpen(false); }}
        title="Créer un budget"
        className="max-w-xl"
      >
        <form onSubmit={onCreateBudget} className="space-y-4">
          <label className="block text-xs font-semibold text-slate-700">
            Source de revenus
            <select
              required
              value={createBudgetIncomeSourceId}
              onChange={(event) => {
                setCreateBudgetIncomeSourceId(event.target.value);
                setSelectedIncome(event.target.value);
              }}
              className="pata-field mt-1 h-11 w-full rounded-xl border px-3 text-sm font-normal text-slate-800 outline-none focus:border-brand-500"
            >
              {budgetIncomeSources.map((income) => (
                <option key={income.id} value={income.id}>
                  {income.source || 'Revenu'} · {formatCurrency(income.remaining)} restant
                </option>
              ))}
            </select>
          </label>

          {createBudgetIncome && (
            <div className="rounded-xl border border-brand-100 bg-brand-50/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-slate-600">Solde réellement disponible</span>
                <strong className="text-sm font-extrabold tabular-nums text-slate-900">{formatCurrency(createBudgetIncome.remaining)}</strong>
              </div>
              {budgetsLoading || selectedIncome !== createBudgetIncomeSourceId ? (
                <p className="mt-2 text-[11px] text-slate-500">Vérification des enveloppes déjà prévues…</p>
              ) : (
                <>
                  <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                    <span>Déjà réparti dans les autres catégories</span>
                    <strong className="tabular-nums text-slate-700">{formatCurrency(createBudgetOtherAllocated)}</strong>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 border-t border-brand-100 pt-2 text-xs">
                    <span className="font-semibold text-slate-700">Encore disponible à répartir</span>
                    <strong className="font-extrabold tabular-nums text-brand-800">{formatCurrency(createBudgetAvailableToAllocate)}</strong>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-slate-800">Catégories à budgétiser</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Une ligne par catégorie, avec son propre montant.</p>
              </div>
              <button
                type="button"
                onClick={() => setCreateBudgetItems((current) => [...current, { categoryId: expenseCategories.find((category) => !current.some((item) => item.categoryId === category.id))?.id || '', amount: '' }])}
                disabled={createBudgetItems.length >= expenseCategories.length || createBudgetItems.length >= 30}
                className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-40"
              >
                <Plus size={14}/> Ajouter
              </button>
            </div>
            <div className="space-y-2">
              {createBudgetItems.map((item, index) => (
                <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(104px,.8fr)_34px] items-end gap-2 rounded-xl border border-slate-200 p-2">
                  <label className="min-w-0 text-[11px] font-semibold text-slate-600">
                    Catégorie
                    <select
                      required
                      value={item.categoryId}
                      onChange={(event) => setCreateBudgetItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, categoryId: event.target.value } : row))}
                      className="pata-field mt-1 h-10 w-full min-w-0 rounded-lg border px-2 text-xs font-medium text-slate-800 outline-none"
                    >
                      {expenseCategories.map((category) => (
                        <option
                          key={category.id}
                          value={category.id}
                          disabled={createBudgetItems.some((row, rowIndex) => rowIndex !== index && row.categoryId === category.id)}
                        >
                          {translateText(category.label, language)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="min-w-0 text-[11px] font-semibold text-slate-600">
                    Montant (FCFA)
                    <input
                      type="number"
                      min="1"
                      max="1000000000"
                      step="1"
                      inputMode="numeric"
                      required
                      value={item.amount}
                      onChange={(event) => setCreateBudgetItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, amount: event.target.value } : row))}
                      className="pata-field mt-1 h-10 w-full min-w-0 rounded-lg border px-2 text-right text-xs font-bold text-slate-800 outline-none"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setCreateBudgetItems((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                    disabled={createBudgetItems.length <= 1}
                    aria-label="Retirer cette catégorie"
                    className="mb-0.5 grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-20"
                  >
                    <Trash2 size={14}/>
                  </button>
                </div>
              ))}
            </div>
            {budgetsLoading || selectedIncome !== createBudgetIncomeSourceId ? (
              <p className="text-[11px] text-slate-500">Pata vérifie les enveloppes existantes de cette source avant l’enregistrement.</p>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                <span className="text-xs font-semibold text-slate-600">Total des nouvelles enveloppes</span>
                <strong className="text-sm font-extrabold tabular-nums text-slate-900">{formatCurrency(createBudgetItemsTotal)}</strong>
              </div>
            )}
          </div>

          {saveError && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{saveError}</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={creatingBudget || budgetsLoading || selectedIncome !== createBudgetIncomeSourceId || !createBudgetIncomeSourceId || !createBudgetItems.length || createBudgetItems.some((item) => !item.categoryId || !Number.isSafeInteger(Number(item.amount)) || Number(item.amount) <= 0 || Number(item.amount) > 1_000_000_000) || createBudgetItemsTotal > createBudgetAvailableToAllocate}
          >
            {creatingBudget ? 'Création…' : createBudgetItems.length > 1 ? 'Créer ' + createBudgetItems.length + ' enveloppes' : 'Créer le budget'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Budget — ${translateText(editing.label, language)}` : ''}
      >
        {editing && (
          <form onSubmit={onSave} className="space-y-3">
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 flex items-center gap-2">
              <Landmark size={16} />
              <span>
                {selectedIncome === 'all' 
                  ? (isEnglish ? 'Overall budget (all income)' : 'Budget Global (Tous les revenus)')
                  : (isEnglish ? `Income: ${monthIncomes.find(i => i.id === selectedIncome)?.source}` : `Revenu : ${monthIncomes.find(i => i.id === selectedIncome)?.source}`)}
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
