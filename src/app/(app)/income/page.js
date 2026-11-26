/* eslint-disable react/no-unescaped-entities */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus, Trash2, TrendingUp, CheckCircle2, Save, RotateCcw, Percent,
  PiggyBank, Target, Pencil, AlertTriangle, Calculator, ArrowRight, Clock3, MapPin, Pin
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { isIncomeCountedAsSource } from '@/lib/finance/incomeBalances.mjs';
import { CategoryManager } from '@/components/ui/CategoryManager';
import { CategoryImage } from '@/components/ui/CategoryImage';
import { CloudinaryImageField } from '@/components/ui/CloudinaryImageField';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { useAuth } from '@/hooks/useAuth';
import { CalculatorLauncher } from '@/components/finance/CalculatorPanel';
import { useLanguage } from '@/context/LanguageContext';
import { useIncomes } from '@/hooks/useIncomes';
import { useDebts } from '@/hooks/useDebts';
import { useExpenses } from '@/hooks/useExpenses';
import { useProfile } from '@/hooks/useProfile';
import { useProjects } from '@/hooks/useProjects';
import { useBudgetRules } from '@/hooks/useBudgetRules';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { createIncome, updateIncome, deleteIncome, setIncomePinned } from '@/lib/firestore/incomes';
import { upsertBudget, upsertBudgets } from '@/lib/firestore/budgets';
import { calculateBudgetPlan, calculateBudgetLine } from '@/lib/finance/budgetPlanner.mjs';
import { computeBudgetBreakdown } from '@/lib/budgetRules';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES, CAMEROON_BANKS } from '@/lib/constants';
import { formatCurrency, formatDate, normalizeExpenseCategoryId } from '@/lib/utils';
import { translateText } from '@/lib/i18n/translations';
import { saveVitalForecast, deleteVitalForecast, saveDurationForecast as saveDurationForecastRecord, deleteDurationForecast } from '@/lib/firestore/forecasts';
import { useBudgets } from '@/hooks/useBudgets';
import { OptionalTransactionFields } from '@/components/transactions/OptionalTransactionFields';
import { DebtCounterpartyField } from '@/components/debts/DebtCounterpartyField';
import { AssistantShortcut } from '@/components/ai/AssistantShortcut';
import { ScheduledTransactionsPanel } from '@/components/transactions/ScheduledTransactionsPanel';
import { createScheduledTransaction } from '@/lib/firestore/scheduledTransactions';
import { checkFinancialOperation } from '@/lib/firestore/financialTargets';
import { NextBestAction } from '@/components/NextBestAction';
import { usePersistentPageState } from '@/hooks/usePersistentPageState';
import { useAppDialog } from '@/hooks/useAppDialog';
import { ScrollAwareAddButton } from '@/components/layout/ScrollAwareAddButton';

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
const emptyIncomeForm = () => ({ id: null, amount: '', amountLocked: false, source: 'Salaire', categoryId: 'salary', image: '', note: '', date: todayIso(), projectId: '', time: currentTime(), locationLabel: '', latitude: null, longitude: null, locationAccuracy: null, paymentMethod: '', details: '', flowType: 'normal', person: '', phone: '', dueDate: '', availableAsFunding: null, repaymentDebtId: '', counterpartyUid: '', counterpartyType: 'person', bankName: '', bankChoice: '', bankCustomName: '', scheduleEnabled: false, recurrenceEnabled: true, scheduleFrequency: 'monthly' });

const FREQUENCIES = [
  { id: 'daily', label: 'Par jour', multiplier: 30 },
  { id: 'weekly', label: 'Par semaine', multiplier: 4 },
  { id: 'monthly', label: 'Par mois', multiplier: 1 },
];

// Le détail d'un revenu est souvent rouvert plusieurs fois pendant une même
// session. Garde la première page brièvement en mémoire et invalide-la dès
// qu'une dépense est modifiée dans l'application.
const incomeExpenseDetailsCache = new Map();
const INCOME_EXPENSE_DETAILS_CACHE_MS = 30_000;

