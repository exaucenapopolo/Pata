'use client';

import { useMemo, useState } from 'react';
import {
  Download, BarChart3, Wallet, CheckCircle2, AlertTriangle,
  Lightbulb, Info,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useExpenses } from '@/hooks/useExpenses';
import { useIncomes } from '@/hooks/useIncomes';
import { useBudgets } from '@/hooks/useBudgets';
import { useGoals } from '@/hooks/useGoals';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { generateAdvice, adviceStyle } from '@/lib/advisor';
import { formatCurrency, resolveCategory } from '@/lib/utils';

const todayMonth = () => new Date().toISOString().slice(0, 7);
const todayYear = () => String(new Date().getFullYear());

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

export default function ReportsPage() {
  const { expenses } = useExpenses();
  const { incomes } = useIncomes();
  const { goals } = useGoals();
  const { customCategories } = useCustomCategories('expense');
  const [month, setMonth] = useState(todayMonth());
  const [year, setYear] = useState(todayYear());

  const { budgets } = useBudgets(month);

  const monthExpenses = useMemo(
    () => expenses.filter((e) => e.date?.startsWith(month)),
    [expenses, month]
  );
  const prevExpenses = useMemo(
    () => expenses.filter((e) => e.date?.startsWith(prevMonth(month))),
    [expenses, month]
  );
  const monthIncomes = useMemo(
    () => incomes.filter((i) => i.month === month),
    [incomes, month]
  );

  const totalExpense = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const totalIncome = monthIncomes.reduce((s, i) => s + i.amount, 0);
  const totalPrevExpense = prevExpenses.reduce((s, e) => s + e.amount, 0);

  const byCategory = useMemo(() => {
    const map = {};
    monthExpenses.forEach((e) => {
      map[e.categoryId] = (map[e.categoryId] || 0) + e.amount;
    });
    return Object.entries(map)
      .map(([id, value]) => {
        const cat = resolveCategory(id, 'expense', customCategories);
        return { name: cat?.label || id, value, color: cat?.color || '#94a3b8' };
      })
      .sort((a, b) => b.value - a.value);
  }, [monthExpenses, customCategories]);

  const yearEvolution = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, '0');
      return `${year}-${m}`;
    });
    return months.map((m) => {
      const total = expenses
        .filter((e) => e.date?.startsWith(m))
        .reduce((s, e) => s + e.amount, 0);
      return { month: m.slice(5), total };
    });
  }, [expenses, year]);

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

  const top5 = byCategory.slice(0, 5);

  const exportCsv = () => {
    if (!monthExpenses.length) return;
    const header = 'Date,Montant,Categorie,Note';
    const rows = monthExpenses.map((e) => {
      const cat = resolveCategory(e.categoryId, 'expense', customCategories);
      return `${e.date},${e.amount},"${cat?.label || e.categoryId}","${(e.note || '').replace(/"/g, '""')}"`;
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pata-depenses-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rapports</h1>
          <p className="text-sm text-slate-500">Analyse et recommandations de ton assistant économique.</p>
        </div>
        <div className="flex gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          />
          <Button variant="outline" onClick={exportCsv}>
            <Download size={14} /> CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Card>
          <CardTitle>Revenus du mois</CardTitle>
          <p className="mt-1 text-xl font-bold text-brand-600">{formatCurrency(totalIncome)}</p>
          {totalIncome > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              {totalIncome > 0 ? `${((1 - totalExpense / totalIncome) * 100).toFixed(0)} % épargné` : ''}
            </p>
          )}
        </Card>
        <Card>
          <CardTitle>Dépenses du mois</CardTitle>
          <p className="mt-1 text-xl font-bold text-red-500">{formatCurrency(totalExpense)}</p>
          {totalPrevExpense > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              {totalExpense >= totalPrevExpense ? '+' : ''}
              {(((totalExpense - totalPrevExpense) / totalPrevExpense) * 100).toFixed(0)} % vs mois dernier
            </p>
          )}
        </Card>
      </div>

      {advices.length > 0 && (
        <Card>
          <CardTitle className="mb-3">Analyse et conseils</CardTitle>
          <div className="space-y-2">
            {advices.map((a) => {
              const s = adviceStyle(a.type);
              const Icon = ADVICE_ICONS[a.type] || Info;
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

      <Card>
        <CardTitle className="mb-3">Évolution {year}</CardTitle>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={yearEvolution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3">
          <label className="text-xs font-medium text-slate-500">Année</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="ml-2 h-8 w-20 rounded border border-slate-300 px-2 text-sm"
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">Répartition par catégorie</CardTitle>
          {byCategory.length === 0 ? (
            <EmptyState icon={Wallet} title="Aucune donnée" />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={40} outerRadius={75}>
                    {byCategory.map((c, i) => (
                      <Cell key={i} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle className="mb-3">Top 5 des catégories</CardTitle>
          {top5.length === 0 ? (
            <EmptyState icon={BarChart3} title="Aucune donnée" />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top5} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip formatter={(v) => formatCurrency(v)} />
                  <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
      }
