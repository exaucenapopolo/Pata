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
  const startDate = new Date().toISOString().slice(0, 10);
  const durationDays = Math.max(1, Math.floor(Number(data.durationDays) || 30));
  const frequencyDays = Math.max(1, Math.floor(Number(data.frequencyDays) || 7));
  const deadline = new Date(
    new Date(startDate).getTime() + durationDays * 86400000
  ).toISOString().slice(0, 10);

  return addDoc(col(uid), {
    name: String(data.name || '').trim(),
    targetAmount: Number(data.targetAmount),
    categoryId: data.categoryId || 'savings',
    startDate,
    durationDays,
    frequencyDays,
    deadline,
    penaltyAmount: Number(data.penaltyAmount || 0),
    createdAt: serverTimestamp(),
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

export async function addDeposit(uid, goalId, { amount, date }) {
  return addDoc(depositsCol(uid, goalId), {
    amount: Number(amount),
    date: date || new Date().toISOString().slice(0, 10),
    source: 'external',
    createdAt: serverTimestamp(),
  });
}

export async function deleteDeposit(uid, goalId, depositId) {
  await deleteDoc(doc(db, 'users', uid, 'goals', goalId, 'deposits', depositId));
                      }
