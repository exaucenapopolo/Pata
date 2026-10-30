'use client';

import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
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

  const onDelete = async (id) => {
    if (!confirm('Supprimer cette catégorie ? Les transactions existantes ne seront pas supprimées.')) return;
    await deleteCategory(user.uid, id);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <div key={cat.id} className="group relative">
            <button
              type="button"
              onClick={() => onChange(cat.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                value === cat.id
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-slate-300 text-slate-700 hover:border-slate-400'
              }`}
            >
              <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} />
              {cat.name || cat.label}
            </button>
            {cat.isCustom && (
              <button
                type="button"
                onClick={() => onDelete(cat.id)}
                className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white shadow group-hover:flex"
                aria-label="Supprimer"
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-dashed border-slate-400 px-3 py-1 text-xs font-medium text-slate-600 hover:border-brand-500 hover:text-brand-600"
        >
          <Plus size={12} className="mr-1 inline" /> Ajouter
        </button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Nouvelle catégorie">
        <form onSubmit={onCreate} className="space-y-3">
          <Input
            label="Nom"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex : Bière, Shopping, Vêtements…"
          />
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Couleur</p>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full border-2 transition ${
                    color === c ? 'border-slate-900' : 'border-transparent'
                  }`}
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
