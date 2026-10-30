import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, where, serverTimestamp, getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

const col = (uid) => collection(db, 'users', uid, 'budgets');

export function subscribeBudgets(uid, month, cb) {
  const q = query(col(uid), where('month', '==', month));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function upsertBudget(uid, { categoryId, amount, month }) {
  const q = query(col(uid), where('month', '==', month), where('categoryId', '==', categoryId));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const ref = doc(db, 'users', uid, 'budgets', snap.docs[0].id);
    await updateDoc(ref, { amount: Number(amount), updatedAt: serverTimestamp() });
    return snap.docs[0].id;
  }
  const created = await addDoc(col(uid), {
    categoryId,
    amount: Number(amount),
    month,
    createdAt: serverTimestamp(),
  });
  return created.id;
}

export async function deleteBudget(uid, id) {
  await deleteDoc(doc(db, 'users', uid, 'budgets', id));
}
