export function isNotificationUnread(notification = {}) {
  return notification?.read !== true && !notification?.readAt;
}
