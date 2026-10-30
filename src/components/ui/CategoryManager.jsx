'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { CategoryImage } from '@/components/ui/CategoryImage';
import { useAuth } from '@/hooks/useAuth';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { createCategory, deleteCategory } from '@/lib/firestore/categories';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#6366f1', '#ef4444', '#ec4899', '#8b5cf6', '#94a3b8'];

export function CategoryManager({ type, value, onChange }) {
  const { user } = useAuth();
  const { categories } = useCustomCategories(type);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const onCreate = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setError('');
    if (!name.trim()) return setError('Nom requis.');
    setSaving(true);
    try {
      await createCategory(user.uid, { name: name.trim(), type, color });
      setName('');
      setColor(COLORS[0]);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Supprimer cette catégorie ? Les transactions existantes ne seront pas supprimées.')) return;
    await deleteCategory(user.uid, id);
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {categories.map((cat) => (
          <div key={cat.id} className="group relative">
            <button
              type="button"
              onClick={() => onChange(cat.id)}
              className={`flex w-full flex-col items-center gap-1.5 rounded-xl border p-2 transition ${
                value === cat.id
                  ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <CategoryImage categoryId={cat.id} image={cat.image} size="md" />
              <span className={`text-[10px] font-medium text-center leading-tight ${value === cat.id ? 'text-brand-700' : 'text-slate-600'}`}>
                {cat.name || cat.label}
              </span>
            </button>
            {cat.isCustom && (
              <button
                type="button"
                onClick={(e) => onDelete(e, cat.id)}
                className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow group-hover:flex"
                aria-label="Supprimer"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-2 transition hover:border-brand-500 hover:bg-brand-50"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm border border-slate-200 text-slate-400">
            <Plus size={20} />
          </div>
          <span className="text-[10px] font-medium text-slate-500 text-center">Créer</span>
        </button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Nouvelle catégorie">
        <form onSubmit={onCreate} className="space-y-3">
          <Input
            label="Nom de la catégorie"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex : Paris sportifs, Tontine, Crypto…"
          />
          <p className="text-xs text-slate-500">
            Le système choisira automatiquement la meilleure illustration selon le nom.
          </p>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Couleur de secours</p>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full border-2 transition ${color === c ? 'border-slate-900' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Couleur ${c}`}
                />
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Création…' : 'Créer la catégorie'}
          </Button>
        </form>
      </Modal>
    </div>
  );
                }
