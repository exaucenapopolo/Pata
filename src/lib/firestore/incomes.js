import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp, getDocs, where,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import { reserveCreationQuota } from '@/lib/usageLimits';

const col = (uid) => collection(db, 'users', uid, 'incomes');

export function subscribeIncomes(uid, cb) {
  const q = query(col(uid), orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function createIncome(uid, data) {
  await reserveCreationQuota(uid, 'incomes');
  const incomeRef = await addDoc(col(uid), {
    amount: Number(data.amount),
    source: data.source || 'Salaire',
    categoryId: data.categoryId || 'salary',
    month: data.month,
    note: data.note || '',
    date: data.date || new Date().toISOString().slice(0, 10),
    createdAt: serverTimestamp(),
  });
  try {
    const currentUser = auth.currentUser;
    if (currentUser?.uid === uid) {
      const token = await currentUser.getIdToken();
      await fetch('/api/analytics/income-created', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ incomeId: incomeRef.id }) });
    }
  } catch (error) { console.warn('Statistique du revenu non synchronisée :', error?.message); }
  return incomeRef;
}

export async function updateIncome(uid, id, patch) {
  await updateDoc(doc(db, 'users', uid, 'incomes', id), patch);
}

export async function deleteIncome(uid, id) {
  await deleteDoc(doc(db, 'users', uid, 'incomes', id));
    }
