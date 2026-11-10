import { collection, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

const debtsCollection = (uid) => collection(db, 'users', uid, 'debts');

export function subscribeDebts(uid, callback) {
  const debtsQuery = query(debtsCollection(uid), orderBy('createdAt', 'desc'));
  return onSnapshot(debtsQuery, (snapshot) => {
    callback(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
  }, (error) => {
    console.error('Debts listener error:', error);
    callback([]);
  });
}

export async function listDebtRepayments(uid, debtId) {
  if (!uid || !debtId || String(debtId).includes('/')) throw new Error('Dette invalide.');
  const repaymentsQuery = query(collection(db, 'users', uid, 'debts', debtId, 'repayments'), orderBy('date', 'desc'));
  const snapshot = await getDocs(repaymentsQuery);
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
}
