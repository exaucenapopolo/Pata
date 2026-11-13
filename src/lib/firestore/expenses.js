import {
  collection, onSnapshot, query, orderBy, where, limit
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';

const col = (uid) => collection(db, 'users', uid, 'expenses');

function notifyIncomeBalancesChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('pata:income-balances-refresh'));
}

export function subscribeExpenses(uid, cb, options = {}) {
  const constraints = [];
  let startDate = options.startDate || null;
  const endDate = options.endDate || null;
  if (options.days && !startDate) {
    const start = new Date();
    start.setDate(start.getDate() - Math.max(1, Math.min(365, Number(options.days) || 30)));
    startDate = start.getFullYear() + '-' + String(start.getMonth() + 1).padStart(2, '0') + '-' + String(start.getDate()).padStart(2, '0');
  }
  if (startDate) constraints.push(where('date', '>=', String(startDate).slice(0, 10)));
  if (endDate) constraints.push(where('date', '<=', String(endDate).slice(0, 10)));
  constraints.push(orderBy('date', 'desc'), limit(Math.max(50, Math.min(1000, Number(options.limit) || 500))));
  const q = query(col(uid), ...constraints);
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
  
  notifyIncomeBalancesChanged();
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
  notifyIncomeBalancesChanged();
  return result;
}

export async function updateExpense(uid, id, patch) {
  return postExpenseAction('update', { ...patch, expenseId: id });
}

export async function deleteExpense(uid, id) {
  return postExpenseAction('delete', { expenseId: id });
}
