import test from 'node:test';
import assert from 'node:assert/strict';
import { isNotificationUnread } from '../src/lib/notifications/notificationState.mjs';

test('treats legacy notifications without read fields as unread', () => {
  assert.equal(isNotificationUnread({}), true);
  assert.equal(isNotificationUnread({ title: 'Ancienne notification' }), true);
});

test('treats explicit unread state as unread', () => {
  assert.equal(isNotificationUnread({ read: false }), true);
});

test('treats read flag or read timestamp as read', () => {
  assert.equal(isNotificationUnread({ read: true }), false);
  assert.equal(isNotificationUnread({ read: false, readAt: '2026-11-13T10:00:00.000Z' }), false);
});
