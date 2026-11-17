import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMoneyKey, evaluateMoneyExpression } from '../src/lib/finance/decimalExpression.mjs';

test('respects multiplication precedence', () => {
  assert.deepEqual(evaluateMoneyExpression('500 + 250 × 2'), {
    exactValue: '1000', roundedValue: '1000', isRounded: false,
  });
});

test('supports parentheses and nested operations', () => {
  assert.equal(evaluateMoneyExpression('(300 + 200) * 3').roundedValue, '1500');
});

test('evaluates division exactly before rounding to whole CFA francs', () => {
  const result = evaluateMoneyExpression('1000 / 3');
  assert.equal(result.exactValue, '333.333333');
  assert.equal(result.roundedValue, '333');
  assert.equal(result.isRounded, true);
});

test('accepts French decimal commas and Unicode operators', () => {
  assert.equal(evaluateMoneyExpression('10,5 + 1,25').exactValue, '11.75');
  assert.equal(evaluateMoneyExpression('24 ÷ 4').roundedValue, '6');
});

test('supports unary signs and negative intermediate values', () => {
  assert.equal(evaluateMoneyExpression('-20 + 5 * 2').roundedValue, '-10');
  assert.equal(evaluateMoneyExpression('-(20 - 35)').roundedValue, '15');
});

test('normalizes a result without unnecessary decimal zeroes', () => {
  assert.equal(evaluateMoneyExpression('1 / 8').exactValue, '0.125');
  assert.equal(evaluateMoneyExpression('1 / 4').exactValue, '0.25');
});

test('rejects division by zero', () => {
  assert.throws(() => evaluateMoneyExpression('10 / (3 - 3)'), /Division par zéro/);
});

test('rejects incomplete and malformed expressions', () => {
  assert.throws(() => evaluateMoneyExpression('300 +'), /Calcul incomplet/);
  assert.throws(() => evaluateMoneyExpression('1..2'), /Nombre invalide/);
  assert.throws(() => evaluateMoneyExpression('2 + (3 * 4'), /Calcul incomplet/);
});

test('rejects executable or unsupported input instead of evaluating it', () => {
  assert.throws(() => evaluateMoneyExpression('globalThis.process.exit()'), /Caractère non autorisé/);
  assert.throws(() => evaluateMoneyExpression('1 ** 3'), /Calcul incomplet|Caractère non autorisé/);
});


test('delete removes exactly one character from a money expression', () => {
  assert.equal(applyMoneyKey('12500', 'delete'), '1250');
  assert.equal(applyMoneyKey('125', '⌫'), '12');
  assert.equal(applyMoneyKey('', 'delete'), '');
});

test('clear empties the money expression without entering action text', () => {
  assert.equal(applyMoneyKey('12500 + 300', 'clear'), '');
  assert.equal(applyMoneyKey('12500', 'C'), '');
});

test('numeric and operator keys are still appended literally', () => {
  assert.equal(applyMoneyKey('125', '00'), '12500');
  assert.equal(applyMoneyKey('125', '+'), '125+');
});
