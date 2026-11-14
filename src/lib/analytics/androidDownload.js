'use client';

const STORAGE_KEY = 'pata.android-download-client.v1';

function createRandomId() {
  try {
    if (typeof window !== 'undefined' && window.crypto?.randomUUID) return window.crypto.randomUUID();
  } catch {
    // Utiliser une valeur de secours si le générateur sécurisé est indisponible.
  }
  return 'pata_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function getClientId() {
  const temporaryId = createRandomId();
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && /^[a-zA-Z0-9_-]{16,96}$/.test(saved)) return saved;
    window.localStorage.setItem(STORAGE_KEY, temporaryId);
    return temporaryId;
  } catch {
    // Si le stockage est indisponible, compter le clic sans reconnaissance durable.
    return temporaryId;
  }
}

export function trackAndroidDownloadClick({ version, versionCode, source }) {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;

  const payload = {
    clientId: getClientId(),
    eventId: createRandomId(),
    version: String(version || ''),
    versionCode: Number(versionCode) || 0,
    source: source === 'in_app_update' ? 'in_app_update' : 'download_page',
  };

  try {
    void fetch('/api/android/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: 'same-origin',
    }).catch((error) => {
      console.warn('[PATA ANDROID DOWNLOAD TRACKING]', error?.message || error);
    });
  } catch (error) {
    console.warn('[PATA ANDROID DOWNLOAD TRACKING]', error?.message || error);
  }
}
