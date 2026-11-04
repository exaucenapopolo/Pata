import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, where, serverTimestamp, getDocs, limit, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { reserveCreationQuota } from '@/lib/usageLimits';

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
  
  await reserveCreationQuota(uid, 'budgets');
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

export function subscribeAllBudgets(uid, cb) {
  const q = query(col(uid), orderBy('month', 'desc'), limit(150));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
