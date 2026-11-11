/* eslint-disable react/no-unescaped-entities */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { PiggyBank, Pencil, Landmark, ChevronRight, MessageCircle, BookmarkPlus, Trash2, Layers3 } from 'lucide-react';
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
import { upsertBudget, deleteBudget, getBudgetTemplates, saveBudgetTemplate, applyBudgetTemplate, removeBudgetTemplate } from '@/lib/firestore/budgets';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { formatCurrency, getLocalMonth, normalizeExpenseCategoryId } from '@/lib/utils';
import { buildBudgetSuggestions } from '@/lib/financialPlanning';

const todayMonth = () => getLocalMonth();

export default function BudgetsPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [month, setMonth] = useState(todayMonth());
  const [selectedIncome, setSelectedIncome] = useState('all');
  
  const { incomes } = useIncomes();
  const { budgets } = useBudgets(month, selectedIncome);
  const { expenses } = useExpenses();
  const { categories: allExpenseCategories } = useCustomCategories('expense');
  const expenseCategories = useMemo(() => allExpenseCategories.filter((category) => category.id !== 'loan_given'), [allExpenseCategories]);

  const [editing, setEditing] = useState(null);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [details, setDetails] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [templateItems, setTemplateItems] = useState([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState('');
  const [templateMessage, setTemplateMessage] = useState('');
  const [budgetPersona, setBudgetPersona] = useState('employee');
  const [applySuggestedAfterSave, setApplySuggestedAfterSave] = useState(false);

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
      return { ...c, budgetId: budget?.id, allocated, spent, usage, remaining: allocated - spent, expenses: monthExpenses.filter((expense) => normalizeExpenseCategoryId(expense.categoryId) === c.id) };
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
    () => enriched.filter((category) => category.budgetId && Number(category.allocated) > 0),
    [enriched]
  );

  const totalAllocated = enriched.reduce((s, c) => s + c.allocated, 0);
  const totalSpent = enriched.reduce((s, c) => s + c.spent, 0);

  const openEdit = (category) => {
    setEditing(category);
    setAmount(String(category.allocated || ''));
  };

  const openSuggestedBudget = () => {
    const items = buildBudgetSuggestions({ incomes, expenses, categories: expenseCategories, persona: budgetPersona, month });
    if (!items.length) {
      setTemplateMessage('Enregistre quelques revenus ou dépenses pour que Pata puisse calculer un budget personnalisé.');
      return;
    }
    const roleLabels = { employee: 'salarié', student: 'élève ou étudiant', self_employed: 'indépendant', family: 'foyer', retired: 'retraité' };
    setEditingTemplateId(null);
    setTemplateName('Budget conseillé — ' + roleLabels[budgetPersona]);
    setTemplateItems(items.map((item) => ({ categoryId: item.categoryId, label: item.label, amount: String(item.amount) })));
    setTemplateMessage('Pata a préparé une première répartition avec ton historique. Modifie librement les montants avant de valider.');
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
      setTemplateMessage('Le modèle doit contenir au moins une catégorie.');
      return;
    }
    setSavingTemplate(true);
    setTemplateMessage('');
    try {
      const savedTemplateId = await saveBudgetTemplate(templateName, items, editingTemplateId);
      setTemplates(await getBudgetTemplates());
      if (applySuggestedAfterSave && !editingTemplateId) {
        const applied = await applyBudgetTemplate(savedTemplateId, month, selectedIncome);
        setTemplateMessage('Budget conseillé enregistré et appliqué à ' + month + ' : ' + (applied.createdCount || 0) + ' enveloppe(s) créée(s), ' + (applied.updatedCount || 0) + ' mise(s) à jour. Tu peux encore ajuster chaque montant.');
      } else {
        setTemplateMessage(editingTemplateId
          ? 'Modèle mis à jour. Les versions déjà appliquées ne sont pas modifiées.'
          : 'Modèle enregistré. Cette création compte dans le quota de budgets du compte gratuit.');
      }
      setTemplateModalOpen(false);
      setEditingTemplateId(null);
      setApplySuggestedAfterSave(false);
    } catch (error) {
      setTemplateMessage(error.message || 'Impossible d’enregistrer ce modèle.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const applyTemplate = async (template) => {
    if (!Array.isArray(template.items) || !template.items.length) return;
    const existingCount = template.items.filter((item) => budgets.some((budget) => normalizeExpenseCategoryId(budget.categoryId) === normalizeExpenseCategoryId(item.categoryId))).length;
    const confirmed = existingCount > 0
      ? window.confirm('Appliquer « ' + template.name + ' » à ' + month + ' ? Les montants positifs seront créés ou mis à jour. Les catégories à zéro supprimeront leur enveloppe de ce mois. Les autres budgets resteront inchangés.')
      : true;
    if (!confirmed) return;
    setApplyingTemplate(template.id);
    setTemplateMessage('');
    try {
      const result = await applyBudgetTemplate(template.id, month, selectedIncome);
      setTemplateMessage('Modèle appliqué à ' + month + ' : ' + (result.createdCount || 0) + ' enveloppe(s) créée(s), ' + (result.updatedCount || 0) + ' mise(s) à jour, ' + (result.deletedCount || 0) + ' mise(s) à zéro retirée(s).');
    } catch (error) {
      setTemplateMessage(error.message || 'Le modèle n’a pas pu être appliqué. Aucun changement partiel n’a été effectué.');
    } finally {
      setApplyingTemplate('');
    }
  };

  const deleteTemplate = async (template) => {
    if (!window.confirm('Supprimer le modèle « ' + template.name + ' » ? Cela ne supprimera aucun budget déjà appliqué.')) return;
    try {
      await removeBudgetTemplate(template.id);
      setTemplates((current) => current.filter((item) => item.id !== template.id));
      setTemplateMessage('Modèle supprimé. Les budgets déjà appliqués sont conservés.');
    } catch (error) {
      setTemplateMessage(error.message || 'Impossible de supprimer ce modèle.');
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
          {!budgetPremium && <p className="mt-1 text-xs text-slate-500">Créations de budgets et modèles : {usedBudgetQuota} / 2 ce mois-ci.</p>}
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button type="button" variant="outline" size="sm" onClick={() => {
            const prompt = 'Analyse mon budget Pata du mois ' + month + '. Profil : ' + budgetPersona + '. Revenus enregistrés : ' + monthIncomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) + ' FCFA. Répartition actuelle : ' + enriched.map((item) => item.label + ' : prévu ' + item.allocated + ' FCFA, dépensé ' + item.spent + ' FCFA').join('; ') + '. Repère les catégories qui consomment le plus, les enveloppes trop élevées ou trop basses et propose des ajustements réalistes adaptés à ce profil. Ne modifie rien sans mon accord.';
            window.dispatchEvent(new CustomEvent('pata:assistant-open', { detail: { prompt } }));
          }}><MessageCircle size={15}/> Analyser avec l’IA</Button>
          <select value={budgetPersona} onChange={(event) => setBudgetPersona(event.target.value)} aria-label="Profil pour la proposition de budget" className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs">
            <option value="employee">Salarié</option>
            <option value="student">Élève / étudiant</option>
            <option value="self_employed">Indépendant</option>
            <option value="family">Foyer / famille</option>
            <option value="retired">Retraité</option>
          </select>
          <Button type="button" variant="outline" size="sm" onClick={openSuggestedBudget} disabled={!enriched.length}><Layers3 size={15}/> Proposer un budget</Button>
          <Button type="button" variant="outline" size="sm" onClick={openNewTemplate} disabled={!enriched.length || (!budgetPremium && budgetQuotaReached)}><BookmarkPlus size={15}/> Enregistrer un modèle</Button>
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

      {totalAllocated === 0 && (
        <EmptyState
          icon={PiggyBank}
          title="Aucun budget défini"
          description="Va dans Revenus et applique la répartition suggérée, ou définis un budget manuellement ici."
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {budgetedCategories.map((c) => (
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
