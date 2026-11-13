import {
  collection, updateDoc, deleteDoc, doc,
  onSnapshot, query, where, limit, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { auth } from '@/lib/firebase/client';

const col = (uid) => collection(db, 'users', uid, 'budgets');

export function subscribeBudgets(uid, month, cb, incomeSourceId = null) {
  let constraints = [where('month', '==', month)];
  if (incomeSourceId) {
    constraints.push(where('incomeSourceId', '==', incomeSourceId));
  }
  
  const q = query(col(uid), ...constraints);
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function upsertBudget(uid, { categoryId, amount, month, incomeSourceId = 'all' }) {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error('Session expirée. Reconnecte-toi puis réessaie.');
  const token = await user.getIdToken();
  const response = await fetch('/api/budgets/upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ categoryId, amount: Number(amount), month, incomeSourceId }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'Impossible d’enregistrer ce budget.');
  return result.id;
}

export async function deleteBudget(uid, id) {
  await deleteDoc(doc(db, 'users', uid, 'budgets', id));
}

export function subscribeAllBudgets(uid, cb) {
  const q = query(col(uid), orderBy('month', 'desc'), limit(150));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}


async function requestBudgetTemplates(method = 'GET', body = null) {
  const user = auth.currentUser;
  if (!user) throw new Error('Session expirée. Reconnecte-toi puis réessaie.');
  const token = await user.getIdToken();
  const response = await fetch('/api/budgets/templates', {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de gérer les modèles de budget.');
  return result;
}

export async function getBudgetTemplates() {
  const result = await requestBudgetTemplates('GET');
  return Array.isArray(result.templates) ? result.templates : [];
}

export async function saveBudgetTemplate(name, items, templateId = null) {
  const result = await requestBudgetTemplates('POST', { name, items, ...(templateId ? { templateId } : {}) });
  return result.id;
}

export async function applyBudgetTemplate(templateId, month, incomeSourceId = 'all') {
  return requestBudgetTemplates('POST', { action: 'apply', templateId, month, incomeSourceId });
}

export async function removeBudgetTemplate(templateId) {
  await requestBudgetTemplates('DELETE', { templateId });
}

export async function setBudgetPinned(uid, id, pinned) {
  const user = auth.currentUser;
  if (!user || !user.uid || !id) throw new Error('Session expirée. Reconnecte-toi puis réessaie.');
  const token = await user.getIdToken();
  const response = await fetch('/api/budgets/pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ budgetId: id, pinned: pinned === true }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de modifier cet épinglage.');
  return result.isPinned === true;
}
