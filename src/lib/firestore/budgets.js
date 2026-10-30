import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, where, serverTimestamp, getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

const col = (uid) => collection(db, 'users', uid, 'budgets');

export function subscribeBudgets(uid, month, cb, incomeSourceId = null) {
  let constraints = [where('month', '==', month)];
  if (incomeSourceId) {
    constraints.push(where('incomeSourceId', '==', incomeSourceId));
  }
  
  const q = query(col(uid), ...constraints);
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function upsertBudget(uid, { categoryId, amount, month, incomeSourceId = 'all' }) {
  const q = query(
    col(uid), 
    where('month', '==', month), 
    where('categoryId', '==', categoryId),
    where('incomeSourceId', '==', incomeSourceId)
  );
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
    incomeSourceId,
    createdAt: serverTimestamp(),
  });
  return created.id;
}

export async function deleteBudget(uid, id) {
  await deleteDoc(doc(db, 'users', uid, 'budgets', id));
}
