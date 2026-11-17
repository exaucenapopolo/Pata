'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

export function AppNavigationProgress() {
  const pathname = usePathname();
  const [state, setState] = useState('idle');
  const currentPathRef = useRef(pathname);
  const stateRef = useRef('idle');
  const hideTimerRef = useRef(null);
  const fallbackTimerRef = useRef(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const clearTimers = () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      if (fallbackTimerRef.current) window.clearTimeout(fallbackTimerRef.current);
      hideTimerRef.current = null;
      fallbackTimerRef.current = null;
    };

    const complete = () => {
      if (fallbackTimerRef.current) window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
      setState('complete');
      stateRef.current = 'complete';
      hideTimerRef.current = window.setTimeout(() => {
        setState('hiding');
        stateRef.current = 'hiding';
        hideTimerRef.current = window.setTimeout(() => {
          setState('idle');
          stateRef.current = 'idle';
          hideTimerRef.current = null;
        }, 180);
      }, 260);
    };

    const start = () => {
      clearTimers();
      setState('loading');
      stateRef.current = 'loading';
      fallbackTimerRef.current = window.setTimeout(complete, 12000);
    };

    const handleClick = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target?.closest?.('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.dataset.noProgress === 'true') return;
      try {
        const next = new URL(anchor.href, window.location.href);
        if (next.origin !== window.location.origin || next.pathname === window.location.pathname) return;
        start();
      } catch {
        // Ignore malformed or non-navigation links.
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
      clearTimers();
    };
  }, []);

  useEffect(() => {
    if (currentPathRef.current === pathname) return;
    currentPathRef.current = pathname;
    if (stateRef.current === 'loading') {
      if (fallbackTimerRef.current) window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
      setState('complete');
      stateRef.current = 'complete';
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => {
        setState('hiding');
        stateRef.current = 'hiding';
        hideTimerRef.current = window.setTimeout(() => {
          setState('idle');
          stateRef.current = 'idle';
          hideTimerRef.current = null;
        }, 180);
      }, 260);
    }
  }, [pathname]);

  if (state === 'idle') return null;
  return <div className={'pata-route-progress' + (state === 'complete' ? ' is-complete' : state === 'hiding' ? ' is-hiding' : '')} aria-hidden="true"><span /></div>;
}
