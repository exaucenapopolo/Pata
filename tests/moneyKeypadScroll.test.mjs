import test from 'node:test';
import assert from 'node:assert/strict';
import { getMoneyKeypadScrollOffset } from '../src/lib/finance/moneyKeypadScroll.mjs';

test('scrolls the active amount field just above the custom keypad', () => {
  assert.equal(
    getMoneyKeypadScrollOffset({ bottom: 720 }, { top: 430 }, 16),
    306,
  );
});

test('does not scroll when the amount field is already above the keypad', () => {
  assert.equal(
    getMoneyKeypadScrollOffset({ bottom: 390 }, { top: 430 }, 16),
    0,
  );
});

test('handles missing layout measurements without moving the page', () => {
  assert.equal(getMoneyKeypadScrollOffset(null, { top: 430 }), 0);
  assert.equal(getMoneyKeypadScrollOffset({ bottom: 700 }, null), 0);
});

test('uses a safe non-negative spacing between the input and keypad', () => {
  assert.equal(
    getMoneyKeypadScrollOffset({ bottom: 500 }, { top: 480 }, -10),
    20,
  );
});
