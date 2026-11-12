'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Bell, Check, ChevronDown, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getPreferredLocale } from '@/lib/utils';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(getPreferredLocale(), { dateStyle: 'short', timeStyle: 'short' });
}

function renderMessageWithLinks(value) {
  const parts = String(value || '').split(/((?:https?:\/\/|www\.)[^\s<>]+)/gi);
  return parts.map((part, index) => {
    if (!/^(https?:\/\/|www\.)/i.test(part)) return part;
    const punctuation = part.match(/[.,!?;:)]+$/)?.[0] || '';
    const linkText = punctuation ? part.slice(0, -punctuation.length) : part;
    const href = /^www\./i.test(linkText) ? 'https://' + linkText : linkText;
    try {
      const parsed = new URL(href);
      if (!['http:', 'https:'].includes(parsed.protocol)) return part;
      return (
        <span key={index}>
          <a href={parsed.href} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-blue-700 underline underline-offset-2">
            {linkText}
          </a>
          {punctuation}
        </span>
      );
    } catch {
      return part;
    }
  });
}

function mergeNotifications(current, incoming) {
  const byId = new Map();
  [...current, ...incoming].forEach((item) => byId.set(item.id, item));
  return [...byId.values()].sort((a, b) => {
    const dateA = new Date(a.createdAt || 0).getTime() || 0;
    const dateB = new Date(b.createdAt || 0).getTime() || 0;
    return dateB - dateA;
  });
}

