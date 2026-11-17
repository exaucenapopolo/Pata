import test from 'node:test';
import assert from 'node:assert/strict';
import { rankQuickNavigationPages } from '../src/lib/navigation/quickNavigation.mjs';

const pages = [
  { href: '/expenses', label: 'Dépenses' },
  { href: '/income', label: 'Revenus' },
  { href: '/budgets', label: 'Budgets' },
  { href: '/goals', label: 'Épargne' },
  { href: '/settings', label: 'Paramètres' },
  { href: '/cotisations', label: 'Cotisations' },
];

test('returns the four pages with the highest visit counts in descending order', () => {
  const usage = {
    '/expenses': { count: 14, lastVisitedAt: 100 },
    '/income': { count: 4, lastVisitedAt: 200 },
    '/budgets': { count: 8, lastVisitedAt: 150 },
    '/goals': { count: 2, lastVisitedAt: 300 },
    '/settings': { count: 11, lastVisitedAt: 120 },
    '/cotisations': { count: 6, lastVisitedAt: 180 },
  };
  const result = rankQuickNavigationPages(pages, usage);
  assert.deepEqual(result.map((page) => page.href), [
    '/expenses', '/settings', '/budgets', '/cotisations',
  ]);
  assert.equal(result.length, 4);
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
