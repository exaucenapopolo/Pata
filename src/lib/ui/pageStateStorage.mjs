export const PAGE_STATE_STORAGE_VERSION = 1;

export function getPageStateStorageKey(userId, page, field) {
  const scope = String(userId || 'guest').trim() || 'guest';
  const pageKey = String(page || '').trim();
  const fieldKey = String(field || '').trim();
  if (!pageKey || !fieldKey) throw new Error('A page and field are required to persist UI state.');
  return [
    'pata',
    'page-state',
    'v' + PAGE_STATE_STORAGE_VERSION,
    encodeURIComponent(scope),
    encodeURIComponent(pageKey),
    encodeURIComponent(fieldKey),
  ].join(':');
}

export function readPageState(storage, key, fallback) {
  if (!storage || !key) return fallback;
  try {
    const raw = storage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writePageState(storage, key, value) {
  if (!storage || !key) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
