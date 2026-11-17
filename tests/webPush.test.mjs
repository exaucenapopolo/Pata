import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWebPushSubscription,
  webPushSubscriptionId,
  isExpiredWebPushError,
} from '../src/lib/notifications/webPush.mjs';

const keys = {
  p256dh: 'B'.repeat(87),
  auth: 'A'.repeat(22),
};

test('accepte une souscription Web Push Chrome', () => {
  const subscription = normalizeWebPushSubscription({
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-token',
    expirationTime: null,
    keys,
  });
  assert.equal(subscription.endpoint, 'https://fcm.googleapis.com/fcm/send/test-token');
  assert.equal(subscription.expirationTime, null);
  assert.deepEqual(subscription.keys, keys);
});

test('accepte les services push Apple et Mozilla', () => {
  assert.equal(normalizeWebPushSubscription({
    endpoint: 'https://web.push.apple.com/test',
    keys,
  }).endpoint, 'https://web.push.apple.com/test');
  assert.equal(normalizeWebPushSubscription({
    endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/test',
    keys,
  }).endpoint, 'https://updates.push.services.mozilla.com/wpush/v2/test');
});

test('refuse les URL non HTTPS, les hôtes arbitraires et les ports personnalisés', () => {
  assert.throws(() => normalizeWebPushSubscription({ endpoint: 'http://fcm.googleapis.com/test', keys }));
  assert.throws(() => normalizeWebPushSubscription({ endpoint: 'https://example.com/test', keys }));
  assert.throws(() => normalizeWebPushSubscription({ endpoint: 'https://127.0.0.1/test', keys }));
  assert.throws(() => normalizeWebPushSubscription({ endpoint: 'https://fcm.googleapis.com:8443/test', keys }));
});

test('refuse les clés d’abonnement invalides', () => {
  assert.throws(() => normalizeWebPushSubscription({
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    keys: { p256dh: 'bad', auth: 'bad' },
  }));
});

test('génère une identité stable et traite les abonnements expirés', () => {
  const first = webPushSubscriptionId('https://fcm.googleapis.com/fcm/send/test');
  const second = webPushSubscriptionId('https://fcm.googleapis.com/fcm/send/test');
  assert.equal(first, second);
  assert.equal(first.length, 64);
  assert.equal(isExpiredWebPushError({ statusCode: 410 }), true);
  assert.equal(isExpiredWebPushError({ statusCode: 404 }), true);
  assert.equal(isExpiredWebPushError({ statusCode: 500 }), false);
});

test('construit un payload Web Push avec image Cloudinary et icônes Pata', async () => {
  const { buildPataWebPushPayload } = await import('../src/lib/notifications/webPush.mjs');
  const imageUrl = 'https://res.cloudinary.com/do83voiqy/image/upload/v1/pata/notifications/info.jpg';
  const payload = buildPataWebPushPayload({ title: 'Information Pata', body: 'Un nouveau message', url: '/dashboard', imageUrl });
  assert.equal(payload.source, 'pata-webpush');
  assert.equal(payload.icon.endsWith('/pata-notification.svg'), true);
  assert.equal(payload.badge.endsWith('/pata-notification-badge.svg'), true);
  assert.equal(payload.image, imageUrl);
});

test('refuse une image non HTTPS dans le payload Web Push', async () => {
  const { buildPataWebPushPayload } = await import('../src/lib/notifications/webPush.mjs');
  const payload = buildPataWebPushPayload({ imageUrl: 'http://example.com/photo.jpg' });
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'image'), false);
});
