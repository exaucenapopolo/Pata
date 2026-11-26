/**
 * Writes a value into a controlled React input and emits the native events
 * React listens to. Resetting React's value tracker before dispatch ensures
 * the synthetic onChange handler is not skipped after a programmatic write.
 */
export function writeMoneyInputValue(input, value) {
  if (!input) return false;

  const previousValue = String(input.value ?? '');
  const nextValue = String(value ?? '');
  if (previousValue === nextValue) return false;

  const view = input.ownerDocument?.defaultView;
  const prototype = view?.HTMLInputElement?.prototype;
  const nativeSetter = prototype
    ? Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    : null;

  if (nativeSetter) nativeSetter.call(input, nextValue);
  else input.value = nextValue;

  // React attaches this tracker to controlled inputs. Keep its old value so
  // the following input event is recognized as a real value change.
  input._valueTracker?.setValue?.(previousValue);

  const InputEventConstructor = view?.InputEvent;
  const EventConstructor = view?.Event || globalThis.Event;
  const inputEvent = typeof InputEventConstructor === 'function'
    ? new InputEventConstructor('input', {
      bubbles: true,
      composed: true,
      inputType: 'insertReplacementText',
      data: nextValue,
    })
    : new EventConstructor('input', { bubbles: true, composed: true });

  input.dispatchEvent(inputEvent);
  input.dispatchEvent(new EventConstructor('change', { bubbles: true, composed: true }));
  return true;
}
