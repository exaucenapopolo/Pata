import { auth } from '@/lib/firebase/client';

async function businessRequest(path, method = 'GET', payload = null) {
  const user = auth.currentUser;
  if (!user) throw new Error('Session expirée. Reconnecte-toi puis réessaie.');
  const token = await user.getIdToken();
  const response = await fetch(path, {
    method,
    headers: { Authorization: 'Bearer ' + token, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) {
    const error = new Error(result.error || 'Impossible de communiquer avec l’espace entreprise.');
    error.code = result.code || '';
    error.status = response.status;
    throw error;
  }
  return result;
}
const root = '/api/businesses';
function createRequestId(prefix) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now() + '_' + Math.random().toString(36).slice(2);
  return prefix + '_' + random;
}
const businessPath = (id, resource = '') => root + '/' + encodeURIComponent(id) + (resource ? '/' + resource : '');

export async function getBusinesses() {
  const result = await businessRequest(root);
  return { businesses: Array.isArray(result.businesses) ? result.businesses : [], premiumActive: result.premiumActive === true };
}
export async function createBusiness(input) {
  const result = await businessRequest(root, 'POST', input);
  return result.business;
}
export async function getBusinessOverview(id) {
  return businessRequest(businessPath(id, 'overview'));
}
export async function getBusinessTransactions(id, options = {}) {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.type) params.set('type', String(options.type));
  return businessRequest(businessPath(id, 'transactions') + (params.size ? '?' + params.toString() : ''));
}
export async function createBusinessTransaction(id, input) {
  return businessRequest(businessPath(id, 'transactions'), 'POST', {
    ...input,
    requestId: input.requestId || createRequestId('txn'),
  });
}
export async function getBusinessAccounts(id) {
  const result = await businessRequest(businessPath(id, 'accounts'));
  return Array.isArray(result.accounts) ? result.accounts : [];
}
export async function createBusinessAccount(id, input) {
  return businessRequest(businessPath(id, 'accounts'), 'POST', input);
}
export async function transferPersonalIncome(id, input) {
  return businessRequest(businessPath(id, 'transfer/from-personal'), 'POST', {
    ...input,
    requestId: input.requestId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'transfer_' + Date.now() + '_' + Math.random().toString(36).slice(2)),
  });
}
export async function getBusinessResource(id, resource) {
  const result = await businessRequest(businessPath(id, 'resources/' + encodeURIComponent(resource)));
  return Array.isArray(result.items) ? result.items : [];
}
export async function saveBusinessResource(id, resource, input, itemId = '') {
  return businessRequest(businessPath(id, 'resources/' + encodeURIComponent(resource) + (itemId ? '/' + encodeURIComponent(itemId) : '')), itemId ? 'PATCH' : 'POST', input);
}
export async function deleteBusinessResource(id, resource, itemId) {
  return businessRequest(businessPath(id, 'resources/' + encodeURIComponent(resource) + '/' + encodeURIComponent(itemId)), 'DELETE');
}
export async function payBusinessDocument(id, resource, itemId, input) {
  return businessRequest(businessPath(id, 'resources/' + encodeURIComponent(resource) + '/' + encodeURIComponent(itemId) + '/pay'), 'POST', {
    ...input,
    requestId: input.requestId || createRequestId('payment'),
  });
}
