import {
  collection, onSnapshot, query, orderBy
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';

const col = (uid) => collection(db, 'users', uid, 'expenses');

export function subscribeExpenses(uid, cb) {
  const q = query(col(uid), orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function createExpense(uid, data) {
  const user = auth.currentUser;
  if (!user) throw new Error('Utilisateur non connecté.');
  
  const token = await user.getIdToken();
  
  const res = await fetch('/api/expenses/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  const result = await res.json();
  if (result.confirmationRequired) return result;
  if (!res.ok || !result.success) {
    throw new Error(result.error || 'Erreur lors de l\'enregistrement de la dépense.');
  }
  
  return result;
}

async function postExpenseAction(path, payload) {
  const user = auth.currentUser;
  if (!user) throw new Error('Utilisateur non connecté.');
  const token = await user.getIdToken();
  const response = await fetch(`/api/expenses/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (result.confirmationRequired) return result;
  if (!response.ok || !result.success) throw new Error(result.error || 'Opération impossible.');
  return result;
}

export async function updateExpense(uid, id, patch) {
  return postExpenseAction('update', { ...patch, expenseId: id });
}

export async function deleteExpense(uid, id) {
  return postExpenseAction('delete', { expenseId: id });
}
