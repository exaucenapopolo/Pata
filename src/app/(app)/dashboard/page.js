/* eslint-disable react/no-unescaped-entities */
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown, Wallet, Target, PiggyBank, ChevronRight,
  CheckCircle2, AlertTriangle, Lightbulb, Info, Landmark, Calendar, ArrowUpRight, ArrowDownLeft, Plus
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardTitle, CardValue } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { CategoryImage } from '@/components/ui/CategoryImage';
import { AssistantShortcut } from '@/components/ai/AssistantShortcut';
import { useIncomes } from '@/hooks/useIncomes';
import { useExpenses } from '@/hooks/useExpenses';
import { useGoals } from '@/hooks/useGoals';
import { useProfile } from '@/hooks/useProfile';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { generateAdvice, adviceIconColor } from '@/lib/advisor';
import { formatCurrency, formatDate, resolveCategory, getFirstOfMonth, getLastOfMonth } from '@/lib/utils';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const ADVICE_ICONS = { success: CheckCircle2, danger: AlertTriangle, warning: AlertTriangle, tip: Lightbulb, info: Info };

export default function DashboardPage() {
  const [customStart, setCustomStart] = useState(getFirstOfMonth());
  const [customEnd, setCustomEnd] = useState(todayIso());
  const [showCustomPeriod, setShowCustomPeriod] = useState(false);

  const startDate = showCustomPeriod ? customStart : getFirstOfMonth();
  const endDate = showCustomPeriod ? customEnd : getLastOfMonth();

  const { incomes } = useIncomes();
  const { expenses } = useExpenses();
  const { goals } = useGoals();
  const { profile } = useProfile();
  const { customCategories } = useCustomCategories('expense');

  const userName = useMemo(() => {
    const raw = profile?.displayName?.trim();
    return raw ? raw.split(' ')[0] : 'toi';
  }, [profile]);

  const { prevStartDate, prevEndDate } = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const durationMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 86400000);
    const prevStart = new Date(prevEnd.getTime() - durationMs);
    return {
      prevStartDate: prevStart.toISOString().slice(0, 10),
      prevEndDate: prevEnd.toISOString().slice(0, 10),
    };
  }, [startDate, endDate]);

  const periodExpenses = useMemo(
    () => expenses.filter((e) => e.date >= startDate && e.date <= endDate),
    [expenses, startDate, endDate]
  );
  const prevExpenses = useMemo(
    () => expenses.filter((e) => e.date >= prevStartDate && e.date <= prevEndDate),
    [expenses, prevStartDate, prevEndDate]
  );
  const periodIncomes = useMemo(
    () => incomes.filter((i) => i.date >= startDate && i.date <= endDate),
    [incomes, startDate, endDate]
  );
  const prevIncomes = useMemo(
    () => incomes.filter((i) => i.date >= prevStartDate && i.date <= prevEndDate),
    [incomes, prevStartDate, prevEndDate]
  );

  const totalIncome = incomes.reduce((s, i) => s + (i.amount || 0), 0);
  const totalExpense = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const globalBalance = totalIncome - totalExpense;

  const periodIncomeTotal = periodIncomes.reduce((s, i) => s + (i.amount || 0), 0);
  const periodExpenseTotal = periodExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const incomeById = useMemo(() => new Map(incomes.map((income) => [income.id, income])), [incomes]);
  const previousIncomeSpend = useMemo(() => periodExpenses.reduce((sum, expense) => {
    const source = incomeById.get(expense.incomeSourceId);
    return source && String(source.date || source.month || '').slice(0, 10) < startDate
      ? sum + (Number(expense.amount) || 0) : sum;
  }, 0), [periodExpenses, incomeById, startDate]);
  const prevTotalIncome = prevIncomes.reduce((s, i) => s + (i.amount || 0), 0);
  const prevTotalExpense = prevExpenses.reduce((s, e) => s + (e.amount || 0), 0);

  const byCategory = useMemo(() => {
    const map = {};
    periodExpenses.forEach((e) => {
      map[e.categoryId] = (map[e.categoryId] || 0) + (e.amount || 0);
    });
    return Object.entries(map)
      .map(([id, value]) => {
        const cat = resolveCategory(id, 'expense', customCategories);
        return { id, name: cat?.label || id, value, color: cat?.color || '#94a3b8' };
      })
      .sort((a, b) => b.value - a.value);
  }, [periodExpenses, customCategories]);

  const advices = useMemo(
    () => generateAdvice({
      expenses: periodExpenses,
      previousExpenses: prevExpenses,
      totalIncome: periodIncomeTotal,
      previousIncome: prevTotalIncome,
      previousIncomeSpend,
      goals,
      customCategories,
      userName,
    }),
    [periodExpenses, prevExpenses, periodIncomeTotal, prevTotalIncome, goals, customCategories, userName]
  );

  const topExpenses = useMemo(() => {
    return [...periodExpenses].sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [periodExpenses]);

  const expenseChange = prevTotalExpense > 0 ? ((periodExpenseTotal - prevTotalExpense) / prevTotalExpense) * 100 : null;
  const incomeChange = prevTotalIncome > 0 ? ((periodIncomeTotal - prevTotalIncome) / prevTotalIncome) * 100 : null;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#075b43] via-[#08674b] to-[#0c8060] p-5 text-white shadow-lg shadow-emerald-950/10 sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full border-[28px] border-white/5" />
        <div className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full border-[20px] border-white/5" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-semibold tracking-wide text-emerald-100">TON ESPACE FINANCIER</p><h1 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">Bonjour {userName}</h1><p className="mt-1 max-w-sm text-xs leading-5 text-emerald-100 sm:text-sm">Voici ce qui se passe dans tes finances. Garde une vue claire sur ton argent.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <AssistantShortcut label="Conseil personnalisé" prompt="Fais un bilan de ma situation financière à partir des informations de mon tableau de bord Pata. Explique les points forts, les risques et trois actions prioritaires adaptées à mes revenus, dépenses, budgets et objectifs. Ne modifie aucune donnée." />
            <Link href="/reports" className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/15">Voir mon bilan <ChevronRight size={14}/></Link>
          </div>
        </div>
        <div className="relative mt-6 border-t border-white/15 pt-4"><p className="text-[11px] font-medium text-emerald-100">Solde global enregistré</p><p className="mt-1 break-words text-3xl font-bold tracking-tight sm:text-4xl">{formatCurrency(globalBalance)}</p><p className="mt-2 text-[10px] text-emerald-100">Total des revenus moins le total des dépenses enregistrées.</p></div>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">Actions rapides</h2><span className="text-[10px] font-medium text-slate-400">Gérer mon argent</span></div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Link href="/expenses?new=1" className="group flex min-h-[112px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md active:scale-[0.98]"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-700"><ArrowUpRight size={19}/></span><span><strong className="block text-xs text-slate-900">Ajouter une dépense</strong><span className="mt-0.5 block text-[10px] text-slate-500">Enregistrer une sortie</span></span></Link>
          <Link href="/income?new=1" className="group flex min-h-[112px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md active:scale-[0.98]"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><ArrowDownLeft size={19}/></span><span><strong className="block text-xs text-slate-900">Ajouter un revenu</strong><span className="mt-0.5 block text-[10px] text-slate-500">Enregistrer une entrée</span></span></Link>
          <Link href="/budgets" className="group flex min-h-[112px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md active:scale-[0.98]"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><PiggyBank size={19}/></span><span><strong className="block text-xs text-slate-900">Gérer mes budgets</strong><span className="mt-0.5 block text-[10px] text-slate-500">Prévoir mes dépenses</span></span></Link>
          <Link href="/goals" className="group flex min-h-[112px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md active:scale-[0.98]"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Plus size={19}/></span><span><strong className="block text-xs text-slate-900">Créer un objectif</strong><span className="mt-0.5 block text-[10px] text-slate-500">Préparer mon épargne</span></span></Link>
        </div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-base font-bold text-slate-900">Vue d’ensemble</h2><p className="text-xs text-slate-500">Activité et comparaisons financières.</p></div></div>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
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
        </div>

        {showCustomPeriod && (
          <div className="mt-3 flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium text-slate-500 mb-1">Du</label>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-medium text-slate-500 mb-1">Au</label>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
            </div>
          </div>
        )}

        <p className="mt-2 text-xs text-slate-500">
          Période affichée : {formatDate(startDate)} → {formatDate(endDate)}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card>
          <div className="flex items-center gap-2 text-brand-600">
            <TrendingUp size={16} />
            <CardTitle className="text-brand-600">Revenus</CardTitle>
          </div>
          <CardValue>{formatCurrency(periodIncomeTotal)}</CardValue>
          {incomeChange !== null && (
            <p className={`mt-1 text-xs font-medium ${incomeChange >= 0 ? 'text-brand-600' : 'text-red-500'}`}>
              {incomeChange >= 0 ? '↑' : '↓'} {Math.abs(incomeChange).toFixed(0)}% vs préc.
            </p>
          )}
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-red-500">
            <TrendingDown size={16} />
            <CardTitle className="text-red-500">Dépenses</CardTitle>
          </div>
          <CardValue>{formatCurrency(periodExpenseTotal)}</CardValue>
          {expenseChange !== null && (
            <p className={`mt-1 text-xs font-medium ${expenseChange <= 0 ? 'text-brand-600' : 'text-red-500'}`}>
              {expenseChange >= 0 ? '↑' : '↓'} {Math.abs(expenseChange).toFixed(0)}% vs préc.
            </p>
          )}
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-slate-500">
            <Wallet size={16} />
            <CardTitle>Solde Global</CardTitle>
          </div>
          <CardValue className={globalBalance < 0 ? 'text-red-600' : 'text-slate-900'}>
            {formatCurrency(globalBalance)}
          </CardValue>
          <p className="mt-1 text-xs text-slate-500">Tout compte confondu</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-slate-500">
            <PiggyBank size={16} />
            <CardTitle>Fonds antérieurs utilisés</CardTitle>
          </div>
          <CardValue>{formatCurrency(previousIncomeSpend)}</CardValue>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Dépenses de la période financées par des revenus reçus avant cette période.
          </p>
        </Card>
      </div>

      {previousIncomeSpend > 0 && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm leading-6 text-blue-900">
          Une partie de tes dépenses ({formatCurrency(previousIncomeSpend)}) a été financée par des revenus reçus avant la période affichée. Cet argent ne vient donc pas de revenus générés ce mois-ci : tu utilises une réserve déjà disponible.
        </div>
      )}

      {advices.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightbulb size={16} className="text-slate-400" />
              <CardTitle>Assistant</CardTitle>
            </div>
            <Link href="/reports" className="flex items-center text-xs font-medium text-brand-600 hover:underline">
              Détails <ChevronRight size={14} />
            </Link>
          </div>
          <div className="space-y-3">
            {advices.slice(0, 4).map((a) => {
              const Icon = ADVICE_ICONS[a.type] || Info;
              return (
                <div key={a.id} className="flex items-start gap-3">
                  <Icon size={16} className={`mt-0.5 shrink-0 ${adviceIconColor(a.type)}`} />
                  <p className="text-sm leading-relaxed text-slate-700">{a.message}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <CardTitle>Répartition des dépenses</CardTitle>
            <Link href="/expenses" className="flex items-center text-xs font-medium text-brand-600 hover:underline">
              Voir tout <ChevronRight size={14} />
            </Link>
          </div>
          {byCategory.length === 0 ? (
            <EmptyState icon={Wallet} title="Aucune dépense sur cette période" description="Ajuste les dates ou ajoute une dépense." />
          ) : (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {byCategory.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 space-y-1.5">
                {byCategory.slice(0, 5).map((c) => (
                  <li key={c.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </span>
                    <span className="font-medium text-slate-700">
                      {formatCurrency(c.value)}
                      <span className="ml-1 text-xs text-slate-400">({((c.value / periodExpenseTotal) * 100).toFixed(0)}%)</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <CardTitle>Objectifs en cours</CardTitle>
            <Link href="/goals" className="flex items-center text-xs font-medium text-brand-600 hover:underline">
              Gérer <ChevronRight size={14} />
            </Link>
          </div>
          {goals.length === 0 ? (
            <EmptyState icon={Target} title="Aucun objectif" description="Crée ton premier objectif d'épargne." />
          ) : (
            <ul className="space-y-3">
              {goals.slice(0, 4).map((g) => {
                const daysLeft = g.deadline ? Math.max(0, Math.ceil((new Date(g.deadline) - new Date()) / 86400000)) : null;
                return (
                  <li key={g.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{g.name}</p>
                      <p className="text-xs text-slate-500">
                        {g.type === 'piggybank' ? 'Tirelire libre' : `${formatCurrency(g.targetAmount)} — ${daysLeft} j restants`}
                      </p>
                    </div>
                    <Target size={18} className="text-brand-500" />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <CardTitle>Dépenses les plus élevées</CardTitle>
          <Link href="/expenses" className="flex items-center text-xs font-medium text-brand-600 hover:underline">
            Tout voir <ChevronRight size={14} />
          </Link>
        </div>
        {topExpenses.length === 0 ? (
          <EmptyState icon={Wallet} title="Aucune dépense sur cette période" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {topExpenses.map((e) => {
              const cat = resolveCategory(e.categoryId, 'expense', customCategories);
              return (
                <li key={e.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <CategoryImage categoryId={e.categoryId} image={cat?.image} size="sm" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{cat?.label || 'Autre'}</p>
                      <p className="text-xs text-slate-500">{formatDate(e.date)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-800">{formatCurrency(e.amount)}</p>
                    {e.incomeSourceId && e.incomeSourceId !== 'all' && (
                       <p className="text-[10px] text-slate-400">{e.incomeSourceName}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
      }
