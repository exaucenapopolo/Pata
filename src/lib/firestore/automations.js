// src/lib/firestore/automations.js
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

const col = (uid) => collection(db, 'users', uid, 'automations');

export function subscribeAutomations(uid, cb) {
  return onSnapshot(query(col(uid)), (snap) => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function createAutomation(uid, data) {
  return addDoc(col(uid), {
    amount: Number(data.amount),
    categoryId: data.categoryId,
    note: data.note || '',
    frequency: data.frequency, // 'daily', 'weekly', 'monthly'
    nextRun: data.nextRun, // Date ISO string
    anchorDay: Number(data.anchorDay) || (data.nextRun ? new Date(data.nextRun).getUTCDate() : new Date().getUTCDate()),
    endDate: data.endDate || null,
    active: data.active !== false,
    runCount: Number(data.runCount) || 0,
    incomeSourceId: data.incomeSourceId || 'all',
    incomeSourceName: data.incomeSourceName || 'Tous les revenus',
    createdAt: serverTimestamp(),
  });
}

export async function deleteAutomation(uid, id) {
  await deleteDoc(doc(db, 'users', uid, 'automations', id));
    }
