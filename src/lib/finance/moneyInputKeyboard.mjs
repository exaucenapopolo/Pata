/**
 * Temporarily disables the native mobile keyboard for a money field while
 * Pata's custom keypad is active. The original field settings are restored
 * when the custom keypad closes.
 */
export function hideNativeMoneyKeyboard(input) {
  if (!input) return null;
  const originalState = {
    readOnly: Boolean(input.readOnly),
    inputMode: input.getAttribute('inputmode'),
  };
  input.readOnly = true;
  input.setAttribute('inputmode', 'none');
  return originalState;
}

export function restoreNativeMoneyKeyboard(input, originalState) {
  if (!input || !originalState) return;
  input.readOnly = Boolean(originalState.readOnly);
  if (originalState.inputMode == null) input.removeAttribute('inputmode');
  else input.setAttribute('inputmode', originalState.inputMode);
}
