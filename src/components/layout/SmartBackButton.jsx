'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export function SmartBackButton() {
  const pathname = usePathname();
  const router = useRouter();
  if (!pathname || pathname === '/dashboard' || pathname === '/admin') return null;
  const goBack = () => {
    const sameOriginReferrer = typeof document !== 'undefined' && document.referrer && document.referrer.startsWith(window.location.origin);
    if (sameOriginReferrer && window.history.length > 1) router.back();
    else router.push('/dashboard');
  };
  return (
    <div className="mb-3">
      <button type="button" onClick={goBack} className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
        <ArrowLeft size={16} /> Retour
      </button>
    </div>
  );
}
