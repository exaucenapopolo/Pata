'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, LogOut, Download, User, FileText, FileSpreadsheet, Bell } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card, CardTitle } from '@/components/ui/Card';
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
  const [penaltyDefault, setPenaltyDefault] = useState(500);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) { setAutomations([]); return undefined; }
    return subscribeAutomations(user.uid, setAutomations);
  }, [user]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || '');
      setCurrency(profile.currency || 'XAF');
      setTheme(profile.theme === 'dark' ? 'dark' : 'light');
      setPenaltyDefault(profile.penaltyDefault ?? 500);
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
        penaltyDefault: Number(penaltyDefault) || 0,
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
        <CardTitle className="mb-3">Profil</CardTitle>
        <form onSubmit={onSave} className="space-y-3">
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
          <Input
            label="Amende par défaut (FCFA)"
            type="number"
            min="0"
            value={penaltyDefault}
            onChange={(e) => setPenaltyDefault(e.target.value)}
          />
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

      <Card>
        <CardTitle className="mb-3">Compte</CardTitle>
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <User size={18} />
          </div>
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
