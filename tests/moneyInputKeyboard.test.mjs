import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  hideNativeMoneyKeyboard,
  restoreNativeMoneyKeyboard,
} from '../src/lib/finance/moneyInputKeyboard.mjs';

function createInput({ readOnly = false, inputMode = null } = {}) {
  const attributes = new Map();
  if (inputMode != null) attributes.set('inputmode', inputMode);
  return {
    readOnly,
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
  };
}

test('hides the native keyboard but keeps the original field settings for restoration', () => {
  const input = createInput({ inputMode: 'decimal' });
  const original = hideNativeMoneyKeyboard(input);

  assert.equal(input.readOnly, true);
  assert.equal(input.getAttribute('inputmode'), 'none');
  assert.deepEqual(original, { readOnly: false, inputMode: 'decimal' });

  restoreNativeMoneyKeyboard(input, original);
  assert.equal(input.readOnly, false);
  assert.equal(input.getAttribute('inputmode'), 'decimal');
});

test('restores a field that had no explicit inputmode attribute', () => {
  const input = createInput();
  const original = hideNativeMoneyKeyboard(input);

  restoreNativeMoneyKeyboard(input, original);
  assert.equal(input.readOnly, false);
  assert.equal(input.getAttribute('inputmode'), null);
});

test('preserves fields that were already read-only', () => {
  const input = createInput({ readOnly: true, inputMode: 'numeric' });
  const original = hideNativeMoneyKeyboard(input);

  restoreNativeMoneyKeyboard(input, original);
  assert.equal(input.readOnly, true);
  assert.equal(input.getAttribute('inputmode'), 'numeric');
});

test('keeps keypad taps clickable and routes each key into the expression state', () => {
  const component = fs.readFileSync('src/components/layout/MoneyKeypad.jsx', 'utf8');
  const pointerHandler = component.match(/const handlePointerDown = \(event\) => \{([\s\S]*?)\n    \};/);

  assert.ok(pointerHandler, 'Android pointer handler must exist');
  assert.doesNotMatch(pointerHandler[1], /preventDefault\(/);
  assert.match(component, /onClick=\{\(\) => appendKey\(key\.action \|\| key\.label\)\}/);
  assert.match(component, /setExpression\(\(current\) => applyMoneyKey\(current, key\)\)/);
});
