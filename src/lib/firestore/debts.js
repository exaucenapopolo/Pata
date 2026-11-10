import { collection, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';

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


async function callDebtApi(path, method = 'GET', payload = null) {
  const user = auth.currentUser;
  if (!user) throw new Error('Session expirée. Reconnecte-toi puis réessaie.');
  const token = await user.getIdToken();
  const response = await fetch('/api/debts/' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'Cette opération est indisponible.');
  return result;
}

export async function searchDebtCounterparties(value) {
  const queryValue = String(value || '').trim();
  if (queryValue.length < 3) return [];
  const result = await callDebtApi('search-users?q=' + encodeURIComponent(queryValue));
  return Array.isArray(result.users) ? result.users : [];
}

export async function listDebtRequests() {
  const result = await callDebtApi('requests');
  return Array.isArray(result.requests) ? result.requests : [];
}

export async function respondDebtRequest(requestId, decision) {
  return callDebtApi('requests/respond', 'POST', { requestId, decision });
}
