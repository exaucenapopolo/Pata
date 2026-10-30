import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp, getDocs, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

const col = (uid) => collection(db, 'users', uid, 'incomes');

export function subscribeIncomes(uid, cb) {
  const q = query(col(uid), orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function createIncome(uid, data) {
  return addDoc(col(uid), {
    amount: Number(data.amount),
    source: data.source || 'Salaire',
    month: data.month,
    note: data.note || '',
    date: data.date || new Date().toISOString().slice(0, 10),
    createdAt: serverTimestamp(),
  });
}

export async function updateIncome(uid, id, patch) {
  await updateDoc(doc(db, 'users', uid, 'incomes', id), patch);
}

export async function deleteIncome(uid, id) {
  await deleteDoc(doc(db, 'users', uid, 'incomes', id));
}

export async function getIncomeForMonth(uid, month) {
  const q = query(col(uid), where('month', '==', month));
  const snap = await getDocs(q);
  return snap.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
    }
