'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Save, LogOut, Download, FileText, FileSpreadsheet, Bell, ShieldCheck, LockKeyhole, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card, CardTitle } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useExpenses } from '@/hooks/useExpenses';
import { useIncomes } from '@/hooks/useIncomes';
import { useGoals } from '@/hooks/useGoals';
import { useDeposits } from '@/hooks/useDeposits';
import { subscribeAutomations } from '@/lib/firestore/automations';
import { useAllBudgets } from '@/hooks/useAllBudgets';
import { convertCurrencyAmount, formatCurrency, getPreferredCurrencyCode } from '@/lib/utils';
import { NotificationSettings } from '@/components/NotificationSettings';
import { PinSecuritySettings } from '@/components/security/PinSecuritySettings';
import { ReferralsSettings } from '@/components/ReferralsSettings';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { profile, save } = useProfile();
  const { expenses } = useExpenses();
  const { incomes } = useIncomes();
  const { goals } = useGoals();
  const { deposits } = useDeposits();
  const { budgets } = useAllBudgets();
  const router = useRouter();

  const [automations, setAutomations] = useState([]);
  const [displayName, setDisplayName] = useState('');
  const [currency, setCurrency] = useState('XAF');
  const [theme, setTheme] = useState('light');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showProfileLogo, setShowProfileLogo] = useState(false);

  useEffect(() => {
    if (!user) { setAutomations([]); return undefined; }
    return subscribeAutomations(user.uid, setAutomations);
  }, [user]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || '');
      setCurrency(profile.currency || 'XAF');
      setTheme(profile.theme === 'dark' ? 'dark' : 'light');
    }
  }, [profile]);

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      let currencyRates = profile?.currencyRates || { XAF: 1, EUR: 1 / 655.957, USD: 1 / 600 };
      if (currency !== (profile?.currency || 'XAF') || !profile?.currencyRates) {
        try {
          const token = await user.getIdToken();
          const ratesResponse = await fetch('/api/currency/rates', { headers: { Authorization: `Bearer ${token}` } });
          const ratesData = await ratesResponse.json();
          if (ratesResponse.ok && ratesData.success) currencyRates = ratesData.rates;
        } catch (rateError) {
          console.warn('Taux de change non actualisés; conservation des derniers taux connus.', rateError);
        }
      }
      await save({
        displayName: displayName.trim() || 'Utilisateur',
        currency,
        theme,
        currencyRates,
        currencyRateUpdatedAt: new Date().toISOString(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const getExportRows = () => {
    const rows = [
      ['Type', 'Date', 'Libellé', 'Catégorie', `Montant (${getPreferredCurrencyCode()})`, 'Détail'],
      ...incomes.map((item) => ['Revenu', item.date || item.month || '', item.source || 'Revenu', item.categoryId || '', convertCurrencyAmount(item.amount || 0), item.note || '']),
      ...expenses.map((item) => ['Dépense', item.date || '', item.note || 'Dépense', item.categoryId || '', convertCurrencyAmount(item.amount || 0), item.incomeSourceName || '']),
      ...deposits.map((item) => ['Recharge portefeuille', item.createdAt?.toDate ? item.createdAt.toDate().toISOString().slice(0, 10) : '', 'Recharge Pata', item.status || '', convertCurrencyAmount(item.amount || 0), item.phone || '']),
      ...budgets.map((item) => ['Budget', item.month || '', item.categoryId || '', item.incomeSourceId || 'all', convertCurrencyAmount(item.amount || 0), '']),
      ...goals.map((item) => ['Objectif', item.startDate || '', item.name || '', item.categoryId || '', convertCurrencyAmount(item.targetAmount || 0), item.deadline || '']),
      ...(Array.isArray(profile?.durationForecasts) ? profile.durationForecasts : []).map((item) => ['Prévision de durée', item.createdAt || '', item.name || 'Prévision', `${item.estimatedDays || 0} jour(s) estimé(s)`, convertCurrencyAmount(item.capital || 0), `Fin estimée : ${item.estimatedEndDate || 'non définie'}`]),
      ...(Array.isArray(profile?.vitalForecastHistory) ? profile.vitalForecastHistory : []).map((item) => ['Prévision vitale', item.createdAt || '', item.name || 'Prévision vitale', `${Object.keys(item.needs || {}).length} catégorie(s)`, convertCurrencyAmount(item.totalBudget || 0), `Période : ${item.month || ''}`]),
      ...automations.map((item) => ['Opération programmée', item.nextRun || '', item.note || 'Dépense récurrente', item.categoryId || '', convertCurrencyAmount(item.amount || 0), `${item.frequency || ''} · ${item.active === false ? 'En pause' : 'Active'} · ${item.incomeSourceName || 'Tous les revenus'}`]),
    ];
    return rows;
  };

  const exportPdf = () => {
    const rows = getExportRows();
    const table = rows.map((row, index) => `<tr>${row.map((cell) => `<${index === 0 ? 'th' : 'td'}>${String(cell ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))}</${index === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('');
    const popup = window.open('', '_blank', 'width=1000,height=800');
    if (!popup) { alert('Autorise les fenêtres contextuelles pour télécharger le rapport PDF.'); return; }
    popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Export Pata</title><style>body{font:12px Arial,sans-serif;color:#172033;padding:28px}h1{font-size:22px}p{color:#64748b}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #dbe2ea;padding:7px;text-align:left}th{background:#edf2f7}tr:nth-child(even){background:#f8fafc}@media print{button{display:none}}</style></head><body><h1>Rapport de données Pata</h1><p>Compte : ${String(profile?.displayName || user?.email || '').replace(/[&<>"']/g, '')} · Généré le ${new Date().toLocaleDateString('fr-FR')}</p><p>Les montants sont convertis dans la devise d’affichage ${getPreferredCurrencyCode()} pour faciliter la lecture. Les valeurs de référence de Pata restent enregistrées en XAF.</p><table>${table}</table><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  };

  const exportExcel = () => {
    const rows = getExportRows();
    const html = `<html><head><meta charset="utf-8"></head><body><table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${String(cell ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pata-export-${new Date().toISOString().slice(0, 10)}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const localMonthKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit' }).format(new Date());
  const localDayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Douala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const stats = profile?.monthlyStats?.lastResetMonth === localMonthKey ? (profile.monthlyStats || {}) : {};
  const expiry = profile?.premiumUntil?.toDate ? profile.premiumUntil.toDate() : new Date(profile?.premiumUntil || 0);
  const isPremium = Number.isFinite(expiry.getTime()) && expiry > new Date();
  const usageRows = [
    ['Dépenses', Number(stats.expenses) || 0, 60],
    ['Revenus', Number(stats.incomes) || 0, 2],
    ['Budgets', Number(stats.budgets) || 0, 2],
    ['Objectifs et tirelires', Number(stats.goals) || 0, 1],
    ['Prévisions vitales', Number(stats.vitalForecasts) || 0, 1],
    ['Estimations de durée', Number(stats.durationForecasts) || 0, 1],
  ];
  const dailyStats = profile?.dailyStats?.lastResetDate === localDayKey ? profile.dailyStats : {};

  const onLogout = async () => {
    if (!confirm('Se déconnecter ?')) return;
    await logout();
    router.replace('/login');
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Paramètres</h1>
        <p className="text-sm text-slate-500">Personnalise ton compte et tes préférences.</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><CardTitle>Mon abonnement</CardTitle><p className="mt-1 text-xs text-slate-500">Ton offre et ton utilisation pour le mois en cours.</p></div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isPremium ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{isPremium ? 'Premium' : 'Gratuit'}</span>
        </div>
        {isPremium ? (
          <p className="mt-3 text-sm text-slate-600">Accès Premium jusqu’au {expiry.toLocaleDateString('fr-FR')}.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {usageRows.map(([label, used, limit]) => (
              <div key={label} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
                <span className="text-sm text-slate-700">{label}</span>
                <span className={`shrink-0 text-sm font-semibold ${used >= limit ? 'text-amber-700' : 'text-slate-600'}`}>{used} / {limit}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 pt-1"><span className="text-sm text-slate-700">Messages à Mč aujourd’hui</span><span className="text-sm font-semibold text-slate-600">{Number(dailyStats.aiCount) || 0} / 3</span></div>
            <Button type="button" className="mt-2 w-full" onClick={() => router.push('/premium')}>Découvrir Premium</Button>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle className="mb-3">Profil</CardTitle>
        <form onSubmit={onSave} className="space-y-3">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <button type="button" onClick={() => setShowProfileLogo(true)} aria-label="Afficher le logo de profil en grand" className="shrink-0 rounded-2xl bg-white p-1 shadow-sm transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
              <img src="/android-chrome-192x192.png" alt="Logo de profil Pata" className="h-16 w-16 rounded-xl object-contain" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">Photo de profil</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Le logo Pata est utilisé comme image de profil de ton compte.</p>
              <button type="button" onClick={() => setShowProfileLogo(true)} className="mt-1 text-xs font-semibold text-brand-700">Afficher en grand</button>
            </div>
          </div>
          <Input
            label="Nom affiché"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Input label="Email" value={user?.email || ''} disabled />
          <Select label="Devise d’affichage" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="XAF">FCFA (XAF)</option>
            <option value="EUR">Euro (EUR)</option>
            <option value="USD">Dollar US (USD)</option>
          </Select>
          <Select label="Apparence de l’application" value={theme} onChange={(e) => { const nextTheme = e.target.value === 'dark' ? 'dark' : 'light'; setTheme(nextTheme); document.documentElement.classList.toggle('dark', nextTheme === 'dark'); document.documentElement.dataset.theme = nextTheme; try { localStorage.setItem('pata-theme', nextTheme); } catch { /* stockage indisponible */ } }}>
            <option value="light">Mode clair</option>
            <option value="dark">Mode sombre</option>
          </Select>
          <p className="text-xs leading-5 text-slate-500">Les valeurs sont conservées en XAF. Pata les convertit à l’écran dans la devise sélectionnée, selon le dernier taux disponible.</p>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={saving}>
              <Save size={15} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            {saved && <span className="text-sm text-brand-600">Enregistré</span>}
          </div>
        </form>
      </Card>

      <Card>
        <CardTitle className="mb-2">Exporter mes données</CardTitle>
        <p className="mb-3 text-xs leading-5 text-slate-500">Télécharge tes revenus, dépenses, recharges, budgets, objectifs, prévisions et opérations programmées dans un document lisible, avec les montants convertis dans ta devise d’affichage. Le PDF peut être enregistré depuis la fenêtre d’impression.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportPdf}><FileText size={15} /> Télécharger en PDF</Button>
          <Button variant="outline" onClick={exportExcel}><FileSpreadsheet size={15} /> Ouvrir dans Excel</Button>
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex items-center gap-2"><Bell size={17} className="text-slate-500" /><CardTitle>Notifications</CardTitle></div>
        <p className="mb-3 text-xs leading-5 text-slate-500">Active les rappels utiles de Pata sur cet appareil. Tu peux les désactiver à tout moment.</p>
        <NotificationSettings />
      </Card>

      <PinSecuritySettings />
      <ReferralsSettings />

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck size={18} className="text-brand-700"/>
          <div><CardTitle>Confidentialité et documents juridiques</CardTitle><p className="mt-1 text-xs text-slate-500">Consulte les règles qui encadrent ton compte et tes données.</p></div>
        </div>
        <div className="space-y-2">
          <Link href="/conditions" className="flex min-h-[62px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-brand-200 hover:bg-brand-50/40">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><FileText size={17}/></span>
            <span className="min-w-0 flex-1"><strong className="block text-sm text-slate-800">Conditions d’utilisation</strong><span className="mt-0.5 block text-[11px] text-slate-500">Fonctionnement du service, compte et abonnements</span></span>
            <ChevronRight size={17} className="text-slate-400"/>
          </Link>
          <Link href="/confidentialite" className="flex min-h-[62px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-brand-200 hover:bg-brand-50/40">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><LockKeyhole size={17}/></span>
            <span className="min-w-0 flex-1"><strong className="block text-sm text-slate-800">Politique de confidentialité</strong><span className="mt-0.5 block text-[11px] text-slate-500">Données personnelles, localisation et assistante IA</span></span>
            <ChevronRight size={17} className="text-slate-400"/>
          </Link>
        </div>
      </Card>

      <Modal open={showProfileLogo} onClose={() => setShowProfileLogo(false)} title="Logo de profil Pata" className="max-w-sm">
        <div className="flex flex-col items-center gap-3 py-2">
          <img src="/android-chrome-512x512.png" alt="Logo Pata" className="h-52 w-52 max-w-full rounded-3xl object-contain"/>
          <p className="text-center text-xs leading-5 text-slate-500">Ce logo identifie le profil dans l’application.</p>
        </div>
      </Modal>

      <Card>
        <CardTitle className="mb-3">Compte</CardTitle>
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <img src="/android-chrome-192x192.png" alt="Logo officiel de Pata" className="h-12 w-12 shrink-0 rounded-2xl bg-white object-contain p-1 shadow-sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">
              {profile?.displayName || 'Utilisateur'}
            </p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
        </div>
        <Button variant="danger" className="mt-3" onClick={onLogout}>
          <LogOut size={15} /> Se déconnecter
        </Button>
      </Card>
    </div>
  );
              }
