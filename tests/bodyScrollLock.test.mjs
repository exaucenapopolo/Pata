import test from 'node:test';
import assert from 'node:assert/strict';
import { createBodyScrollLockManager } from '../src/lib/ui/bodyScrollLock.mjs';

test('restores the original overflow after the last modal closes', () => {
  const manager = createBodyScrollLockManager();
  const body = { style: { overflow: 'auto' } };
  const release = manager.acquire(body);
  assert.equal(body.style.overflow, 'hidden');
  release();
  assert.equal(body.style.overflow, 'auto');
  assert.equal(manager.getActiveCount(), 0);
});

test('keeps scrolling locked until every nested modal has closed', () => {
  const manager = createBodyScrollLockManager();
  const body = { style: { overflow: '' } };
  const releaseParent = manager.acquire(body);
  const releaseChild = manager.acquire(body);
  releaseChild();
  assert.equal(body.style.overflow, 'hidden');
  assert.equal(manager.getActiveCount(), 1);
  releaseParent();
  assert.equal(body.style.overflow, '');
  assert.equal(manager.getActiveCount(), 0);
});

test('makes modal cleanup idempotent', () => {
  const manager = createBodyScrollLockManager();
  const body = { style: { overflow: 'scroll' } };
  const release = manager.acquire(body);
  release();
  release();
  assert.equal(manager.getActiveCount(), 0);
  assert.equal(body.style.overflow, 'scroll');
});
