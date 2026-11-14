import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = String(process.env.PATA_E2E_BASE_URL || 'https://www.pata-yam.site').replace(/\/+$/, '');
const ID_TOKEN = String(process.env.PATA_E2E_ID_TOKEN || '').trim();
const INCOME_ID = String(process.env.PATA_E2E_INCOME_ID || '').trim();
const ADMIN_COOKIE = String(process.env.PATA_E2E_ADMIN_COOKIE || '').trim();

function buildHeaders({ token = '', cookie = '' } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (cookie) headers.Cookie = cookie;
  return headers;
}

async function getJson(path, credentials = {}) {
  const response = await fetch(BASE_URL + path, {
    method: 'GET',
    headers: buildHeaders(credentials),
    signal: AbortSignal.timeout(20_000),
    redirect: 'follow',
    cache: 'no-store',
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { /* réponse non JSON */ }
  return { response, body };
}

test('les routes sensibles refusent une requête sans jeton Firebase', async () => {
  const checks = [
    '/api/incomes/expenses?incomeId=pata-e2e-auth-check',
    '/api/admin/overview',
    '/api/admin/users?limit=5',
  ];
  for (const path of checks) {
    const { response, body } = await getJson(path);
    assert.equal(response.status, 401, 'La route ' + path + ' doit refuser une requête sans authentification.');
    assert.equal(body?.success, false, 'La réponse doit provenir de l’API Pata, pas d’une page HTML de protection externe.');
    assert.ok(typeof body?.error === 'string' && body.error.length > 0, 'L’API doit expliquer le refus d’authentification.');
  }
});

test('le résumé des dépenses liées à un revenu utilise les vraies données et pagine à 50 éléments au maximum', {
  skip: !ID_TOKEN || !INCOME_ID ? 'Définir PATA_E2E_ID_TOKEN et PATA_E2E_INCOME_ID pour tester un revenu appartenant au compte de test.' : false,
}, async () => {
  const path = '/api/incomes/expenses?incomeId=' + encodeURIComponent(INCOME_ID);
  const first = await getJson(path, { token: ID_TOKEN });
  assert.equal(first.response.status, 200, 'Le résumé des dépenses doit répondre 200.');
  assert.equal(first.body?.success, true, 'Le résumé des dépenses doit être confirmé.');
  assert.ok(Number.isFinite(first.body.totalSpent), 'Le total dépensé doit être numérique.');
  assert.ok(Number.isInteger(first.body.expenseCount) && first.body.expenseCount >= 0, 'Le nombre de dépenses doit être un entier positif ou nul.');
  assert.ok(Array.isArray(first.body.expenses), 'La première page doit contenir un tableau de dépenses.');
  assert.ok(first.body.expenses.length <= 50, 'Une page ne doit jamais retourner plus de 50 dépenses.');
  assert.equal(typeof first.body.hasMore, 'boolean', 'Le serveur doit préciser si une autre page existe.');

  const ids = new Set(first.body.expenses.map((item) => item.id));
  for (const item of first.body.expenses) {
    assert.ok(item && typeof item.id === 'string' && item.id.length > 0, 'Chaque dépense doit posséder un identifiant.');
    assert.ok(Number.isFinite(Number(item.amount)), 'Chaque dépense doit avoir un montant lisible.');
  }

  if (first.body.hasMore) {
    assert.ok(typeof first.body.nextCursor === 'string' && first.body.nextCursor.length > 0, 'La pagination doit fournir un curseur.');
    const second = await getJson(path + '&cursor=' + encodeURIComponent(first.body.nextCursor), { token: ID_TOKEN });
    assert.equal(second.response.status, 200, 'La page suivante doit répondre 200.');
    assert.equal(second.body?.success, true, 'La page suivante doit être confirmée.');
    assert.ok(Array.isArray(second.body.expenses) && second.body.expenses.length <= 50, 'La page suivante doit être limitée à 50 opérations.');
    for (const item of second.body.expenses) {
      assert.ok(!ids.has(item.id), 'La pagination ne doit pas répéter une dépense déjà affichée.');
    }
  }
});

test('le tableau administrateur lit les agrégats et la liste de comptes sans modifier les données', {
  skip: !ID_TOKEN || !ADMIN_COOKIE ? 'Définir PATA_E2E_ID_TOKEN et PATA_E2E_ADMIN_COOKIE depuis un compte administrateur de test.' : false,
}, async () => {
  assert.ok(ADMIN_COOKIE.startsWith('pata_admin_session='), 'PATA_E2E_ADMIN_COOKIE doit contenir le cookie complet pata_admin_session=…');

  const overview = await getJson('/api/admin/overview', { token: ID_TOKEN, cookie: ADMIN_COOKIE });
  assert.equal(overview.response.status, 200, 'La vue générale admin doit répondre 200.');
  assert.equal(overview.body?.success, true, 'La vue générale admin doit être confirmée.');
  assert.ok(overview.body.stats && typeof overview.body.stats === 'object', 'Les agrégats administrateur doivent être présents.');
  for (const key of ['totalUsers', 'androidUsers', 'webUsers', 'webOnlyUsers', 'unclassifiedPlatformUsers', 'androidDownloadClicks', 'androidDownloadClients']) {
    assert.ok(Object.prototype.hasOwnProperty.call(overview.body.stats, key), 'Statistique administrateur manquante : ' + key);
  }

  const users = await getJson('/api/admin/users?limit=5&platform=all', { token: ID_TOKEN, cookie: ADMIN_COOKIE });
  assert.equal(users.response.status, 200, 'La liste administrateur doit répondre 200.');
  assert.equal(users.body?.success, true, 'La liste administrateur doit être confirmée.');
  assert.ok(Array.isArray(users.body.users), 'La liste des comptes doit être un tableau.');
  assert.ok(users.body.users.length <= 5, 'La liste doit respecter la limite demandée.');
});
