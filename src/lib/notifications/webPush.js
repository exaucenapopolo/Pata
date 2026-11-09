import webPush from 'web-push';
import { createHash } from 'node:crypto';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.pata-yam.site').replace(/\/$/, '');

export function normalizeWebPushSubscription(value) {
  if (!value || typeof value !== 'object') throw new Error('Abonnement Web Push manquant.');
  const endpoint = String(value.endpoint || '').trim();
  const parsed = new URL(endpoint);
  if (parsed.protocol !== 'https:' || endpoint.length > 4096) throw new Error('Adresse de notification invalide.');
  const p256dh = String(value.keys?.p256dh || '').trim();
  const auth = String(value.keys?.auth || '').trim();
  if (p256dh.length < 40 || p256dh.length > 256 || auth.length < 16 || auth.length > 128) {
    throw new Error('Clés de notification invalides.');
  }
  return {
    endpoint,
    expirationTime: Number.isFinite(Number(value.expirationTime)) ? Number(value.expirationTime) : null,
    keys: { p256dh, auth },
  };
}

export function webPushSubscriptionId(endpoint) {
  return createHash('sha256').update(String(endpoint)).digest('hex');
}

export function isExpiredWebPushError(error) {
  return [404, 410].includes(Number(error?.statusCode || error?.status));
}

export async function sendPataWebPush(subscriptionInput, notification) {
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT || APP_URL;
  if (!publicKey || !privateKey || !subject) throw new Error('La configuration Web Push de Pata est incomplète.');

  const subscription = normalizeWebPushSubscription(subscriptionInput);
  webPush.setVapidDetails(subject, publicKey, privateKey);

  const rawUrl = String(notification.url || notification.target || '/dashboard');
  let safeUrl = '/dashboard';
  try {
    const target = new URL(rawUrl, APP_URL);
    if (target.origin === APP_URL) safeUrl = target.pathname + target.search + target.hash;
  } catch { /* conserver /dashboard */ }

  const tag = String(notification.tag || 'pata-notification').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 32);
  const payload = {
    source: 'pata-webpush',
    title: String(notification.title || 'Pata').slice(0, 80),
    body: String(notification.body || 'Ouvre Pata pour consulter cette information.').slice(0, 220),
    url: safeUrl,
    tag,
    icon: APP_URL + '/android-chrome-192x192.png',
    badge: APP_URL + '/android-chrome-192x192.png',
  };

  return webPush.sendNotification(subscription, JSON.stringify(payload), {
    TTL: 86400,
    urgency: 'high',
    topic: tag,
  });
}
