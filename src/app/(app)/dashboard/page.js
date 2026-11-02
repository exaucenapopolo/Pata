/* eslint-disable react/no-unescaped-entities */
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown, Wallet, Target, PiggyBank, ChevronRight,
  CheckCircle2, AlertTriangle, Lightbulb, Info, Landmark, Calendar
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardTitle, CardValue } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { CategoryImage } from '@/components/ui/CategoryImage';
import { useIncomes } from '@/hooks/useIncomes';
import { useExpenses } from '@/hooks/useExpenses';
import { useGoals } from '@/hooks/useGoals';
import { useProfile } from '@/hooks/useProfile';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { generateAdvice, adviceIconColor } from '@/lib/advisor';
import { formatCurrency, formatDate, resolveCategory } from '@/lib/utils';

// 🟢 Correction : le mois en cours strict
const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const lastOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
};
const todayIso = () => new Date().toISOString().slice(0, 10);

const ADVICE_ICONS = { success: CheckCircle2, danger: AlertTriangle, warning: AlertTriangle, tip: Lightbulb, info: Info };

export default function DashboardPage() {
  const [customStart, setCustomStart] = useState(firstOfMonth());
  const [customEnd, setCustomEnd] = useState(todayIso());
  const [showCustomPeriod, setShowCustomPeriod] = useState(false);

  // 🟢 Dates effectives
  const startDate = showCustomPeriod ? customStart : firstOfMonth();
  const endDate = showCustomPeriod ? customEnd : lastOfMonth();

  const { incomes } = useIncomes();
  const { expenses } = useExpenses();
  const { goals } = useGoals();
  const { profile } = useProfile();
  const { customCategories } = useCustomCategories('expense');

  const userName = useMemo(() => {
    const raw = profile?.displayName?.trim();
    return raw ? raw.split(' ')[0] : 'toi';
  }, [profile]);

  // 🟢 Calcul de la période précédente
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

  // 🟢 Filtrage strict
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

  // Revenus disponibles
  const incomeWithBalance = useMemo(() => {
    return incomes.map((inc) => {
      const linkedExpenses = expenses.filter((e) => e.incomeSourceId === inc.id);
      const spent = linkedExpenses.reduce((s, e) => s + (e.amount || 0), 0);
      const remaining = Math.max(0, (inc.amount || 0) - spent);
      return { ...inc, spent, remaining, isExhausted: remaining === 0 };
    }).filter(inc => !inc.isExhausted || inc.date >= startDate);
  }, [incomes, expenses, startDate]);

  const totalIncome = periodIncomes.reduce((s, i) => s + (i.amount || 0), 0);
  const prevTotalIncome = prevIncomes.reduce((s, i) => s + (i.amount || 0), 0);
  const totalExpense = periodExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const prevTotalExpense = prevExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const balance = totalIncome - totalExpense;

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
      totalIncome,
      previousIncome: prevTotalIncome,
      goals,
      customCategories,
      userName,
    }),
    [periodExpenses, prevExpenses, totalIncome, prevTotalIncome, goals, customCategories, userName]
  );

  // 🟢 Tri des dépenses par montant décroissant
  const topExpenses = useMemo(() => {
    return [...periodExpenses].sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [periodExpenses]);

  const expenseChange = prevTotalExpense > 0 ? ((totalExpense - prevTotalExpense) / prevTotalExpense) * 100 : null;
  const incomeChange = prevTotalIncome > 0 ? ((totalIncome - prevTotalIncome) / prevTotalIncome) * 100 : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tableau de bord</h1>
          <p className="text-sm text-slate-500">Vue d'ensemble et comparaisons intelligentes.</p>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowCustomPeriod(false)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${!showCustomPeriod ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            Ce mois (en cours)
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
          Période affichée : {formatDate(startDate)} → {formatDate(endDate)} <br />
          Comparaison avec : {formatDate(prevStartDate)} → {formatDate(prevEndDate)}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card>
          <div className="flex items-center gap-2 text-brand-600">
            <TrendingUp size={16} />
            <CardTitle className="text-brand-600">Revenus</CardTitle>
          </div>
          <CardValue>{formatCurrency(totalIncome)}</CardValue>
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
          <CardValue>{formatCurrency(totalExpense)}</CardValue>
          {expenseChange !== null && (
            <p className={`mt-1 text-xs font-medium ${expenseChange <= 0 ? 'text-brand-600' : 'text-red-500'}`}>
              {expenseChange >= 0 ? '↑' : '↓'} {Math.abs(expenseChange).toFixed(0)}% vs préc.
            </p>
          )}
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-slate-500">
            <Wallet size={16} />
            <CardTitle>Solde</CardTitle>
          </div>
          <CardValue className={balance < 0 ? 'text-red-600' : 'text-slate-900'}>
            {formatCurrency(balance)}
          </CardValue>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-slate-500">
            <PiggyBank size={16} />
            <CardTitle>Revenus dispo.</CardTitle>
          </div>
          <CardValue>{formatCurrency(incomeWithBalance.reduce((s, i) => s + i.remaining, 0))}</CardValue>
          <p className="mt-1 text-xs text-slate-500">
            {incomeWithBalance.filter(i => i.remaining > 0).length} source(s) active(s)
          </p>
        </Card>
      </div>

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

      {incomeWithBalance.filter(i => i.remaining > 0).length > 0 && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Landmark size={16} className="text-slate-400" />
              <CardTitle>Revenus avec solde disponible</CardTitle>
            </div>
            <Link href="/income" className="flex items-center text-xs font-medium text-brand-600 hover:underline">
              Gérer <ChevronRight size={14} />
            </Link>
          </div>
          <div className="space-y-3">
            {incomeWithBalance.filter(i => i.remaining > 0).slice(0, 4).map(inc => (
              <div key={inc.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{inc.source}</p>
                    <p className="text-xs text-slate-500">{formatDate(inc.date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-brand-600">{formatCurrency(inc.amount)}</p>
                    <p className="text-[10px] text-slate-500">Total</p>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-slate-600 mb-1">
                  <span>Dépensé</span>
                  <span className="text-red-500">- {formatCurrency(inc.spent)}</span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-200 pt-1.5">
                  <span className="text-xs font-semibold text-slate-700">Reste</span>
                  <span className="text-sm font-bold text-slate-900">{formatCurrency(inc.remaining)}</span>
                </div>
              </div>
            ))}
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
                      <span className="ml-1 text-xs text-slate-400">({((c.value / totalExpense) * 100).toFixed(0)}%)</span>
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

      {/* 🟢 TITRE ET TRI MIS A JOUR : Dépenses les plus élevées */}
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
