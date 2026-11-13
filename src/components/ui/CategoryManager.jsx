'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { CategoryImage } from '@/components/ui/CategoryImage';
import { CloudinaryImageField } from '@/components/ui/CloudinaryImageField';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useCustomCategories } from '@/hooks/useCustomCategories';
import { createCategory, updateCategory, deleteCategory } from '@/lib/firestore/categories';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#6366f1', '#ef4444', '#ec4899', '#8b5cf6', '#94a3b8'];

export function CategoryManager({ type, value, onChange }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const isEnglish = language === 'en';
  const { categories } = useCustomCategories(type);
  const visibleCategories = categories.filter((category) => !(type === 'expense' && ['loan_given', 'debt_repayment'].includes(category.id))
    && !(type === 'income' && ['debt_borrowed', 'debt_repayment_received'].includes(category.id)));
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [image, setImage] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openCreate = () => {
    setEditingCategory(null);
    setName('');
    setColor(COLORS[0]);
    setImage('');
    setError('');
    setOpen(true);
  };

  const openEdit = (category) => {
    setEditingCategory(category);
    setName(category.name || category.label || '');
    setColor(category.color || COLORS[0]);
    setImage(category.image || '');
    setError('');
    setOpen(true);
  };

  const onCreate = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setError('');
    if (!name.trim()) return setError(isEnglish ? 'A category name is required.' : 'Nom requis.');
    if (!user?.uid) return setError(isEnglish ? 'Your session has expired.' : 'Session expirée.');
    setSaving(true);
    try {
      if (editingCategory) {
        await updateCategory(user.uid, editingCategory.id, { name: name.trim(), color, image: image || null });
      } else {
        await createCategory(user.uid, { name: name.trim(), type, color, image: image || null });
      }
      setName('');
      setColor(COLORS[0]);
      setImage('');
      setEditingCategory(null);
      setOpen(false);
    } catch (err) {
      setError(err.message || (isEnglish ? 'Could not save this category.' : 'Impossible d’enregistrer cette catégorie.'));
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
        {visibleCategories.map((cat) => (
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
              <div className="absolute -right-1 -top-1 flex items-center gap-1">
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEdit(cat); }} className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-700 shadow ring-1 ring-slate-200" aria-label={isEnglish ? 'Edit category' : 'Modifier la catégorie'}><Pencil size={11}/></button>
                <button type="button" onClick={(e) => onDelete(e, cat.id)} className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow" aria-label={isEnglish ? 'Delete category' : 'Supprimer la catégorie'}><X size={12}/></button>
              </div>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={openCreate}
          className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-2 transition hover:border-brand-500 hover:bg-brand-50"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm border border-slate-200 text-slate-400">
            <Plus size={20} />
          </div>
          <span className="text-[10px] font-medium text-slate-500 text-center">Créer</span>
        </button>
      </div>

      <Modal open={open} onClose={() => { if (!saving) setOpen(false); }} title={editingCategory ? (isEnglish ? 'Edit category' : 'Modifier la catégorie') : (isEnglish ? 'New category' : 'Nouvelle catégorie')}>
        <form onSubmit={onCreate} className="space-y-3">
          <Input label={isEnglish ? 'Category name' : 'Nom de la catégorie'} required value={name} onChange={(e) => setName(e.target.value)} placeholder={isEnglish ? 'e.g. Freelance, Gifts, Rent…' : 'Ex. : Freelance, Cadeaux, Loyer…'} />
          <CloudinaryImageField value={image} onChange={setImage} folder={`pata/categories/${type}`} language={language}/>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">{isEnglish ? 'Category color' : 'Couleur de la catégorie'}</p>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => <button type="button" key={c} onClick={() => setColor(c)} className={`h-8 w-8 rounded-full border-2 transition ${color === c ? 'border-slate-900' : 'border-transparent'}`} style={{ backgroundColor: c }} aria-label={`Couleur ${c}`} />)}
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? (isEnglish ? 'Saving…' : 'Enregistrement…') : editingCategory ? (isEnglish ? 'Save changes' : 'Enregistrer les modifications') : (isEnglish ? 'Create category' : 'Créer la catégorie')}
          </Button>
        </form>
      </Modal>
    </div>
  );
                }
