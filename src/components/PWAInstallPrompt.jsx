'use client';

import { useEffect, useState } from 'react';
import { Download, X, Share, Smartphone } from 'lucide-react';

const DISMISS_KEY = 'pata-pwa-install-dismissed';

export function PWAInstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (standalone) return;
    let dismissedUntil = 0;
    try { dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0); } catch { /* stockage indisponible */ }
    if (dismissedUntil > Date.now()) return;

    const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
    setIos(isIOS);
    const onInstallAvailable = (event) => {
      event.preventDefault();
      setInstallEvent(event);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setInstallEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onInstallAvailable);
    window.addEventListener('appinstalled', onInstalled);
    if (isIOS) setVisible(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallAvailable);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000)); } catch { /* stockage indisponible */ }
    setVisible(false);
  };

  const install = async () => {
    if (!installEvent) {
      setShowHelp(true);
      return;
    }
    setBusy(true);
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice?.outcome === 'accepted') setVisible(false);
      setInstallEvent(null);
    } catch {
      setShowHelp(true);
    } finally { setBusy(false); }
  };

  if (!visible) return null;
  return (
    <aside className="mx-3 mb-3 rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm sm:mx-6" aria-label="Installer Pata">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Smartphone size={19}/></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Installer Pata sur cet appareil</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">Retrouve Pata directement depuis ton écran d’accueil, comme une application.</p>
          {showHelp && (
            <div className="mt-2 rounded-lg bg-slate-50 p-2.5 text-xs leading-5 text-slate-600">
              {ios
                ? <>Sur iPhone ou iPad : appuie sur <strong>Partager</strong> dans Safari, puis choisis <strong>Sur l’écran d’accueil</strong> et confirme avec <strong>Ajouter</strong>.</>
                : <>Dans le menu de ton navigateur, choisis <strong>Installer l’application</strong> ou <strong>Ajouter à l’écran d’accueil</strong>.</>}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={install} disabled={busy} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-60">
              {ios || !installEvent ? <Share size={14}/> : <Download size={14}/>}
              {busy ? 'Préparation…' : showHelp ? 'Compris' : 'Installer Pata'}
            </button>
            {showHelp && <button type="button" onClick={dismiss} className="min-h-9 rounded-lg px-3 text-xs font-medium text-slate-500">Plus tard</button>}
          </div>
        </div>
        <button type="button" onClick={dismiss} aria-label="Fermer" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={16}/></button>
      </div>
    </aside>
  );
}
