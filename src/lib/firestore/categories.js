import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { normalizeCategoryType } from '@/lib/categories/categoryType.mjs';

const col = (uid) => collection(db, 'users', uid, 'categories');

export function subscribeCategories(uid, cb) {
  const q = query(col(uid), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function createCategory(uid, data) {
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Nom requis.');
  return addDoc(col(uid), {
    name,
    type: normalizeCategoryType(data.type),
    color: data.color || '#10b981',
    icon: data.icon || null,
    image: typeof data.image === 'string' ? data.image : null,
    isCustom: true,
    createdAt: serverTimestamp(),
  });
}

export async function updateCategory(uid, id, patch) {
  const safePatch = {};
  if (patch.name !== undefined) {
    const name = String(patch.name || '').trim();
    if (!name) throw new Error('Nom requis.');
    safePatch.name = name;
  }
  if (patch.color !== undefined) safePatch.color = String(patch.color || '#10b981');
  if (patch.image !== undefined) safePatch.image = typeof patch.image === 'string' ? patch.image : null;
  if (patch.icon !== undefined) safePatch.icon = patch.icon || null;
  await updateDoc(doc(db, 'users', uid, 'categories', id), {
    ...safePatch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCategory(uid, id) {
  await deleteDoc(doc(db, 'users', uid, 'categories', id));
}
