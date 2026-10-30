import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp, getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

const col = (uid) => collection(db, 'users', uid, 'goals');
const depositsCol = (uid, gid) => collection(db, 'users', uid, 'goals', gid, 'deposits');

export function subscribeGoals(uid, cb) {
  const q = query(col(uid), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export function subscribeDeposits(uid, goalId, cb) {
  const q = query(depositsCol(uid, goalId), orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function createGoal(uid, data) {
  const base = {
    name: String(data.name || '').trim(),
    type: data.type || 'goal',
    categoryId: data.categoryId || 'savings',
    debtBalance: 0,
    createdAt: serverTimestamp(),
  };

  if (data.type === 'piggybank') {
    return addDoc(col(uid), base);
  }

  return addDoc(col(uid), {
    ...base,
    targetAmount: Number(data.targetAmount),
    startDate: data.startDate,
    deadline: data.deadline,
    frequencyDays: Number(data.frequencyDays),
    penaltyAmount: Number(data.penaltyAmount || 0),
  });
}

export async function updateGoal(uid, id, patch) {
  await updateDoc(doc(db, 'users', uid, 'goals', id), patch);
}

export async function deleteGoal(uid, id) {
  const deps = await getDocs(depositsCol(uid, id));
  await Promise.all(deps.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'users', uid, 'goals', id));
}

export async function addDeposit(uid, goalId, { amount, date, incomeSourceId, incomeSourceName }) {
  return addDoc(depositsCol(uid, goalId), {
    amount: Number(amount),
    date: date || new Date().toISOString().slice(0, 10),
    source: 'wallet',
    incomeSourceId: incomeSourceId || null,
    incomeSourceName: incomeSourceName || null,
    createdAt: serverTimestamp(),
  });
}

export async function deleteDeposit(uid, goalId, depositId) {
  await deleteDoc(doc(db, 'users', uid, 'goals', goalId, 'deposits', depositId));
                                    }
