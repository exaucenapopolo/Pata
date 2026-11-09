'use client';

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

export function PWAInstallButton() {
  const [promptEvent, setPromptEvent] = useState(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) { setInstalled(true); return undefined; }
    const ua = navigator.userAgent || '';
    const ipad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    setIos(/iphone|ipad|ipod/i.test(ua) || ipad);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    setInstalled(standalone);
    const capture = (event) => { event.preventDefault(); setPromptEvent(event); };
    const onInstalled = () => { setInstalled(true); setPromptEvent(null); };
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!promptEvent) { setHelp(true); return; }
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === 'accepted') setInstalled(true);
      setPromptEvent(null);
    } catch { setHelp(true); }
  };

  if (installed) return null;
  return (
    <>
      <button type="button" onClick={install} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#0b5c46]/20 bg-white px-3.5 text-sm font-semibold text-[#0b5c46] transition hover:bg-[#f2f7f4]">
        <span>Installer l’application</span>
      </button>
      {help && <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/45 p-3 sm:items-center">
        <section className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
          <div className="flex items-center justify-between"><h2 className="font-bold text-slate-900">Installer Pata</h2><button type="button" onClick={()=>setHelp(false)} aria-label="Fermer" className="rounded-full bg-slate-100 p-2"><span>Fermer</span></button></div>
          <p className="mt-3 text-sm leading-6 text-slate-600">{ios ? <>Dans Safari, appuie sur <strong>Partager</strong>, puis sur <strong>Sur l’écran d’accueil</strong> et confirme.</> : <>Dans Chrome, Edge ou un navigateur compatible, ouvre le menu du navigateur puis choisis <strong>Installer Pata</strong> ou <strong>Ajouter à l’écran d’accueil</strong>. Sur ordinateur, l’option peut aussi apparaître dans la barre d’adresse.</>}</p>
          <button type="button" onClick={()=>setHelp(false)} className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-[#0b5c46] px-4 text-sm font-semibold text-white">Compris</button>
        </section>
      </div>}
    </>
  );
}
