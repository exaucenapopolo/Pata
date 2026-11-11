import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/client';

const billsCollection = (uid) => collection(db, 'users', uid, 'bills');

export function subscribeBills(uid, callback, onError) {
  if (!uid) return () => {};
  const billsQuery = query(billsCollection(uid), orderBy('nextDueDate', 'asc'));
  return onSnapshot(
    billsQuery,
    (snapshot) => callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
    onError
  );
}

async function postBillAction(action, payload = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Utilisateur non connecté.');
  const token = await user.getIdToken();
  const response = await fetch('/api/bills/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (result.confirmationRequired) return result;
  if (!response.ok || !result.success) throw new Error(result.error || 'Opération impossible.');
  return result;
}

export function createBill(payload) {
  return postBillAction('create', payload);
}

export function updateBill(billId, payload) {
  return postBillAction('update', { ...payload, billId });
}

export function deactivateBill(billId) {
  return postBillAction('delete', { billId });
}

export function payBill(payload) {
  return postBillAction('pay', payload);
}
