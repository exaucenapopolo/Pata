'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { shouldShowScrollAction } from '@/lib/ui/scrollActionVisibility.mjs';

export function ScrollAwareAddButton({ label, ariaLabel, onClick, disabled = false, visible = true, threshold = 240 }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!visible) {
      setScrolled(false);
      return undefined;
    }
    const pageScroller = document.querySelector('[data-pata-page-scroll]');
    const updateVisibility = () => {
      setScrolled(shouldShowScrollAction({
        windowY: window.scrollY || document.documentElement.scrollTop || 0,
        mainY: pageScroller?.scrollTop || 0,
        threshold,
      }));
    };
    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    pageScroller?.addEventListener('scroll', updateVisibility, { passive: true });
    return () => {
      window.removeEventListener('scroll', updateVisibility);
      pageScroller?.removeEventListener('scroll', updateVisibility);
    };
  }, [threshold, visible]);

  if (!visible || !scrolled) return null;
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel || label} title={label}
      className="fixed left-4 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[45] inline-flex min-h-12 items-center gap-2 rounded-full border border-emerald-950/10 bg-[#075b43] px-4 text-sm font-bold text-white shadow-lg shadow-emerald-950/20 transition hover:bg-[#064b38] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 lg:bottom-6 lg:left-6">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-white/15"><Plus size={19} strokeWidth={2.6}/></span>
      <span>{label}</span>
    </button>
  );
}
