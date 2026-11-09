'use client';

import { useEffect, useState } from 'react';

export function AndroidDownloadCard() {
  const [release, setRelease] = useState(null);
  useEffect(() => {
    let active = true;
    fetch('/android-version.json', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (active && data) setRelease(data); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  if (!release?.downloadAvailable) {
    return <button type="button" disabled className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-200 px-4 text-sm font-semibold text-slate-500">APK bientôt disponible</button>;
  }
  return (
    <a href={release.apkUrl} className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-[#075b43] px-4 text-sm font-semibold text-white">
      Télécharger Pata Android {release.version}
    </a>
  );
}
