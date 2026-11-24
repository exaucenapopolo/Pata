import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPageScrollStorageKey,
  readPageScrollPosition,
  writePageScrollPosition,
} from '../src/lib/ui/pageScrollStorage.mjs';

const storage = () => {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
};

test('la position de défilement est isolée par utilisateur et par page', () => {
  const key = getPageScrollStorageKey('u1', '/expenses');
  assert.notEqual(key, getPageScrollStorageKey('u2', '/expenses'));
  assert.notEqual(key, getPageScrollStorageKey('u1', '/income'));
});

test('restaure séparément le défilement mobile et le conteneur desktop', () => {
  const store = storage();
  const key = getPageScrollStorageKey('u1', '/expenses');
  assert.equal(writePageScrollPosition(store, key, { windowY: 640, mainY: 180 }), true);
  assert.deepEqual(readPageScrollPosition(store, key), { windowY: 640, mainY: 180 });
});

test('les données de défilement absentes ou invalides restent sans danger', () => {
  const store = storage();
  store.setItem('broken', 'invalid');
  assert.deepEqual(readPageScrollPosition(store, 'missing'), { windowY: 0, mainY: 0 });
  assert.deepEqual(readPageScrollPosition(store, 'broken'), { windowY: 0, mainY: 0 });
});