export function NotificationInbox() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingId, setMarkingId] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [activeFilter, setActiveFilter] = useState('unread');
  const [expandedId, setExpandedId] = useState('');
  const [error, setError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);
  const [portalTarget, setPortalTarget] = useState(null);

  const unreadCount = useMemo(() => items.filter((item) => !item.isRead).length, [items]);
  const readCount = useMemo(() => items.filter((item) => item.isRead).length, [items]);
  const visibleItems = useMemo(
    () => items.filter((item) => activeFilter === 'read' ? item.isRead : !item.isRead),
    [items, activeFilter]
  );

  const loadNotifications = useCallback(async (silent = false, append = false) => {
    if (!user) {
      setItems([]);
      setNextCursor(null);
      setHasMore(false);
      return;
    }
    if (!silent) {
      if (append) setLoadingMore(true);
      else setLoading(true);
    }
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ limit: '50' });
      if (append && nextCursor) params.set('cursor', nextCursor);
      const response = await fetch('/api/notifications/inbox?' + params.toString(), {
        method: 'GET',
        cache: 'no-store',
        headers: { Authorization: 'Bearer ' + token },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Notifications indisponibles.');
      const incoming = Array.isArray(result.notifications) ? result.notifications : [];
      setItems((current) => append ? mergeNotifications(current, incoming) : incoming);
      setNextCursor(result.nextCursor || null);
      setHasMore(Boolean(result.hasMore));
      setError('');
    } catch (requestError) {
      if (!silent) setError(requestError.message || 'Impossible de charger les notifications.');
    } finally {
      if (!silent) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [user, nextCursor]);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return undefined;
    }
    void loadNotifications();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadNotifications(true);
    }, 45000);
    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') void loadNotifications(true);
    };
    document.addEventListener('visibilitychange', refreshOnFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
  }, [user, loadNotifications]);

  const markAsRead = async (notification) => {
    if (!user || !notification?.id || notification.isRead || markingId) return;
    setMarkingId(notification.id);
    setError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ notificationId: notification.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de marquer cette notification comme lue.');
      setItems((current) => current.map((item) => item.id === notification.id
        ? { ...item, read: true, isRead: true, readAt: new Date().toISOString() }
        : item));
    } catch (requestError) {
      setError(requestError.message || 'Impossible de marquer cette notification comme lue.');
    } finally {
      setMarkingId('');
    }
  };

  const markAllAsRead = async () => {
    if (!user || markingAll || (!unreadCount && !hasMore)) return;
    setMarkingAll(true);
    setError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ markAll: true }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de marquer toutes les notifications comme lues.');
      const readAt = new Date().toISOString();
      setItems((current) => current.map((item) => ({ ...item, read: true, isRead: true, readAt: item.readAt || readAt })));
      setNextCursor(null);
      setHasMore(false);
      setActiveFilter('unread');
    } catch (requestError) {
      setError(requestError.message || 'Impossible de marquer toutes les notifications comme lues.');
    } finally {
      setMarkingAll(false);
    }
  };

  const toggleNotification = (notification) => {
    setExpandedId((current) => current === notification.id ? '' : notification.id);
    if (!notification.isRead) void markAsRead(notification);
  };

  const openTarget = (target) => {
    if (typeof target !== 'string' || !target.trim()) return;
    if (target.startsWith('/') && !target.startsWith('//')) {
      router.push(target);
      setOpen(false);
      return;
    }
    try {
      const url = new URL(target);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        window.open(url.href, '_blank', 'noopener,noreferrer');
      }
    } catch {
      setError('Le lien de cette notification n’est pas valide.');
    }
  };

  if (!user) return null;

  return (
    <div className="relative z-[80] shrink-0">
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          if (!open) void loadNotifications();
        }}
        aria-label={'Notifications non lues : ' + unreadCount}
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.97]"
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && portalTarget && createPortal(
        <>
          <button
            type="button"
            aria-label="Fermer les notifications"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[79] cursor-default bg-slate-950/10"
          />
          <section className="fixed left-1/2 top-[calc(64px+env(safe-area-inset-top)+0.5rem)] z-[81] flex max-h-[min(78dvh,620px)] w-[min(calc(100vw-1.5rem),400px)] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_18px_48px_rgba(8,39,70,0.16)] sm:top-[calc(68px+env(safe-area-inset-top)+0.5rem)]">
            <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Notifications</h2>
                <p className="text-[11px] text-slate-500">{unreadCount} non lue(s) · {readCount} déjà lue(s)</p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => loadNotifications()} aria-label="Actualiser" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                  <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                </button>
                <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                  <X size={15} />
                </button>
              </div>
            </header>

            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
              <div className="grid flex-1 grid-cols-2 gap-2">
                <button type="button" onClick={() => setActiveFilter('unread')} className={'rounded-lg px-3 py-2 text-xs font-semibold transition ' + (activeFilter === 'unread' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                  Non lues ({unreadCount})
                </button>
                <button type="button" onClick={() => setActiveFilter('read')} className={'rounded-lg px-3 py-2 text-xs font-semibold transition ' + (activeFilter === 'read' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                  Déjà lues ({readCount})
                </button>
              </div>
            </div>

            {(unreadCount > 0 || hasMore) && (
              <div className="border-b border-slate-100 px-3 py-2">
                <button
                  type="button"
                  onClick={markAllAsRead}
                  disabled={markingAll}
                  className="flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-[#c8dfd0] bg-[#eff7f1] px-3 text-xs font-semibold text-[#0b5c46] transition hover:bg-[#e3f1e7] disabled:opacity-50"
                >
                  {markingAll ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Tout marquer comme lu
                </button>
              </div>
            )}

            {error && <p className="mx-3 mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {loading && !items.length && <p className="p-6 text-center text-xs text-slate-500">Chargement des notifications…</p>}
              {visibleItems.map((item) => (
                <article key={item.id} className="mb-2 overflow-hidden rounded-xl border border-slate-100 last:mb-0">
                  <button
                    type="button"
                    onClick={() => toggleNotification(item)}
                    aria-expanded={expandedId === item.id}
                    className="flex w-full items-start gap-3 p-3 text-left transition hover:bg-slate-50"
                  >
                    <span className={'mt-0.5 rounded-full p-2 ' + (item.isRead ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-700')}>
                      <Bell size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-xs text-slate-900">{item.title || 'Information Pata'}</strong>
                      <span className="mt-1 block whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">
                        {item.body || item.message || 'Ouvre Pata pour consulter cette information.'}
                      </span>
                      {typeof item.imageUrl === 'string' && item.imageUrl.startsWith('https://') && (
                        <img src={item.imageUrl} alt="Illustration de la notification" loading="lazy" className="mt-3 max-h-40 w-full rounded-lg border border-slate-100 object-cover" />
                      )}
                      <span className="mt-2 block text-[10px] text-slate-400">
                        {formatDate(item.createdAt)} · {item.isRead ? 'Déjà lue' : 'Nouvelle notification'}
                      </span>
                    </span>
                    <ChevronDown size={15} className={'mt-1 shrink-0 text-slate-400 transition-transform ' + (expandedId === item.id ? 'rotate-180' : '')} />
                  </button>

                  {expandedId === item.id && (
                    <div className="border-t border-slate-100 bg-slate-50/70 px-3 pb-3 pt-2">
                      <p className="whitespace-pre-wrap break-words text-xs leading-6 text-slate-700">
                        {renderMessageWithLinks(item.body || item.message || '')}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {item.target && (
                          <button type="button" onClick={() => openTarget(item.target)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100">
                            <ExternalLink size={13} /> Ouvrir la page
                          </button>
                        )}
                        {!item.isRead && (
                          <button type="button" disabled={markingId === item.id} onClick={() => markAsRead(item)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-slate-900 px-2.5 text-[11px] font-semibold text-white disabled:opacity-50">
                            {markingId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                            Marquer comme lue
                          </button>
                        )}
                        {item.isRead && <span className="text-[10px] text-slate-400">Lue le {formatDate(item.readAt) || formatDate(item.createdAt)}</span>}
                      </div>
                    </div>
                  )}
                </article>
              ))}

              {!loading && !visibleItems.length && (
                <div className="px-5 py-9 text-center">
                  <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Check size={18} /></span>
                  <p className="mt-3 text-sm font-semibold text-slate-700">{activeFilter === 'read' ? 'Aucune notification déjà lue' : 'Tout est à jour'}</p>
                  <p className="mt-1 text-xs text-slate-500">{activeFilter === 'read' ? 'Les messages consultés apparaîtront dans cet onglet.' : 'Les nouvelles informations importantes apparaîtront ici.'}</p>
                </div>
              )}
            </div>

            {hasMore && (
              <div className="border-t border-slate-100 p-3">
                <button type="button" onClick={() => loadNotifications(false, true)} disabled={loadingMore} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
                  Charger les notifications précédentes
                </button>
              </div>
            )}
          </section>
        </>,
        portalTarget
      )}
    </div>
  );
}