const formatIncomeDate = (value) => {
  const dateValue = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return 'Date non renseignée';
  const date = new Date(dateValue + 'T12:00:00');
  return formatDate(date, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
};

const getIncomeExpenseFlowLabel = (expense, isEnglish = false) => {
  if (expense?.cashWithdrawal || expense?.flowType === 'cash_withdrawal') return isEnglish ? 'Cash transfer' : 'Retrait vers espèces';
  if (expense?.flowType === 'loan_given' || expense?.categoryId === 'loan_given') return isEnglish ? 'Loan given' : 'Prêt accordé';
  if (expense?.flowType === 'repayment' || expense?.repaymentDebtId || expense?.categoryId === 'debt_repayment') return isEnglish ? 'Debt repayment' : 'Remboursement de dette';
  const labels = isEnglish
    ? { consumption: 'Everyday expense', project: 'Project', savings: 'Savings', investment: 'Investment' }
    : { consumption: 'Dépense courante', project: 'Projet', savings: 'Épargne', investment: 'Investissement' };
  return labels[expense?.expenseType] || (isEnglish ? 'Other outflow' : 'Autre sortie');
};

export default function IncomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const { appConfirm, appAlert, dialog } = useAppDialog();
  const { incomes, loading: incomesLoading, balancesReady } = useIncomes();
  const { debts } = useDebts();
  const activeReceivableDebts = debts.filter((debt) => debt.type === 'owed_to_me' && ['active', 'partial', 'late'].includes(debt.status) && Number(debt.remaining) > 0);
  const { expenses } = useExpenses({ days: 30, limit: 500 });
  const { profile, save } = useProfile();
  const { projects } = useProjects();
  const premiumExpiry = profile?.premiumUntil?.toDate ? profile.premiumUntil.toDate() : new Date(profile?.premiumUntil || 0);
  const isPremium = Number.isFinite(premiumExpiry.getTime()) && premiumExpiry > new Date();
  const { customCategories } = useCustomCategories('expense');
  const { customCategories: customIncomeCategories } = useCustomCategories('income');
  const { rules, updatePercent, saveRules, resetRules, total, isValid, loading: rulesLoading } = useBudgetRules();

  const [month, setMonth] = usePersistentPageState('income', 'month', todayMonth(), user?.uid);
  const [incomeSection, setIncomeSection] = usePersistentPageState('income', 'section', 'all', user?.uid);
  const [incomeSearch, setIncomeSearch] = usePersistentPageState('income', 'search', '', user?.uid);
  const [incomeFilterCategory, setIncomeFilterCategory] = usePersistentPageState('income', 'filterCategory', 'all', user?.uid);
  const [incomeAvailability, setIncomeAvailability] = usePersistentPageState('income', 'availability', 'all', user?.uid);
  const [incomeSort, setIncomeSort] = usePersistentPageState('income', 'sort', 'pinned_newest', user?.uid);
  const [incomeMinAmount, setIncomeMinAmount] = usePersistentPageState('income', 'minAmount', '', user?.uid);
  const [incomeMaxAmount, setIncomeMaxAmount] = usePersistentPageState('income', 'maxAmount', '', user?.uid);
  const [open, setOpen] = usePersistentPageState('income', 'editorOpen', false, user?.uid);
  const [form, setForm] = usePersistentPageState('income', 'form', emptyIncomeForm(), user?.uid);
  const [incomeBudgetPrompt, setIncomeBudgetPrompt] = useState(null);
  const [selectedIncome, setSelectedIncome] = usePersistentPageState('income', 'selectedIncome', null, user?.uid);
  const [incomeExpenseDetails, setIncomeExpenseDetails] = useState({ incomeId: null, loading: false, loadingMore: false, totalSpent: 0, expenseCount: 0, expenses: [], nextCursor: null, error: '' });
  const [incomeExpenseDetailsRevision, setIncomeExpenseDetailsRevision] = useState(0);

  useEffect(() => {
    const invalidate = () => {
      incomeExpenseDetailsCache.clear();
      setIncomeExpenseDetailsRevision((current) => current + 1);
    };
    window.addEventListener('pata:income-balances-refresh', invalidate);
    return () => window.removeEventListener('pata:income-balances-refresh', invalidate);
  }, []);

  useEffect(() => {
    const isBorrowedIncome = selectedIncome?.flowType === 'debt_borrowed' || selectedIncome?.categoryId === 'debt_borrowed';
    if (!selectedIncome?.id || selectedIncome.cashPocket || (selectedIncome.neutralFlow && !isBorrowedIncome)) {
      setIncomeExpenseDetails({ incomeId: selectedIncome?.id || null, loading: false, loadingMore: false, totalSpent: 0, expenseCount: 0, expenses: [], nextCursor: null, error: '' });
      return undefined;
    }
    let active = true;
    const cacheKey = user?.uid + ':' + selectedIncome.id;
    const cached = incomeExpenseDetailsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setIncomeExpenseDetails({ ...cached.value, loading: false, loadingMore: false, error: '' });
      return () => { active = false; };
    }
    incomeExpenseDetailsCache.delete(cacheKey);
    setIncomeExpenseDetails({ incomeId: selectedIncome.id, loading: true, loadingMore: false, totalSpent: 0, expenseCount: 0, expenses: [], nextCursor: null, error: '' });
    (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/incomes/expenses?incomeId=' + encodeURIComponent(selectedIncome.id), {
          headers: { Authorization: 'Bearer ' + token },
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de charger les dépenses associées.');
        if (active) {
          const value = {
            incomeId: selectedIncome.id, loading: false, loadingMore: false,
            totalSpent: Number(result.totalSpent) || 0,
            expenseCount: Number(result.expenseCount) || 0,
            expenses: Array.isArray(result.expenses) ? result.expenses : [],
            nextCursor: result.nextCursor || null, error: '',
          };
          incomeExpenseDetailsCache.set(cacheKey, {
            expiresAt: Date.now() + INCOME_EXPENSE_DETAILS_CACHE_MS,
            value,
          });
          setIncomeExpenseDetails(value);
        }
      } catch (loadError) {
        if (active) setIncomeExpenseDetails({ incomeId: selectedIncome.id, loading: false, loadingMore: false, totalSpent: 0, expenseCount: 0, expenses: [], nextCursor: null, error: loadError.message || 'Détail indisponible.' });
      }
    })();
    return () => { active = false; };
  }, [selectedIncome?.id, selectedIncome?.neutralFlow, selectedIncome?.cashPocket, selectedIncome?.flowType, selectedIncome?.categoryId, user, incomeExpenseDetailsRevision]);
  const [saving, setSaving] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [savingApplied, setSavingApplied] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState('');
  const [rulesSavedAt, setRulesSavedAt] = useState(null);
  const [selectedIncomeToApply, setSelectedIncomeToApply] = useState('all');
  const { budgets: appliedBudgets } = useBudgets(month, selectedIncomeToApply);
  const selectedIncomeBudgetMonth = selectedIncome?.month || selectedIncome?.date?.slice(0, 7) || month;
  const { budgets: selectedIncomeBudgets, loading: selectedIncomeBudgetsLoading } = useBudgets(
    selectedIncomeBudgetMonth,
    selectedIncome?.id || '__income_detail_inactive__',
  );
  const [deleteId, setDeleteId] = useState(null);
  const [showCotisationReminder, setShowCotisationReminder] = useState(false);
  const [nextAction, setNextAction] = useState(null);

  const [pinMenuId, setPinMenuId] = useState(null);
  const [pinSavingId, setPinSavingId] = useState('');
  const pinPressTimerRef = useRef(null);
  const suppressPinClickRef = useRef(false);
  const clearPinPressTimer = () => {
    if (pinPressTimerRef.current) window.clearTimeout(pinPressTimerRef.current);
    pinPressTimerRef.current = null;
  };
  const startIncomeLongPress = (event, item) => {
    if (event.target.closest('button:not([data-pin-long-press]),a,input,select,textarea')) return;
    clearPinPressTimer();
    suppressPinClickRef.current = false;
    pinPressTimerRef.current = window.setTimeout(() => {
      suppressPinClickRef.current = true;
      setPinMenuId(item.id);
    }, 900);
  };
  const openIncomeDetails = (item) => {
    if (suppressPinClickRef.current) { suppressPinClickRef.current = false; return; }
    setPinMenuId(null);
    setSelectedIncome(item);
  };
  const toggleIncomePinned = async (item) => {
    setPinSavingId(item.id);
    try {
      await setIncomePinned(user.uid, item.id, !item.isPinned);
      suppressPinClickRef.current = false;
      setPinMenuId(null);
    } catch (pinError) {
      setError(pinError.message || 'Impossible de modifier cet épinglage.');
    } finally { setPinSavingId(''); }
  };

  // 🟢 États des prévisions
  const [vitalOpen, setVitalOpen] = useState(false);
  const [vitalForm, setVitalForm] = useState({});
  const [budgetName, setBudgetName] = useState('');
  const [totalBudget, setTotalBudget] = useState('');
  const [savingVital, setSavingVital] = useState(false);
  const [showVerification, setShowVerification] = useState(false); // Pour le bouton "Vérifier"
  const [vitalApplyOpen, setVitalApplyOpen] = useState(false);
  const [vitalApplySourceId, setVitalApplySourceId] = useState('');
  const [vitalCreateIncome, setVitalCreateIncome] = useState(false);
  const [vitalApplyError, setVitalApplyError] = useState('');
  const [vitalApplyBusy, setVitalApplyBusy] = useState(false);
  const [vitalError, setVitalError] = useState('');
  const [durationName, setDurationName] = useState('');
  const [durationCapital, setDurationCapital] = useState('');
  const [durationExpense, setDurationExpense] = useState('');
  const [durationFrequency, setDurationFrequency] = useState('daily');
  const [durationError, setDurationError] = useState('');
  const [savingDuration, setSavingDuration] = useState(false);

  useEffect(() => {
    const openFromShortcut = (flowType = 'normal', debtId = '') => {
      const categoryId = flowType === 'debt_borrowed' ? 'debt_borrowed' : flowType === 'repayment_received' ? 'debt_repayment_received' : 'salary';
      setForm({ ...emptyIncomeForm(), ...(flowType === 'debt_borrowed' ? { source: '' } : {}), flowType: ['debt_borrowed', 'repayment_received'].includes(flowType) ? flowType : 'normal', repaymentDebtId: debtId, categoryId });
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
  }, [setForm, setOpen]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const highlightedId = params.get('highlight');
    if (!highlightedId || !incomes.length) return;
    const match = incomes.find((item) => item.id === highlightedId);
    if (match) setSelectedIncome(match);
    params.delete('highlight');
    const query = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : ''));
  }, [incomes, setSelectedIncome]);

  const incomesWithBalance = useMemo(() => incomes.map((income) => {
    const balanceAvailable = income.balanceAvailable === true;
    const spent = balanceAvailable ? Math.max(0, Number(income.spent) || 0) : null;
    const remaining = balanceAvailable ? Math.max(0, Number(income.remaining) || 0) : null;
    const createdDate = income.date || (income.createdAt?.toDate ? income.createdAt.toDate().toISOString().slice(0, 10) : null);
    return {
      ...income,
      spent,
      remaining,
      balanceAvailable,
      createdDate,
      exhaustedDate: null,
      isExhausted: balanceAvailable && remaining === 0 && spent > 0,
    };
  }), [incomes]);

  useEffect(() => {
    if (!selectedIncome?.id) return;
    const latestIncome = incomesWithBalance.find((income) => income.id === selectedIncome.id);
    if (latestIncome && latestIncome !== selectedIncome) setSelectedIncome(latestIncome);
  }, [incomesWithBalance, selectedIncome, selectedIncome?.id, setSelectedIncome]);

  const incomeBalancesAvailable = balancesReady && incomesWithBalance.every((item) => item.balanceAvailable);
  const activeIncomes = useMemo(() => incomesWithBalance.filter((income) => income.balanceAvailable && isIncomeCountedAsSource(income) && !income.isExhausted), [incomesWithBalance]);
  const totalAvailable = incomeBalancesAvailable ? activeIncomes.reduce((s, i) => s + i.remaining, 0) : null;
  const cashPocketBalances = useMemo(() => incomesWithBalance.filter((item) => item.balanceAvailable && item.cashPocket === true), [incomesWithBalance]);
  const cashAvailable = incomeBalancesAvailable ? cashPocketBalances.reduce((sum, item) => sum + item.remaining, 0) : null;
  const cashflowForecast = useMemo(() => {
    const today = todayIso();
    const start = new Date(today + 'T12:00:00');
    start.setDate(start.getDate() - 29);
    const startKey = start.getFullYear() + '-' + String(start.getMonth() + 1).padStart(2, '0') + '-' + String(start.getDate()).padStart(2, '0');
    const recentOutflows = expenses.filter((item) => {
      const date = String(item.date || '').slice(0, 10);
      return date >= startKey && date <= today
        && item.flowType !== 'cash_withdrawal'
        && item.cashWithdrawal !== true
        && item.status !== 'pending_confirmation'
        && Number(item.amount) > 0;
    });
    const totalOutflows = recentOutflows.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const firstDate = recentOutflows.map((item) => String(item.date || '').slice(0, 10)).filter(Boolean).sort()[0];
    const observedDays = firstDate
      ? Math.max(1, Math.min(30, Math.floor((Date.parse(today + 'T12:00:00') - Date.parse(firstDate + 'T12:00:00')) / 86400000) + 1))
      : 30;
    const averageDailyOutflow = totalOutflows / observedDays;
    const availableNow = totalAvailable == null || cashAvailable == null ? null : Math.max(0, totalAvailable + cashAvailable);
    return {
      availableNow,
      totalOutflows,
      observedDays,
      averageDailyOutflow,
      projections: [3, 7, 30].map((days) => ({
        days,
        plannedOutflow: Math.round(averageDailyOutflow * days),
        remaining: availableNow == null ? null : Math.round(availableNow - averageDailyOutflow * days),
      })),
    };
  }, [expenses, totalAvailable, cashAvailable]);
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
    if (days < 1) return isEnglish ? 'Less than one day' : 'Moins d’un jour';
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    const remainingDays = days % 30;
    const parts = [];
    if (years) parts.push(isEnglish ? `${years} year${years > 1 ? 's' : ''}` : `${years} an${years > 1 ? 's' : ''}`);
    if (months) parts.push(isEnglish ? `${months} month${months > 1 ? 's' : ''}` : `${months} mois`);
    if (remainingDays && parts.length < 2) parts.push(isEnglish ? `${remainingDays} day${remainingDays > 1 ? 's' : ''}` : `${remainingDays} jour${remainingDays > 1 ? 's' : ''}`);
    return parts.join(isEnglish ? ' and ' : ' et ') || (isEnglish ? 'Less than one day' : 'Moins d’un jour');
  };

  const saveDurationForecast = async (event) => {
    event.preventDefault();
    setDurationError('');
    const capital = Math.round(Number(durationCapital));
    if (!capital || capital <= 0 || dailyRate <= 0) return setDurationError(isEnglish ? 'Enter a positive amount of capital and an estimated expense.' : 'Indique un capital positif et une dépense estimée.');
    setSavingDuration(true);
    try {
      const result = await saveDurationForecastRecord({
        name: durationName.trim(),
        capital,
        expense: Math.round(Number(durationExpense) || 0),
        frequency: durationFrequency,
      });
      if (!result?.forecast) throw new Error(isEnglish ? 'The estimate was not saved.' : 'L’estimation n’a pas été enregistrée.');
      setDurationName(''); setDurationCapital(''); setDurationExpense(''); setDurationFrequency('daily');
    } catch (error) {
      setDurationError(isEnglish ? 'Could not save this forecast.' : (error.message || 'Impossible d’enregistrer cette prévision.'));
    } finally {
      setSavingDuration(false);
    }
  };

  const removeDurationForecast = async (id) => {
    if (!(await appConfirm(isEnglish ? 'Delete this forecast? Deleting it will not restore a free creation for this month.' : 'Supprimer cette prévision ? Cette suppression ne te rendra pas une création gratuite pour ce mois.', { title: isEnglish ? 'Delete forecast?' : 'Supprimer cette prévision ?', kind: 'danger', confirmLabel: isEnglish ? 'Delete forecast' : 'Supprimer' }))) return;
    await deleteDurationForecast(id);
  };

  const analyzeWithAssistant = (prompt, promptEn = prompt) => {
    window.dispatchEvent(new CustomEvent('pata:assistant-open', { detail: { prompt: isEnglish ? promptEn : prompt } }));
  };

  const monthIncomes = useMemo(() => incomesWithBalance
    .filter((item) => String(item.month || item.date || '').slice(0, 7) === month)
    .sort((a, b) => String(b.date || b.createdDate || '').localeCompare(String(a.date || a.createdDate || ''))),
  [incomesWithBalance, month]);

  const monthEarningSources = useMemo(() => monthIncomes.filter((income) =>
    isIncomeCountedAsSource(income)
    && !income.cashPocket
    && income.flowType !== 'repayment_received'
    && income.categoryId !== 'debt_repayment_received'
  ), [monthIncomes]);
  // Ne compte que les emprunts réellement reçus en argent comme revenus issus de dettes.
  const monthDebtIncomeSources = useMemo(() => monthEarningSources.filter((income) =>
    income.flowType === 'debt_borrowed' || income.categoryId === 'debt_borrowed'
  ), [monthEarningSources]);
  const earnedThisMonth = monthEarningSources.reduce((sum, income) => sum + (Number(income.amount) || 0), 0);
  const debtIncomeAmount = monthDebtIncomeSources.reduce((sum, income) => sum + (Number(income.amount) || 0), 0);
  const earnedWithoutDebtThisMonth = Math.max(0, earnedThisMonth - debtIncomeAmount);
  const activeMonthSources = monthEarningSources.filter((income) =>
    income.balanceAvailable && !income.isExhausted && Number(income.remaining) > 0
  );
  const budgetTargetMonthSources = monthEarningSources;
  const availableThisMonth = balancesReady && monthEarningSources.every((income) => income.balanceAvailable)
    ? activeMonthSources.reduce((sum, income) => sum + (Number(income.remaining) || 0), 0)
    : null;

  const filteredIncomes = useMemo(() => {
    const query = incomeSearch.trim().toLocaleLowerCase();
    const minimum = incomeMinAmount === '' ? null : Number(incomeMinAmount);
    const maximum = incomeMaxAmount === '' ? null : Number(incomeMaxAmount);
    const categories = [...INCOME_CATEGORIES, ...customIncomeCategories];
    const matches = incomesWithBalance.filter((item) => {
      const category = categories.find((candidate) => candidate.id === item.categoryId);
      const searchText = [item.source, item.note, item.details, item.locationLabel, category?.label, category?.name]
        .filter(Boolean).join(' ').toLocaleLowerCase();
      const amount = Number(item.amount) || 0;
      if (query && !searchText.includes(query)) return false;
      if (incomeFilterCategory !== 'all' && item.categoryId !== incomeFilterCategory) return false;
      if (minimum !== null && (!Number.isFinite(minimum) || amount < minimum)) return false;
      if (maximum !== null && (!Number.isFinite(maximum) || amount > maximum)) return false;
      if (incomeAvailability === 'available' && (!item.balanceAvailable || item.isExhausted || Number(item.remaining) <= 0)) return false;
      if (incomeAvailability === 'exhausted' && (!item.balanceAvailable || !item.isExhausted)) return false;
      if (incomeAvailability === 'unverified' && item.balanceAvailable) return false;
      return true;
    });

    const dateValue = (item) => String(item.date || item.createdDate || '');
    matches.sort((a, b) => {
      if (incomeSort === 'pinned_newest') return Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned))
        || dateValue(b).localeCompare(dateValue(a));
      if (incomeSort === 'date_oldest') return dateValue(a).localeCompare(dateValue(b));
      if (incomeSort === 'amount_high') return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      if (incomeSort === 'amount_low') return (Number(a.amount) || 0) - (Number(b.amount) || 0);
      if (incomeSort === 'available_high') return (Number(b.remaining) || 0) - (Number(a.remaining) || 0);
      if (incomeSort === 'available_low') return (Number(a.remaining) || 0) - (Number(b.remaining) || 0);
      return dateValue(b).localeCompare(dateValue(a));
    });
    return matches;
  }, [incomesWithBalance, incomeSearch, incomeFilterCategory, incomeAvailability, incomeSort, incomeMinAmount, incomeMaxAmount, customIncomeCategories]);
  const highestIncomeInMonth = useMemo(() => monthEarningSources
    .reduce((highest, income) => Number(income.amount) > Number(highest?.amount || 0) ? income : highest, null), [monthEarningSources]);
  const totalIncome = monthIncomes.filter(isIncomeCountedAsSource).reduce((s, i) => s + (Number(i.remaining) || 0), 0);
  const breakdown = useMemo(() => computeBudgetBreakdown(totalIncome, rules), [totalIncome, rules]);

  const vitalNeeds = useMemo(() => profile?.vitalNeeds || {}, [profile?.vitalNeeds]);
  const allCategories = useMemo(() => {
    const defaults = EXPENSE_CATEGORIES.filter((category) => category.id !== 'loan_given').map(c => ({ ...c, isCustom: false }));
    const customs = customCategories.map(c => ({ ...c, isCustom: true, label: c.name }));
    return [...defaults, ...customs];
  }, [customCategories]);

  const savedVitalRows = useMemo(() => allCategories.map((category) => {
    const need = vitalNeeds[category.id] || {};
    return {
      categoryId: category.id,
      value: need.value ?? need.amount ?? 0,
      calculationType: need.calculationType === 'percentage' ? 'percentage' : 'amount',
      frequency: need.frequency || 'monthly',
    };
  }), [allCategories, vitalNeeds]);
  const savedVitalPlan = useMemo(
    () => calculateBudgetPlan(savedVitalRows, Number(profile?.vitalTotalBudget) || 0),
    [savedVitalRows, profile?.vitalTotalBudget]
  );
  const savedTotalVital = savedVitalPlan.total;

  const draftVitalRows = useMemo(() => allCategories.map((category) => {
    const need = vitalForm[category.id] || {};
    return {
      categoryId: category.id,
      value: need.value ?? need.amount ?? 0,
      calculationType: need.calculationType === 'percentage' ? 'percentage' : 'amount',
      frequency: need.frequency || 'monthly',
    };
  }), [allCategories, vitalForm]);
  const draftVitalPlan = useMemo(
    () => calculateBudgetPlan(draftVitalRows, Number(totalBudget) || 0),
    [draftVitalRows, totalBudget]
  );
  const draftTotalVital = draftVitalPlan.total;
  const hasDraftPercentage = draftVitalRows.some((item) => item.calculationType === 'percentage' && Number(item.value) > 0);
  const vitalDraftValid = Number(totalBudget) > 0 && Number.isFinite(Number(totalBudget))
    && Number(totalBudget) <= 10_000_000_000
    && draftVitalRows.some((item) => Number(item.value) > 0)
    && draftVitalPlan.valid;
  const isSavedOverBudget = Number(profile?.vitalTotalBudget) > 0 && savedTotalVital > Number(profile?.vitalTotalBudget);
  const isDraftOverBudget = Number(totalBudget) > 0 && draftTotalVital > Number(totalBudget);

  const openVitalModal = () => {
    const initial = {};
    allCategories.forEach((category) => {
      const existing = vitalNeeds[category.id] || {};
      initial[category.id] = {
        value: String(existing.value ?? existing.amount ?? ''),
        calculationType: existing.calculationType === 'percentage' ? 'percentage' : 'amount',
        frequency: existing.frequency || 'monthly',
      };
    });
    setVitalForm(initial);
    setBudgetName(profile?.vitalBudgetName || 'Budget mensuel');
    setTotalBudget(String(profile?.vitalTotalBudget || ''));
    setShowVerification(false);
    setVitalOpen(true);
  };
  
  useEffect(() => {
    if (!vitalOpen) setTotalBudget(String(profile?.vitalTotalBudget || ''));
  }, [profile?.vitalTotalBudget, vitalOpen]);


  const onSaveVital = async (e) => {
    e.preventDefault();
    setVitalError('');

    if (!vitalDraftValid || (hasDraftPercentage && !(Number(totalBudget) > 0))) {
      setVitalError(isEnglish
        ? 'Enter a valid total income and check every amount, percentage and frequency.'
        : 'Indique un budget total valide et vérifie chaque montant, pourcentage et fréquence.');
      setShowVerification(true);
      return;
    }
    if (isDraftOverBudget) {
      const confirmed = await appConfirm(
        isEnglish
          ? 'The monthly envelopes exceed the reference income by ' + formatCurrency(draftTotalVital - Number(totalBudget)) + '. You can still keep this plan, but it will require additional funds. Save it anyway?'
          : 'Les enveloppes mensuelles dépassent le revenu de référence de ' + formatCurrency(draftTotalVital - Number(totalBudget)) + '. Tu peux conserver ce plan, mais il faudra trouver des fonds supplémentaires. Veux-tu quand même l’enregistrer ?',
        { title: isEnglish ? 'Forecast exceeds income' : 'Prévisions supérieures au revenu', kind: 'warning', confirmLabel: isEnglish ? 'Keep my forecast' : 'Conserver ma prévision' }
      );
      if (!confirmed) return;
    }

    setSavingVital(true);
    try {
      const cleaned = {};
      allCategories.forEach((category) => {
        const value = vitalForm[category.id] || {};
        const numericValue = Number(value.value ?? value.amount);
        if (Number.isFinite(numericValue) && numericValue > 0) {
          cleaned[category.id] = {
            amount: numericValue,
            value: numericValue,
            calculationType: value.calculationType === 'percentage' ? 'percentage' : 'amount',
            frequency: value.frequency || 'monthly',
          };
        }
      });
      const result = await saveVitalForecast({
        name: budgetName || 'Prévision vitale',
        totalBudget: Number(totalBudget),
        needs: cleaned,
      });
      if (!result?.success) throw new Error('La prévision n’a pas été enregistrée.');
      setVitalOpen(false);
      setVitalError('');
    } catch (saveError) {
      setVitalError(saveError.message || (isEnglish ? 'Could not save the forecast.' : 'Impossible d’enregistrer cette prévision.'));
    } finally {
      setSavingVital(false);
    }
  };
  const deleteVital = async () => {
    if (!(await appConfirm(isEnglish ? 'Do you really want to delete all your essential spending forecasts?' : 'Voulez-vous vraiment supprimer toutes vos prévisions vitales ?', { title: isEnglish ? 'Delete all forecasts?' : 'Supprimer toutes les prévisions ?', kind: 'danger', confirmLabel: isEnglish ? 'Delete all' : 'Tout supprimer' }))) return;
    await deleteVitalForecast();
  };

  const applyVitalToBudget = () => {
    if (!savedTotalVital) return;
    const defaultSource = budgetTargetMonthSources[0] || null;
    setVitalApplySourceId(defaultSource?.id || '');
    setVitalCreateIncome(false);
    setVitalApplyError('');
    setVitalApplyOpen(true);
  };

  const confirmApplyVitalToBudget = async () => {
    if (!savedTotalVital || savingApplied) return;
    setVitalApplyError('');
    setVitalApplyBusy(true);
    try {
      const selectedSource = budgetTargetMonthSources.find((income) => income.id === vitalApplySourceId);
      if (!vitalCreateIncome && !selectedSource) {
        setVitalApplyError(isEnglish
          ? 'Choose an available income source, or explicitly select the option to create a new income.'
          : 'Choisis une source de revenu disponible ou coche explicitement la création d’un nouveau revenu.');
        return;
      }

      const planBase = vitalCreateIncome
        ? Math.round(Number(totalBudget) > 0 ? Number(totalBudget) : savedTotalVital)
        : Math.max(0, Number(selectedSource?.amount) || 0);
      if (!Number.isSafeInteger(planBase) || planBase <= 0) throw new Error(isEnglish ? 'The selected income amount is invalid.' : 'Le montant de la source choisie est invalide.');

      const plannedItems = allCategories.map((category) => {
        const need = vitalNeeds[category.id] || {};
        const value = Number(need.value ?? need.amount ?? 0);
        const calculationType = need.calculationType === 'percentage' ? 'percentage' : 'amount';
        const frequency = need.frequency || 'monthly';
        const calculated = calculateBudgetLine({
          categoryId: category.id,
          value,
          calculationType,
          frequency,
        }, planBase);
        return {
          categoryId: category.id,
          amount: calculated.amount,
          value,
          calculationType,
          frequency,
        };
      }).filter((item) => item.amount > 0);

      if (!plannedItems.length || plannedItems.length > 30) {
        throw new Error(isEnglish ? 'The forecast contains no valid budget categories.' : 'Cette prévision ne contient aucune catégorie de budget valide.');
      }

      let incomeSourceId = vitalApplySourceId;
      if (vitalCreateIncome) {
        const plannedIncomeAmount = planBase;
        const confirmed = await appConfirm(
          isEnglish
            ? 'Pata will add a new income of ' + formatCurrency(plannedIncomeAmount) + ' called "' + (budgetName || 'Forecast budget') + '" and attach these envelopes to it. This is a real income entry. Continue?'
            : 'Pata va réellement enregistrer un nouveau revenu de ' + formatCurrency(plannedIncomeAmount) + ' nommé « ' + (budgetName || 'Budget prévisionnel') + ' », puis rattacher les enveloppes à ce revenu. Continuer ?',
          { title: isEnglish ? 'Create an income too?' : 'Créer aussi un revenu ?', kind: 'warning', confirmLabel: isEnglish ? 'Create income and budgets' : 'Créer le revenu et les budgets' }
        );
        if (!confirmed) return;
        const incomeResult = await createIncome(user.uid, {
          amount: plannedIncomeAmount,
          source: budgetName || (isEnglish ? 'Forecast budget' : 'Budget prévisionnel'),
          categoryId: 'salary',
          note: isEnglish ? 'Created deliberately from an essential spending forecast' : 'Créé volontairement depuis une prévision de dépenses essentielles',
          date: month === todayMonth() ? todayIso() : month + '-01',
          month,
        });
        incomeSourceId = incomeResult.id;
      }

      const source = vitalCreateIncome
        ? { id: incomeSourceId, source: budgetName || 'Budget prévisionnel', remaining: planBase }
        : selectedSource;
      if (!incomeSourceId) throw new Error(isEnglish ? 'The income source could not be identified.' : 'La source de revenu n’a pas pu être identifiée.');

      const totalToAllocate = plannedItems.reduce((sum, item) => sum + item.amount, 0);
      if (source.balanceAvailable === true && totalToAllocate > Number(source.remaining || 0)) {
        const confirmed = await appConfirm(
          isEnglish
            ? 'These envelopes total ' + formatCurrency(totalToAllocate) + ', while ' + formatCurrency(Number(source.remaining) || 0) + ' remains available on this income. Keep this budget plan anyway?'
            : 'Ces enveloppes totalisent ' + formatCurrency(totalToAllocate) + ', alors qu’il reste ' + formatCurrency(Number(source.remaining) || 0) + ' sur ce revenu. Veux-tu quand même conserver ce budget ?',
          { title: isEnglish ? 'Budget exceeds available balance' : 'Budget supérieur au solde disponible', kind: 'warning', confirmLabel: isEnglish ? 'Keep the budget' : 'Conserver le budget' }
        );
        if (!confirmed) return;
      }

      const result = await upsertBudgets(user.uid, {
        items: plannedItems,
        month,
        incomeSourceId,
      });
      setSelectedIncomeToApply(incomeSourceId);
      setApplied(false);
      setVitalApplyOpen(false);
      await appAlert(
        isEnglish
          ? 'Your forecast has been applied to ' + source.source + '. ' + (result.createdCount || 0) + ' envelope(s) created and ' + (result.updatedCount || 0) + ' updated.'
          : 'Ta prévision est maintenant appliquée au revenu « ' + source.source + ' ». ' + (result.createdCount || 0) + ' enveloppe(s) créée(s) et ' + (result.updatedCount || 0) + ' mise(s) à jour.',
        { kind: 'success', title: isEnglish ? 'Budgets applied' : 'Budgets appliqués' }
      );
    } catch (applyError) {
      setVitalApplyError(applyError.message || (isEnglish ? 'Could not apply the forecast.' : 'Impossible d’appliquer cette prévision.'));
    } finally {
      setVitalApplyBusy(false);
    }
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
      amountLocked: income.balanceAvailable !== true || Number(income.spent) > 0,
      source: income.source || 'Revenu',
      categoryId: income.categoryId || 'other_income',
      image: income.image || '',
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
      flowType: income.flowType || 'normal', person: income.person || '', phone: income.phone || '', dueDate: income.dueDate || '', availableAsFunding: typeof income.availableAsFunding === 'boolean' ? income.availableAsFunding : null, repaymentDebtId: income.repaymentDebtId || '', counterpartyUid: income.counterpartyUid || '', counterpartyType: income.counterpartyType || 'person', bankName: income.bankName || '', bankChoice: income.counterpartyType === 'bank' ? (CAMEROON_BANKS.includes(income.bankName) ? income.bankName : '__other__') : '', bankCustomName: income.counterpartyType === 'bank' && !CAMEROON_BANKS.includes(income.bankName) ? (income.bankName || income.person || '') : '',
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
    if (form.flowType === 'debt_borrowed' && typeof form.availableAsFunding !== 'boolean') return setError('Indique si tu as reçu de l’argent ou des biens/services à crédit.');
    if (form.flowType === 'debt_borrowed' && (!debtCreditorName || !form.dueDate)) return setError(form.counterpartyType === 'bank' ? 'Choisis une banque ou saisis son nom, puis indique la date d’échéance.' : 'Indique la personne et la date d’échéance de la dette.');
    if (form.flowType === 'repayment_received' && !form.repaymentDebtId) return setError('Choisis la créance remboursée.');
    setSaving(true);
    try {
      if (!form.id && form.flowType === 'debt_borrowed') {
        try {
          const check = await checkFinancialOperation({
            operationType: 'debt_borrowed', amount, date: form.date, categoryId: 'debt_borrowed',
          });
          if (check.warnings?.length) {
            const warningDetails = check.warnings.map((warning) => translateText(warning, language)).join('\n\n');
            const reminder = isEnglish
              ? 'A reminder from Pata:\n\n' + warningDetails + '\n\nYou can keep your commitment and cancel, or continue anyway. Would you like to continue?'
              : 'Petit rappel de Pata :\n\n' + warningDetails + '\n\nTu peux respecter ton engagement et annuler, ou continuer quand même. Souhaites-tu poursuivre ?';
            if (!(await appConfirm(reminder, { title: isEnglish ? 'Pata reminder' : 'Rappel de Pata', kind: 'warning', confirmLabel: isEnglish ? 'Continue anyway' : 'Continuer quand même' }))) return;
          }
        } catch {
          if (!(await appConfirm(isEnglish ? 'Pata could not check your commitments right now. You can try again or continue without this check. Would you like to continue?' : 'Pata n’a pas pu vérifier tes engagements pour le moment. Tu peux réessayer ou continuer sans cette vérification. Souhaites-tu poursuivre ?', { title: isEnglish ? 'Commitment check unavailable' : 'Vérification indisponible', kind: 'warning', confirmLabel: isEnglish ? 'Continue without check' : 'Continuer sans vérification' }))) return;
        }
      }
      const payload = {
        amount, source: form.flowType === 'debt_borrowed' ? debtCreditorName : form.source,
        categoryId: form.flowType === 'debt_borrowed' ? 'debt_borrowed' : form.flowType === 'repayment_received' ? 'debt_repayment_received' : form.categoryId,
        flowType: form.flowType || 'normal', person: form.flowType === 'debt_borrowed' ? debtCreditorName : form.person, phone: form.phone, dueDate: form.dueDate,
        counterpartyType: form.flowType === 'debt_borrowed' ? (form.counterpartyType || 'person') : '',
        bankName: form.flowType === 'debt_borrowed' && form.counterpartyType === 'bank' ? debtCreditorName : '',
        counterpartyUid: form.flowType === 'debt_borrowed' && form.counterpartyType !== 'bank' ? (form.counterpartyUid || '') : '',
        availableAsFunding: form.flowType === 'debt_borrowed' ? form.availableAsFunding : false,
        repaymentDebtId: form.flowType === 'repayment_received' ? form.repaymentDebtId : '', note: form.note,
        date: form.date, month: form.date.slice(0, 7), projectId: ['normal', 'debt_borrowed'].includes(form.flowType) && isPremium ? form.projectId : '', time: form.time,
        locationLabel: form.locationLabel, latitude: form.latitude, longitude: form.longitude,
        locationAccuracy: form.locationAccuracy, paymentMethod: form.paymentMethod, details: form.details,
        image: form.image || '',
      };
      if (!form.id && form.scheduleEnabled) {
        const kind = form.flowType === 'debt_borrowed' ? 'debt_borrowed' : form.flowType === 'repayment_received' ? 'repayment_received' : 'income';
        await createScheduledTransaction(user.uid, {
          ...payload,
          kind,
          scheduleDate: form.date,
          recurrenceEnabled: form.flowType === 'normal' && form.recurrenceEnabled === true,
          frequency: form.scheduleFrequency || 'monthly',
        });
        setOpen(false);
        setForm(emptyIncomeForm());
        return;
      }
      if (form.id) {
        await updateIncome(user.uid, form.id, payload);
      } else {
        const result = await createIncome(user.uid, payload);
        if (result.budgetRecommendation) setIncomeBudgetPrompt(result.budgetRecommendation);
        if (result.linkedDebt?.status === 'quota_reached') {
          await appAlert(translateText('Ta dette est bien enregistrée. Le quota gratuit de 2 liaisons de comptes par mois est atteint ; elle reste suivie normalement dans ton compte.', language), { kind: 'success', title: isEnglish ? 'Debt recorded' : 'Dette enregistrée' });
        }
        setShowCotisationReminder(true);
      }
      setOpen(false);
      setForm(emptyIncomeForm());
      setNextAction({ sequence: Date.now() });
    } catch (err) { setError(err.message || 'Impossible d’enregistrer ce revenu.'); } finally { setSaving(false); }
  };

  const onSaveRules = async () => {
    if (!isValid) return;
    setSavingRules(true);
    try { await saveRules(rules); setRulesSavedAt(new Date()); } finally { setSavingRules(false); }
  };

  const onResetRules = async () => {
    if (!(await appConfirm(isEnglish ? 'Reset the allocation percentages to their defaults?' : 'Réinitialiser les pourcentages par défaut ?', { title: isEnglish ? 'Reset allocation?' : 'Réinitialiser la répartition ?', confirmLabel: isEnglish ? 'Reset' : 'Réinitialiser' }))) return;
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
      await appAlert(isEnglish ? `You have ${Math.max(0, 2 - usedBudgets)} free budget creation(s) left this month, but this allocation requires ${newBudgetCount}. Existing budgets can be edited without using another creation.` : `Il te reste ${Math.max(0, 2 - usedBudgets)} création(s) de budget sur ton compte gratuit ce mois-ci, mais cette répartition en nécessite ${newBudgetCount}. Les budgets déjà existants peuvent être modifiés sans consommer une nouvelle création.`, { kind: 'warning', title: isEnglish ? 'Free budget limit' : 'Limite de budgets gratuits' });
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

  const loadMoreIncomeExpenses = async () => {
    if (!selectedIncome?.id || !incomeExpenseDetails.nextCursor || incomeExpenseDetails.loadingMore) return;
    setIncomeExpenseDetails((current) => ({ ...current, loadingMore: true, error: '' }));
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/incomes/expenses?incomeId=' + encodeURIComponent(selectedIncome.id) + '&cursor=' + encodeURIComponent(incomeExpenseDetails.nextCursor), {
        headers: { Authorization: 'Bearer ' + token },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de charger les dépenses suivantes.');
      setIncomeExpenseDetails((current) => {
        if (current.incomeId !== selectedIncome.id) return current;
        const value = {
          ...current,
          loadingMore: false,
          expenses: [...current.expenses, ...(Array.isArray(result.expenses) ? result.expenses : [])],
          nextCursor: result.nextCursor || null,
        };
        incomeExpenseDetailsCache.set(user.uid + ':' + selectedIncome.id, {
          expiresAt: Date.now() + INCOME_EXPENSE_DETAILS_CACHE_MS,
          value,
        });
        return value;
      });
    } catch (loadError) {
      setIncomeExpenseDetails((current) => ({ ...current, loadingMore: false, error: loadError.message || 'Impossible de charger les dépenses suivantes.' }));
    }
  };

  return (
    <div className="space-y-4">
      <ScrollAwareAddButton label="Ajouter un revenu" ariaLabel="Ajouter un revenu" onClick={openNewIncome} disabled={incomeQuotaReached} visible={!open && !selectedIncome && !deleteId && !vitalOpen && !vitalApplyOpen && !incomeBudgetPrompt}/>
      {nextAction && <NextBestAction key={nextAction.sequence} actionKey="income-saved" title={isEnglish ? 'Income saved' : 'Revenu enregistré'} description={isEnglish ? 'You can now allocate part of this income to your budgets and keep track of what remains available.' : 'Tu peux maintenant répartir une partie de ce revenu entre tes budgets et suivre ce qu’il te reste.'} href="/budgets" cta={isEnglish ? 'Organise this income' : 'Organiser ce revenu'} />}
      {showCotisationReminder && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3"><div><p className="text-sm font-semibold text-brand-900">Revenu enregistré.</p><p className="mt-0.5 text-xs text-brand-800">Pense à vérifier ta prochaine cotisation si tu participes à un groupe.</p></div><div className="flex items-center gap-3"><Link href="/cotisations" className="text-xs font-bold text-brand-800 underline">Voir mes cotisations</Link><button type="button" onClick={() => setShowCotisationReminder(false)} className="text-xs text-brand-700">Fermer</button></div></div>}
      <div className="pata-page-heading flex flex-wrap items-center justify-between gap-3">
        <h1 className="pata-page-title text-2xl font-bold text-slate-900">Revenus</h1>
        <div className="flex flex-wrap items-center gap-2">
          <AssistantShortcut label="Analyser mes revenus" prompt="Analyse mes sources de revenus dans Pata. Aide-moi à comprendre leur régularité, leur répartition et les risques de dépendance à une seule source. Propose des pistes adaptées sans modifier mes opérations." promptEn="Analyze my income sources in Pata. Help me understand how regular they are, how they are distributed and the risks of relying on a single source. Suggest practical improvements without changing my transactions." />
          <Button size="sm" onClick={openNewIncome} disabled={incomeQuotaReached} data-pata-tour="income-create-top" title={incomeQuotaReached ? 'Limite gratuite atteinte' : 'Ajouter un revenu'}>
            <Plus size={14}/> Ajouter un revenu
          </Button>
          <MonthPicker value={month} onChange={setMonth} className="w-full sm:w-auto" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><p className="text-[10px] leading-4 text-slate-500">Total encaissé (dettes incluses)</p><p className="mt-1 break-words text-sm font-extrabold tabular-nums text-slate-950 sm:text-base">{formatCurrency(earnedThisMonth)}</p></div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><p className="text-[10px] leading-4 text-slate-500">Total gagné sans dettes</p><p className="mt-1 break-words text-sm font-extrabold tabular-nums text-slate-950 sm:text-base">{formatCurrency(earnedWithoutDebtThisMonth)}</p></div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><p className="text-[10px] leading-4 text-slate-500">Sources sur la période</p><p className="mt-1 text-sm font-extrabold tabular-nums text-slate-950 sm:text-base">{monthEarningSources.length}</p></div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-[10px] leading-4 text-slate-500">Emprunts reçus</p>
          <p className="mt-1 text-sm font-extrabold tabular-nums text-slate-950 sm:text-base">{monthDebtIncomeSources.length}</p>
          <p className="mt-0.5 break-words text-[10px] font-medium text-slate-500">Montant : {formatCurrency(debtIncomeAmount)}</p>
        </div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><p className="text-[10px] leading-4 text-slate-500">Sources actives</p><p className="mt-1 text-sm font-extrabold tabular-nums text-slate-950 sm:text-base">{activeMonthSources.length}</p></div>
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><p className="text-[10px] leading-4 text-slate-500">Disponible (dettes incluses)</p><p className="mt-1 break-words text-sm font-extrabold tabular-nums text-brand-800 sm:text-base">{availableThisMonth == null ? '—' : formatCurrency(availableThisMonth)}</p></div>
      </div>
      <ScheduledTransactionsPanel kinds={['income', 'debt_borrowed', 'repayment_received']} isPremium={isPremium} compact />
      <nav aria-label={isEnglish ? 'Income sections' : 'Rubriques des revenus'} className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="tablist">
          {[
            ['all', isEnglish ? 'All' : 'Tout'],
            ['revenues', isEnglish ? 'Income sources' : 'Revenus'],
            ['cashflow', isEnglish ? 'Cash flow' : 'Trésorerie'],
            ['vital', isEnglish ? 'Essential forecasts' : 'Prévisions vitales'],
            ['duration', isEnglish ? 'Money duration' : 'Durée du capital'],
            ['budgets', isEnglish ? 'Budgets' : 'Budgets'],
          ].map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={incomeSection === value}
              onClick={() => setIncomeSection(value)}
              className={'pata-filter-pill min-h-10 w-full rounded-xl border px-2 py-2 text-xs font-semibold leading-4 transition ' + (incomeSection === value ? 'is-active border-brand-700 bg-brand-700 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800')}>
              {label}
            </button>
          ))}
      </nav>
      {(incomeSection === 'all' || incomeSection === 'revenues') && !premiumActive && (
        <div className={`pata-quota-panel rounded-xl border p-3 ${incomeQuotaReached ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-sm font-semibold text-slate-800">Revenus créés ce mois-ci</p><p className="text-xs text-slate-500">{usedIncomeQuota} sur 2 autorisés avec le compte gratuit.</p></div>
            <span className="text-sm font-bold text-slate-700">{Math.min(usedIncomeQuota, 2)}/2</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.min(100, usedIncomeQuota / 2 * 100)}%` }} /></div>
          {incomeQuotaReached && <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-amber-800">Tu as utilisé tes deux créations de revenus pour ce mois.</p><Button type="button" size="sm" onClick={() => window.location.assign('/premium')}>Passer à Premium</Button></div>}
        </div>
      )}

      {(incomeSection === 'all' || incomeSection === 'revenues') && (
        <Card className="border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Ton plus gros revenu du mois</CardTitle>
              <p className="mt-1 text-xs text-slate-500">La somme la plus élevée reçue pendant le mois sélectionné.</p>
            </div>
            <span className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">{month}</span>
          </div>
          {highestIncomeInMonth ? (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
              <CategoryImage categoryId={highestIncomeInMonth.categoryId} image={highestIncomeInMonth.image || [...INCOME_CATEGORIES, ...customIncomeCategories].find((item) => item.id === highestIncomeInMonth.categoryId)?.image} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{highestIncomeInMonth.source || 'Revenu'}</p>
                <p className="mt-1 text-xs text-slate-500">{formatIncomeDate(highestIncomeInMonth.date)}</p>
              </div>
              <strong className="shrink-0 text-right text-base font-bold text-slate-900">{formatCurrency(highestIncomeInMonth.amount)}</strong>
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-slate-200 p-3 text-sm text-slate-500">Aucun revenu enregistré pour ce mois.</p>
          )}
        </Card>
      )}

      {(incomeSection === 'all' || incomeSection === 'cashflow') && (
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Prévision de trésorerie</CardTitle>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Si tu gardes le rythme de sorties observé récemment, voici ce qu’il pourrait te rester dans 3, 7 ou 30 jours, sans nouveau revenu.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">Basée sur les 30 derniers jours</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[11px] text-slate-500">Disponible maintenant</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{cashflowForecast.availableNow == null ? 'Indisponible' : formatCurrency(cashflowForecast.availableNow)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[11px] text-slate-500">Sorties moyennes / jour</p>
            <p className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(Math.round(cashflowForecast.averageDailyOutflow))}</p>
          </div>
          {cashflowForecast.projections.map((item) => (
            <div key={item.days} className="rounded-xl border border-slate-100 p-3">
              <p className="text-[11px] text-slate-500">Dans {item.days} jours</p>
              <p className={'mt-1 text-sm font-bold ' + (item.remaining != null && item.remaining < 0 ? 'text-red-600' : 'text-emerald-700')}>{item.remaining == null ? 'Indisponible' : item.remaining < 0 ? 'Déficit estimé : ' + formatCurrency(Math.abs(item.remaining)) : formatCurrency(item.remaining)}</p>
              <p className="mt-1 text-[10px] text-slate-400">Sorties prévues : {formatCurrency(item.plannedOutflow)}</p>
            </div>
          ))}
        </div>
        {cashflowForecast.totalOutflows <= 0
          ? <p className="mt-3 text-xs text-amber-700">Pas encore de sortie exploitable sur la période. Enregistre tes dépenses pour obtenir une estimation plus pertinente.</p>
          : <p className="mt-3 text-[11px] text-slate-400">Calcul fondé sur {cashflowForecast.observedDays} jour(s) d’observation et les sorties enregistrées. Les revenus futurs et les dépenses exceptionnelles ne sont pas anticipés.</p>}
      </Card>
      )}

      {(incomeSection === 'all' || incomeSection === 'vital') && Array.isArray(profile?.vitalForecastHistory) && profile.vitalForecastHistory.length > 0 && (
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
      {(incomeSection === 'all' || incomeSection === 'vital') && (
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
            Calcule tes besoins par catégorie, puis applique-les directement à une source de revenu. La création d’un nouveau revenu reste facultative.
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
                  if (!need || !Number(need.value ?? need.amount)) return null;
                  const monthly = calculateBudgetLine({
                    categoryId: k.id,
                    value: need.value ?? need.amount,
                    calculationType: need.calculationType === 'percentage' ? 'percentage' : 'amount',
                    frequency: need.frequency || 'monthly',
                  }, Number(profile?.vitalTotalBudget) || 0).amount;
                  return (
                    <li key={k.id} className="flex items-center justify-between gap-3 text-xs text-slate-600">
                      <span className="flex min-w-0 items-center gap-2">
                        <CategoryImage categoryId={k.id} image={k.image} size="sm" />
                        <span className="min-w-0">
                          <strong className="block truncate font-semibold text-slate-700">{k.label}</strong>
                          <span className="block text-[10px] text-slate-400">
                            {need.calculationType === 'percentage' ? (Number(need.value ?? need.amount) + '% du revenu') : (formatCurrency(Number(need.value ?? need.amount)) + ' par période')}
                            {' · ' + (FREQUENCIES.find((frequency) => frequency.id === need.frequency)?.label?.toLowerCase() || 'par mois')}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">{formatCurrency(Math.round(monthly))}</span>
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
              <Button onClick={applyVitalToBudget} className="w-full" disabled={vitalApplyBusy || isSavedOverBudget}>
                <ArrowRight size={14} /> Appliquer aux budgets
              </Button>
              <Button variant="outline" onClick={() => analyzeWithAssistant(
                `Analyse en profondeur mes Prévisions vitales. Nom : ${profile?.vitalBudgetName || 'Budget'}. Budget total : ${Number(totalBudget) || 0} FCFA. Détail mensuel par catégorie : ${allCategories.map((category) => { const need = vitalNeeds[category.id]; if (!need?.amount) return null; const frequency = FREQUENCIES.find((item) => item.id === need.frequency); return `${category.label}: ${Number(need.amount) * (frequency?.multiplier || 1)} FCFA/mois`; }).filter(Boolean).join('; ')}. Explique les points de vigilance et propose des améliorations concrètes sans modifier mes données.`,
                `Analyze my essential spending forecast in depth. Name: ${profile?.vitalBudgetName || 'Budget'}. Total budget: ${Number(totalBudget) || 0} XAF. Monthly breakdown by category: ${allCategories.map((category) => { const need = vitalNeeds[category.id]; if (!need?.amount) return null; const frequency = FREQUENCIES.find((item) => item.id === need.frequency); return `${translateText(category.label, 'en')}: ${Number(need.amount) * (frequency?.multiplier || 1)} XAF/month`; }).filter(Boolean).join('; ')}. Explain what I should watch and suggest practical improvements without changing any data.`
              )} className="w-full">
                Continuer l’analyse avec Mč
              </Button>
            </div>
          </>
        )}
      </Card>
      )}

      {(incomeSection === 'all' || incomeSection === 'duration') && (
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
          <div className="sm:col-span-2 flex flex-wrap gap-2"><Button type="submit" disabled={savingDuration} className="w-full sm:w-auto">{savingDuration ? 'Enregistrement…' : 'Enregistrer cette estimation'}</Button><Button type="button" variant="outline" onClick={() => analyzeWithAssistant(
                `Explique-moi simplement cette estimation de durée du capital. Capital disponible : ${Number(durationCapital) || 0} FCFA. Dépense : ${Number(durationExpense) || 0} FCFA ${durationFrequency === 'daily' ? 'par jour' : durationFrequency === 'weekly' ? 'par semaine' : 'par mois'}. Équivalent quotidien : ${Math.round(dailyRate)} FCFA. Durée estimée : ${calculatedDurationDays ?? 'non calculable'} jour(s). Précise les hypothèses et signale si ma dépense par période dépasse mon capital.`,
                `Explain this money-duration estimate in simple terms. Available capital: ${Number(durationCapital) || 0} XAF. Spending: ${Number(durationExpense) || 0} XAF ${durationFrequency === 'daily' ? 'per day' : durationFrequency === 'weekly' ? 'per week' : 'per month'}. Daily equivalent: ${Math.round(dailyRate)} XAF. Estimated duration: ${calculatedDurationDays ?? 'not calculable'} days. Explain the assumptions and point out whether my spending per period exceeds my available capital.`
              )}>Comprendre avec Mč</Button></div>
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
                  <Button type="button" size="sm" variant="outline" onClick={() => analyzeWithAssistant(
                    `Analyse cette prévision de durée du capital et donne-moi des conseils concrets. Nom : ${forecast.name}. Capital : ${forecast.capital} FCFA. Dépense quotidienne : ${forecast.dailyExpense} FCFA. Hebdomadaire : ${forecast.weeklyExpense} FCFA. Mensuelle : ${forecast.monthlyExpense} FCFA. Moyenne par jour : ${forecast.averageDaily} FCFA. Durée estimée : ${forecast.estimatedDays} jours, jusqu’au ${forecast.estimatedEndDate}.`,
                    `Analyze this money-duration forecast and give me practical advice. Name: ${forecast.name}. Capital: ${forecast.capital} XAF. Daily spending: ${forecast.dailyExpense} XAF. Weekly spending: ${forecast.weeklyExpense} XAF. Monthly spending: ${forecast.monthlyExpense} XAF. Daily average: ${forecast.averageDaily} XAF. Estimated duration: ${forecast.estimatedDays} days, until ${forecast.estimatedEndDate}.`
                  )}>Analyser avec Mč</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      )}

      {(incomeSection === 'all' || incomeSection === 'revenues') && (
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Toutes mes sources de revenus</CardTitle>
            <p className="mt-1 text-[11px] text-slate-500">{filteredIncomes.length} affichée(s) sur {incomesWithBalance.length}</p>
          </div>
          <Button size="sm" onClick={openNewIncome} data-pata-tour="income-create" disabled={incomeQuotaReached} className={incomeQuotaReached ? "opacity-50 grayscale" : ""}><Plus size={14} /> {incomeQuotaReached ? "Limite atteinte" : "Ajouter"}</Button>
        </div>
        <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input type="search" value={incomeSearch} onChange={(event) => setIncomeSearch(event.target.value)} placeholder="Rechercher une source, une note…" aria-label="Rechercher un revenu" className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-brand-400"/>
            <select value={incomeFilterCategory} onChange={(event) => setIncomeFilterCategory(event.target.value)} aria-label="Filtrer par catégorie de revenu" className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs">
              <option value="all">Toutes les catégories</option>
              {INCOME_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
              {customIncomeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <select value={incomeAvailability} onChange={(event) => setIncomeAvailability(event.target.value)} aria-label="Filtrer par disponibilité" className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs">
              <option value="all">Tous les soldes</option><option value="available">Encore disponibles</option><option value="exhausted">Déjà épuisés</option><option value="unverified">Solde à vérifier</option>
            </select>
            <select value={incomeSort} onChange={(event) => setIncomeSort(event.target.value)} aria-label="Trier les revenus" className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs">
              <option value="pinned_newest">Épinglés et récents</option><option value="date_newest">Plus récents</option><option value="date_oldest">Plus anciens</option><option value="amount_high">Montant : plus élevé</option><option value="amount_low">Montant : moins élevé</option><option value="available_high">Disponible : plus élevé</option><option value="available_low">Disponible : moins élevé</option>
            </select>
            <input type="number" min="0" step="1" value={incomeMinAmount} onChange={(event) => setIncomeMinAmount(event.target.value)} placeholder="Montant min." aria-label="Montant minimum du revenu" className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs"/>
            <input type="number" min="0" step="1" value={incomeMaxAmount} onChange={(event) => setIncomeMaxAmount(event.target.value)} placeholder="Montant max." aria-label="Montant maximum du revenu" className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs"/>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[10px] text-slate-500">Tu peux combiner plusieurs filtres.</p>
            <button type="button" onClick={() => { setIncomeSearch(''); setIncomeFilterCategory('all'); setIncomeAvailability('all'); setIncomeSort('pinned_newest'); setIncomeMinAmount(''); setIncomeMaxAmount(''); }} className="text-[11px] font-semibold text-brand-700 hover:underline">Réinitialiser</button>
          </div>
        </div>
        {incomesLoading ? (
          <div className="flex justify-center py-8"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent"/></div>
        ) : incomesWithBalance.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Aucun revenu enregistré" description="Ajoute ton salaire ou une source de revenu." />
        ) : filteredIncomes.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Aucun résultat" description="Aucun revenu ne correspond à tes filtres. Modifie ou réinitialise les critères."/>
        ) : (
          <ul className="space-y-3">
            {filteredIncomes.map((inc) => (
              <li key={inc.id}
                onPointerDown={(event) => startIncomeLongPress(event, inc)}
                onPointerUp={clearPinPressTimer}
                onPointerLeave={clearPinPressTimer}
                onPointerCancel={clearPinPressTimer}
                onContextMenu={(event) => { event.preventDefault(); suppressPinClickRef.current = false; setPinMenuId(inc.id); }}
                className={`rounded-2xl border p-3 transition ${inc.isExhausted ? 'border-slate-100 bg-slate-50/50' : 'border-slate-200 bg-white'}`}>
                <button type="button" data-pin-long-press="true" onClick={() => openIncomeDetails(inc)} className="flex w-full items-center justify-between gap-3 rounded-xl text-left focus:outline-none focus:ring-2 focus:ring-brand-200">
                  <span className="flex min-w-0 items-center gap-3">
                    <CategoryImage categoryId={inc.categoryId} image={inc.image || [...INCOME_CATEGORIES, ...customIncomeCategories].find((category) => category.id === inc.categoryId)?.image} size="md"/>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-slate-900">{inc.source}</strong>{inc.isPinned && <Pin size={12} className="fill-current text-brand-600" aria-label="Épinglé"/>}{inc.isExhausted && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Épuisé</span>}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{formatDate(inc.date)} · {inc.cashPocket ? 'Portefeuille espèces' : INCOME_CATEGORIES.find(c => c.id === inc.categoryId)?.label || 'Revenu'}</span>
                      {inc.cashPocket ? <span className="mt-1 inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Espèces · transfert depuis Mobile Money</span> : inc.flowType === 'debt_borrowed' ? <span className="mt-1 inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{inc.availableAsFunding === true ? 'Dette · argent reçu' : inc.availableAsFunding === false ? 'Dette · biens ou services pris à crédit' : 'Dette · nature à préciser'}</span> : inc.neutralFlow && <span className="mt-1 inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Mouvement neutre</span>}
                      {inc.repaymentDebtId && <span className="mt-1 inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Remboursement reçu</span>}
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">{inc.time && <span className="inline-flex items-center gap-1"><Clock3 size={10}/>{inc.time}</span>}{inc.locationLabel && <span className="inline-flex max-w-[150px] items-center gap-1 truncate"><MapPin size={10}/>{inc.locationLabel}</span>}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right"><strong className="block text-sm font-bold text-slate-900">{formatCurrency(inc.amount)}</strong><span className="text-[10px] font-medium text-brand-700">Voir le détail</span></span>
                </button>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
                  <span className="text-[11px] text-slate-500">{inc.flowType === 'debt_borrowed' ? (inc.debtArchived ? 'Emprunt remboursé · dossier archivé · conservé dans les revenus encaissés' : inc.availableAsFunding === true ? `Emprunt reçu · ${formatCurrency(inc.remaining)} disponible · compté dans les revenus encaissés · à rembourser` : inc.availableAsFunding === false ? 'Dette suivie · biens/services à crédit' : 'Dette ancienne · nature à préciser') : !inc.balanceAvailable ? 'Solde indisponible — vérification nécessaire' : inc.isExhausted ? (inc.exhaustedDate ? `Épuisé le ${formatDate(inc.exhaustedDate)}` : 'Source épuisée') : `Disponible : ${formatCurrency(inc.remaining)}`}</span>
                  <span className="flex items-center gap-1">
                    {!inc.neutralFlow && inc.flowType !== 'debt_borrowed' && inc.categoryId !== 'debt_borrowed' && <button type="button" onClick={() => setDeleteId(inc.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Supprimer ce revenu"><Trash2 size={14}/></button>}
                  </span>
                </div>
                {inc.balanceAvailable && !inc.isExhausted && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{width: `${inc.amount > 0 ? Math.min(100, (inc.spent / inc.amount) * 100) : 0}%`}}/></div>}
                </li>
            ))}
          </ul>
        )}
      </Card>
      )}

      {(incomeSection === 'all' || incomeSection === 'budgets') && (
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
      )}

      {(incomeSection === 'all' || incomeSection === 'budgets') && totalIncome > 0 && breakdown.length > 0 && (
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

      <Modal open={Boolean(pinMenuId)} onClose={() => { suppressPinClickRef.current = false; setPinMenuId(null); }} title="Options du revenu">
        {(() => {
          const incomeToPin = incomesWithBalance.find((item) => item.id === pinMenuId);
          if (!incomeToPin) return <p className="text-sm text-slate-500">Ce revenu n’est plus disponible.</p>;
          return (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">{incomeToPin.source || 'Revenu'}</p>
                <p className="mt-1 text-xs text-slate-500">{formatCurrency(incomeToPin.amount)}</p>
              </div>
              <Button type="button" className="w-full" onClick={() => toggleIncomePinned(incomeToPin)} disabled={pinSavingId === incomeToPin.id}>
                <Pin size={14} className={incomeToPin.isPinned ? 'fill-current' : ''}/>
                {pinSavingId === incomeToPin.id ? 'Enregistrement…' : incomeToPin.isPinned ? 'Désépingler ce revenu' : 'Épingler ce revenu'}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={() => { suppressPinClickRef.current = false; setPinMenuId(null); }}>Annuler</Button>
            </div>
          );
        })()}
      </Modal>

      <Modal open={!!selectedIncome} onClose={() => setSelectedIncome(null)} title={selectedIncome?.cashPocket ? 'Détail des espèces' : 'Détail du revenu'}>
        {selectedIncome && (() => {
          const methodLabels = { cash: 'Espèces', mtn_momo: 'MTN Mobile Money', orange_money: 'Orange Money', bank_transfer: 'Virement bancaire', card: 'Carte bancaire', other: 'Autre moyen' };
          return ( 
            <div className="space-y-4">
              {(() => {
                const incomeCategory = [...INCOME_CATEGORIES, ...customIncomeCategories].find((category) => category.id === selectedIncome.categoryId);
                const isBorrowedIncome = selectedIncome.flowType === 'debt_borrowed' || selectedIncome.categoryId === 'debt_borrowed';
                const isTrackedIncome = !selectedIncome.cashPocket && (!selectedIncome.neutralFlow || isBorrowedIncome);
                const isEditableStandardIncome = !selectedIncome.cashPocket && !selectedIncome.neutralFlow && !isBorrowedIncome;
                const detailsReady = !incomeExpenseDetails.loading && !incomeExpenseDetails.error && incomeExpenseDetails.incomeId === selectedIncome.id;
                const visibleExpenses = detailsReady ? incomeExpenseDetails.expenses : [];
                const categoryTotals = new Map();
                const typeTotals = new Map();
                const dayTotals = new Map();
                visibleExpenses.forEach((expense) => {
                  const categoryId = normalizeExpenseCategoryId(expense.categoryId || 'other');
                  const categoryTotal = categoryTotals.get(categoryId) || { amount: 0, count: 0 };
                  categoryTotals.set(categoryId, { amount: categoryTotal.amount + (Number(expense.amount) || 0), count: categoryTotal.count + 1 });
                  const typeLabel = getIncomeExpenseFlowLabel(expense, isEnglish);
                  const typeTotal = typeTotals.get(typeLabel) || { amount: 0, count: 0 };
                  typeTotals.set(typeLabel, { amount: typeTotal.amount + (Number(expense.amount) || 0), count: typeTotal.count + 1 });
                  const day = String(expense.date || '').slice(0, 10);
                  if (day) dayTotals.set(day, (dayTotals.get(day) || 0) + (Number(expense.amount) || 0));
                });
                const categoryRows = [...categoryTotals.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 5);
                const typeRows = [...typeTotals.entries()].sort((a, b) => b[1].amount - a[1].amount);
                const topDay = [...dayTotals.entries()].sort((a, b) => b[1] - a[1])[0] || null;
                const remainingAmount = Number(selectedIncome.amount || 0) - Number(incomeExpenseDetails.totalSpent || 0);
                const loanGivenRows = visibleExpenses.filter((expense) => expense.flowType === 'loan_given' || expense.categoryId === 'loan_given');
                const loanGivenTotal = loanGivenRows.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
                const budgetAllocated = selectedIncomeBudgets.reduce((sum, budget) => sum + (Number(budget.amount) || 0), 0);
                const budgetCategoryIds = new Set(selectedIncomeBudgets.map((budget) => normalizeExpenseCategoryId(budget.categoryId)));
                const monthBudgetExpenses = visibleExpenses.filter((expense) =>
                  String(expense.date || '').startsWith(selectedIncomeBudgetMonth)
                  && !expense.neutralFlow
                  && !expense.cashWithdrawal
                  && expense.flowType !== 'loan_given'
                );
                const budgetSpent = monthBudgetExpenses.filter((expense) => budgetCategoryIds.has(normalizeExpenseCategoryId(expense.categoryId)))
                  .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
                const unbudgetedSpent = monthBudgetExpenses.filter((expense) => !budgetCategoryIds.has(normalizeExpenseCategoryId(expense.categoryId)))
                  .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
                const budgetCheckComplete = detailsReady && !incomeExpenseDetails.nextCursor;
                const budgetOverrun = selectedIncomeBudgets.reduce((total, budget) => {
                  const categoryId = normalizeExpenseCategoryId(budget.categoryId);
                  const categorySpent = monthBudgetExpenses
                    .filter((expense) => normalizeExpenseCategoryId(expense.categoryId) === categoryId)
                    .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
                  return total + Math.max(0, categorySpent - (Number(budget.amount) || 0));
                }, 0);
                const budgetLink = '/budgets?month=' + encodeURIComponent(selectedIncomeBudgetMonth) + '&incomeId=' + encodeURIComponent(selectedIncome.id);
                const expenseCategoryFor = (id) => [...EXPENSE_CATEGORIES, ...customCategories].find((category) => category.id === normalizeExpenseCategoryId(id)) || null;
                return (
                  <>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      <CategoryImage
                        categoryId={selectedIncome.categoryId}
                        image={selectedIncome.image || incomeCategory?.image}
                        size="banner"
                      />
                      <div className="bg-brand-50 p-4 text-center">
                        <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">{selectedIncome.cashPocket ? 'Poche espèces · mouvement neutre' : incomeCategory?.label || incomeCategory?.name || 'Revenu'}</p>
                        <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{formatCurrency(selectedIncome.amount)}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-700">{selectedIncome.source}</p>
                        {isEditableStandardIncome && (
                          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => openEditIncome(selectedIncome)}>
                            <Pencil size={13}/> Modifier la photo ou les informations
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3">
                      <div className="flex justify-between gap-4 py-3 text-sm"><span className="text-slate-500">Date</span><strong className="text-right capitalize text-slate-800">{formatIncomeDate(selectedIncome.date)}</strong></div>
                      <div className="flex justify-between gap-4 py-3 text-sm"><span className="text-slate-500">Heure</span><strong className="text-right text-slate-800">{selectedIncome.time || 'Non renseignée'}</strong></div>
                      <div className="flex justify-between gap-4 py-3 text-sm"><span className="text-slate-500">Lieu</span><strong className="max-w-[60%] text-right text-slate-800">{selectedIncome.locationLabel || 'Non renseigné'}</strong></div>
                      <div className="flex justify-between gap-4 py-3 text-sm"><span className="text-slate-500">Moyen de réception</span><strong className="text-right text-slate-800">{methodLabels[selectedIncome.paymentMethod] || 'Non précisé'}</strong></div>
                      <div className="flex justify-between gap-4 py-3 text-sm"><span className="text-slate-500">Client / mission</span><strong className="max-w-[60%] text-right text-slate-800">{selectedIncome.details || 'Non renseigné'}</strong></div>
                      <div className="py-3 text-sm"><p className="text-slate-500">Note</p><p className="mt-1 whitespace-pre-wrap text-slate-800">{selectedIncome.note || 'Aucune note'}</p></div>
                    </div>
                    {selectedIncome.latitude != null && selectedIncome.longitude != null && <a href={'https://www.google.com/maps?q=' + selectedIncome.latitude + ',' + selectedIncome.longitude} target="_blank" rel="noreferrer" className="block rounded-xl border border-slate-200 px-3 py-2.5 text-center text-xs font-semibold text-brand-800 hover:bg-brand-50">Voir la position sur la carte</a>}

                    {isTrackedIncome && (
                      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-bold text-slate-900">Budget associé à ce revenu</h3>
                              <p className="mt-1 text-xs text-slate-500">Vérifie ce qui était prévu pour cet argent et ce qui a réellement été dépensé.</p>
                            </div>
                            <Link href={budgetLink} className="text-xs font-semibold text-brand-700 underline underline-offset-2">Voir ce budget</Link>
                          </div>
                        </div>
                        <div className="space-y-3 p-3">
                          {selectedIncomeBudgetsLoading ? (
                            <p className="text-xs text-slate-500">Chargement du budget associé…</p>
                          ) : selectedIncomeBudgets.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-200 p-3">
                              <p className="text-sm font-semibold text-slate-700">Aucun budget n’a encore été configuré pour ce revenu.</p>
                              <p className="mt-1 text-xs leading-5 text-slate-500">Tu peux créer des enveloppes par catégorie et revenir ici pour suivre leur respect.</p>
                              <Link href={budgetLink} className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-brand-700 hover:bg-brand-50">Configurer un budget pour ce revenu</Link>
                            </div>
                          ) : (
                            <>
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-500">Montant prévu</p><p className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(budgetAllocated)}</p><p className="mt-1 text-[10px] text-slate-500">{selectedIncomeBudgets.length} enveloppe(s)</p></div>
                                <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-500">{budgetCheckComplete ? 'Dépensé dans ces enveloppes' : 'Dépenses consultées'}</p><p className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(budgetSpent)}</p></div>
                                <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] text-slate-500">Sans enveloppe</p><p className="mt-1 text-sm font-bold text-slate-900">{budgetCheckComplete ? formatCurrency(unbudgetedSpent) : 'À vérifier'}</p></div>
                              </div>
                              {!budgetCheckComplete ? (
                                <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">La comparaison n’est pas encore complète. Consulte toutes les dépenses associées pour vérifier correctement le budget.</p>
                              ) : budgetOverrun ? (
                                <p className="rounded-lg bg-red-50 p-3 text-xs leading-5 text-red-700">Le montant dépensé dépasse les enveloppes prévues de {formatCurrency(budgetOverrun)}.</p>
                              ) : unbudgetedSpent > 0 ? (
                                <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">Le budget n’est pas complet : certaines dépenses n’ont pas encore d’enveloppe associée.</p>
                              ) : (
                                <p className="rounded-lg bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">Les dépenses consultées respectent les enveloppes configurées.</p>
                              )}
                            </>
                          )}
                          <Link href={budgetLink} className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">Ouvrir les budgets de ce revenu</Link>
                        </div>
                      </section>
                    )}

                    {isTrackedIncome && (
                      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left">
                        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                          <h3 className="text-sm font-bold text-slate-900">Ce que tu as fait avec cet argent</h3>
                          <p className="mt-1 text-xs leading-5 text-slate-500">Retrouve les sorties, les catégories utilisées et ce qu’il te reste de ce revenu.</p>
                        </div>
                        <div className="space-y-3 p-3">
                          {incomeExpenseDetails.loading || incomeExpenseDetails.incomeId !== selectedIncome.id ? (
                            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Chargement de tes opérations…</p>
                          ) : incomeExpenseDetails.error ? (
                            <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{incomeExpenseDetails.error}</p>
                          ) : (
                            <>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2"><p className="truncate text-[9px] leading-4 text-slate-500 sm:text-[10px]">Total des sorties</p><p className="mt-1 break-words text-xs font-bold leading-tight text-slate-900 sm:text-sm">{formatCurrency(incomeExpenseDetails.totalSpent)}</p></div>
                                <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2"><p className="truncate text-[9px] leading-4 text-slate-500 sm:text-[10px]">Reste estimé</p><p className={'mt-1 break-words text-xs font-bold leading-tight sm:text-sm ' + (remainingAmount < 0 ? 'text-red-600' : 'text-emerald-700')}>{formatCurrency(Math.max(0, remainingAmount))}</p>{remainingAmount < 0 && <p className="mt-1 text-[9px] text-red-600">Dépassement : {formatCurrency(Math.abs(remainingAmount))}</p>}</div>
                                <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2"><p className="truncate text-[9px] leading-4 text-slate-500 sm:text-[10px]">Opérations</p><p className="mt-1 text-xs font-bold leading-tight text-slate-900 sm:text-sm">{incomeExpenseDetails.expenseCount}</p></div>
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <div className="rounded-xl border border-slate-100 p-3">
                                  <h4 className="text-xs font-semibold text-slate-800">Nature des sorties</h4>
                                  {typeRows.length ? <div className="mt-2 space-y-1.5">{typeRows.map(([label, total]) => <div key={label} className="flex items-center justify-between gap-3 text-xs"><span className="min-w-0 flex-1 text-slate-600">{label} <span className="text-slate-400">({total.count})</span></span><strong className="shrink-0 text-slate-800">{formatCurrency(total.amount)}</strong></div>)}</div> : <p className="mt-2 text-xs text-slate-500">Aucune sortie enregistrée.</p>}
                                </div>
                                <div className="rounded-xl border border-slate-100 p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <h4 className="text-xs font-semibold text-slate-800">Prêts accordés avec cet argent</h4>
                                    <strong className="text-xs text-slate-900">{formatCurrency(loanGivenTotal)}</strong>
                                  </div>
                                  <p className="mt-1 text-[10px] text-slate-500">{loanGivenRows.length} prêt(s) retrouvé(s) dans les opérations affichées</p>
                                  {loanGivenRows.length ? <div className="mt-2 space-y-2">{loanGivenRows.map((loan) => <div key={loan.id} className="rounded-lg bg-slate-50 px-2.5 py-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="truncate text-xs font-semibold text-slate-800">{loan.person || loan.counterpartyName || 'Bénéficiaire non renseigné'}</p>
                                        <p className="mt-0.5 text-[10px] capitalize text-slate-500">{formatIncomeDate(loan.date)}</p>
                                        {loan.dueDate && <p className="mt-0.5 text-[10px] text-slate-500">Échéance : {formatIncomeDate(loan.dueDate)}</p>}
                                      </div>
                                      <strong className="shrink-0 text-xs text-slate-900">{formatCurrency(loan.amount)}</strong>
                                    </div>
                                  </div>)}</div> : <p className="mt-2 text-xs text-slate-500">Aucun prêt accordé n’est associé à ce revenu dans les opérations consultées.</p>}
                                </div>
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-xl border border-slate-100 p-3">
                                  <h4 className="text-xs font-semibold text-slate-800">Répartition par catégorie</h4>
                                  {categoryRows.length === 0 ? <p className="mt-2 text-xs text-slate-500">Aucune dépense enregistrée.</p> : (
                                    <div className="mt-2 space-y-2">
                                      {categoryRows.map(([categoryId, total]) => {
                                        const category = expenseCategoryFor(categoryId);
                                        return <div key={categoryId} className="flex items-center gap-2"><CategoryImage categoryId={categoryId} image={category?.image} size="sm"/><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-700">{category?.label || category?.name || 'Autre'}</strong><span className="text-[10px] text-slate-400">{total.count} opération(s)</span></span><strong className="shrink-0 text-xs text-slate-800">{formatCurrency(total.amount)}</strong></div>;
                                      })}
                                    </div>
                                  )}
                                </div>
                                <div className="rounded-xl border border-slate-100 p-3">
                                  <h4 className="text-xs font-semibold text-slate-800">Journée la plus coûteuse</h4>
                                  {topDay ? <><p className="mt-2 text-xs capitalize text-slate-600">{formatIncomeDate(topDay[0])}</p><p className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(topDay[1])}</p></> : <p className="mt-2 text-xs text-slate-500">Aucune date de dépense renseignée.</p>}
                                  {incomeExpenseDetails.nextCursor && <p className="mt-2 text-[10px] leading-4 text-slate-400">Ce classement évolue au fur et à mesure que tu consultes les autres opérations.</p>}
                                </div>
                              </div>
                              <div className="border-t border-slate-100 pt-3">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <h4 className="text-xs font-semibold text-slate-800">Dépenses associées</h4>
                                  <span className="text-[10px] text-slate-500">{incomeExpenseDetails.expenseCount} au total</span>
                                </div>
                                {visibleExpenses.length === 0 ? (
                                  <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Aucune dépense n’est encore associée à ce revenu.</p>
                                ) : (
                                  <ul className="space-y-2">
                                    {visibleExpenses.map((expense) => {
                                      const expenseCategory = expenseCategoryFor(expense.categoryId);
                                      const isLoanGiven = expense.flowType === 'loan_given' || expense.categoryId === 'loan_given';
                                      const title = isLoanGiven ? 'Prêt accordé' : expense.title || expense.name || expense.description || expense.details || expense.note || expenseCategory?.label || expenseCategory?.name || 'Dépense';
                                      const loanPerson = expense.person || expense.counterpartyName || 'Bénéficiaire non renseigné';
                                      return (
                                        <li key={expense.id} className="flex items-start gap-3 rounded-xl border border-slate-100 p-2.5">
                                          <CategoryImage categoryId={expense.categoryId} image={expense.image || expenseCategory?.image} size="md"/>
                                          <div className="min-w-0 flex-1">
                                            <p className="break-words text-xs font-semibold text-slate-800">{title}</p>
                                            <p className="mt-1 text-[10px] capitalize leading-4 text-slate-500">{formatIncomeDate(expense.date)} · {expenseCategory?.label || expenseCategory?.name || 'Autre'}</p>
                                            <p className="mt-1 text-[10px] font-medium text-brand-700">{getIncomeExpenseFlowLabel(expense, isEnglish)}</p>
                                            {isLoanGiven && <p className="mt-1 text-[10px] text-slate-600">À : <strong className="font-semibold text-slate-800">{loanPerson}</strong>{expense.dueDate ? ' · Échéance : ' + formatIncomeDate(expense.dueDate) : ''}</p>}
                                            {expense.note && expense.note !== title && <p className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-slate-500">{expense.note}</p>}
                                          </div>
                                          <strong className="shrink-0 text-right text-xs text-slate-900">{formatCurrency(expense.amount)}</strong>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </div>
                              <div className="flex flex-col gap-2 sm:flex-row">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="min-h-10 flex-1"
                                  onClick={() => {
                                    const sourceName = selectedIncome.source || selectedIncome.person || 'Emprunt reçu';
                                    router.push('/expenses?new=1&incomeSourceId=' + encodeURIComponent(selectedIncome.id) + '&incomeSourceName=' + encodeURIComponent(sourceName));
                                  }}
                                >
                                  <Plus size={14}/> Ajouter une dépense à cette source
                                </Button>
                                <Link href="/expenses" className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">Ouvrir les dépenses</Link>
                                {incomeExpenseDetails.nextCursor && <button type="button" onClick={loadMoreIncomeExpenses} disabled={incomeExpenseDetails.loadingMore} className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{incomeExpenseDetails.loadingMore ? 'Chargement…' : 'Voir plus de dépenses'}</button>}
                              </div>
                            </>
                          )}
                        </div>
                      </section>
                    )}
                  </>
                );
              })()}
                            <AssistantShortcut label="Analyser ce revenu avec Mč" prompt={`Analyse ce revenu enregistré dans Pata : source ${selectedIncome.source || 'non précisée'}, montant ${selectedIncome.amount} FCFA, date ${selectedIncome.date || 'non précisée'}, catégorie ${selectedIncome.categoryId || 'non précisée'}. Explique son importance dans mon équilibre financier et propose des conseils concrets. Ne modifie aucune donnée.`} promptEn={`Analyze this income entry in Pata: source ${selectedIncome.source || 'not specified'}, amount ${selectedIncome.amount} XAF, date ${selectedIncome.date || 'not specified'}, category ${translateText([...INCOME_CATEGORIES, ...customIncomeCategories].find((item) => item.id === selectedIncome.categoryId)?.label || selectedIncome.categoryId || 'not specified', 'en')}. Explain its importance to my financial balance and suggest practical advice. Do not change any data.`}/>
              {selectedIncome.cashPocket ? <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Cet argent provient d’un retrait Mobile Money déjà enregistré. Il ne constitue pas un revenu : il représente ton argent disponible en espèces. Relie les prochaines dépenses payées en espèces à cette source pour suivre son solde sans compter le retrait comme une dépense.</p> : selectedIncome.flowType === 'debt_borrowed' && selectedIncome.debtId ? <div className="space-y-2"><p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{selectedIncome.debtArchived ? 'Cette dette a été entièrement remboursée et son dossier a été retiré de Dettes & prêts. L’entrée d’argent reste visible ici dans ton historique des revenus encaissés.' : selectedIncome.availableAsFunding === true ? 'Cette dette correspond à de l’argent réellement reçu. Pata la compte dans tes revenus encaissés et tes sources disponibles pour financer des dépenses. Elle reste toutefois une dette à rembourser : ce n’est pas un salaire ni un bénéfice gagné.' : selectedIncome.availableAsFunding === false ? 'Cette dette correspond à des biens ou services déjà pris à crédit. Son montant sert à suivre ce que tu dois, sans augmenter tes revenus ni ton argent disponible.' : 'Cette ancienne dette n’a pas encore de nature précisée. Choisis lors de la modification si tu as reçu de l’argent ou des biens/services à crédit.'}</p>{!selectedIncome.debtArchived && <Button type="button" variant="outline" className="w-full" onClick={() => openEditIncome(selectedIncome)}><Pencil size={14}/> Modifier la dette</Button>}</div> : selectedIncome.neutralFlow || selectedIncome.debtId || selectedIncome.repaymentDebtId ? <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Ce mouvement est lié au suivi des Dettes & prêts. Pour préserver le solde restant et l’historique, sa modification ou sa suppression se gère dans cette rubrique.</p> : <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => openEditIncome(selectedIncome)}><Pencil size={14}/> Modifier</Button>
                <Button type="button" variant="outline" className="flex-1 border-red-200 text-red-700 hover:bg-red-50" onClick={() => { setDeleteId(selectedIncome.id); setSelectedIncome(null); }}><Trash2 size={14}/> Supprimer</Button>
              </div>}
            </div>
          );
        })()}
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Modifier l’opération' : 'Nouveau revenu'}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nature de l’opération</label>
            <select value={form.flowType || 'normal'} disabled={!!form.id && form.flowType === 'repayment_received'} onChange={(event) => {
              const flowType = event.target.value;
              const categoryId = flowType === 'debt_borrowed' ? 'debt_borrowed' : flowType === 'repayment_received' ? 'debt_repayment_received' : 'salary';
              setForm({ ...form, flowType, categoryId, source: flowType === 'debt_borrowed' ? form.source : (form.person || form.source), person: flowType === 'debt_borrowed' ? (form.flowType === 'debt_borrowed' ? form.person : '') : form.person, availableAsFunding: form.availableAsFunding, repaymentDebtId: flowType === 'repayment_received' ? form.repaymentDebtId : '', projectId: '' });
            }} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="normal">Revenu normal</option><option value="debt_borrowed">Dette contractée (argent emprunté)</option>
              {!form.id && <option value="repayment_received">Remboursement reçu</option>}
            </select>
          </div>
          {form.flowType === 'debt_borrowed' && <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <div><label className="mb-1 block text-sm font-medium text-slate-700">Type de créancier</label><select value={form.counterpartyType || 'person'} onChange={(event) => setForm({ ...form, counterpartyType: event.target.value, person: '', source: '', bankName: '', bankChoice: '', bankCustomName: '', counterpartyUid: '' })} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="person">Une personne physique ou un commerçant</option><option value="bank">Une banque</option></select></div>
            {form.counterpartyType === 'bank' ? <div><label className="mb-1 block text-sm font-medium text-slate-700">Banque</label><select value={form.bankChoice || ''} onChange={(event) => { const bankChoice = event.target.value; const bankName = bankChoice === '__other__' ? '' : bankChoice; setForm({ ...form, bankChoice, bankName, bankCustomName: '', person: bankName, source: bankName, counterpartyUid: '' }); }} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Choisir une banque camerounaise</option>{CAMEROON_BANKS.map((bank) => <option key={bank} value={bank}>{bank}</option>)}<option value="__other__">Autre banque — saisir son nom</option></select>{form.bankChoice === '__other__' && <div className="mt-2"><Input label="Nom de la banque" required value={form.bankCustomName || ''} onChange={(event) => setForm({ ...form, bankCustomName: event.target.value, bankName: event.target.value, person: event.target.value, source: event.target.value })}/></div>}</div> : <DebtCounterpartyField label="Personne ou commerce auprès duquel tu as pris à crédit" value={form.person} selectedUid={form.counterpartyUid} onNameChange={(person) => setForm({ ...form, person, source: person, counterpartyUid: '' })} onSelect={(account) => setForm({ ...form, person: account.displayName, source: account.displayName, counterpartyUid: account.uid })} onContactSelect={(contact) => setForm({ ...form, person: contact.displayName, source: contact.displayName, phone: contact.phone, counterpartyUid: '' })}/>}
            <Input label="Téléphone (facultatif)" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })}/>
            <Input label="Date prévue de remboursement" type="date" required value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })}/>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-800">Qu’as-tu réellement reçu ?</p>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700"><input type="radio" name="borrowed-funding" checked={form.availableAsFunding === true} onChange={() => setForm({ ...form, availableAsFunding: true })} className="mt-0.5"/><span><strong>De l’argent</strong><span className="block text-xs leading-5 text-slate-500">La somme m’a été remise. Je peux l’utiliser pour financer mes dépenses.</span></span></label>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-slate-700"><input type="radio" name="borrowed-funding" checked={form.availableAsFunding === false} onChange={() => setForm({ ...form, availableAsFunding: false })} className="mt-0.5"/><span><strong>Des biens ou services à crédit</strong><span className="block text-xs leading-5 text-slate-500">J’ai déjà pris ou consommé quelque chose. Je note sa valeur pour suivre ce que je dois, sans l’ajouter à mes revenus ni à mon argent disponible.</span></span></label>
            </div>
          </div>}
          {form.flowType === 'repayment_received' && <div><label className="mb-1 block text-sm font-medium text-slate-700">Créance remboursée</label><select required value={form.repaymentDebtId} onChange={(event) => setForm({ ...form, repaymentDebtId: event.target.value })} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Choisir une créance</option>{activeReceivableDebts.map((debt) => <option key={debt.id} value={debt.id}>{debt.person} · {formatCurrency(Number(debt.remaining) || 0)} restant</option>)}</select>{!activeReceivableDebts.length && <p className="mt-1 text-xs text-slate-500">Aucune créance active à encaisser.</p>}</div>}
          <div><Input label="Montant (FCFA)" type="number" data-pata-money="true" min="0" step="1" required value={form.amount} disabled={form.amountLocked === true && !!form.id} onChange={(event) => setForm({ ...form, amount: event.target.value })}/><CalculatorLauncher value={form.amount} disabled={form.amountLocked === true && !!form.id} onApply={(result) => setForm((current) => ({ ...current, amount: result }))}/></div>
          {form.amountLocked === true && !!form.id && <p className="rounded-lg bg-amber-50 p-2.5 text-[11px] leading-5 text-amber-800">Ce montant a déjà été utilisé pour financer une dépense. Il reste verrouillé pour préserver l’historique. Tu peux encore modifier la nature et les autres informations autorisées.</p>}
          {form.flowType === 'normal' ? <><div><p className="mb-2 text-sm font-medium text-slate-700">Catégorie de revenu</p><CategoryManager type="income" value={form.categoryId} onChange={(id) => setForm((current) => ({ ...current, categoryId: id, recurrenceEnabled: id === 'salary' ? true : current.categoryId === 'salary' ? false : current.recurrenceEnabled, scheduleFrequency: id === 'salary' ? 'monthly' : current.scheduleFrequency }))}/></div><Input label="Nom / Source" required value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })}/><CloudinaryImageField value={form.image || ''} onChange={(image) => setForm((current) => ({ ...current, image }))} folder="pata/incomes" language={language} label="Photo du revenu (facultatif)"/></> : form.flowType === 'debt_borrowed' ? <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Cette opération reste suivie dans Dettes & prêts. Seule une dette correspondant à de l’argent réellement reçu peut aussi financer des dépenses.</p> : null}
          <Input label="Date" type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })}/>
          {isPremium && ['normal', 'debt_borrowed'].includes(form.flowType) && <div><label className="mb-1 block text-sm font-medium text-slate-700">Affecter à un projet (facultatif)</label><select value={form.projectId || ''} onChange={(event) => setForm({ ...form, projectId: event.target.value })} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Aucun projet — fonds non affectés</option>{projects.filter((item) => item.status === 'active').map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>}
          {!form.id && <div className="rounded-xl border border-slate-200 p-3"><label className="flex cursor-pointer items-start gap-2 text-sm font-semibold text-slate-800"><input type="checkbox" checked={form.scheduleEnabled === true} disabled={!isPremium} onChange={(event) => setForm({ ...form, scheduleEnabled: event.target.checked })} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"/><span>Programmer cette opération</span></label>{!isPremium && <p className="mt-2 text-xs leading-5 text-slate-500">La programmation nécessite Pata Premium. <Link href="/premium" className="font-semibold text-brand-700 underline">Découvrir Premium</Link></p>}{form.scheduleEnabled && <div className="mt-3 space-y-3 border-t border-slate-100 pt-3"><p className="text-xs leading-5 text-slate-500">L’opération sera enregistrée à la date choisie.</p>{form.flowType === 'normal' && <><label className="flex items-center gap-2 text-xs font-medium text-slate-700"><input type="checkbox" checked={form.recurrenceEnabled === true} onChange={(event) => setForm({ ...form, recurrenceEnabled: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-brand-600"/>Rendre ce revenu récurrent</label>{form.recurrenceEnabled && <select value={form.scheduleFrequency || 'monthly'} onChange={(event) => setForm({ ...form, scheduleFrequency: event.target.value })} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="daily">Tous les jours</option><option value="weekly">Chaque semaine</option><option value="monthly">Chaque mois</option></select>}</>}{form.flowType !== 'normal' && <p className="text-xs text-slate-500">Cette opération sera enregistrée une seule fois à la date prévue.</p>}</div>}</div>}
          <Input label="Note (facultatif)" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })}/>
          <OptionalTransactionFields value={form} onChange={(next) => setForm(next)} kind="income"/>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={saving}>{saving ? 'Enregistrement…' : form.id ? 'Enregistrer les modifications' : 'Ajouter le revenu'}</Button>
        </form>
      </Modal>

      <Modal
        open={Boolean(incomeBudgetPrompt)}
        onClose={() => setIncomeBudgetPrompt(null)}
        title={incomeBudgetPrompt?.isSalary ? 'Organise ton salaire avant de dépenser' : 'Prépare ce revenu avec un budget'}
      >
        {incomeBudgetPrompt && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revenu enregistré</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(incomeBudgetPrompt.amount)}</p>
              <p className="mt-1 text-sm text-slate-600">{incomeBudgetPrompt.source}</p>
            </div>
            {incomeBudgetPrompt.isSalary ? (
              <p className="text-sm leading-6 text-slate-700">
                Ton salaire doit couvrir tout le mois. En le répartissant maintenant entre le loyer, les factures, la nourriture, le transport et tes autres priorités, tu réduis le risque de le voir disparaître avant la fin du mois. Pata te recommande fortement de créer des budgets liés à ce salaire. Tu peux néanmoins refuser et le faire plus tard.
              </p>
            ) : (
              <p className="text-sm leading-6 text-slate-700">
                Pour éviter de dépenser ce revenu sans plan, Pata te recommande de le répartir entre tes priorités et de rattacher les budgets à cette source. Tu garderas ainsi une meilleure visibilité sur ce que tu peux dépenser.
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                const target = incomeBudgetPrompt.target;
                setIncomeBudgetPrompt(null);
                if (target) router.push(target);
              }}
              className="w-full rounded-xl bg-[#075b43] px-4 py-3 text-sm font-semibold text-white"
            >
              Créer les budgets liés à ce revenu
            </button>
            <button
              type="button"
              onClick={() => setIncomeBudgetPrompt(null)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600"
            >
              Plus tard, je préfère continuer sans budget
            </button>
          </div>
        )}
      </Modal>

      {/* 🟢 MODALE DES PRÉVISIONS AVEC CALCUL EN TEMPS RÉEL */}
      <Modal open={vitalOpen} onClose={() => setVitalOpen(false)} title="Calculer mes prévisions">
        <form onSubmit={onSaveVital} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Nom du budget"
              placeholder="Ex: Salaire Novembre"
              value={budgetName}
              onChange={(event) => setBudgetName(event.target.value)}
              required
            />
            <Input
              label="Revenu de référence (FCFA)"
              type="number"
              data-pata-money="true"
              min="1"
              max="10000000000"
              step="1"
              placeholder="Ex: 100000"
              value={totalBudget}
              onChange={(event) => { setTotalBudget(event.target.value); setShowVerification(false); setVitalError(''); }}
              required
            />
          </div>

          <p className="text-xs leading-5 text-slate-500">Pour chaque catégorie, choisis un montant fixe ou un pourcentage du revenu, puis sa fréquence. Pata calcule automatiquement l’équivalent mensuel.</p>

          <div className="max-h-[42vh] space-y-3 overflow-y-auto pr-1">
            {allCategories.map((category, index) => {
              const value = vitalForm[category.id] || { value: '', calculationType: 'amount', frequency: 'monthly' };
              const preview = calculateBudgetLine({
                categoryId: category.id,
                value: value.value ?? value.amount,
                calculationType: value.calculationType || 'amount',
                frequency: value.frequency || 'monthly',
              }, Number(totalBudget) || 0);
              return (
                <section key={category.id} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <div className="flex items-center gap-2">
                    <CategoryImage categoryId={category.id} image={category.image} size="sm" />
                    <p className="text-sm font-semibold text-slate-700">{category.label}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      Calcul
                      <select
                        value={value.calculationType || 'amount'}
                        onChange={(event) => { setVitalForm((current) => ({ ...current, [category.id]: { ...value, calculationType: event.target.value } })); setShowVerification(false); }}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                      >
                        <option value="amount">Montant en FCFA</option>
                        <option value="percentage">Pourcentage du revenu</option>
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-slate-700">
                      Fréquence
                      <select
                        value={value.frequency || 'monthly'}
                        onChange={(event) => setVitalForm((current) => ({ ...current, [category.id]: { ...value, frequency: event.target.value } }))}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                      >
                        {FREQUENCIES.map((frequency) => <option key={frequency.id} value={frequency.id}>{frequency.label}</option>)}
                      </select>
                    </label>
                    <label className="col-span-2 block text-xs font-semibold text-slate-700">
                      {value.calculationType === 'percentage' ? 'Pourcentage par période (%)' : 'Montant par période (FCFA)'}
                      <input
                        data-pata-money={value.calculationType === 'percentage' ? 'false' : 'true'}
                        type="number"
                        min="0"
                        max={value.calculationType === 'percentage' ? '100' : '1000000000'}
                        step={value.calculationType === 'percentage' ? '0.1' : '1'}
                        inputMode="decimal"
                        value={value.value ?? value.amount ?? ''}
                        onChange={(event) => { setVitalForm((current) => ({ ...current, [category.id]: { ...value, value: event.target.value } })); setShowVerification(false); setVitalError(''); }}
                        placeholder="0"
                        className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-right text-sm font-semibold"
                      />
                    </label>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs">
                    <span className="text-slate-500">Équivalent mensuel</span>
                    <strong className="tabular-nums text-slate-800">{formatCurrency(preview.amount)}</strong>
                  </div>
                </section>
              );
            })}
          </div>

          <div className={'rounded-xl p-3 text-sm border ' + (isDraftOverBudget ? 'bg-red-50 border-red-200' : 'bg-brand-50 border-brand-100')}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">Total prévisions mensuelles</span>
              <strong className={isDraftOverBudget ? 'text-red-700' : 'text-brand-800'}>{formatCurrency(draftTotalVital)}</strong>
            </div>
            <p className={'mt-1 text-xs ' + (isDraftOverBudget ? 'text-red-600' : 'text-brand-600')}>
              {Number(totalBudget) > 0
                ? (isDraftOverBudget
                  ? 'Dépassement de ' + formatCurrency(draftTotalVital - Number(totalBudget))
                  : 'Reste après prévisions : ' + formatCurrency(Number(totalBudget) - draftTotalVital))
                : 'Indique le revenu de référence pour calculer les pourcentages.'}
            </p>
            {draftVitalPlan.percentageTotal > 100 && <p className="mt-1 text-xs text-amber-700">Les pourcentages cumulés selon leur fréquence dépassent 100 %. Vérifie cette répartition.</p>}
          </div>

          {vitalError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700">{vitalError}</p>}
          {showVerification && isDraftOverBudget && (
            <div className="rounded-xl border border-red-300 bg-red-100 p-3">
              <p className="flex items-center gap-2 text-sm font-bold text-red-800"><AlertTriangle size={16}/> Budget dépassé</p>
              <p className="mt-1 text-xs text-red-700">Tes prévisions dépassent ton revenu de référence de {formatCurrency(draftTotalVital - Number(totalBudget))}.</p>
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setShowVerification(true)} className="flex-1">Vérifier</Button>
            <Button type="submit" className="flex-1" disabled={savingVital || !vitalDraftValid}>
              {savingVital ? 'Enregistrement…' : 'Enregistrer les prévisions'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={vitalApplyOpen} onClose={() => { if (!vitalApplyBusy) setVitalApplyOpen(false); }} title="Appliquer cette prévision aux budgets">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-700">{profile?.vitalBudgetName || 'Prévision vitale'}</p>
            <p className="mt-1 text-lg font-extrabold text-slate-900">{formatCurrency(savedTotalVital)} / mois</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Par défaut, Pata rattache les enveloppes à un revenu déjà enregistré. Aucun nouveau revenu ne sera créé sans ton choix explicite.</p>
          </div>

          <label className="block text-xs font-semibold text-slate-700">
            Revenu auquel rattacher les enveloppes
            <select
              value={vitalApplySourceId}
              onChange={(event) => { setVitalApplySourceId(event.target.value); setVitalApplyError(''); }}
              disabled={vitalCreateIncome || vitalApplyBusy}
              className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal disabled:bg-slate-50"
            >
              <option value="">Choisir un revenu disponible</option>
              {budgetTargetMonthSources.map((income) => (
                <option key={income.id} value={income.id}>
                  {(income.source || 'Revenu') + ' · ' + formatCurrency(income.amount) + ' initial · '
                    + (income.balanceAvailable === true ? formatCurrency(income.remaining) + ' restant' : 'solde à vérifier')}
                </option>
              ))}
            </select>
            {!budgetTargetMonthSources.length && !vitalCreateIncome && <span className="mt-1 block text-[11px] font-normal leading-4 text-amber-700">Aucun revenu enregistré pour cette période. Tu peux créer un revenu uniquement en cochant l’option facultative ci-dessous.</span>}
          </label>

          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
            <input type="checkbox" checked={vitalCreateIncome} disabled={vitalApplyBusy} onChange={(event) => { setVitalCreateIncome(event.target.checked); setVitalApplyError(''); }} className="mt-0.5 h-4 w-4 rounded border-slate-300"/>
            <span>
              <strong>Je veux aussi créer un nouveau revenu</strong>
              <span className="mt-0.5 block text-xs leading-5 text-slate-500">Option facultative. Pata enregistrera réellement un revenu nommé « {budgetName || 'Budget prévisionnel'} » de {formatCurrency(Number(totalBudget) || savedTotalVital)}, puis lui rattachera les budgets.</span>
            </span>
          </label>

          {vitalApplyError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700">{vitalApplyError}</p>}
          <div className="flex gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" className="flex-1" disabled={vitalApplyBusy} onClick={() => setVitalApplyOpen(false)}>Annuler</Button>
            <Button type="button" className="flex-1" disabled={vitalApplyBusy || (!vitalCreateIncome && !vitalApplySourceId)} onClick={confirmApplyVitalToBudget}>
              {vitalApplyBusy ? 'Application…' : vitalCreateIncome ? 'Créer le revenu et les budgets' : 'Appliquer aux budgets'}
            </Button>
          </div>
        </div>
      </Modal>


      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Supprimer ce revenu ?" message="Cette action est irréversible." confirmWord="SUPPRIMER" confirmLabel="Supprimer" variant="danger" />
      {dialog}
    </div>
  );
            }
