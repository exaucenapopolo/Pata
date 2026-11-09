'use client';

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Download, X } from 'lucide-react';

export function AndroidUpdateChecker() {
  const [update, setUpdate] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let active = true;
    const check = async () => {
      try {
        const [installed, response] = await Promise.all([
          App.getInfo(), fetch('/android-version.json', { cache: 'no-store' }),
        ]);
        if (!response.ok) return;
        const latest = await response.json();
        const installedCode = Number(installed.build || 0);
        const latestCode = Number(latest.versionCode || 0);
        if (active && latest.downloadAvailable === true && latestCode > installedCode) {
          setUpdate({ version: latest.version, url: latest.apkUrl, notes: latest.releaseNotes || '' });
        }
      } catch (error) {
        console.warn('[PATA ANDROID UPDATE]', error?.message || error);
      }
    };
    check();
    const listener = App.addListener('appStateChange', ({ isActive }) => { if (isActive) check(); });
    return () => {
      active = false;
      listener.then((value) => value.remove()).catch(() => {});
    };
  }, []);

  if (!update || dismissed) return null;
  return (
    <div className="mx-auto mt-3 w-[calc(100%-1.5rem)] max-w-[900px] rounded-2xl border border-brand-200 bg-white p-3 shadow-sm sm:w-[calc(100%-2.5rem)]">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Download size={17}/></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">Mise à jour Pata {update.version} disponible</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{update.notes || 'Une nouvelle version Android est disponible.'} Le téléchargement et l’installation restent manuels.</p>
          <a href={update.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-9 items-center rounded-lg bg-[#075b43] px-3 text-xs font-semibold text-white">Télécharger la mise à jour</a>
        </div>
        <button type="button" onClick={() => setDismissed(true)} aria-label="Fermer" className="rounded-lg p-1.5 text-slate-400"><X size={16}/></button>
      </div>
    </div>
  );
}
