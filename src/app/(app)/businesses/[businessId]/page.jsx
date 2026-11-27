'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Wallet, Plus, Building2, RefreshCw, LockKeyhole, Crown, CreditCard, Receipt, Users, FileText, Handshake, CalendarClock, PiggyBank, Trash2, CheckCircle2, Send, X, BarChart3 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/context/LanguageContext';
import { subscribeIncomes } from '@/lib/firestore/incomes';
import { isIncomeCountedAsSource } from '@/lib/finance/incomeBalances.mjs';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  createBusinessAccount, createBusinessTransaction, deleteBusinessResource,
  getBusinessAccounts, getBusinessOverview, getBusinessResource,
  getBusinessTransactions, payBusinessDocument, saveBusinessResource,
  transferPersonalIncome,
} from '@/lib/business/client';

const TABS = [
  { id: 'dashboard', fr: 'Vue d’ensemble', en: 'Overview', icon: Building2 },
  { id: 'transactions', fr: 'Opérations', en: 'Transactions', icon: Wallet },
  { id: 'reports', fr: 'Rapports', en: 'Reports', icon: BarChart3 },
  { id: 'accounts', fr: 'Comptes', en: 'Accounts', icon: CreditCard },
  { id: 'invoices', fr: 'Factures clients', en: 'Customer invoices', icon: Receipt },
  { id: 'obligations', fr: 'Obligations', en: 'Obligations', icon: CalendarClock },
  { id: 'clients', fr: 'Clients', en: 'Customers', icon: Users },
  { id: 'suppliers', fr: 'Fournisseurs', en: 'Suppliers', icon: Users },
  { id: 'partners', fr: 'Partenaires', en: 'Partners', icon: Handshake },
  { id: 'contracts', fr: 'Contrats', en: 'Contracts', icon: FileText },
  { id: 'budgets', fr: 'Budgets', en: 'Budgets', icon: PiggyBank },
];
const RESOURCE_CONFIG = {
  invoices: { fields: [{ key: 'title', label: 'Objet de la facture', required: true }, { key: 'customerName', label: 'Nom du client', required: true }, { key: 'invoiceNumber', label: 'Numéro (facultatif)' }, { key: 'totalAmount', label: 'Montant total (FCFA)', type: 'number', required: true }, { key: 'issueDate', label: 'Date d’émission', type: 'date', required: true }, { key: 'dueDate', label: 'Date limite', type: 'date' }, { key: 'note', label: 'Note' }] },
  obligations: { fields: [{ key: 'title', label: 'Obligation à suivre', required: true }, { key: 'amount', label: 'Montant estimé (FCFA)', type: 'number' }, { key: 'dueDate', label: 'Échéance', type: 'date' }, { key: 'category', label: 'Catégorie' }, { key: 'note', label: 'Note' }] },
  clients: { fields: [{ key: 'name', label: 'Nom du client', required: true }, { key: 'phone', label: 'Téléphone' }, { key: 'email', label: 'E-mail', type: 'email' }, { key: 'address', label: 'Adresse' }, { key: 'note', label: 'Note' }] },
  suppliers: { fields: [{ key: 'name', label: 'Nom du fournisseur', required: true }, { key: 'phone', label: 'Téléphone' }, { key: 'email', label: 'E-mail', type: 'email' }, { key: 'address', label: 'Adresse' }, { key: 'note', label: 'Note' }] },
  partners: { fields: [{ key: 'name', label: 'Nom du partenaire', required: true }, { key: 'role', label: 'Rôle ou responsabilité' }, { key: 'phone', label: 'Téléphone' }, { key: 'email', label: 'E-mail', type: 'email' }, { key: 'note', label: 'Accord ou note' }] },
  contracts: { fields: [{ key: 'title', label: 'Titre du contrat', required: true }, { key: 'counterparty', label: 'Client ou partenaire' }, { key: 'amount', label: 'Montant (FCFA)', type: 'number' }, { key: 'startDate', label: 'Date de début', type: 'date' }, { key: 'endDate', label: 'Date de fin', type: 'date' }, { key: 'description', label: 'Description' }] },
  budgets: { fields: [{ key: 'title', label: 'Nom du budget' }, { key: 'categoryId', label: 'Catégorie', required: true }, { key: 'amount', label: 'Montant prévu (FCFA)', type: 'number', required: true }, { key: 'month', label: 'Mois (AAAA-MM)', placeholder: '2026-11', required: true }] },
};
const RESOURCE_LABELS = {
  invoices: 'facture', obligations: 'obligation', clients: 'client',
  suppliers: 'fournisseur', partners: 'partenaire', contracts: 'contrat', budgets: 'budget',
};
const freshForm = (resource) => Object.fromEntries((RESOURCE_CONFIG[resource]?.fields || []).map((field) => [field.key, field.key === 'issueDate' ? new Date().toISOString().slice(0, 10) : field.key === 'month' ? new Date().toISOString().slice(0, 7) : '']));

