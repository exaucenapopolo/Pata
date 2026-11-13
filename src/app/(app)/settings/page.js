'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Save, LogOut, Download, FileText, FileSpreadsheet, Bell, ShieldCheck, LockKeyhole, KeyRound, ChevronRight, UserRound, Crown, Sun, Moon, Gift, MessageSquareText, Smartphone, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useExpenses } from '@/hooks/useExpenses';
import { useIncomes } from '@/hooks/useIncomes';
import { useGoals } from '@/hooks/useGoals';
import { useDeposits } from '@/hooks/useDeposits';
import { subscribeAutomations } from '@/lib/firestore/automations';
import { useAllBudgets } from '@/hooks/useAllBudgets';
import { convertCurrencyAmount, getPreferredCurrencyCode, getPreferredLocale } from '@/lib/utils';
import { NotificationSettings } from '@/components/NotificationSettings';
import { PinSecuritySettings } from '@/components/security/PinSecuritySettings';
import { PasswordSettings } from '@/components/security/PasswordSettings';
import { ReferralsSettings } from '@/components/ReferralsSettings';
import { SmsImportSettings } from '@/components/SmsImportSettings';
import { ProfilePhotoEditor } from '@/components/profile/ProfilePhotoEditor';
import { useLanguage } from '@/context/LanguageContext';
import { translateText } from '@/lib/i18n/translations';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { profile, save } = useProfile();
  const { language, setLanguage, isLanguageSaving } = useLanguage();
  const isEnglish = language === 'en';
  const t = (value) => translateText(value, language);
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
  const [activePanel, setActivePanel] = useState('');
  const [emailRemindersEnabled, setEmailRemindersEnabled] = useState(true);
  const [dailySummaryEmailEnabled, setDailySummaryEmailEnabled] = useState(false);
  const [emailPreferencesSaving, setEmailPreferencesSaving] = useState(false);
  const [emailPreferencesMessage, setEmailPreferencesMessage] = useState('');

  useEffect(() => {
    if (!user) { setAutomations([]); return undefined; }
    return subscribeAutomations(user.uid, setAutomations);
  }, [user]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || '');
      setCurrency(profile.currency || 'XAF');
      setTheme(profile.theme === 'dark' ? 'dark' : 'light');
      setEmailRemindersEnabled(profile.emailRemindersEnabled !== false);
      setDailySummaryEmailEnabled(profile.dailySummaryEmailEnabled === true);
    }
  }, [profile]);

  const syncCotisationProfile = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/cotisations/profile-sync', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Synchronisation indisponible.');
    } catch (error) {
      console.warn('[PATA COTISATION PROFILE SYNC]', error.message || error);
    }
  };

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
      const nextDisplayName = displayName.trim() || 'Utilisateur';
      const profileIdentityChanged = String(profile?.displayName || '') !== nextDisplayName;
      await save({
        displayName: nextDisplayName,
        currency,
        theme,
        currencyRates,
        currencyRateUpdatedAt: new Date().toISOString(),
      });
      if (profileIdentityChanged) await syncCotisationProfile();
      setSaved(true);
      setActivePanel('');
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const updateEmailPreference = async (field, value) => {
    if (!user || emailPreferencesSaving) return;
    const previous = field === 'emailRemindersEnabled' ? emailRemindersEnabled : dailySummaryEmailEnabled;
    if (field === 'emailRemindersEnabled') setEmailRemindersEnabled(value);
    else setDailySummaryEmailEnabled(value);
    setEmailPreferencesSaving(true);
    setEmailPreferencesMessage('');
    try {
      await save({ [field]: value });
      setEmailPreferencesMessage(isEnglish ? 'Email preference saved.' : 'Préférence e-mail enregistrée.');
    } catch (error) {
      if (field === 'emailRemindersEnabled') setEmailRemindersEnabled(previous);
      else setDailySummaryEmailEnabled(previous);
      setEmailPreferencesMessage(error?.message || (isEnglish ? 'Could not save this preference.' : 'Impossible d’enregistrer cette préférence.'));
    } finally {
      setEmailPreferencesSaving(false);
    }
  };

  const getExportRows = () => {
    const rows = [
      [t('Type'), t('Date'), t('Libellé'), t('Catégorie'), t('Montant') + ' (' + getPreferredCurrencyCode() + ')', t('Détail')],
      ...incomes.map((item) => [t('Revenu'), item.date || item.month || '', item.source || t('Revenu'), item.categoryId || '', convertCurrencyAmount(item.amount || 0), item.note || '']),
      ...expenses.map((item) => [t('Dépense'), item.date || '', item.note || t('Dépense'), item.categoryId || '', convertCurrencyAmount(item.amount || 0), item.incomeSourceName || '']),
      ...deposits.map((item) => [t('Recharge portefeuille'), item.createdAt?.toDate ? item.createdAt.toDate().toISOString().slice(0, 10) : '', t('Recharge Pata'), t(item.status || ''), convertCurrencyAmount(item.amount || 0), item.phone || '']),
      ...budgets.map((item) => [t('Budget'), item.month || '', item.categoryId || '', item.incomeSourceId || 'all', convertCurrencyAmount(item.amount || 0), '']),
      ...goals.map((item) => [t('Objectif'), item.startDate || '', item.name || '', item.categoryId || '', convertCurrencyAmount(item.targetAmount || 0), item.deadline || '']),
      ...(Array.isArray(profile?.durationForecasts) ? profile.durationForecasts : []).map((item) => [t('Prévision de durée'), item.createdAt || '', item.name || t('Prévision'), (item.estimatedDays || 0) + ' ' + t('jour(s) estimé(s)'), convertCurrencyAmount(item.capital || 0), t('Fin estimée :') + ' ' + (item.estimatedEndDate || t('non définie'))]),
      ...(Array.isArray(profile?.vitalForecastHistory) ? profile.vitalForecastHistory : []).map((item) => [t('Prévision vitale'), item.createdAt || '', item.name || t('Prévision vitale'), Object.keys(item.needs || {}).length + ' ' + t('catégorie(s)'), convertCurrencyAmount(item.totalBudget || 0), t('Période :') + ' ' + (item.month || '')]),
      ...automations.map((item) => [t('Opération programmée'), item.nextRun || '', item.note || t('Dépense récurrente'), item.categoryId || '', convertCurrencyAmount(item.amount || 0), (item.frequency || '') + ' · ' + (item.active === false ? t('En pause') : t('Active')) + ' · ' + t('Tous les revenus')]),
    ];
    return rows;
  };

  const exportPdf = () => {
    const rows = getExportRows();
    const table = rows.map((row, index) => `<tr>${row.map((cell) => `<${index === 0 ? 'th' : 'td'}>${String(cell ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))}</${index === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('');
    const popup = window.open('', '_blank', 'width=1000,height=800');
    if (!popup) { alert(isEnglish ? 'Allow pop-ups to download the PDF report.' : 'Autorise les fenêtres contextuelles pour télécharger le rapport PDF.'); return; }
    popup.document.write(`<!doctype html><html lang="${language}"><head><meta charset="utf-8"><title>${isEnglish ? "Pata data export" : "Export Pata"}</title><style>body{font:12px Arial,sans-serif;color:#172033;padding:28px}h1{font-size:22px}p{color:#64748b}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #dbe2ea;padding:7px;text-align:left}th{background:#edf2f7}tr:nth-child(even){background:#f8fafc}@media print{button{display:none}}</style></head><body><h1>${isEnglish ? "Pata data report" : "Rapport de données Pata"}</h1><p>${isEnglish ? "Account: " : "Compte : "}${String(profile?.displayName || user?.email || '').replace(/[&<>"']/g, '')} · ${isEnglish ? "Generated on " : "Généré le "}${new Date().toLocaleDateString(getPreferredLocale())}</p><p>${isEnglish ? "Amounts are converted to the displayed currency (" + getPreferredCurrencyCode() + ") for easier reading. Pata reference values remain stored in XAF." : "Les montants sont convertis dans la devise d’affichage " + getPreferredCurrencyCode() + " pour faciliter la lecture. Les valeurs de référence de Pata restent enregistrées en XAF."}</p><table>${table}</table><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  };

  const exportExcel = () => {
    const rows = getExportRows();
    const html = `<html lang="${language}"><head><meta charset="utf-8"><title>${isEnglish ? "Pata data export" : "Export Pata"}</title></head><body><h1>${isEnglish ? "Pata data report" : "Rapport de données Pata"}</h1><table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${String(cell ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
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

  const changeTheme = async (nextTheme) => {
    const normalized = nextTheme === 'dark' ? 'dark' : 'light';
    setTheme(normalized);
    document.documentElement.classList.toggle('dark', normalized === 'dark');
    document.documentElement.dataset.theme = normalized;
    try { localStorage.setItem('pata-theme', normalized); } catch { /* stockage local indisponible */ }
    setSaving(true);
    try {
      await save({ theme: normalized });
      setSaved(true);
    } catch (error) {
      console.error('[PATA THEME SAVE]', error?.message || error);
    } finally {
      setSaving(false);
    }
  };

  const onLogout = async () => {
    if (!confirm(isEnglish ? 'Sign out?' : 'Se déconnecter ?')) return;
    await logout();
    router.replace('/login');
  };
  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <header className="space-y-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">Mon espace</p>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Paramètres</h1>
        <p className="text-sm leading-5 text-slate-500">Gère ton compte et les préférences de Pata au même endroit.</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-50 p-1.5">
            <img src="/android-chrome-192x192.png" alt="Logo Pata" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Compte Pata</p>
            <h2 className="mt-0.5 truncate text-base font-bold text-slate-900">{profile?.displayName || displayName || 'Mon compte'}</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">{user?.email || 'Adresse e-mail non disponible'}</p>
          </div>
          <button type="button" onClick={() => setActivePanel('profile')} className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Modifier</button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${isPremium ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
            <Crown size={13}/>{isPremium ? 'Pata Premium' : 'Plan gratuit'}
          </span>
          <span className="text-[11px] text-slate-500">{currency === 'XAF' ? 'FCFA' : currency} · {theme === 'dark' ? 'Mode sombre' : 'Mode clair'}</span>
          {saved && <span className="text-[11px] font-semibold text-emerald-700">Modification enregistrée</span>}
        </div>
      </section>

      <section className="space-y-2.5">
        <h2 className="px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Compte et abonnement</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
          <SettingRow icon={UserRound} title="Informations personnelles" description="Nom affiché, adresse e-mail et devise" onClick={() => setActivePanel('profile')} />
          <SettingRow icon={Crown} title="Mon abonnement" description={isPremium ? `Premium actif jusqu’au ${expiry.toLocaleDateString(getPreferredLocale())}` : 'Tu utilises actuellement la version gratuite'} value={isPremium ? 'Premium' : 'Gratuit'} onClick={() => setActivePanel('subscription')} />
        </div>
      </section>

      <section className="space-y-2.5">
        <h2 className="px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Sécurité et notifications</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
          <SettingRow icon={LockKeyhole} title="Code secret" description="Verrouille l’accès à ton espace personnel" value="PIN à 4 chiffres" onClick={() => setActivePanel('security')} />
          <SettingRow icon={KeyRound} title="Mot de passe" description={user?.providerData?.some((provider) => provider.providerId === 'password') ? "Modifier ou réinitialiser ton mot de passe" : "Ajouter un mot de passe à ton compte"} onClick={() => setActivePanel('password')} />
          <SettingRow icon={Bell} title="Notifications" description="Alertes et rappels sur cet appareil" onClick={() => setActivePanel('notifications')} />
          <SettingRow icon={MessageSquareText} title="Import SMS Mobile Money" description="Détecter les opérations MTN MoMo et Orange Money" onClick={() => setActivePanel('smsImport')} />
        </div>
      </section>

      <section className="space-y-2.5">
        <h2 className="px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Préférences et données</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
          <SettingRow icon={theme === 'dark' ? Moon : Sun} title="Apparence de Pata" description="Choisis un thème clair ou sombre" value={theme === 'dark' ? 'Sombre' : 'Clair'} onClick={() => setActivePanel('appearance')} />
          <SettingRow icon={Smartphone} title="Télécharger l’application Android" description="Installer la version mobile Pata (APK)" onClick={() => router.push('/telecharger')} />
          <SettingRow icon={Download} title="Exporter mes données" description="Télécharger tes opérations et tes bilans" onClick={() => setActivePanel('exports')} />
          <SettingRow icon={Gift} title="Parrainage" description="Ton lien, tes invitations et tes bonus" onClick={() => setActivePanel('referrals')} />
          <SettingRow icon={Share2} title="Réseaux sociaux" description="Retrouve les pages officielles de Pata" onClick={() => setActivePanel('social')} />
          <SettingRow icon={ShieldCheck} title="Confidentialité et documents" description="Conditions d’utilisation et politique de confidentialité" onClick={() => setActivePanel('legal')} />
        </div>
      </section>

      <button type="button" onClick={onLogout} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100">
        <LogOut size={16}/> Se déconnecter
      </button>

      <Modal open={Boolean(activePanel)} onClose={() => setActivePanel('')} title={{
        profile: 'Informations personnelles',
        subscription: 'Mon abonnement',
        security: 'Code secret',
        password: 'Mot de passe',
        notifications: 'Notifications',
        smsImport: 'Import SMS Mobile Money',
        appearance: 'Apparence de Pata',
        exports: 'Exporter mes données',
        referrals: 'Parrainage',
        social: 'Réseaux sociaux',
        legal: 'Confidentialité et documents',
      }[activePanel] || 'Paramètres'} className="max-w-lg">
        {activePanel === 'profile' && (
          <form onSubmit={onSave} className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              <img src="/android-chrome-192x192.png" alt="Pata" className="h-11 w-11 rounded-xl object-contain"/>
              <div><p className="text-sm font-semibold text-slate-800">{profile?.displayName || 'Ton compte Pata'}</p><p className="mt-0.5 text-xs text-slate-500">Ton identité dans l’application</p></div>
            </div>
            <ProfilePhotoEditor
              photoURL={profile?.photoURL || ''}
              displayName={profile?.displayName || displayName}
              onSave={async (photoURL) => { await save({ photoURL }); await syncCotisationProfile(); }}
            />
            <Input label="Nom affiché" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <Input label="Adresse e-mail" value={user?.email || ''} disabled />
            <Select label="Langue" value={language} onChange={(e) => setLanguage(e.target.value).catch(() => alert(isEnglish ? 'Could not save the language. Check your connection and try again.' : 'Impossible d’enregistrer la langue. Vérifie ta connexion puis réessaie.'))}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </Select>
            <p className="text-xs leading-5 text-slate-500">Choisis la langue de toute ton application Pata. La préférence est enregistrée dans ton profil.</p>
            {isLanguageSaving && <p className="text-xs text-slate-500">Enregistrement de la langue…</p>}
            <Select label="Devise d’affichage" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="XAF">Franc CFA (XAF)</option>
              <option value="EUR">Euro (EUR)</option>
              <option value="USD">Dollar américain (USD)</option>
            </Select>
            <p className="text-xs leading-5 text-slate-500">Les montants sont conservés en FCFA dans Pata. Seule leur présentation est convertie dans la devise choisie.</p>
            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" disabled={saving}><Save size={15}/>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
              <button type="button" onClick={() => setActivePanel('')} className="text-xs font-semibold text-slate-500">Annuler</button>
            </div>
          </form>
        )}

        {activePanel === 'subscription' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">Forfait utilisé actuellement</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div><h3 className="text-lg font-bold text-slate-900">{isPremium ? 'Pata Premium' : 'Pata gratuit'}</h3><p className="mt-1 text-xs text-slate-500">{isPremium ? `Accès actif jusqu’au ${expiry.toLocaleDateString(getPreferredLocale())} · ${Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / 86400000))} jour(s) restant(s)` : 'Les fonctions essentielles restent accessibles gratuitement.'}</p></div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${isPremium ? 'bg-emerald-100 text-emerald-800' : 'bg-white text-slate-600'}`}>{isPremium ? 'ACTIF' : 'GRATUIT'}</span>
              </div>
            </div>
            {!isPremium && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700">Tes limites actuelles</p>
                {usageRows.map(([label, used, limit]) => (
                  <div key={label} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
                    <span className="text-xs text-slate-600">{label}</span>
                    <span className={`shrink-0 text-xs font-semibold ${used >= limit ? 'text-amber-700' : 'text-slate-700'}`}>{used} / {limit}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 pt-1"><span className="text-xs text-slate-600">Messages à Mč aujourd’hui</span><span className="text-xs font-semibold text-slate-700">{Number(dailyStats.aiCount) || 0} / 3</span></div>
              </div>
            )}
            <Button className="w-full" onClick={() => { setActivePanel(''); router.push('/premium'); }}>{isPremium ? 'Gérer ou prolonger Premium' : 'Découvrir les avantages Premium'}</Button>
          </div>
        )}

        {activePanel === 'security' && <PinSecuritySettings />}
        {activePanel === 'password' && <PasswordSettings />}
        {activePanel === 'smsImport' && <SmsImportSettings />}
        {activePanel === 'notifications' && (
          <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <h3 className="text-sm font-bold text-slate-900">{isEnglish ? 'Email reminders' : 'Rappels par e-mail'}</h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {isEnglish
                  ? 'Important due-date reminders can reach your account email even when phone notifications are disabled.'
                  : 'Les rappels importants d’échéance peuvent arriver sur l’adresse e-mail de ton compte, même si les notifications du téléphone sont désactivées.'}
              </p>
              <p className="mt-2 break-all text-[11px] font-semibold text-slate-700">{user?.email || (isEnglish ? 'No email address available' : 'Aucune adresse e-mail disponible')}</p>
              <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <input type="checkbox" checked={emailRemindersEnabled} disabled={emailPreferencesSaving || !user?.email} onChange={(event) => updateEmailPreference('emailRemindersEnabled', event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-700" />
                <span>
                  <span className="block text-xs font-semibold text-slate-800">{isEnglish ? 'Email me about debts, bills and contribution deadlines' : 'M’envoyer les rappels de dettes, factures et cotisations'}</span>
                  <span className="mt-1 block text-[11px] leading-4 text-slate-500">{isEnglish ? 'Enabled by default. You can turn these emails off at any time.' : 'Activé par défaut. Tu peux désactiver ces e-mails à tout moment.'}</span>
                </span>
              </label>
              <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <input type="checkbox" checked={dailySummaryEmailEnabled} disabled={emailPreferencesSaving || !user?.email} onChange={(event) => updateEmailPreference('dailySummaryEmailEnabled', event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-700" />
                <span>
                  <span className="block text-xs font-semibold text-slate-800">{isEnglish ? 'Receive Pata’s daily financial check-in by email' : 'Recevoir le point financier quotidien de Pata par e-mail'}</span>
                  <span className="mt-1 block text-[11px] leading-4 text-slate-500">{isEnglish ? 'Optional and disabled by default. Pata sends the day’s priority reminder, not a full PDF report.' : 'Facultatif et désactivé par défaut. Pata envoie le point prioritaire du jour, pas un rapport PDF détaillé.'}</span>
                </span>
              </label>
              {emailPreferencesSaving && <p className="mt-2 text-[11px] text-slate-500">{isEnglish ? 'Saving…' : 'Enregistrement…'}</p>}
              {emailPreferencesMessage && <p role="status" className="mt-2 text-[11px] leading-4 text-slate-600">{emailPreferencesMessage}</p>}
            </section>
            <div className="space-y-2">
              <p className="text-xs leading-5 text-slate-500">{isEnglish ? 'Configure system alerts for this device. You can also test delivery.' : 'Configure les alertes système de Pata pour cet appareil. Tu peux aussi tester leur réception.'}</p>
              <NotificationSettings />
            </div>
          </div>
        )}

        {activePanel === 'appearance' && (
          <div className="space-y-4">
            <p className="text-xs leading-5 text-slate-500">Le thème choisi s’applique à toutes les pages de l’application, aux menus, aux tableaux et aux fenêtres.</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => changeTheme('light')} className={`rounded-2xl border p-3 text-left transition ${theme === 'light' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}>
                <span className="mb-3 block h-16 rounded-xl border border-slate-200 bg-white p-2"><span className="block h-2 w-9 rounded bg-emerald-600"/><span className="mt-2 block h-2 w-full rounded bg-slate-100"/><span className="mt-1 block h-2 w-3/4 rounded bg-slate-100"/></span>
                <span className="text-sm font-semibold text-slate-800">Mode clair</span><span className="mt-1 block text-[10px] text-slate-500">Fond clair, surfaces blanches</span>
              </button>
              <button type="button" onClick={() => changeTheme('dark')} className={`rounded-2xl border p-3 text-left transition ${theme === 'dark' ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}>
                <span className="mb-3 block h-16 rounded-xl border border-slate-700 bg-[#17251e] p-2"><span className="block h-2 w-9 rounded bg-emerald-400"/><span className="mt-2 block h-2 w-full rounded bg-slate-700"/><span className="mt-1 block h-2 w-3/4 rounded bg-slate-700"/></span>
                <span className="text-sm font-semibold text-slate-800">Mode sombre</span><span className="mt-1 block text-[10px] text-slate-500">Contraste doux, fonds profonds</span>
              </button>
            </div>
            {saving && <p className="text-xs text-slate-500">Enregistrement du thème…</p>}
            {saved && <p className="text-xs font-semibold text-emerald-700">Préférence enregistrée.</p>}
          </div>
        )}

        {activePanel === 'exports' && (
          <div className="space-y-3">
            <p className="text-xs leading-5 text-slate-500">Récupère une copie de tes revenus, dépenses, recharges, budgets, objectifs, prévisions et opérations programmées.</p>
            <Button variant="outline" className="w-full justify-start" onClick={exportPdf}><FileText size={16}/> Télécharger en PDF</Button>
            <Button variant="outline" className="w-full justify-start" onClick={exportExcel}><FileSpreadsheet size={16}/> Exporter pour Excel</Button>
            <p className="text-[11px] leading-5 text-slate-400">Les montants exportés suivent la devise d’affichage de ton compte.</p>
          </div>
        )}

        {activePanel === 'social' && (
          <div className="space-y-2">
            <a href="https://www.facebook.com/share/1Rd13NJTpL/" target="_blank" rel="noreferrer" className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 transition hover:bg-slate-50">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Share2 size={17}/></span>
              <span className="min-w-0 flex-1"><strong className="block text-sm text-slate-800">Facebook</strong><span className="mt-0.5 block text-[11px] text-slate-500">Page officielle de Pata</span></span><ChevronRight size={16} className="text-slate-400"/>
            </a>
            <a href="https://whatsapp.com/channel/0029VbEP2fSAInPrijieOK3k" target="_blank" rel="noreferrer" className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 transition hover:bg-slate-50">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><MessageSquareText size={17}/></span>
              <span className="min-w-0 flex-1"><strong className="block text-sm text-slate-800">Chaîne WhatsApp</strong><span className="mt-0.5 block text-[11px] text-slate-500">Actualités et informations de Pata</span></span><ChevronRight size={16} className="text-slate-400"/>
            </a>
          </div>
        )}
                {activePanel === 'referrals' && <ReferralsSettings />}
        {activePanel === 'legal' && (
          <div className="space-y-2">
            <Link href="/conditions" className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 transition hover:bg-slate-50">
              <FileText size={17} className="text-slate-500"/><span className="min-w-0 flex-1"><strong className="block text-sm text-slate-800">Conditions d’utilisation</strong><span className="mt-0.5 block text-[11px] text-slate-500">Règles du service et abonnements</span></span><ChevronRight size={16} className="text-slate-400"/>
            </Link>
            <Link href="/confidentialite" className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 transition hover:bg-slate-50">
              <ShieldCheck size={17} className="text-slate-500"/><span className="min-w-0 flex-1"><strong className="block text-sm text-slate-800">Politique de confidentialité</strong><span className="mt-0.5 block text-[11px] text-slate-500">Données personnelles et confidentialité</span></span><ChevronRight size={16} className="text-slate-400"/>
            </Link>
          </div>
        )}
      </Modal>
    </div>
  );
}

function SettingRow({ icon: Icon, title, description, value, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[70px] w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 sm:px-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon size={17}/></span>
      <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-slate-800">{title}</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">{description}</span></span>
      <span className="flex shrink-0 items-center gap-1.5">{value && <span className="max-w-[88px] truncate text-[10px] font-semibold text-slate-500">{value}</span>}<ChevronRight size={16} className="text-slate-400"/></span>
    </button>
  );
}