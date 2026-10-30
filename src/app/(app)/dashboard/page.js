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
import { CategoryBadge } from '@/components/ui/CategoryBadge';
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
  const { budgets } = useBudgets(month);
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
  const totalBudget = budgets.reduce((s, b) => s + (b.amount || 0), 0);
  const balance = totalIncome - totalExpense;
  const budgetUsage = totalBudget > 0 ? (totalExpense / totalBudget) * 100 : 0;

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

  // 🟢 NOUVEAU : Calcul des dépenses par source de revenu
  const byIncomeSource = useMemo(() => {
    const map = {};
    monthExpenses.forEach((e) => {
      const sourceName = e.incomeSourceName || 'Fonds Globaux';
      map[sourceName] = (map[sourceName] || 0) + (e.amount || 0);
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [monthExpenses]);

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
          <p className="text-sm text-slate-500">Vue d&apos;ensemble et conseils personnalisés.</p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card>
          <div className="flex items-center gap-2 text-brand-600">
            <TrendingUp size={16} />
            <CardTitle className="text-brand-600">Revenus</CardTitle>
          </div>
          <CardValue>{formatCurrency(totalIncome)}</CardValue>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-red-500">
            <TrendingDown size={16} />
            <CardTitle className="text-red-500">Dépenses</CardTitle>
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
            <CardTitle className="text-brand-600">Budget alloué</CardTitle>
          </div>
          <CardValue>{formatCurrency(totalBudget)}</CardValue>
          {totalBudget > 0 && (
            <div className="mt-3">
              <ProgressBar
                value={budgetUsage}
                color={budgetUsage > 100 ? '#ef4444' : budgetUsage > 80 ? '#f59e0b' : '#10b981'}
              />
              <p className="mt-1 text-xs text-slate-500">
                {budgetUsage.toFixed(0)} % consommé
              </p>
            </div>
          )}
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
          {byCategory.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {byCategory.slice(0, 4).map((c) => (
                <li key={c.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </span>
                  <span className="font-medium text-slate-700">{formatCurrency(c.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <CardTitle>Dépenses par source</CardTitle>
            <Landmark size={16} className="text-slate-400" />
          </div>
          {byIncomeSource.length === 0 ? (
            <EmptyState icon={Landmark} title="Aucune donnée" description="Liez vos dépenses à un revenu." />
          ) : (
            <ul className="space-y-3">
              {byIncomeSource.map((s) => (
                <li key={s.name} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{s.name}</span>
                    <span className="font-bold text-slate-900">{formatCurrency(s.value)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-brand-500 rounded-full" 
                      style={{ width: `${(s.value / totalExpense) * 100}%` }} 
                    />
                  </div>
                </li>
              ))}
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
                    <CategoryBadge categoryId={e.categoryId} color={cat?.color} size="sm" />
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