export default function BusinessWorkspacePage() {
  const params = useParams();
  const businessId = String(params?.businessId || '');
  const router = useRouter();
  const { user } = useAuth();
  const { language } = useLanguage();
  const en = language === 'en';
  const [personalSources, setPersonalSources] = useState([]);
  const [personalSourcesLoading, setPersonalSourcesLoading] = useState(false);
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [items, setItems] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [resourceFormOpen, setResourceFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [transactionForm, setTransactionForm] = useState({ type: 'income', amount: '', title: '', categoryId: 'sales', date: new Date().toISOString().slice(0, 10), accountId: 'main', note: '', paymentMethod: '' });
  const [accountForm, setAccountForm] = useState({ name: '', type: 'cash', openingBalance: '0' });
  const [resourceForm, setResourceForm] = useState({});
  const [transferForm, setTransferForm] = useState({ incomeId: '', amount: '', accountId: 'main', date: new Date().toISOString().slice(0, 10) });
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', accountId: 'main', date: new Date().toISOString().slice(0, 10) });
  const [actionNotice, setActionNotice] = useState('');

  const writable = overview?.readOnly === false;
  const premiumActive = overview?.premiumActive === true;

  const refreshOverview = useCallback(async () => {
    if (!businessId) return;
    setOverviewLoading(true);
    setPageError('');
    try {
      const data = await getBusinessOverview(businessId);
      setOverview(data);
      setAccounts(data.accounts || []);
    } catch (error) {
      setPageError(error.message || 'Impossible de charger cette entreprise.');
    } finally {
      setOverviewLoading(false);
    }
  }, [businessId]);

  useEffect(() => { void refreshOverview(); }, [refreshOverview]);

  useEffect(() => {
    if (!businessId || !overview) return;
    let active = true;
    const load = async () => {
      if (['dashboard', 'reports'].includes(activeTab)) return;
      setListLoading(true);
      setFormError('');
      try {
        if (activeTab === 'transactions') {
          const result = await getBusinessTransactions(businessId, { limit: 100 });
          if (active) setTransactions(result.transactions || []);
        } else if (activeTab === 'accounts') {
          const result = await getBusinessAccounts(businessId);
          if (active) setAccounts(result);
        } else {
          const result = await getBusinessResource(businessId, activeTab);
          if (active) setItems(result);
        }
      } catch (error) {
        if (active) setFormError(error.message || 'Impossible de charger cette rubrique.');
      } finally {
        if (active) setListLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [activeTab, businessId, overview]);

  useEffect(() => {
    if (overview?.readOnly && !['dashboard', 'transactions', 'reports'].includes(activeTab)) setActiveTab('dashboard');
  }, [overview?.readOnly, activeTab]);

  const accountsForSelect = useMemo(() => accounts.length ? accounts : overview?.accounts || [], [accounts, overview?.accounts]);
  const money = (amount) => formatCurrency(Number(amount) || 0, overview?.business?.currency || 'XAF');
  const reloadCurrent = async () => {
    await refreshOverview();
    if (activeTab === 'transactions') {
      const result = await getBusinessTransactions(businessId, { limit: 100 });
      setTransactions(result.transactions || []);
    }
    if (RESOURCE_CONFIG[activeTab]) setItems(await getBusinessResource(businessId, activeTab));
  };

  const submitTransaction = async (event) => {
    event.preventDefault();
    setSaving(true); setFormError(''); setActionNotice('');
    try {
      await createBusinessTransaction(businessId, transactionForm);
      setShowTransactionForm(false);
      setTransactionForm((current) => ({ ...current, amount: '', title: '', note: '' }));
      setActionNotice(en ? 'Transaction saved.' : 'Opération enregistrée.');
      await reloadCurrent();
    } catch (error) { setFormError(error.message || 'Impossible d’enregistrer cette opération.'); }
    finally { setSaving(false); }
  };

  const submitAccount = async (event) => {
    event.preventDefault();
    setSaving(true); setFormError('');
    try {
      await createBusinessAccount(businessId, accountForm);
      setShowAccountForm(false);
      setAccountForm({ name: '', type: 'cash', openingBalance: '0' });
      await refreshOverview();
      if (activeTab === 'accounts') setAccounts(await getBusinessAccounts(businessId));
    } catch (error) { setFormError(error.message || 'Impossible de créer ce compte.'); }
    finally { setSaving(false); }
  };

  const submitResource = async (event) => {
    event.preventDefault();
    setSaving(true); setFormError('');
    try {
      await saveBusinessResource(businessId, activeTab, resourceForm);
      setResourceFormOpen(false);
      setResourceForm(freshForm(activeTab));
      setItems(await getBusinessResource(businessId, activeTab));
      await refreshOverview();
      setActionNotice(en ? 'Information saved.' : 'Information enregistrée.');
    } catch (error) { setFormError(error.message || 'Impossible d’enregistrer cet élément.'); }
    finally { setSaving(false); }
  };

  const submitTransfer = async (event) => {
    event.preventDefault();
    setSaving(true); setFormError('');
    try {
      await transferPersonalIncome(businessId, transferForm);
      setShowTransferForm(false);
      setTransferForm((current) => ({ ...current, amount: '' }));
      window.dispatchEvent(new Event('pata:income-balances-refresh'));
      await reloadCurrent();
      setActionNotice(en ? 'Personal funds transferred to the business.' : 'Fonds personnels transférés vers l’entreprise.');
    } catch (error) { setFormError(error.message || 'Impossible d’effectuer ce transfert.'); }
    finally { setSaving(false); }
  };

  const submitPayment = async (event) => {
    event.preventDefault();
    if (!paymentTarget) return;
    setSaving(true); setFormError('');
    try {
      await payBusinessDocument(businessId, activeTab, paymentTarget.id, paymentForm);
      setPaymentTarget(null);
      setItems(await getBusinessResource(businessId, activeTab));
      await refreshOverview();
      setActionNotice(en ? 'Payment recorded.' : 'Paiement enregistré.');
    } catch (error) { setFormError(error.message || 'Impossible d’enregistrer le paiement.'); }
    finally { setSaving(false); }
  };

  const removeResource = async (item) => {
    const label = RESOURCE_LABELS[activeTab] || 'élément';
    const confirmed = window.confirm(en ? 'Delete this ' + label + '?' : 'Supprimer cet élément (' + label + ') ?');
    if (!confirmed) return;
    setFormError('');
    try {
      await deleteBusinessResource(businessId, activeTab, item.id);
      setItems(await getBusinessResource(businessId, activeTab));
      await refreshOverview();
    } catch (error) { setFormError(error.message || 'Impossible de supprimer cet élément.'); }
  };

  const openResourceForm = () => { setFormError(''); setResourceForm(freshForm(activeTab)); setResourceFormOpen((value) => !value); };
  useEffect(() => {
    if (!showTransferForm || !user?.uid) return undefined;
    let active = true;
    setPersonalSourcesLoading(true);
    const unsubscribe = subscribeIncomes(user.uid, async (rows) => {
      try {
        const candidates = rows.filter((income) => isIncomeCountedAsSource(income)
          && !income.cashPocket && income.flowType !== 'repayment_received'
          && income.categoryId !== 'debt_repayment_received');
        if (!candidates.length) { if (active) { setPersonalSources([]); setPersonalSourcesLoading(false); } return; }
        const token = await user.getIdToken();
        const response = await fetch('/api/incomes/spent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ incomeIds: candidates.map((income) => income.id) }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success || !Array.isArray(result.totals)) throw new Error(result.error || 'Soldes personnels indisponibles.');
        const totals = new Map(result.totals.map((item) => [String(item.incomeId), Number(item.spent) || 0]));
        const next = candidates.map((income) => {
          const spent = Math.max(0, totals.get(income.id) || 0);
          return { ...income, spent, remaining: Math.max(0, Number(income.amount || 0) - spent) };
        }).filter((income) => income.remaining > 0);
        if (active) setPersonalSources(next);
      } catch (error) {
        console.warn('[PATA BUSINESS PERSONAL SOURCES]', error?.message || error);
        if (active) setPersonalSources([]);
      } finally {
        if (active) setPersonalSourcesLoading(false);
      }
    });
    return () => { active = false; unsubscribe(); };
  }, [showTransferForm, user]);

  if (overviewLoading) return <div className="mx-auto flex max-w-5xl items-center gap-2 py-16 text-sm text-slate-500"><RefreshCw size={16} className="animate-spin"/>Chargement de l’entreprise…</div>;
  if (pageError || !overview) return <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{pageError || 'Entreprise introuvable.'}<div className="mt-3"><Link href="/businesses" className="underline">Retour aux entreprises</Link></div></div>;

  const currentTab = TABS.find((tab) => tab.id === activeTab);
  const visibleTabs = writable ? TABS : TABS.filter((tab) => ['dashboard', 'transactions', 'reports'].includes(tab.id));

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-8">
      <header className="flex items-start gap-3">
        <Link href="/businesses" aria-label={en ? 'Back to businesses' : 'Retour aux entreprises'} className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"><ArrowLeft size={18}/></Link>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-700">{en ? 'Business space' : 'Espace entreprise'}</p>
          <h2 className="truncate text-2xl font-extrabold tracking-tight text-slate-900">{overview.business.name}</h2>
          <p className="mt-1 text-xs text-slate-500">{overview.business.activity || (en ? 'Professional finances' : 'Finances professionnelles')} {overview.business.city ? '· ' + overview.business.city : ''}</p>
        </div>
        <span className={'mt-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ' + (writable ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800')}>{writable ? (en ? 'Premium active' : 'Premium actif') : (en ? 'View only' : 'Consultation')}</span>
      </header>

      {!writable && (
        <section className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <LockKeyhole size={19} className="mt-0.5 shrink-0 text-amber-700"/>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-amber-950">{en ? 'Your business is in read-only mode' : 'Ton entreprise est en mode consultation'}</h3>
            <p className="mt-1 text-xs leading-5 text-amber-900/80">{en ? 'Your existing overview and transaction history remain available. Creating, editing, transfers and sensitive business records are locked until Premium is active again.' : 'Ton résumé et ton historique financier restent consultables. Les créations, modifications, transferts et informations professionnelles sensibles restent verrouillés jusqu’à la réactivation de Premium.'}</p>
            <Link href="/premium" className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#075b43] px-3 text-xs font-semibold text-white">{en ? 'Reactivate Premium' : 'Réactiver Premium'} <Crown size={14}/></Link>
          </div>
        </section>
      )}

      <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label={en ? 'Business sections' : 'Rubriques de l’entreprise'}>
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          return <button key={tab.id} type="button" onClick={() => { setFormError(''); setActiveTab(tab.id); }} className={'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition ' + (activeTab === tab.id ? 'bg-[#075b43] text-white' : 'border border-slate-200 bg-white text-slate-600') }><Icon size={15}/>{en ? tab.en : tab.fr}</button>;
        })}
      </nav>

      {actionNotice && <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-800"><CheckCircle2 size={16}/>{actionNotice}<button type="button" onClick={() => setActionNotice('')} className="ml-auto"><X size={14}/></button></div>}
      {formError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{formError}</div>}

      {activeTab === 'dashboard' && (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="col-span-2 rounded-2xl bg-[#075b43] p-4 text-white sm:col-span-1"><p className="text-[10px] text-white/75">{en ? 'Available cash' : 'Trésorerie disponible'}</p><p className="mt-2 text-xl font-extrabold tabular-nums">{money(overview.totals.cashBalance)}</p><p className="mt-1 text-[10px] text-white/70">FCFA · {en ? 'all active accounts' : 'tous comptes actifs'}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] text-slate-500">{en ? 'Collected income' : 'Revenus encaissés'}</p><p className="mt-2 text-lg font-bold text-slate-900 tabular-nums">{money(overview.totals.income)}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] text-slate-500">{en ? 'Paid expenses' : 'Dépenses payées'}</p><p className="mt-2 text-lg font-bold text-slate-900 tabular-nums">{money(overview.totals.expense)}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] text-slate-500">{en ? 'Period result' : 'Résultat de la période'}</p><p className={'mt-2 text-lg font-bold tabular-nums ' + (overview.totals.result < 0 ? 'text-red-700' : 'text-emerald-700')}>{money(overview.totals.result)}</p></div>
          </section>
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-bold text-slate-900">{en ? 'Money received from the owner' : 'Apports du propriétaire'}</h3><p className="mt-2 text-xl font-bold text-slate-900">{money(overview.totals.ownerContributions)}</p><p className="mt-1 text-xs text-slate-500">{en ? 'Not counted as business sales.' : 'Ne sont pas comptés comme des ventes.'}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-bold text-slate-900">{en ? 'Outstanding commitments' : 'Engagements financiers'}</h3><div className="mt-2 flex justify-between text-xs"><span className="text-slate-500">{en ? 'Receivables' : 'Créances clients'}</span><strong>{money(overview.totals.receivables)}</strong></div><div className="mt-2 flex justify-between text-xs"><span className="text-slate-500">{en ? 'Payables' : 'Dettes à payer'}</span><strong>{money(overview.totals.payables)}</strong></div></div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2"><h3 className="font-bold text-slate-900">{en ? 'Financial accounts' : 'Comptes financiers'}</h3>{writable && <button type="button" onClick={() => setActiveTab('accounts')} className="text-xs font-semibold text-brand-700">{en ? 'Manage' : 'Gérer'}</button>}</div>
            <div className="mt-3 space-y-2">
              {(overview.accounts || []).map((account) => <div key={account.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5"><span className="min-w-0 truncate text-xs font-medium text-slate-700">{account.name}</span><strong className="shrink-0 text-xs tabular-nums text-slate-900">{money(account.balance)}</strong></div>)}
              {!overview.accounts?.length && <p className="text-xs text-slate-500">{en ? 'No active account.' : 'Aucun compte actif.'}</p>}
            </div>
          </section>
          {writable && <div className="grid grid-cols-2 gap-2 sm:max-w-md"><button type="button" onClick={() => { setTransactionForm((current) => ({ ...current, type: 'income' })); setShowTransactionForm(true); }} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#075b43] px-3 text-xs font-semibold text-white"><ArrowDownLeft size={16}/>{en ? 'Add income' : 'Ajouter un revenu'}</button><button type="button" onClick={() => { setTransactionForm((current) => ({ ...current, type: 'expense' })); setShowTransactionForm(true); }} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"><ArrowUpRight size={16}/>{en ? 'Add expense' : 'Ajouter une dépense'}</button></div>}
        </div>
      )}

      {activeTab === 'reports' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div><h3 className="font-bold text-slate-900">{en ? 'Business financial reports' : 'Rapports financiers de l’entreprise'}</h3><p className="mt-1 text-xs text-slate-500">{en ? 'Monthly collected income, paid expenses and operating result.' : 'Revenus encaissés, dépenses payées et résultat par mois.'}</p></div>
            <BarChart3 size={20} className="shrink-0 text-brand-700"/>
          </div>
          {overview.monthlyHistory?.length ? (
            <div className="mt-4 space-y-4">
              {[...overview.monthlyHistory].reverse().map((row) => {
                const income = Math.max(0, Number(row.income) || 0);
                const expense = Math.max(0, Number(row.expense) || 0);
                const max = Math.max(income, expense, 1);
                const result = income - expense;
                const [year, monthNumber] = String(row.month || '').split('-').map(Number);
                const label = year && monthNumber ? new Date(year, monthNumber - 1, 1).toLocaleDateString(en ? 'en-GB' : 'fr-FR', { month: 'long', year: 'numeric' }) : row.month;
                return <div key={row.id || row.month} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center justify-between gap-3"><strong className="text-xs capitalize text-slate-800">{label}</strong><span className={'text-xs font-bold tabular-nums ' + (result < 0 ? 'text-rose-700' : 'text-emerald-700')}>{money(result)}</span></div>
                  <div className="mt-3 space-y-2">
                    <div><div className="mb-1 flex justify-between gap-2 text-[10px]"><span className="text-slate-500">{en ? 'Income received' : 'Revenus encaissés'}</span><strong>{money(income)}</strong></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: Math.max(0, Math.min(100, income / max * 100)) + '%' }}/></div></div>
                    <div><div className="mb-1 flex justify-between gap-2 text-[10px]"><span className="text-slate-500">{en ? 'Expenses paid' : 'Dépenses payées'}</span><strong>{money(expense)}</strong></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-rose-400" style={{ width: Math.max(0, Math.min(100, expense / max * 100)) + '%' }}/></div></div>
                  </div>
                </div>;
              })}
            </div>
          ) : <p className="py-10 text-center text-xs text-slate-500">{en ? 'Monthly reports will appear after the first transactions.' : 'Les rapports mensuels apparaîtront après les premières opérations.'}</p>}
          <p className="mt-3 text-[10px] leading-5 text-slate-400">{en ? 'Owner contributions and opening balances are kept separate from sales and are not included in the operating result.' : 'Les apports du propriétaire et les soldes initiaux restent séparés des ventes et ne sont pas intégrés au résultat d’exploitation.'}</p>
        </section>
      )}

      {activeTab === 'transactions' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="font-bold text-slate-900">{en ? 'Transaction history' : 'Historique des opérations'}</h3>{writable && <button type="button" onClick={() => setShowTransactionForm(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#075b43] px-3 text-xs font-semibold text-white"><Plus size={14}/>{en ? 'New' : 'Ajouter'}</button>}</div>
          {listLoading ? <p className="py-8 text-center text-xs text-slate-500">{en ? 'Loading…' : 'Chargement…'}</p> : transactions.length ? <div className="mt-3 divide-y divide-slate-100">{transactions.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 py-3"><div className="flex min-w-0 items-start gap-2.5"><span className={'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ' + (item.type === 'expense' ? 'bg-rose-50 text-rose-700' : item.flowType === 'owner_contribution' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700')}>{item.type === 'expense' ? <ArrowUpRight size={15}/> : <ArrowDownLeft size={15}/>}</span><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-800">{item.title || item.categoryId}</p><p className="mt-1 text-[10px] text-slate-500">{formatDate(item.date || item.createdAt)} · {item.flowType === 'owner_contribution' ? (en ? 'Owner contribution' : 'Apport du propriétaire') : item.categoryId}</p>{item.note && <p className="mt-1 text-[10px] text-slate-500">{item.note}</p>}</div></div><strong className={'shrink-0 text-xs tabular-nums ' + (item.type === 'expense' ? 'text-rose-700' : 'text-emerald-700')}>{item.type === 'expense' ? '−' : '+'}{money(item.amount)}</strong></div>)}</div> : <p className="py-10 text-center text-xs text-slate-500">{en ? 'No transactions yet.' : 'Aucune opération enregistrée.'}</p>}
        </section>
      )}

      {activeTab === 'accounts' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2"><div><h3 className="font-bold text-slate-900">{en ? 'Cash and payment accounts' : 'Caisses et comptes de paiement'}</h3><p className="mt-1 text-xs text-slate-500">{en ? 'Balances change when business transactions are recorded.' : 'Les soldes évoluent avec les opérations de l’entreprise.'}</p></div><button type="button" onClick={() => setShowAccountForm((value) => !value)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#075b43] px-3 text-xs font-semibold text-white"><Plus size={14}/>{en ? 'Add account' : 'Ajouter'}</button></div>
          {showAccountForm && <form onSubmit={submitAccount} className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-3"><input required value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} placeholder={en ? 'Account name' : 'Nom du compte'} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"/><select value={accountForm.type} onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value })} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="cash">Caisse</option><option value="mtn_momo">MTN MoMo</option><option value="orange_money">Orange Money</option><option value="bank">Banque</option><option value="other">Autre</option></select><input type="number" min="0" step="1" value={accountForm.openingBalance} onChange={(e) => setAccountForm({ ...accountForm, openingBalance: e.target.value })} placeholder={en ? 'Opening balance' : 'Solde initial'} className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"/><button disabled={saving} className="min-h-10 rounded-lg bg-[#075b43] px-3 text-xs font-semibold text-white sm:col-span-3">{saving ? (en ? 'Saving…' : 'Enregistrement…') : (en ? 'Save account' : 'Enregistrer le compte')}</button></form>}
          {listLoading ? <p className="py-8 text-xs text-slate-500">Chargement…</p> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{accounts.map((account) => <div key={account.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3"><div><p className="text-sm font-semibold text-slate-800">{account.name}</p><p className="mt-1 text-[10px] text-slate-500">{account.type}</p></div><strong className="text-sm tabular-nums">{money(account.balance)}</strong></div>)}</div>}
          {writable && <button type="button" onClick={() => setShowTransferForm(true)} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-800"><Send size={15}/>{en ? 'Transfer personal funds into this business' : 'Transférer des fonds personnels vers l’entreprise'}</button>}
        </section>
      )}

      {RESOURCE_CONFIG[activeTab] && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2"><div><h3 className="font-bold text-slate-900">{currentTab ? (en ? currentTab.en : currentTab.fr) : ''}</h3><p className="mt-1 text-xs text-slate-500">{en ? 'Information stored in this business only.' : 'Informations conservées uniquement dans cette entreprise.'}</p></div><button type="button" onClick={openResourceForm} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#075b43] px-3 text-xs font-semibold text-white"><Plus size={14}/>{en ? 'Add' : 'Ajouter'}</button></div>
          {resourceFormOpen && <form onSubmit={submitResource} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">{RESOURCE_CONFIG[activeTab].fields.map((field) => <label key={field.key} className="text-[11px] font-semibold text-slate-600">{field.label}<input required={field.required} type={field.type || 'text'} placeholder={field.placeholder || ''} value={resourceForm[field.key] || ''} onChange={(e) => setResourceForm({ ...resourceForm, [field.key]: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"/>{field.key === 'month' && <span className="mt-1 block text-[10px] font-normal text-slate-400">AAAA-MM</span>}</label>)}<div className="flex gap-2 sm:col-span-2"><button disabled={saving} className="min-h-10 flex-1 rounded-lg bg-[#075b43] text-xs font-semibold text-white">{saving ? '…' : (en ? 'Save' : 'Enregistrer')}</button><button type="button" onClick={() => setResourceFormOpen(false)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-600">{en ? 'Cancel' : 'Annuler'}</button></div></form>}
          {listLoading ? <p className="py-8 text-xs text-slate-500">Chargement…</p> : items.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{items.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-800">{item.title || item.name || item.customerName}</p><p className="mt-1 text-[10px] text-slate-500">{item.customerName || item.counterparty || item.role || item.category || item.phone || ''}</p></div><button type="button" onClick={() => removeResource(item)} aria-label={en ? 'Delete item' : 'Supprimer'} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700"><Trash2 size={14}/></button></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2">{activeTab === 'budgets' ? <div className="w-full"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-slate-900">{money(item.amount)}</strong><span className="text-[10px] font-semibold text-slate-500">{item.overBudget ? (en ? 'Over budget' : 'Budget dépassé') : (en ? 'Allocated' : 'Alloué')}</span></div><div className="mt-2 flex flex-wrap justify-between gap-2 text-[10px] text-slate-500"><span>{en ? 'Spent' : 'Dépensé'} : {money(item.spent || 0)}</span><span>{en ? 'Remaining' : 'Restant'} : {money(item.remaining ?? Math.max(0, Number(item.amount || 0) - Number(item.spent || 0)))}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={'h-full rounded-full ' + (item.overBudget ? 'bg-rose-500' : 'bg-emerald-500')} style={{ width: Math.max(0, Math.min(100, Number(item.amount) > 0 ? Number(item.spent || 0) / Number(item.amount) * 100 : 0)) + '%' }}/></div></div> : (item.totalAmount || item.amount) ? <strong className="text-sm text-slate-900">{money(item.remaining ?? item.totalAmount ?? item.amount)}</strong> : <span className="text-[10px] text-slate-500">{item.status || item.address || item.email || item.note || ''}</span>}{['invoices', 'obligations'].includes(activeTab) && Number(item.remaining ?? item.totalAmount ?? item.amount) > 0 && <button type="button" onClick={() => { setPaymentTarget(item); setPaymentForm({ amount: String(item.remaining ?? item.totalAmount ?? item.amount), accountId: accountsForSelect[0]?.id || 'main', date: new Date().toISOString().slice(0, 10) }); }} className="min-h-8 rounded-lg bg-blue-50 px-2.5 text-[10px] font-semibold text-blue-800">{en ? 'Record payment' : 'Enregistrer un paiement'}</button>}</div></div>)}</div> : <p className="py-10 text-center text-xs text-slate-500">{en ? 'No item saved yet.' : 'Aucun élément enregistré.'}</p>}
        </section>
      )}

      {showTransactionForm && writable && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 p-3 sm:items-center">
          <form onSubmit={submitTransaction} className="max-h-[90dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
            <div className="flex items-center justify-between"><h3 className="font-bold text-slate-900">{en ? 'New business transaction' : 'Nouvelle opération professionnelle'}</h3><button type="button" onClick={() => setShowTransactionForm(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500"><X size={18}/></button></div>
            <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setTransactionForm({ ...transactionForm, type: 'income', categoryId: 'sales' })} className={'min-h-10 rounded-lg text-xs font-semibold ' + (transactionForm.type === 'income' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600')}>{en ? 'Income' : 'Entrée'}</button><button type="button" onClick={() => setTransactionForm({ ...transactionForm, type: 'expense', categoryId: 'other' })} className={'min-h-10 rounded-lg text-xs font-semibold ' + (transactionForm.type === 'expense' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600')}>{en ? 'Expense' : 'Sortie'}</button></div>
            <label className="block text-xs font-semibold text-slate-600">{en ? 'Amount (XAF)' : 'Montant (FCFA)'}<input type="number" min="1" step="1" required value={transactionForm.amount} onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-base"/></label>
            <label className="block text-xs font-semibold text-slate-600">{en ? 'Label / source' : 'Libellé / source'}<input required maxLength={120} value={transactionForm.title} onChange={(e) => setTransactionForm({ ...transactionForm, title: e.target.value })} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"/></label>
            <div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-slate-600">{en ? 'Date' : 'Date'}<input type="date" required value={transactionForm.date} onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-2 text-xs"/></label><label className="text-xs font-semibold text-slate-600">{en ? 'Financial account' : 'Compte financier'}<select value={transactionForm.accountId} onChange={(e) => setTransactionForm({ ...transactionForm, accountId: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs">{accountsForSelect.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label></div>
            <label className="block text-xs font-semibold text-slate-600">{en ? 'Category' : 'Catégorie'}<input value={transactionForm.categoryId} onChange={(e) => setTransactionForm({ ...transactionForm, categoryId: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"/></label>
            <label className="block text-xs font-semibold text-slate-600">{en ? 'Note (optional)' : 'Note (facultatif)'}<textarea value={transactionForm.note} onChange={(e) => setTransactionForm({ ...transactionForm, note: e.target.value })} rows={2} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></label>
            <button disabled={saving} className="min-h-11 w-full rounded-xl bg-[#075b43] text-sm font-semibold text-white">{saving ? (en ? 'Saving…' : 'Enregistrement…') : (en ? 'Save transaction' : 'Enregistrer l’opération')}</button>
          </form>
        </div>
      )}

      {showTransferForm && writable && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 p-3 sm:items-center">
          <form onSubmit={submitTransfer} className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between"><h3 className="font-bold text-slate-900">{en ? 'Personal contribution' : 'Apport depuis tes finances personnelles'}</h3><button type="button" onClick={() => setShowTransferForm(false)}><X size={18}/></button></div>
            <p className="text-xs leading-5 text-slate-500">{en ? 'The selected amount is reduced from the personal income source and added to the business account as an owner contribution, not as sales.' : 'Le montant choisi sera déduit du solde disponible de ta source personnelle et ajouté au compte de l’entreprise comme apport du propriétaire, pas comme une vente.'}</p>
            <label className="block text-xs font-semibold text-slate-600">Source de revenu personnelle<select required value={transferForm.incomeId} onChange={(e) => setTransferForm({ ...transferForm, incomeId: e.target.value })} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Choisir un revenu</option>{personalSources.map((income) => <option key={income.id} value={income.id}>{income.source} · {money(income.remaining)} disponibles</option>)}</select></label>
            <label className="block text-xs font-semibold text-slate-600">Montant à transférer (FCFA)<input type="number" min="1" step="1" required value={transferForm.amount} onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-base"/></label>
            <label className="block text-xs font-semibold text-slate-600">Compte de destination<select value={transferForm.accountId} onChange={(e) => setTransferForm({ ...transferForm, accountId: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">{accountsForSelect.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <label className="block text-xs font-semibold text-slate-600">Date<input type="date" required value={transferForm.date} onChange={(e) => setTransferForm({ ...transferForm, date: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"/></label>
            {personalSourcesLoading && <p className="text-xs text-slate-500">Chargement des soldes personnels…</p>}{!personalSourcesLoading && !personalSources.length && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Aucune source personnelle ne dispose actuellement d’un solde vérifié et disponible.</p>}
            <button disabled={saving || personalSourcesLoading || !personalSources.length} className="min-h-11 w-full rounded-xl bg-[#075b43] text-sm font-semibold text-white">{saving ? 'Transfert…' : 'Confirmer le transfert'}</button>
          </form>
        </div>
      )}

      {paymentTarget && writable && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 p-3 sm:items-center">
          <form onSubmit={submitPayment} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between"><h3 className="font-bold text-slate-900">{en ? 'Record a payment' : 'Enregistrer un paiement'}</h3><button type="button" onClick={() => setPaymentTarget(null)}><X size={18}/></button></div>
            <p className="text-xs text-slate-500">{paymentTarget.title} · reste {money(paymentTarget.remaining ?? paymentTarget.totalAmount ?? paymentTarget.amount)}</p>
            <label className="block text-xs font-semibold text-slate-600">Montant payé (FCFA)<input type="number" min="1" step="1" required value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-base"/></label>
            <label className="block text-xs font-semibold text-slate-600">Compte financier<select value={paymentForm.accountId} onChange={(e) => setPaymentForm({ ...paymentForm, accountId: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">{accountsForSelect.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <button disabled={saving} className="min-h-11 w-full rounded-xl bg-[#075b43] text-sm font-semibold text-white">{saving ? '…' : 'Confirmer le paiement'}</button>
          </form>
        </div>
      )}
    </div>
  );
}
