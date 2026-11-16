const DB_NAME = 'pata-offline-operations';
const STORE_NAME = 'operations';
const DB_VERSION = 1;

function openQueueDatabase() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Le stockage hors connexion n’est pas disponible sur cet appareil.'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('uid', 'uid', { unique: false });
        store.createIndex('capturedAt', 'capturedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Impossible d’ouvrir la file hors connexion.'));
    request.onblocked = () => reject(new Error('La file hors connexion est utilisée par un autre onglet.'));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Échec du stockage hors connexion.'));
  });
}

export async function enqueueOfflineCapture({ uid, payload, nativeCaptureId = '', sharedImageData = '', capturedAt = new Date().toISOString() }) {
  if (!uid || !payload || !payload.idempotencyKey) {
    throw new Error('Compte ou identifiant de saisie manquant pour la sauvegarde hors connexion.');
  }
  const database = await openQueueDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const committed = new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('La saisie n’a pas été conservée sur cet appareil.'));
      transaction.onabort = () => reject(transaction.error || new Error('La sauvegarde locale a été interrompue.'));
    });
    const record = {
      id: String(payload.idempotencyKey),
      uid: String(uid),
      payload,
      nativeCaptureId: String(nativeCaptureId || ''),
      sharedImageData: String(sharedImageData || ''),
      capturedAt,
      attempts: 0,
    };
    await requestResult(transaction.objectStore(STORE_NAME).put(record));
    await committed;
    return record;
  } finally {
    database.close();
  }
}

export async function listOfflineCaptures(uid) {
  if (!uid) return [];
  const database = await openQueueDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).index('uid').getAll(String(uid));
    const rows = await requestResult(request);
    return (Array.isArray(rows) ? rows : []).sort((a, b) => String(a.capturedAt).localeCompare(String(b.capturedAt)));
  } finally {
    database.close();
  }
}

export async function removeOfflineCapture(id) {
  if (!id) return;
  const database = await openQueueDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(String(id));
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Impossible de retirer une saisie synchronisée.'));
      transaction.onabort = () => reject(transaction.error || new Error('La suppression locale a été interrompue.'));
    });
  } finally {
    database.close();
  }
}
