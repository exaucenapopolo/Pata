import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('la file hors connexion repose sur IndexedDB et garde un espace séparé par utilisateur', () => {
  const queue = read('src/lib/quickCapture/offlineQueue.mjs');
  assert.match(queue, /indexedDB\.open\(DB_NAME, DB_VERSION\)/);
  assert.match(queue, /createObjectStore\(STORE_NAME, \{ keyPath: 'id' \}\)/);
  assert.match(queue, /createIndex\('uid', 'uid', \{ unique: false \}\)/);
  assert.match(queue, /createIndex\('capturedAt', 'capturedAt', \{ unique: false \}\)/);
  assert.match(queue, /nativeCaptureId/);
  assert.match(queue, /capturedAt/);
  assert.match(queue, /idempotencyKey/);
});

test('une saisie locale est considérée enregistrée seulement après validation de la transaction IndexedDB', () => {
  const queue = read('src/lib/quickCapture/offlineQueue.mjs');
  const transactionStart = queue.indexOf("const transaction = database.transaction(STORE_NAME, 'readwrite')");
  const completeHandler = queue.indexOf('transaction.oncomplete = resolve', transactionStart);
  const putRequest = queue.indexOf("objectStore(STORE_NAME).put(record)", transactionStart);
  const awaitCommit = queue.indexOf('await committed', transactionStart);
  assert.ok(transactionStart >= 0);
  assert.ok(completeHandler > transactionStart && completeHandler < putRequest);
  assert.ok(putRequest < awaitCommit);
});

test('les saisies en attente sont triées chronologiquement et supprimables après synchronisation', () => {
  const queue = read('src/lib/quickCapture/offlineQueue.mjs');
  assert.match(queue, /index\('uid'\)\.getAll\(String\(uid\)\)/);
  assert.ok(queue.includes('String(a.capturedAt).localeCompare(String(b.capturedAt))'));
  assert.match(queue, /objectStore\(STORE_NAME\)\.delete\(String\(id\)\)/);
});

test('Quick Capture sauvegarde hors réseau, reprend au retour de la connexion et conserve la date', () => {
  const coordinator = read('src/components/QuickCaptureCoordinator.jsx');
  assert.match(coordinator, /if \(typeof navigator !== 'undefined' && !navigator\.onLine\)/);
  assert.match(coordinator, /enqueueOfflineCapture\(/);
  assert.match(coordinator, /capturedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(coordinator, /window\.addEventListener\('online'/);
  assert.match(coordinator, /document\.addEventListener\('visibilitychange'/);
  assert.match(coordinator, /listOfflineCaptures\(user\.uid\)/);
  assert.match(coordinator, /restoreOfflineCaptureDraft\(item/);
  assert.match(coordinator, /origin === 'offline'/);
  assert.match(coordinator, /removeOfflineCapture\(draft\.id\)/);
});

test('une opération en attente garde sa date et son identifiant lors de la reprise', () => {
  const coordinator = read('src/components/QuickCaptureCoordinator.jsx');
  assert.match(coordinator, /date: String\(payload\.date \|\| item\?\.capturedAt/);
  assert.match(coordinator, /idempotencyKey: draft\.id/);
});
