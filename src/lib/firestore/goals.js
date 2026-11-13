import {
  collection, doc, limit, onSnapshot, query, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { auth } from '@/lib/firebase/client';

const col = (uid) => collection(db, 'users', uid, 'goals');
const depositsCol = (uid, gid) => collection(db, 'users', uid, 'goals', gid, 'deposits');

export function subscribeGoals(uid, cb) {
  const q = query(col(uid), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export function subscribeDeposits(uid, goalId, cb) {
  const q = query(depositsCol(uid, goalId), orderBy('date', 'desc'), limit(100));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function createGoal(uid, data) {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error('Session expirée. Reconnecte-toi puis réessaie.');
  const token = await user.getIdToken();
  const response = await fetch('/api/goals/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de créer cette épargne.');
  return { id: result.id };
}

async function postGoalUpdate(uid, payload) {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error('Session expirée. Reconnecte-toi puis réessaie.');
  const token = await user.getIdToken();
  const response = await fetch('/api/goals/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de modifier cet objectif.');
  return result;
}

export async function updateGoal(uid, id, patch) {
  return postGoalUpdate(uid, { goalId: id, ...patch });
}

export async function toggleGoalPin(uid, id, currentStatus) {
  return postGoalUpdate(uid, { goalId: id, pinned: !currentStatus });
}

export async function deleteGoal(uid, id) {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error('Session expirée. Reconnecte-toi puis réessaie.');
  const token = await user.getIdToken();
  const response = await fetch('/api/goals/delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ goalId: id }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de supprimer cette épargne.');
}
