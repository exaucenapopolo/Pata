import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyQuickNavigationOrder,
  getQuickNavigationPages,
  moveQuickNavigationPage,
  rankQuickNavigationPages,
} from '../src/lib/navigation/quickNavigation.mjs';

const pages = [
  { href: '/expenses', label: 'Dépenses' },
  { href: '/income', label: 'Revenus' },
  { href: '/budgets', label: 'Budgets' },
  { href: '/goals', label: 'Épargne' },
  { href: '/settings', label: 'Paramètres' },
  { href: '/cotisations', label: 'Cotisations' },
];

test('returns the most visited pages in descending order', () => {
  const usage = {
    '/expenses': { count: 14, lastVisitedAt: 100 },
    '/income': { count: 4, lastVisitedAt: 200 },
    '/budgets': { count: 8, lastVisitedAt: 150 },
    '/goals': { count: 2, lastVisitedAt: 300 },
    '/settings': { count: 11, lastVisitedAt: 120 },
    '/cotisations': { count: 6, lastVisitedAt: 180 },
  };
  const result = rankQuickNavigationPages(pages, usage, 4);
  assert.deepEqual(result.map((page) => page.href), [
    '/expenses', '/settings', '/budgets', '/cotisations',
  ]);
});

test('uses the most recent visit when visit counts are equal', () => {
  const usage = {
    '/expenses': { count: 3, lastVisitedAt: 100 },
    '/income': { count: 3, lastVisitedAt: 200 },
  };
  const result = rankQuickNavigationPages(pages, usage);
  assert.equal(result[0].href, '/income');
  assert.equal(result[1].href, '/expenses');
});

test('keeps stable default order for a new user without usage history', () => {
  const result = rankQuickNavigationPages(pages, {});
  assert.deepEqual(result.map((page) => page.href), [
    '/expenses', '/income', '/budgets', '/goals',
  ]);
  assert.ok(result.every((page) => page.visitCount === 0));
});

test('ignores invalid counters and safely limits the returned list', () => {
  const usage = {
    '/expenses': { count: -5, lastVisitedAt: -1 },
    '/income': { count: 'not-a-number', lastVisitedAt: NaN },
    '/budgets': { count: 7.8, lastVisitedAt: 123 },
  };
  const result = rankQuickNavigationPages(pages, usage, 2);
  assert.deepEqual(result.map((page) => page.href), ['/budgets', '/expenses']);
  assert.equal(result[0].visitCount, 7);
  assert.equal(result[1].visitCount, 0);
  assert.equal(rankQuickNavigationPages(pages, usage, 0).length, 0);
});

test('applies a saved personal order before filling remaining ranked destinations', () => {
  const usage = {
    '/settings': { count: 400, lastVisitedAt: 500 },
    '/expenses': { count: 300, lastVisitedAt: 400 },
    '/income': { count: 200, lastVisitedAt: 300 },
    '/budgets': { count: 100, lastVisitedAt: 200 },
  };
  const result = getQuickNavigationPages(pages, usage, {
    customized: true,
    order: ['/goals', '/cotisations', '/expenses', '/income'],
    locked: true,
  }, 4);
  assert.deepEqual(result.map((page) => page.href), [
    '/goals', '/cotisations', '/expenses', '/income',
  ]);
});

test('ignores unknown and duplicate routes in a saved order', () => {
  const result = applyQuickNavigationOrder(pages, [
    '/settings', '/missing', '/settings', '/expenses',
  ]);
  assert.deepEqual(result.slice(0, 3).map((page) => page.href), [
    '/settings', '/expenses', '/income',
  ]);
});

test('moves a shortcut to the selected position without dropping other shortcuts', () => {
  const current = pages.slice(0, 4);
  const result = moveQuickNavigationPage(current, '/goals', '/expenses');
  assert.deepEqual(result.map((page) => page.href), [
    '/goals', '/expenses', '/income', '/budgets',
  ]);
  assert.equal(result.length, current.length);
});

test('does not change order when a drag target is invalid', () => {
  const current = pages.slice(0, 4);
  const result = moveQuickNavigationPage(current, '/missing', '/expenses');
  assert.deepEqual(result.map((page) => page.href), current.map((page) => page.href));
});
