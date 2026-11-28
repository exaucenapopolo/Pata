import test from 'node:test';
import assert from 'node:assert/strict';
import { getMoneyKeypadScrollOffset } from '../src/lib/finance/moneyKeypadScroll.mjs';

test('returns a positive offset only when a field would be covered by the legacy keypad', () => {
  assert.equal(getMoneyKeypadScrollOffset({ bottom: 720 }, { top: 430 }, 16), 306);
  assert.equal(getMoneyKeypadScrollOffset({ bottom: 390 }, { top: 430 }, 16), 0);
});

test('handles missing layout measurements without moving the page', () => {
  assert.equal(getMoneyKeypadScrollOffset(null, { top: 430 }), 0);
  assert.equal(getMoneyKeypadScrollOffset({ bottom: 700 }, null), 0);
});

test('uses a safe non-negative spacing value', () => {
  assert.equal(getMoneyKeypadScrollOffset({ bottom: 500 }, { top: 480 }, -10), 20);
});

test('the amount-entry experience uses the native keyboard and an optional calculator overlay', async () => {
  const fs = await import('node:fs');
  const page = fs.readFileSync('src/app/(app)/expenses/page.js', 'utf8');
  const calculator = fs.readFileSync('src/components/finance/CalculatorPanel.jsx', 'utf8');

  assert.match(page, /import \{ CalculatorLauncher \} from '@\/components\/finance\/CalculatorPanel'/);
  assert.match(page, /<CalculatorLauncher value=\{form\.amount\} onApply=/);
  assert.match(calculator, /role="dialog" aria-modal="true" aria-label="Calculatrice"/);
  assert.match(calculator, /onApply\?\.\(result\)/);
  assert.match(calculator, /setOpen\(false\)/);
  assert.doesNotMatch(page, /MoneyKeypad\.jsx/);
});
