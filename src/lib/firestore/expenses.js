import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

const col = (uid) => collection(db, 'users', uid, 'expenses');

export function subscribeExpenses(uid, cb) {
  const q = query(col(uid), orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function createExpense(uid, data) {
  return addDoc(col(uid), {
    amount: Number(data.amount),
    categoryId: data.categoryId,
    date: data.date,
    note: data.note || '',
    createdAt: serverTimestamp(),
  });
}

export async function updateExpense(uid, id, patch) {
  await updateDoc(doc(db, 'users', uid, 'expenses', id), patch);
}

export async function deleteExpense(uid, id) {
  await deleteDoc(doc(db, 'users', uid, 'expenses', id));
}
