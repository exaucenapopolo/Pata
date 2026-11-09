import {
  collection, deleteDoc, doc,
  onSnapshot, query, orderBy,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';

const col = (uid) => collection(db, 'users', uid, 'incomes');

export function subscribeIncomes(uid, cb) {
  const q = query(col(uid), orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function createIncome(uid, data) {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error('Session expirée. Reconnecte-toi puis réessaie.');
  const token = await user.getIdToken();
  const response = await fetch('/api/incomes/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'Impossible d’enregistrer ce revenu.');
  return { id: result.id };
}

export async function deleteIncome(uid, id) {
  await deleteDoc(doc(db, 'users', uid, 'incomes', id));
    }

export async function updateIncome(uid, id, data) {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error('Session expirée. Reconnecte-toi puis réessaie.');
  if (!id) throw new Error('Identifiant de revenu manquant.');
  const token = await user.getIdToken();
  const response = await fetch('/api/incomes/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ ...data, incomeId: id }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de modifier ce revenu.');
  return { id: result.id || id };
}
