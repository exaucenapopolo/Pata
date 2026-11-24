export function getPageScrollStorageKey(userId, pathname) {
  const scope = String(userId || 'guest').trim() || 'guest';
  const path = String(pathname || '/dashboard');
  return 'pata:page-scroll:v1:' + encodeURIComponent(scope) + ':' + encodeURIComponent(path);
}

export function readPageScrollPosition(storage, key) {
  const fallback = { windowY: 0, mainY: 0 };
  try {
    const raw = storage?.getItem(key);
    if (raw == null) return fallback;
    const value = JSON.parse(raw);
    return {
      windowY: Number.isFinite(Number(value?.windowY)) ? Math.max(0, Number(value.windowY)) : 0,
      mainY: Number.isFinite(Number(value?.mainY)) ? Math.max(0, Number(value.mainY)) : 0,
    };
  } catch {
    return fallback;
  }
}

export function writePageScrollPosition(storage, key, position) {
  try {
    storage?.setItem(key, JSON.stringify({
      windowY: Math.max(0, Number(position?.windowY) || 0),
      mainY: Math.max(0, Number(position?.mainY) || 0),
    }));
    return true;
  } catch {
    return false;
  }
}
