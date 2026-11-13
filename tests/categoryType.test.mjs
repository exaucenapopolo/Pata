import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCategoryType } from '../src/lib/categories/categoryType.mjs';

test('keeps income, expense and goal categories separate', () => {
  assert.equal(normalizeCategoryType('expense'), 'expense');
  assert.equal(normalizeCategoryType('income'), 'income');
  assert.equal(normalizeCategoryType('goal'), 'goal');
});

test('uses expense only for unknown types', () => {
  assert.equal(normalizeCategoryType('unknown'), 'expense');
  assert.equal(normalizeCategoryType(null), 'expense');
});
