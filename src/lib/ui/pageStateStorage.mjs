export const PAGE_STATE_STORAGE_VERSION = 1;

export function getPageStateStorageKey(userId, page, field) {
  const scope = String(userId || 'guest').trim() || 'guest';
  const pageKey = String(page || '').trim();
  const fieldKey = String(field || '').trim();
  if (!pageKey || !fieldKey) throw new Error('A page and field are required to persist UI state.');
  return ['pata', 'page-state', 'v' + PAGE_STATE_STORAGE_VERSION, encodeURIComponent(scope), encodeURIComponent(pageKey), encodeURIComponent(fieldKey)].join(':');
}

export function getSafePageStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
}

function hasExpectedShape(value, fallback) {
  if (fallback === null) return value === null || (typeof value === 'object' && !Array.isArray(value));
  if (Array.isArray(fallback)) return Array.isArray(value);
  if (fallback && typeof fallback === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  if (typeof fallback === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === typeof fallback;
}

export function readPageState(storage, key, fallback) {
  if (!storage || !key) return fallback;
  try {
    const raw = storage.getItem(key);
    if (raw == null || raw.length > 200_000) return fallback;
    const value = JSON.parse(raw);
    return hasExpectedShape(value, fallback) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function writePageState(storage, key, value) {
  if (!storage || !key) return false;
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== 'string' || serialized.length > 200_000) return false;
    storage.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}
