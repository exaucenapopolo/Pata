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
  const pendingModeRef = useRef(null);
  const [promptValue, setPromptValue] = useState('');

  const settle = useCallback((value) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    pendingModeRef.current = null;
    setOptions(null);
    setPromptValue('');
    resolve?.(value);
  }, []);

  const request = useCallback((nextOptions) => new Promise((resolve) => {
    if (resolverRef.current) resolverRef.current(pendingModeRef.current === 'prompt' ? null : false);
    resolverRef.current = resolve;
    pendingModeRef.current = nextOptions?.mode || null;
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

  const appPrompt = useCallback((message, defaultValue = '', config = {}) => {
    setPromptValue(String(defaultValue ?? ''));
    return request({
      mode: 'prompt',
      kind: config.kind || 'info',
      title: config.title || 'Saisir une information',
      message,
      confirmLabel: config.confirmLabel || 'Valider',
      cancelLabel: config.cancelLabel || 'Annuler',
      promptPlaceholder: config.placeholder || '',
      promptMultiline: config.multiline === true,
    });
  }, [request]);

  const dialog = (
    <AppDialog
      open={!!options}
      kind={options?.kind || 'info'}
      title={options?.title || 'Pata'}
      message={options?.message || ''}
      confirmLabel={options?.confirmLabel || 'Compris'}
      cancelLabel={options?.cancelLabel || 'Annuler'}
      showCancel={options?.mode !== 'alert'}
      prompt={options?.mode === 'prompt'}
      promptValue={promptValue}
      onPromptChange={setPromptValue}
      promptPlaceholder={options?.promptPlaceholder || ''}
      promptMultiline={options?.promptMultiline === true}
      onClose={() => settle(options?.mode === 'prompt' ? null : false)}
      onConfirm={() => settle(options?.mode === 'prompt' ? promptValue : true)}
    />
  );

  return { appConfirm, appAlert, appPrompt, dialog };
}
