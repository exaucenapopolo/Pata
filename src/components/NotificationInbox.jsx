'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, ChevronRight, Loader2, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
};

export function NotificationInbox() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [markingId, setMarkingId] = useState('');

  const loadNotifications = useCallback(async (silent = false) => {
    if (!user) { setItems([]); return; }
    if (!silent) setLoading(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/notifications/inbox', {
        method: 'GET',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Notifications indisponibles.');
      setItems(Array.isArray(result.notifications) ? result.notifications : []);
    } catch (error) {
      if (!silent) console.warn('[PATA INBOX]', error.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadNotifications();
    const timer = setInterval(() => { void loadNotifications(true); }, 45000);
    const refreshOnFocus = () => { if (document.visibilityState === 'visible') void loadNotifications(true); };
    document.addEventListener('visibilitychange', refreshOnFocus);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
  }, [loadNotifications]);

  const markAsRead = async (notification) => {
    if (!user || !notification?.id || markingId) return;
    setMarkingId(notification.id);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ notificationId: notification.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Impossible de marquer cette notification comme lue.');
      setItems((current) => current.filter((item) => item.id !== notification.id));
      if (notification.target && notification.target.startsWith('/') && !notification.target.startsWith('//')) {
        setOpen(false);
        router.push(notification.target);
      }
    } catch (error) {
      console.warn('[PATA INBOX READ]', error.message);
      void loadNotifications(true);
    } finally {
      setMarkingId('');
    }
  };

  if (!user) return null;

  return (
    <div className="fixed right-4 top-20 z-[80] sm:right-6">
      <button
        type="button"
        onClick={() => { setOpen((value) => !value); if (!open) void loadNotifications(); }}
        aria-label={`Notifications non lues : ${items.length}`}
        aria-expanded={open}
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-lg transition hover:bg-slate-50"
      >
        <Bell size={19}/>
        {items.length > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{items.length > 9 ? '9+' : items.length}</span>}
      </button>
      {open && <section className="absolute right-0 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div><h2 className="text-sm font-bold text-slate-900">Notifications</h2><p className="text-[11px] text-slate-500">{items.length} non lue(s)</p></div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => loadNotifications()} aria-label="Actualiser" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Loader2 size={15} className={loading ? 'animate-spin' : ''}/></button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={15}/></button>
          </div>
        </header>
        <div className="max-h-[min(65vh,520px)] overflow-y-auto">
          {loading && !items.length && <p className="p-6 text-center text-xs text-slate-500">Chargement…</p>}
          {!loading && !items.length && <p className="p-7 text-center text-xs leading-5 text-slate-500">Tu es à jour. Les nouvelles informations importantes apparaîtront ici.</p>}
          {items.map((item) => <article key={item.id} className="border-b border-slate-100 px-4 py-3 last:border-0">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 rounded-full bg-blue-50 p-2 text-blue-700"><Bell size={15}/></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{item.title || 'Information Pata'}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{item.body || item.message || ''}</p>
                <p className="mt-2 text-[10px] text-slate-400">{formatDate(item.createdAt)}</p>
                <button type="button" disabled={markingId === item.id} onClick={() => markAsRead(item)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-800 disabled:opacity-50">
                  {markingId === item.id ? <Loader2 size={13} className="animate-spin"/> : <Check size={13}/>}
                  Marquer comme lue
                  {item.target && <ChevronRight size={13}/>}
                </button>
              </div>
            </div>
          </article>)}
        </div>
      </section>}
    </div>
  );
}
