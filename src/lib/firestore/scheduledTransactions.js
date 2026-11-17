import { auth } from '@/lib/firebase/client';

async function callScheduledTransactions(method, payload = null) {
  const user = auth.currentUser;
  if (!user) throw new Error('Session expirée. Reconnecte-toi puis réessaie.');
  const token = await user.getIdToken();
  const response = await fetch('/api/scheduled-transactions', {
    method,
    headers: { Authorization: 'Bearer ' + token, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de gérer cette programmation.');
  return result;
}

export async function createScheduledTransaction(uid, data) {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error('Session expirée. Reconnecte-toi puis réessaie.');
  return callScheduledTransactions('POST', data);
}

export async function listScheduledTransactions(uid) {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) return [];
  const token = await user.getIdToken();
  const response = await fetch('/api/scheduled-transactions', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de charger les opérations programmées.');
  return Array.isArray(result.scheduledTransactions) ? result.scheduledTransactions : [];
}

export async function cancelScheduledTransaction(uid, id) {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error('Session expirée. Reconnecte-toi puis réessaie.');
  return callScheduledTransactions('DELETE', { id });
}
