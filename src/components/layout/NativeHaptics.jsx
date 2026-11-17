'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  '[role="button"]',
  '[role="switch"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
].join(',');

/**
 * Small native feedback for deliberate controls only.
 * Text fields, text selection, typing and form input events never vibrate.
 */
export function NativeHaptics() {
  useEffect(() => {
    let isAndroidApp = false;
    try {
      isAndroidApp = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    } catch {
      isAndroidApp = false;
    }

    if (!isAndroidApp || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
      return undefined;
    }

    const handleAction = (event) => {
      const target = event.target;
      const control = target?.closest?.(INTERACTIVE_SELECTOR);
      if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') return;
      if (control.closest('[data-haptics="off"]') || control.hasAttribute('data-pata-no-haptic')) return;

      try {
        navigator.vibrate(10);
      } catch {
        // Feedback is optional; a device without vibration remains fully usable.
      }
    };

    document.addEventListener('click', handleAction, true);
    return () => document.removeEventListener('click', handleAction, true);
  }, []);

  return null;
}
