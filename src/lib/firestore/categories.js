import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

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
    type: data.type === 'goal' ? 'goal' : 'expense',
    color: data.color || '#10b981',
    icon: data.icon || null,
    isCustom: true,
    createdAt: serverTimestamp(),
  });
}

export async function updateCategory(uid, id, patch) {
  await updateDoc(doc(db, 'users', uid, 'categories', id), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCategory(uid, id) {
  await deleteDoc(doc(db, 'users', uid, 'categories', id));
  }
