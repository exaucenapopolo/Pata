'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown, Wallet, Target, PiggyBank, ChevronRight,
  CheckCircle2, AlertTriangle, Lightbulb, Info,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardTitle, CardValue } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { useIncomes } from '@/hooks/useIncomes';
import { useExpenses } from '@/hooks/useExpenses';
import { useBudgets } from '@/hooks/useBudgets';
import { useGoals } from '@/hooks/useGoals';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { generateAdvice, adviceStyle } from '@/lib/advisor';
import { formatCurrency, formatDate, resolveCategory } from '@/lib/utils';

const todayMonth = () => new Date().toISOString().slice(0, 7);
const prevMonth = (m) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const ADVICE_ICONS = {
  check: CheckCircle2,
  alert: AlertTriangle,
  lightbulb: Lightbulb,
  info: Info,
};

export default function DashboardPage() {
  const [month, setMonth] = useState(todayMonth());
  const { incomes } = useIncomes();
  const { expenses } = useExpenses();
  const { budgets } = useBudgets(month);
  const { goals } = useGoals();
  const { customCategories } = useCustomCategories('expense');

  const monthIncomes = useMemo(
    () => incomes.filter((i) => i.month === month),
    [incomes, month]
  );
  const monthExpenses = useMemo(
    () => expenses.filter((e) => e.date?.startsWith(month)),
    [expenses, month]
  );
  const prevExpenses = useMemo(
    () => expenses.filter((e) => e.date?.startsWith(prevMonth(month))),
    [expenses, month]
  );

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
        return { name: cat?.label || id, value, color: cat?.color || '#94a3b8' };
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
    }),
    [monthExpenses, prevExpenses, budgets, goals, totalIncome, customCategories]
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
            <CardTitle>Conseils de l&apos;assistant</CardTitle>
            <Link
              href="/reports"
              className="flex items-center text-xs font-medium text-brand-600 hover:underline"
            >
              Détails <ChevronRight size={14} />
            </Link>
          </div>
          <div className="space-y-2">
            {advices.slice(0, 3).map((a) => {
              const s = adviceStyle(a.type);
              const Icon = ADVICE_ICONS[adviceTypeToIcon(a.type)] || Info;
              return (
                <div
                  key={a.id}
                  className={`flex items-start gap-2 rounded-xl border ${s.border} ${s.bg} p-3`}
                >
                  <Icon size={16} className={`mt-0.5 shrink-0 ${s.iconColor}`} />
                  <div>
                    <p className={`text-sm font-semibold ${s.titleColor}`}>{a.title}</p>
                    <p className="text-xs text-slate-600">{a.message}</p>
                  </div>
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
            <EmptyState
              icon={Wallet}
              title="Aucune dépense ce mois"
              description="Ajoute ta première dépense pour voir la répartition."
            />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byCategory}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {byCategory.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
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
            <CardTitle>Objectifs en cours</CardTitle>
            <Link href="/goals" className="flex items-center text-xs font-medium text-brand-600 hover:underline">
              Gérer <ChevronRight size={14} />
            </Link>
          </div>
          {goals.length === 0 ? (
            <EmptyState
              icon={Target}
              title="Aucun objectif"
              description="Crée ton premier objectif d'épargne."
            />
          ) : (
            <ul className="space-y-3">
              {goals.slice(0, 4).map((g) => {
                const daysLeft = Math.max(
                  0,
                  Math.ceil((new Date(g.deadline) - new Date()) / 86400000)
                );
                return (
                  <li
                    key={g.id}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{g.name}</p>
                      <p className="text-xs text-slate-500">
                        {formatCurrency(g.targetAmount)} — {daysLeft} j restants
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
                <li key={e.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {cat?.label || 'Autre'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(e.date)}
                      {e.note ? ` — ${e.note}` : ''}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-slate-800">
                    {formatCurrency(e.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function adviceTypeToIcon(type) {
  switch (type) {
    case 'success': return 'check';
    case 'danger':
    case 'warning': return 'alert';
    case 'tip': return 'lightbulb';
    default: return 'info';
  }
                }
