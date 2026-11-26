import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  hideNativeMoneyKeyboard,
  restoreNativeMoneyKeyboard,
} from '../src/lib/finance/moneyInputKeyboard.mjs';
import { writeMoneyInputValue } from '../src/lib/finance/moneyInputValue.mjs';

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


test('the multiple-expense form gives Android amounts to the custom keypad and avoids nested scrolling', () => {
  const page = fs.readFileSync('src/app/(app)/expenses/page.js', 'utf8');
  const start = page.indexOf('<Modal open={batchModalOpen}');
  const end = page.indexOf('<Modal open={bulkSourceOpen}', start);
  assert.ok(start >= 0 && end > start);
  const batchModal = page.slice(start, end);
  assert.match(batchModal, /type="text" inputMode="numeric" data-pata-money="true"/);
  assert.doesNotMatch(batchModal, /type="number"[^>]*inputMode="numeric"/);
  assert.doesNotMatch(batchModal, /max-h-\[55vh\].*overflow-y-auto/);
  const keypad = fs.readFileSync('src/components/layout/MoneyKeypad.jsx', 'utf8');
  assert.match(keypad, /input\.dataset\.pataMoney === 'true'/);
  assert.match(keypad, /host\.scrollBy\(\{ top: scrollOffset, behavior: 'auto' \}\)/);
});

test('keeps keypad taps clickable and routes each key into the expression state', () => {
  const component = fs.readFileSync('src/components/layout/MoneyKeypad.jsx', 'utf8');
  const pointerHandler = component.match(/const handlePointerDown = \(event\) => \{([\s\S]*?)\n    \};/);

  assert.ok(pointerHandler, 'Android pointer handler must exist');
  assert.doesNotMatch(pointerHandler[1], /preventDefault\(/);
  assert.match(component, /onClick=\{\(\) => appendKey\(key\.action \|\| key\.label\)\}/);
  assert.match(component, /setExpression\(\(current\) => applyMoneyKey\(current, key\)\)/);
});

test('writes calculator values into the real controlled field and forces React to observe the change', () => {
  let currentValue = '';
  const trackerValues = [];
  const events = [];
  function FakeHTMLInputElement() {}
  Object.defineProperty(FakeHTMLInputElement.prototype, 'value', {
    get() { return currentValue; },
    set(value) { currentValue = String(value); },
  });
  class FakeEvent {
    constructor(type, options = {}) { this.type = type; this.options = options; }
  }
  class FakeInputEvent extends FakeEvent {}
  const input = Object.create(FakeHTMLInputElement.prototype);
  input.ownerDocument = { defaultView: { HTMLInputElement: FakeHTMLInputElement, InputEvent: FakeInputEvent, Event: FakeEvent } };
  input._valueTracker = { setValue(value) { trackerValues.push(value); } };
  input.dispatchEvent = (event) => { events.push(event); return true; };

  assert.equal(writeMoneyInputValue(input, '12500'), true);
  assert.equal(input.value, '12500');
  assert.deepEqual(trackerValues, ['']);
  assert.deepEqual(events.map((event) => event.type), ['input', 'change']);
  assert.equal(events[0].options.bubbles, true);
  assert.equal(events[0].options.composed, true);
  assert.equal(writeMoneyInputValue(input, '12500'), false);
  assert.equal(events.length, 2);
});

test('temporarily unlocks the active read-only field while synchronizing its controlled value', () => {
  let currentValue = '';
  let readOnlyDuringInput = null;
  function FakeHTMLInputElement() {}
  Object.defineProperty(FakeHTMLInputElement.prototype, 'value', {
    get() { return currentValue; },
    set(value) { currentValue = String(value); },
  });
  class FakeEvent {
    constructor(type, options = {}) { this.type = type; this.options = options; }
  }
  class FakeInputEvent extends FakeEvent {}
  const input = Object.create(FakeHTMLInputElement.prototype);
  input.readOnly = true;
  input.ownerDocument = { defaultView: { HTMLInputElement: FakeHTMLInputElement, InputEvent: FakeInputEvent, Event: FakeEvent } };
  input._valueTracker = { setValue() {} };
  input.dispatchEvent = (event) => {
    if (event.type === 'input') readOnlyDuringInput = input.readOnly;
    return true;
  };

  assert.equal(writeMoneyInputValue(input, '25000'), true);
  assert.equal(currentValue, '25000');
  assert.equal(readOnlyDuringInput, false);
  assert.equal(input.readOnly, true);
});

test('les champs de montant des pages Budget et Revenus sont reliés à la calculatrice, sans traiter les pourcentages comme des montants', () => {
  const budgets = fs.readFileSync('src/app/(app)/budgets/page.js', 'utf8');
  const income = fs.readFileSync('src/app/(app)/income/page.js', 'utf8');

  assert.match(budgets, /data-pata-money="true"/);
  assert.match(budgets, /data-pata-money=\{item\.calculationType === 'amount' \? 'true' : 'false'\}/);
  assert.match(income, /label="Montant \(FCFA\)" type="number" data-pata-money="true"/);
  assert.match(income, /label="Revenu de référence \(FCFA\)"[\s\S]{0,100}data-pata-money="true"/);
  assert.match(income, /data-pata-money=\{value\.calculationType === 'percentage' \? 'false' : 'true'\}/);
});
