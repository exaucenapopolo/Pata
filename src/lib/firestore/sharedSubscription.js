'use client';

import { onSnapshot } from 'firebase/firestore';

// Partage les mêmes listeners Firestore entre les composants et les pages.
// Un listener reste vivant quelques minutes après le dernier désabonnement :
// revenir rapidement sur une page réutilise les données déjà chargées au lieu
// de relancer une lecture complète de la même requête.
const subscriptions = new Map();
const DEFAULT_KEEP_ALIVE_MS = 5 * 60 * 1000;

function safelyNotify(callback, value) {
  try {
    callback(value);
  } catch (error) {
    console.error('[PATA FIRESTORE SHARED SUBSCRIPTION]', error);
  }
}

export function subscribeSharedSnapshot(key, queryOrReference, callback, onError, options = {}) {
  if (!key || typeof callback !== 'function') return () => {};

  const cacheKey = String(key);
  let entry = subscriptions.get(cacheKey);

  if (!entry) {
    entry = {
      listeners: new Set(),
      unsubscribe: null,
      timer: null,
      hasValue: false,
      value: undefined,
      error: null,
    };
    subscriptions.set(cacheKey, entry);
  }

  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }

  const listener = { callback, onError };
  entry.listeners.add(listener);

  // Réutilise immédiatement le dernier résultat pendant la navigation.
  if (entry.hasValue) safelyNotify(callback, entry.value);
  if (entry.error && typeof onError === 'function') onError(entry.error);

  if (!entry.unsubscribe) {
    try {
      entry.unsubscribe = onSnapshot(queryOrReference, (snapshot) => {
        entry.value = snapshot;
        entry.hasValue = true;
        entry.error = null;
        entry.listeners.forEach((current) => safelyNotify(current.callback, snapshot));
      }, (error) => {
        entry.error = error;
        const detail = String(error?.message || error || '');
        if (error?.code === 'failed-precondition' || /requires an index|index is currently building/i.test(detail)) {
          const match = detail.match(/https:\/\/console\.firebase\.google\.com\/[^\s"'<>]+/i);
          console.error('[PATA FIRESTORE INDEX REQUIRED]', {
            queryKey: cacheKey,
            directLink: match?.[0]?.replace(/[),.;]+$/, '') || null,
            message: detail.slice(0, 1800),
            manualGuide: 'https://console.firebase.google.com/project/_/firestore/indexes',
          });
        }
        entry.listeners.forEach((current) => {
          if (typeof current.onError === 'function') current.onError(error);
        });
      });
    } catch (error) {
      entry.error = error;
      if (typeof onError === 'function') onError(error);
    }
  }

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    entry.listeners.delete(listener);
    if (entry.listeners.size > 0 || entry.timer) return;

    const keepAliveMs = Number.isFinite(options.keepAliveMs)
      ? Math.max(0, options.keepAliveMs)
      : DEFAULT_KEEP_ALIVE_MS;

    entry.timer = setTimeout(() => {
      entry.timer = null;
      if (entry.listeners.size > 0) return;
      entry.unsubscribe?.();
      entry.unsubscribe = null;
      entry.value = undefined;
      entry.hasValue = false;
      entry.error = null;
      subscriptions.delete(cacheKey);
    }, keepAliveMs);
  };
}

export function clearSharedSubscriptions(prefix = '') {
  const match = String(prefix);
  for (const [key, entry] of subscriptions) {
    if (match && !key.startsWith(match)) continue;
    if (entry.timer) clearTimeout(entry.timer);
    entry.unsubscribe?.();
    subscriptions.delete(key);
  }
}
