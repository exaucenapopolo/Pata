'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import { shouldShowScrollAction } from '@/lib/ui/scrollActionVisibility.mjs';

export function ScrollAwareAddButton({ label, ariaLabel, onClick, disabled = false, visible = true, threshold = 240 }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!visible) {
      setScrolled(false);
      return undefined;
    }

    // Le contenu défile dans <main> sur ordinateur et dans le document sur mobile.
    const pageScroller = document.querySelector('[data-pata-page-scroll]');
    const updateVisibility = () => {
      setScrolled(shouldShowScrollAction({
        windowY: window.scrollY || document.scrollingElement?.scrollTop || document.documentElement.scrollTop || 0,
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

  if (!visible || !scrolled || typeof document === 'undefined') return null;

  // Sortir le bouton de <main> évite qu'un conteneur de défilement,
  // son overflow ou un contexte de transformation le colle à la liste.
  // Il est désormais positionné par rapport à la fenêtre, quel que soit le scroller.
  return createPortal(
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel || label}
      title={label}
      style={{
        position: 'fixed',
        zIndex: 55,
        left: '16px',
        bottom: 'calc(5.5rem + env(safe-area-inset-bottom))',
      }}
      className="inline-flex min-h-12 items-center gap-2 rounded-full border border-emerald-950/10 bg-[#075b43] px-4 text-sm font-bold text-white shadow-lg shadow-emerald-950/20 transition hover:bg-[#064b38] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 lg:bottom-6 lg:left-6"
    >
      <span className="grid h-7 w-7 place-items-center rounded-full bg-white/15">
        <Plus size={19} strokeWidth={2.6}/>
      </span>
      <span>{label}</span>
    </button>,
    document.body,
  );
}
