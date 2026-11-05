/* eslint-disable react/no-unescaped-entities */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, BarChart3, Wallet, Target, PiggyBank, MessageCircle, CalendarRange, TrendingUp, TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useExpenses } from '@/hooks/useExpenses';
import { useIncomes } from '@/hooks/useIncomes';
import { useAllBudgets } from '@/hooks/useAllBudgets';
import { useGoals } from '@/hooks/useGoals';
import { useProfile } from '@/hooks/useProfile';
import { useDeposits } from '@/hooks/useDeposits';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { useWeeklyReport } from '@/hooks/useWeeklyReport';
import { convertCurrencyAmount, formatCurrency, formatDate, getPreferredCurrencyCode, resolveCategory } from '@/lib/utils';

const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const monthFirst = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
const monthLast = (date) => iso(new Date(date.getFullYear(), date.getMonth() + 1, 0));
const currentYear = () => String(new Date().getFullYear());
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export default function ReportsPage() {
  const { expenses } = useExpenses();
  const { incomes } = useIncomes();
  const { budgets } = useAllBudgets();
  const { goals } = useGoals();
  const { deposits: walletDeposits } = useDeposits();
  const { profile } = useProfile();
  const { customCategories } = useCustomCategories('expense');
  const { report: weeklyReport } = useWeeklyReport();

  const [periodType, setPeriodType] = useState('month');
  const [month, setMonth] = useState(iso(new Date()).slice(0, 7));
  const [year, setYear] = useState(currentYear());
  const [customStart, setCustomStart] = useState(monthFirst(new Date()));
  const [customEnd, setCustomEnd] = useState(iso(new Date()));
  const [selectedDay, setSelectedDay] = useState(iso(new Date()));
  const [selectedWeekDate, setSelectedWeekDate] = useState(iso(new Date()));
  const [goalDepositTotals, setGoalDepositTotals] = useState({});

  useEffect(() => {
    let active = true;
    if (!goals.length) { setGoalDepositTotals({}); return () => { active = false; }; }
    const load = async () => {
      try {
        const { db } = await import('@/lib/firebase/client');
        const { collection, getDocs } = await import('firebase/firestore');
        const values = await Promise.all(goals.map(async (goal) => {
          const snapshot = await getDocs(collection(db, 'users', profile?.id || '', 'goals', goal.id, 'deposits'));
          return [goal.id, snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))];
        }));
        if (active) setGoalDepositTotals(Object.fromEntries(values));
      } catch (error) {
        console.warn('Impossible de charger le détail de l’épargne des objectifs.', error);
      }
    };
    if (profile?.id) load();
    return () => { active = false; };
  }, [goals, profile?.id]);

  const range = useMemo(() => {
    const now = new Date();
    if (periodType === 'day') return { start: selectedDay, end: selectedDay, label: `Journée du ${formatDate(selectedDay)}` };
    if (periodType === 'week') {
      const [weekYear, weekMonth, weekDay] = selectedWeekDate.split('-').map(Number);
      const day = new Date(weekYear, weekMonth - 1, weekDay);
      const offset = (day.getDay() + 6) % 7;
      day.setDate(day.getDate() - offset);
      const end = new Date(day); end.setDate(end.getDate() + 6);
      return { start: iso(day), end: iso(end), label: `Semaine du ${formatDate(iso(day))} au ${formatDate(iso(end))}` };
    }
    if (periodType === 'year') return { start: `${year}-01-01`, end: `${year}-12-31`, label: `Année ${year}` };
    if (periodType === 'custom') return { start: customStart, end: customEnd, label: `Du ${formatDate(customStart)} au ${formatDate(customEnd)}` };
    const [y, m] = month.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    return { start: monthFirst(date), end: monthLast(date), label: date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) };
  }, [periodType, selectedDay, selectedWeekDate, year, customStart, customEnd, month]);

  const rangeValid = Boolean(range.start && range.end && range.start <= range.end);
  const periodExpenses = useMemo(() => rangeValid ? expenses.filter((item) => item.date >= range.start && item.date <= range.end) : [], [expenses, range, rangeValid]);
  const periodIncomes = useMemo(() => rangeValid ? incomes.filter((item) => {
    const date = item.date || `${item.month || ''}-01`;
    return date >= range.start && date <= range.end;
  }) : [], [incomes, range, rangeValid]);
  const totalIncome = periodIncomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalExpense = periodExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const net = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? (net / totalIncome) * 100 : null;
  const averageDailyExpense = rangeValid ? totalExpense / Math.max(1, Math.round((new Date(`${range.end}T00:00:00`) - new Date(`${range.start}T00:00:00`)) / 86400000) + 1) : 0;

  const categoryData = useMemo(() => {
    const map = new Map();
    periodExpenses.forEach((expense) => {
      const category = resolveCategory(expense.categoryId, 'expense', customCategories);
      const current = map.get(expense.categoryId) || { id: expense.categoryId, name: category.label, value: 0, color: category.color || '#94a3b8', count: 0 };
      current.value += Number(expense.amount) || 0; current.count += 1; map.set(expense.categoryId, current);
    });
    return [...map.values()].sort((a, b) => b.value - a.value);
  }, [periodExpenses, customCategories]);

  const sourceData = useMemo(() => {
    const map = new Map();
    periodIncomes.forEach((income) => {
      const key = income.source || 'Autre revenu';
      map.set(key, (map.get(key) || 0) + (Number(income.amount) || 0));
    });
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a,b) => b.value-a.value);
  }, [periodIncomes]);

  const evolution = useMemo(() => {
    if (!rangeValid) return [];
    const start = new Date(`${range.start}T00:00:00`);
    const end = new Date(`${range.end}T00:00:00`);
    const span = Math.floor((end - start) / 86400000) + 1;
    if (span <= 45) {
      return Array.from({ length: span }, (_, index) => {
        const date = new Date(start); date.setDate(date.getDate() + index); const key = iso(date);
        return { label: key.slice(8), revenus: periodIncomes.filter((item) => (item.date || `${item.month}-01`) === key).reduce((sum,item) => sum + Number(item.amount || 0),0), depenses: periodExpenses.filter((item) => item.date === key).reduce((sum,item) => sum + Number(item.amount || 0),0) };
      });
    }
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    const result = [];
    while (cursor <= last) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}`;
      result.push({ label: cursor.toLocaleDateString('fr-FR', { month: 'short' }), revenus: periodIncomes.filter((item) => (item.date || `${item.month}-01`).startsWith(key)).reduce((sum,item) => sum + Number(item.amount || 0),0), depenses: periodExpenses.filter((item) => (item.date || '').startsWith(key)).reduce((sum,item) => sum + Number(item.amount || 0),0) });
      cursor.setMonth(cursor.getMonth()+1);
    }
    return result;
  }, [range, rangeValid, periodIncomes, periodExpenses]);

  const periodMonths = useMemo(() => {
    if (!rangeValid) return [];
    const start = new Date(`${range.start.slice(0,7)}-01T00:00:00`);
    const end = new Date(`${range.end.slice(0,7)}-01T00:00:00`);
    const result = [];
    while (start <= end && result.length < 36) { result.push(`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}`); start.setMonth(start.getMonth()+1); }
    return result;
  }, [range, rangeValid]);
  const periodBudgets = budgets.filter((item) => periodMonths.includes(item.month));
  const budgetAnalysis = useMemo(() => periodBudgets.map((budget) => {
    const category = resolveCategory(budget.categoryId, 'expense', customCategories);
    const spent = periodExpenses.filter((expense) => expense.categoryId === budget.categoryId && periodMonths.includes(expense.date?.slice(0,7)) && (budget.incomeSourceId === 'all' || !budget.incomeSourceId || expense.incomeSourceId === budget.incomeSourceId)).reduce((sum, expense) => sum + (Number(expense.amount)||0), 0);
    return { id: budget.id, category: category.label, month: budget.month, allocated: Number(budget.amount)||0, spent, remaining: Number(budget.amount||0)-spent };
  }), [periodBudgets, periodExpenses, periodMonths, customCategories]);

  const goalAnalysis = goals.map((goal) => {
    const deposits = goalDepositTotals[goal.id] || [];
    const saved = deposits.reduce((sum, item) => sum + (item.source === 'loan' ? 0 : Number(item.amount)||0), 0);
    return { id: goal.id, name: goal.name || 'Objectif', target: Number(goal.targetAmount)||0, saved, deadline: goal.deadline || '', progress: Number(goal.targetAmount) > 0 ? Math.min(100, saved / Number(goal.targetAmount) * 100) : null };
  });
  const totalSavedGoals = goalAnalysis.reduce((sum, item) => sum + item.saved, 0);
  const periodWalletDeposits = walletDeposits.filter((item) => {
    const date = item.createdAt?.toDate ? item.createdAt.toDate().toISOString().slice(0,10) : String(item.createdAt || '').slice(0,10);
    return date >= range.start && date <= range.end && String(item.status || '').toUpperCase() === 'CONFIRMED';
  });
  const walletAdded = periodWalletDeposits.reduce((sum, item) => sum + (Number(item.amount)||0), 0);

  const askAssistant = () => {
    const prompt = `Réalise une analyse approfondie de mon rapport financier pour la période ${range.label}. Revenus : ${totalIncome} FCFA. Dépenses : ${totalExpense} FCFA. Différence : ${net} FCFA. Dépenses par catégorie : ${categoryData.map((item) => `${item.name}: ${item.value} FCFA`).join('; ')}. Budgets : ${budgetAnalysis.map((item) => `${item.category} (${item.month}) : ${item.spent}/${item.allocated} FCFA`).join('; ')}. Objectifs : ${goalAnalysis.map((item) => `${item.name}: ${item.saved}/${item.target} FCFA`).join('; ')}. Solde du portefeuille : ${Number(profile?.balance)||0} FCFA. Fais ressortir les tendances, risques et actions concrètes sans inventer de données ni modifier mes opérations.`;
    window.dispatchEvent(new CustomEvent('pata:assistant-open', { detail: { prompt } }));
  };

  const getRows = () => [
    ['Type', 'Date', 'Libellé', 'Catégorie / source', `Montant (${getPreferredCurrencyCode()})`, 'Détail'],
    ...periodIncomes.map((item) => ['Revenu', item.date || item.month, item.source || 'Revenu', item.categoryId || '', convertCurrencyAmount(Number(item.amount)||0), item.note || '']),
    ...periodExpenses.map((item) => ['Dépense', item.date || '', item.note || 'Dépense', resolveCategory(item.categoryId, 'expense', customCategories).label, convertCurrencyAmount(Number(item.amount)||0), item.incomeSourceName || '']),
    ...periodWalletDeposits.map((item) => ['Recharge portefeuille', item.createdAt?.toDate ? item.createdAt.toDate().toISOString().slice(0,10) : '', 'Recharge Pata', item.status || '', convertCurrencyAmount(Number(item.amount)||0), item.phone || '']),
    ...budgetAnalysis.map((item) => ['Budget', item.month, item.category, 'Montant dépensé / alloué', convertCurrencyAmount(item.spent), `${formatCurrency(item.allocated)} alloués`]),
    ...goalAnalysis.map((item) => ['Objectif', item.deadline, item.name, 'Épargne cumulée', convertCurrencyAmount(item.saved), `${formatCurrency(item.target)} visés`]),
  ];
  const exportPdf = () => {
    const rows = getRows();
    const table = rows.map((row,index) => `<tr>${row.map((cell) => `<${index===0?'th':'td'}>${escapeHtml(cell)}</${index===0?'th':'td'}>`).join('')}</tr>`).join('');
    const popup = window.open('', '_blank', 'width=1100,height=850');
    if (!popup) { alert('Autorise les fenêtres contextuelles pour créer le PDF.'); return; }
    popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport Pata</title><style>body{font:12px Arial,sans-serif;color:#172033;padding:28px}h1{font-size:24px;margin-bottom:4px}h2{font-size:15px;margin-top:24px}.muted{color:#64748b}.kpis{display:flex;gap:12px;margin:20px 0}.kpi{flex:1;padding:12px;background:#f1f5f9;border-radius:8px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #dbe2ea;padding:7px;text-align:left}th{background:#edf2f7}tr:nth-child(even){background:#f8fafc}@media print{body{padding:10mm}}</style></head><body><h1>Rapport financier Pata</h1><p class="muted">${escapeHtml(profile?.displayName || 'Utilisateur')} · ${escapeHtml(range.label)} · Généré le ${new Date().toLocaleDateString('fr-FR')}</p><div class="kpis"><div class="kpi">Revenus<br><b>${escapeHtml(formatCurrency(totalIncome))}</b></div><div class="kpi">Dépenses<br><b>${escapeHtml(formatCurrency(totalExpense))}</b></div><div class="kpi">Différence<br><b>${escapeHtml(formatCurrency(net))}</b></div></div><h2>Opérations détaillées</h2><table>${table}</table><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  };
  const exportExcel = () => {
    const rows = getRows();
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><h2>Rapport Pata — ${escapeHtml(range.label)}</h2><table border="1">${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `pata-rapport-${range.start}-${range.end}.xls`; link.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-slate-900">Rapports financiers</h1><p className="mt-1 text-sm text-slate-500">Une analyse détaillée de tes opérations, de tes budgets, de ton épargne et de ton portefeuille.</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={exportPdf}><FileText size={15}/> PDF</Button><Button variant="outline" onClick={exportExcel}><FileSpreadsheet size={15}/> Excel</Button></div>
      </header>

      <Card>
        <div className="mb-3 flex items-center gap-2"><CalendarRange size={17} className="text-slate-500"/><CardTitle>Période du rapport</CardTitle></div>
        <div className="flex flex-wrap gap-2">
          {[['day','Jour'],['week','Semaine'],['month','Mois'],['year','Année'],['custom','Période personnalisée']].map(([value,label]) => <button key={value} onClick={() => setPeriodType(value)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${periodType===value?'bg-slate-900 text-white':'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{label}</button>)}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {periodType==='day' && <label className="text-xs font-medium text-slate-500">Journée<input type="date" value={selectedDay} onChange={(e)=>setSelectedDay(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800"/></label>}
          {periodType==='week' && <label className="text-xs font-medium text-slate-500">Semaine contenant le<input type="date" value={selectedWeekDate} onChange={(e)=>setSelectedWeekDate(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800"/></label>}
          {periodType==='month' && <label className="text-xs font-medium text-slate-500">Mois<input type="month" value={month} onChange={(e)=>setMonth(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800"/></label>}
          {periodType==='year' && <label className="text-xs font-medium text-slate-500">Année<input type="number" min="2000" max="2100" value={year} onChange={(e)=>setYear(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800"/></label>}
          {periodType==='custom' && <><label className="text-xs font-medium text-slate-500">Du<input type="date" value={customStart} onChange={(e)=>setCustomStart(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800"/></label><label className="text-xs font-medium text-slate-500">Au<input type="date" value={customEnd} onChange={(e)=>setCustomEnd(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-800"/></label></>}
        </div>
        <p className="mt-3 text-sm font-semibold text-slate-800">{range.label}</p>
        {!rangeValid && <p className="mt-1 text-xs text-red-600">La date de début doit être antérieure ou égale à la date de fin.</p>}
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><p className="text-xs font-medium text-slate-500">Revenus encaissés</p><p className="mt-2 text-xl font-bold text-emerald-700">{formatCurrency(totalIncome)}</p><p className="mt-1 text-xs text-slate-500">{periodIncomes.length} entrée(s)</p></Card>
        <Card><p className="text-xs font-medium text-slate-500">Dépenses enregistrées</p><p className="mt-2 text-xl font-bold text-red-600">{formatCurrency(totalExpense)}</p><p className="mt-1 text-xs text-slate-500">{periodExpenses.length} opération(s)</p></Card>
        <Card><p className="text-xs font-medium text-slate-500">Différence de la période</p><p className={`mt-2 text-xl font-bold ${net>=0?'text-slate-900':'text-red-600'}`}>{formatCurrency(net)}</p><p className="mt-1 text-xs text-slate-500">{savingsRate===null?'Aucun revenu saisi':`${savingsRate.toFixed(1)} % des revenus`}</p></Card>
        <Card><p className="text-xs font-medium text-slate-500">Dépense moyenne / jour</p><p className="mt-2 text-xl font-bold text-slate-900">{formatCurrency(averageDailyExpense)}</p><p className="mt-1 text-xs text-slate-500">Sur la durée sélectionnée</p></Card>
      </div>

      {weeklyReport && (
        <Card>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Bilan hebdomadaire automatique</CardTitle>
              <p className="mt-1 text-xs text-slate-500">Semaine du {formatDate(weeklyReport.weekStart)} au {formatDate(weeklyReport.weekEnd)} · Comparaison avec la semaine précédente</p>
            </div>
            {weeklyReport.expenseChangePercent !== null && weeklyReport.expenseChangePercent !== undefined && (
              <span className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${weeklyReport.expenseChangePercent > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {weeklyReport.expenseChangePercent > 0 ? '+' : ''}{weeklyReport.expenseChangePercent} % de dépenses
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Revenus</p><p className="mt-1 text-sm font-bold text-emerald-700">{formatCurrency(weeklyReport.totalIncome)}</p></div>
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Dépenses</p><p className="mt-1 text-sm font-bold text-red-600">{formatCurrency(weeklyReport.totalExpense)}</p></div>
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Semaine précédente · revenus</p><p className="mt-1 text-sm font-bold">{formatCurrency(weeklyReport.previousIncome)}</p></div>
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Semaine précédente · dépenses</p><p className="mt-1 text-sm font-bold">{formatCurrency(weeklyReport.previousExpense)}</p></div>
          </div>
          {Array.isArray(weeklyReport.advice) && weeklyReport.advice.length > 0 && (
            <div className="mt-3 rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-xs font-semibold text-slate-700">À retenir</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">{weeklyReport.advice.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </div>
          )}
          {Array.isArray(weeklyReport.categories) && weeklyReport.categories.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-xs font-semibold text-slate-700">Principales dépenses</p>
              <div className="flex flex-wrap gap-2">{weeklyReport.categories.slice(0, 4).map((item) => <span key={item.categoryId} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{item.label} · {formatCurrency(item.amount)}</span>)}</div>
            </div>
          )}
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2"><CardTitle>Évolution des revenus et dépenses</CardTitle><span className="text-[11px] text-slate-400">Par jour ou par mois selon la période</span></div>
        {evolution.length ? <div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={evolution}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="label" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} tickFormatter={(value)=>formatCurrency(value)}/><Tooltip formatter={(value)=>formatCurrency(value)}/><Line type="monotone" dataKey="revenus" name="Revenus" stroke="#059669" strokeWidth={2} dot={false}/><Line type="monotone" dataKey="depenses" name="Dépenses" stroke="#dc2626" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div> : <EmptyState icon={BarChart3} title="Aucune donnée sur cette période"/>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">Où part ton argent ?</CardTitle>
          {categoryData.length ? <><div className="h-52"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>{categoryData.map((item,index)=><Cell key={item.id || index} fill={item.color}/>)}</Pie><Tooltip formatter={(value)=>formatCurrency(value)}/></PieChart></ResponsiveContainer></div><div className="mt-2 space-y-2">{categoryData.slice(0,8).map((item)=> <div key={item.id} className="flex items-center justify-between gap-3 text-sm"><span>{item.name} <span className="text-xs text-slate-400">({item.count})</span></span><strong>{formatCurrency(item.value)}</strong></div>)}</div></> : <EmptyState icon={Wallet} title="Aucune dépense dans cette période"/>}
        </Card>
        <Card>
          <CardTitle className="mb-3">Origine des revenus</CardTitle>
          {sourceData.length ? <div className="space-y-3">{sourceData.map((item)=> <div key={item.name}><div className="mb-1 flex justify-between gap-3 text-sm"><span>{item.name}</span><strong>{formatCurrency(item.value)}</strong></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{width:`${totalIncome?Math.min(100,item.value/totalIncome*100):0}%`}}/></div></div>)}</div> : <EmptyState icon={TrendingUp} title="Aucun revenu sur cette période"/>}
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between"><CardTitle>Respect des budgets</CardTitle><span className="text-xs text-slate-400">{periodBudgets.length} enveloppe(s)</span></div>
        {budgetAnalysis.length ? <><div className="space-y-3 md:hidden">{budgetAnalysis.map((item)=><div key={`mobile-${item.id}`} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{item.category}</p><p className="text-[11px] text-slate-400">{item.month}</p></div><span className={`text-xs font-semibold ${item.remaining<0?'text-red-600':'text-emerald-700'}`}>{item.remaining<0?`Dépassé de ${formatCurrency(Math.abs(item.remaining))}`:`Reste ${formatCurrency(item.remaining)}`}</span></div><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] text-slate-500">Prévu</p><p className="mt-1 text-sm font-semibold">{formatCurrency(item.allocated)}</p></div><div className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] text-slate-500">Dépensé</p><p className="mt-1 text-sm font-semibold">{formatCurrency(item.spent)}</p></div></div></div>)}</div><div className="hidden md:block overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="py-2 pr-3">Catégorie</th><th className="py-2 pr-3">Prévu</th><th className="py-2 pr-3">Dépensé</th><th className="py-2">Écart</th></tr></thead><tbody>{budgetAnalysis.map((item)=><tr key={item.id} className="border-b border-slate-100"><td className="py-2.5 pr-3">{item.category}<span className="block text-[11px] text-slate-400">{item.month}</span></td><td className="py-2.5 pr-3">{formatCurrency(item.allocated)}</td><td className="py-2.5 pr-3">{formatCurrency(item.spent)}</td><td className={`py-2.5 font-semibold ${item.remaining<0?'text-red-600':'text-emerald-700'}`}>{item.remaining<0?`Dépassement ${formatCurrency(Math.abs(item.remaining))}`:`Reste ${formatCurrency(item.remaining)}`}</td></tr>)}</tbody></table></div></> : <p className="text-sm text-slate-500">Aucun budget enregistré pour les mois de cette période.</p>}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center gap-2"><Target size={17} className="text-slate-500"/><CardTitle>Objectifs d’épargne</CardTitle></div>
          <div className="mb-3 grid grid-cols-2 gap-2"><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Objectifs actifs</p><p className="mt-1 text-xl font-bold">{goals.length}</p></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Total épargné</p><p className="mt-1 text-xl font-bold text-emerald-700">{formatCurrency(totalSavedGoals)}</p></div></div>
          {goalAnalysis.length ? <div className="space-y-3">{goalAnalysis.map((item)=><div key={item.id}><div className="flex justify-between gap-2 text-sm"><span className="font-medium">{item.name}</span><strong>{formatCurrency(item.saved)}{item.target?` / ${formatCurrency(item.target)}`:''}</strong></div>{item.progress!==null&&<div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{width:`${item.progress}%`}}/></div>}</div>)}</div> : <p className="text-sm text-slate-500">Aucun objectif enregistré.</p>}
        </Card>
        <Card>
          <div className="mb-3 flex items-center gap-2"><PiggyBank size={17} className="text-slate-500"/><CardTitle>Portefeuille Pata</CardTitle></div>
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Solde actuel</p><p className="mt-1 text-2xl font-bold">{formatCurrency(Number(profile?.balance)||0)}</p></div>
          <div className="mt-3 flex justify-between text-sm"><span className="text-slate-500">Recharges confirmées sur la période</span><strong>{formatCurrency(walletAdded)}</strong></div>
          <p className="mt-1 text-xs text-slate-500">Ce portefeuille est un solde interne Pata, distinct des comptes Mobile Money.</p>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2"><CardTitle>Opérations de la période</CardTitle><span className="text-xs text-slate-400">{periodIncomes.length + periodExpenses.length} ligne(s)</span></div>
        {periodIncomes.length + periodExpenses.length === 0 ? <EmptyState icon={Wallet} title="Aucune opération à afficher"/> : <><div className="max-h-[70vh] space-y-2 overflow-y-auto md:hidden">{[...periodIncomes.map((item)=>({...item,_type:'Revenu',_label:item.source||'Revenu',_amount:Number(item.amount)||0})),...periodExpenses.map((item)=>({...item,_type:'Dépense',_label:item.note||resolveCategory(item.categoryId,'expense',customCategories).label,_amount:Number(item.amount)||0}))].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).map((item)=><div key={`mobile-${item._type}-${item.id}`} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{item._label}</p><p className={`mt-1 text-xs ${item._type==='Revenu'?'text-emerald-700':'text-red-600'}`}>{item._type} · {item.date||item.month}</p></div><strong className="shrink-0 text-sm">{formatCurrency(item._amount)}</strong></div>)}</div><div className="hidden max-h-80 overflow-y-auto md:block"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs text-slate-500"><tr><th className="px-2 py-2">Date</th><th className="px-2 py-2">Type</th><th className="px-2 py-2">Libellé</th><th className="px-2 py-2 text-right">Montant</th></tr></thead><tbody>{[...periodIncomes.map((item)=>({...item,_type:'Revenu',_label:item.source||'Revenu',_amount:Number(item.amount)||0})),...periodExpenses.map((item)=>({...item,_type:'Dépense',_label:item.note||resolveCategory(item.categoryId,'expense',customCategories).label,_amount:Number(item.amount)||0}))].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).map((item)=><tr key={`${item._type}-${item.id}`} className="border-t border-slate-100"><td className="px-2 py-2.5 text-xs text-slate-500">{item.date||item.month}</td><td className={`px-2 py-2.5 text-xs ${item._type==='Revenu'?'text-emerald-700':'text-red-600'}`}>{item._type}</td><td className="max-w-[260px] truncate px-2 py-2.5">{item._label}</td><td className="px-2 py-2.5 text-right font-semibold">{formatCurrency(item._amount)}</td></tr>)}</tbody></table></div></>}
      </Card>

      <Card className="border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Analyse personnalisée avec Mč</CardTitle><p className="mt-1 text-xs text-slate-500">L’assistante recevra les chiffres et les catégories de ce rapport pour aller plus loin.</p></div><Button onClick={askAssistant}><MessageCircle size={15}/> Analyser ce rapport</Button></div>
      </Card>
    </div>
  );
}
