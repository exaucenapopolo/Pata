import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPageStateStorageKey,
  getSafePageStorage,
  readPageState,
  writePageState,
} from '../src/lib/ui/pageStateStorage.mjs';

function createMemoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test('les clés de préférences sont isolées par utilisateur, page et champ', () => {
  const first = getPageStateStorageKey('user-1', 'expenses', 'filterCategory');
  assert.notEqual(first, getPageStateStorageKey('user-2', 'expenses', 'filterCategory'));
  assert.notEqual(first, getPageStateStorageKey('user-1', 'income', 'filterCategory'));
  assert.notEqual(first, getPageStateStorageKey('user-1', 'expenses', 'filterSort'));
});

test('enregistre et restaure les filtres, formulaires et sélections sans altérer leur type', () => {
  const storage = createMemoryStorage();
  const key = getPageStateStorageKey('user-1', 'expenses', 'form');
  const value = { amount: '1500', date: '2026-11-24', incomeSourceId: 'income-1' };
  assert.equal(writePageState(storage, key, value), true);
  assert.deepEqual(readPageState(storage, key, {}), value);
});

test('une valeur absente ou corrompue retourne la valeur de secours', () => {
  const storage = createMemoryStorage({ broken: '{not-json' });
  assert.deepEqual(readPageState(storage, 'missing', { page: 1 }), { page: 1 });
  assert.deepEqual(readPageState(storage, 'broken', { page: 1 }), { page: 1 });
});

test('ignore un état enregistré avec un type incompatible avec la page', () => {
  const storage = createMemoryStorage({
    wrongBoolean: '"open"',
    wrongArray: '{"unexpected":true}',
    wrongObject: '["not","a","form"]',
  });
  assert.equal(readPageState(storage, 'wrongBoolean', false), false);
  assert.deepEqual(readPageState(storage, 'wrongArray', []), []);
  assert.deepEqual(readPageState(storage, 'wrongObject', {}), {});
});

test('refuse les états excessivement volumineux', () => {
  const storage = createMemoryStorage({ huge: JSON.stringify({ value: 'x'.repeat(200_001) }) });
  assert.deepEqual(readPageState(storage, 'huge', { safe: true }), { safe: true });
  assert.equal(writePageState(storage, 'huge', { value: 'x'.repeat(200_001) }), false);
});

test('les accès bloqués au stockage local ne font pas planter la page', () => {
  const storage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('quota'); },
  };
  assert.equal(readPageState(storage, 'key', 'default'), 'default');
  assert.equal(writePageState(storage, 'key', 'value'), false);
});

test('la récupération du stockage local retourne null quand le contexte ne le permet pas', () => {
  assert.doesNotThrow(() => getSafePageStorage());
});
