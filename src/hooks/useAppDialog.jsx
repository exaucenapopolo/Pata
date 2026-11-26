'use client';

import { useCallback, useRef, useState } from 'react';
import { AppDialog } from '@/components/ui/AppDialog';

/**
 * Shared Pata dialog controller for confirmations and informative messages.
 * Replaces browser-native alert/confirm popups with an accessible app dialog.
 */
export function useAppDialog() {
  const [options, setOptions] = useState(null);
  const resolverRef = useRef(null);

  const settle = useCallback((value) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOptions(null);
    resolve?.(value);
  }, []);

  const request = useCallback((nextOptions) => new Promise((resolve) => {
    if (resolverRef.current) resolverRef.current(false);
    resolverRef.current = resolve;
    setOptions(nextOptions);
  }), []);

  const appConfirm = useCallback((message, config = {}) => request({
    mode: 'confirm',
    kind: config.kind || 'warning',
    title: config.title || 'Confirmer',
    message,
    confirmLabel: config.confirmLabel || 'Continuer',
    cancelLabel: config.cancelLabel || 'Annuler',
  }), [request]);

  const appAlert = useCallback((message, config = {}) => request({
    mode: 'alert',
    kind: config.kind || 'info',
    title: config.title || 'Pata',
    message,
    confirmLabel: config.confirmLabel || 'Compris',
  }), [request]);

  const dialog = (
    <AppDialog
      open={!!options}
      kind={options?.kind || 'info'}
      title={options?.title || 'Pata'}
      message={options?.message || ''}
      confirmLabel={options?.confirmLabel || 'Compris'}
      cancelLabel={options?.cancelLabel || 'Annuler'}
      showCancel={options?.mode === 'confirm'}
      onClose={() => settle(false)}
      onConfirm={() => settle(true)}
    />
  );

  return { appConfirm, appAlert, dialog };
}
