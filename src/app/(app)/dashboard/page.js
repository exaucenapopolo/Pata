/* eslint-disable react/no-unescaped-entities */
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown, Wallet, Target, PiggyBank, ChevronRight,
  CheckCircle2, AlertTriangle, Lightbulb, Info, Landmark
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardTitle, CardValue } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { CategoryImage } from '@/components/ui/CategoryImage';
import { useIncomes } from '@/hooks/useIncomes';
import { useExpenses } from '@/hooks/useExpenses';
import { useBudgets } from '@/hooks/useBudgets';
import { useGoals } from '@/hooks/useGoals';
import { useProfile } from '@/hooks/useProfile';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { generateAdvice, adviceIconColor } from '@/lib/advisor';
import { formatCurrency, formatDate, resolveCategory } from '@/lib/utils';

const todayMonth = () => new Date().toISOString().slice(0, 7);
const prevMonth = (m) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const ADVICE_ICONS = {
  success: CheckCircle2,
  danger: AlertTriangle,
  warning: AlertTriangle,
  tip: Lightbulb,
  info: Info,
};

export default function DashboardPage() {
  const [month, setMonth] = useState(todayMonth());
  const { incomes } = useIncomes();
  const { expenses } = useExpenses();
  const { budgets } = useBudgets(month); // Récupère tous les budgets (global + par revenu)
  const { goals } = useGoals();
  const { profile } = useProfile();
  const { customCategories } = useCustomCategories('expense');

  const userName = useMemo(() => {
    const raw = profile?.displayName?.trim();
    if (!raw) return 'toi';
    return raw.split(' ')[0];
  }, [profile]);

  const monthIncomes = useMemo(() => incomes.filter((i) => i.month === month), [incomes, month]);
  const monthExpenses = useMemo(() => expenses.filter((e) => e.date?.startsWith(month)), [expenses, month]);
  const prevExpenses = useMemo(() => expenses.filter((e) => e.date?.startsWith(prevMonth(month))), [expenses, month]);

  const totalIncome = monthIncomes.reduce((s, i) => s + (i.amount || 0), 0);
  const totalExpense = monthExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  
  // On ne prend pour le budget global que ceux qui sont "all" (ou sans incomeSourceId pour rétrocompatibilité)
  const totalBudget = budgets.filter(b => !b.incomeSourceId || b.incomeSourceId === 'all').reduce((s, b) => s + (b.amount || 0), 0);
  
  const balance = totalIncome - totalExpense;
  const budgetUsage = totalBudget > 0 ? (totalExpense / totalBudget) * 100 : 0;

  // --- SECTION DÉTAIL PAR REVENU ---
  const incomeDetails = useMemo(() => {
    return monthIncomes.map(inc => {
      const linkedExpenses = monthExpenses.filter(e => e.incomeSourceId === inc.id);
      const spent = linkedExpenses.reduce((s, e) => s + (e.amount || 0), 0);
      const remaining = Math.max(0, inc.amount - spent);
      return { ...inc, spent, remaining, linkedExpensesCount: linkedExpenses.length };
    });
  }, [monthIncomes, monthExpenses]);

  const globalExpenses = monthExpenses.filter(e => !e.incomeSourceId || e.incomeSourceId === 'all');
  const totalGlobalSpent = globalExpenses.reduce((s, e) => s + (e.amount || 0), 0);

  // --- GRAPHIQUES ---
  const byCategory = useMemo(() => {
    const map = {};
    monthExpenses.forEach((e) => {
      map[e.categoryId] = (map[e.categoryId] || 0) + (e.amount || 0);
    });
    return Object.entries(map)
      .map(([id, value]) => {
        const cat = resolveCategory(id, 'expense', customCategories);
        return { id, name: cat?.label || id, value, color: cat?.color || '#94a3b8' };
      })
      .sort((a, b) => b.value - a.value);
  }, [monthExpenses, customCategories]);

  const advices = useMemo(
    () => generateAdvice({
      expenses: monthExpenses,
      previousExpenses: prevExpenses,
      budgets,
      goals,
      totalIncome,
      customCategories,
      userName,
    }),
    [monthExpenses, prevExpenses, budgets, goals, totalIncome, customCategories, userName]
  );

  const recentExpenses = monthExpenses.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tableau de bord</h1>
          <p className="text-sm text-slate-500">Vue d’ensemble et détails par revenu.</p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
        />
      </div>

      {/* VUE GLOBALE */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card>
          <div className="flex items-center gap-2 text-brand-600">
            <TrendingUp size={16} />
            <CardTitle className="text-brand-600">Revenus Globaux</CardTitle>
          </div>
          <CardValue>{formatCurrency(totalIncome)}</CardValue>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-red-500">
            <TrendingDown size={16} />
            <CardTitle className="text-red-500">Dépenses Globales</CardTitle>
          </div>
          <CardValue>{formatCurrency(totalExpense)}</CardValue>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-slate-500">
            <Wallet size={16} />
            <CardTitle>Solde du mois</CardTitle>
          </div>
          <CardValue className={balance < 0 ? 'text-red-600' : 'text-slate-900'}>
            {formatCurrency(balance)}
          </CardValue>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-brand-600">
            <PiggyBank size={16} />
            <CardTitle className="text-brand-600">Budget Global</CardTitle>
          </div>
          <CardValue>{formatCurrency(totalBudget)}</CardValue>
          {totalBudget > 0 && (
            <div className="mt-3">
              <ProgressBar
                value={budgetUsage}
                color={budgetUsage > 100 ? '#ef4444' : budgetUsage > 80 ? '#f59e0b' : '#10b981'}
              />
              <p className="mt-1 text-xs text-slate-500">
                {budgetUsage.toFixed(0)} % du budget global
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* DÉTAIL PAR REVENU */}
      {incomeDetails.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Landmark size={16} className="text-slate-400" />
              <CardTitle>Situation par Revenu</CardTitle>
            </div>
            <Link href="/income" className="flex items-center text-xs font-medium text-brand-600 hover:underline">
              Gérer <ChevronRight size={14} />
            </Link>
          </div>
          <div className="space-y-4">
            {incomeDetails.map(inc => (
              <div key={inc.id} className="rounded-xl border border-slate-100 p-3 bg-slate-50/50">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{inc.source}</p>
                    <p className="text-xs text-slate-500">{formatDate(inc.date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-brand-600">{formatCurrency(inc.amount)}</p>
                    <p className="text-[10px] text-slate-500">Revenu total</p>
                  </div>
                </div>
                
                <div className="flex justify-between items-center text-sm mb-2">
                  <span className="text-slate-500">Dépenses liées ({inc.linkedExpensesCount})</span>
                  <span className="font-semibold text-red-500">- {formatCurrency(inc.spent)}</span>
                </div>
                
                <div className="flex justify-between items-center border-t border-slate-200 pt-2">
                  <span className="text-xs font-semibold text-slate-700">Solde restant sur ce revenu</span>
                  <span className={`text-base font-bold ${inc.remaining > 0 ? 'text-slate-900' : 'text-red-600'}`}>
                    {formatCurrency(inc.remaining)}
                  </span>
                </div>
              </div>
            ))}

            {/* Dépenses Globales */}
            {totalGlobalSpent > 0 && (
              <div className="rounded-xl border border-slate-100 p-3 bg-white">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-semibold text-slate-700">Dépenses non affectées (Globales)</span>
                  <span className="text-sm font-bold text-red-500">- {formatCurrency(totalGlobalSpent)}</span>
                </div>
                <p className="text-xs text-slate-500">
                  Ces dépenses ne sont liées à aucun revenu spécifique. Elles impactent le solde global.
                </p>
              </div>
            )}
          </div>
        </Card>
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
            {advices.slice(0, 3).map((a) => {
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
            <EmptyState icon={Wallet} title="Aucune dépense ce mois" description="Ajoute ta première dépense." />
          ) : (
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
                const daysLeft = Math.max(0, Math.ceil((new Date(g.deadline) - new Date()) / 86400000));
                return (
                  <li key={g.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{g.name}</p>
                      <p className="text-xs text-slate-500">{formatCurrency(g.targetAmount)} — {daysLeft} j restants</p>
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
          <CardTitle>Dernières dépenses</CardTitle>
          <Link href="/expenses" className="flex items-center text-xs font-medium text-brand-600 hover:underline">
            Tout voir <ChevronRight size={14} />
          </Link>
        </div>
        {recentExpenses.length === 0 ? (
          <EmptyState icon={Wallet} title="Aucune dépense enregistrée" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {recentExpenses.map((e) => {
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
                    {e.incomeSourceId !== 'all' && (
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
