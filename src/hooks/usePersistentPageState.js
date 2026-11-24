'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getPageStateStorageKey, readPageState, writePageState } from '@/lib/ui/pageStateStorage.mjs';

/**
 * Persists small UI choices and drafts locally, scoped to the signed-in user.
 * Do not use it for Firestore records, authentication tokens, or loading flags.
 */
export function usePersistentPageState(page, field, initialValue, userId, options = {}) {
  const initialRef = useRef(initialValue);
  initialRef.current = initialValue;
  const skipRestore = options.skipRestore === true;
  const storageKey = getPageStateStorageKey(userId, page, field);
  const [entry, setEntry] = useState({ key: '', value: initialValue });
  const [hydratedKey, setHydratedKey] = useState('');

  useEffect(() => {
    const restored = skipRestore
      ? initialRef.current
      : readPageState(typeof window === 'undefined' ? null : window.localStorage, storageKey, initialRef.current);
    setEntry({ key: storageKey, value: restored });
    setHydratedKey(storageKey);
  }, [storageKey, skipRestore]);

  useEffect(() => {
    if (hydratedKey !== storageKey || entry.key !== storageKey) return;
    if (typeof window !== 'undefined') {
      writePageState(window.localStorage, storageKey, entry.value);
    }
  }, [entry, hydratedKey, storageKey]);

  const setValue = useCallback((nextValue) => {
    setEntry((current) => {
      const currentValue = current.key === storageKey ? current.value : initialRef.current;
      const value = typeof nextValue === 'function' ? nextValue(currentValue) : nextValue;
      return { key: storageKey, value };
    });
  }, [storageKey]);

  return [entry.key === storageKey ? entry.value : initialRef.current, setValue, hydratedKey === storageKey];
}
