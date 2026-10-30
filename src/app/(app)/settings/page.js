'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, LogOut, Download, User } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card, CardTitle } from '@/components/ui/Card';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useExpenses } from '@/hooks/useExpenses';
import { useIncomes } from '@/hooks/useIncomes';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { profile, save } = useProfile();
  const { expenses } = useExpenses();
  const { incomes } = useIncomes();
  const router = useRouter();

  const [displayName, setDisplayName] = useState('');
  const [currency, setCurrency] = useState('XAF');
  const [penaltyDefault, setPenaltyDefault] = useState(500);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || '');
      setCurrency(profile.currency || 'XAF');
      setPenaltyDefault(profile.penaltyDefault ?? 500);
    }
  }, [profile]);

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await save({
        displayName: displayName.trim() || 'Utilisateur',
        currency,
        penaltyDefault: Number(penaltyDefault) || 0,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const exportAll = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      profile,
      incomes,
      expenses,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pata-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
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
          <Select label="Devise" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="XAF">FCFA (XAF)</option>
            <option value="EUR">Euro (EUR)</option>
            <option value="USD">Dollar US (USD)</option>
          </Select>
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
        <CardTitle className="mb-3">Données</CardTitle>
        <p className="mb-3 text-xs text-slate-500">
          Exporte toutes tes données (revenus, dépenses, profil) au format JSON.
        </p>
        <Button variant="outline" onClick={exportAll}>
          <Download size={15} /> Exporter mes données
        </Button>
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
