'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const TRACKED_PATHS = new Set([
  '/expenses', '/income', '/budgets', '/goals', '/debts',
  '/bills', '/cotisations', '/wallet', '/reports', '/premium',
]);

export function PageUsageTracker({ uid }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!uid || !TRACKED_PATHS.has(pathname)) return;
    const storageKey = 'pata-page-visits:' + uid;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      const current = saved[pathname] && typeof saved[pathname] === 'object' ? saved[pathname] : {};
      saved[pathname] = {
        count: Math.min(9999, (Number(current.count) || 0) + 1),
        lastVisitedAt: Date.now(),
      };
      localStorage.setItem(storageKey, JSON.stringify(saved));
      window.dispatchEvent(new Event('pata:page-usage-updated'));
    } catch {
      // La navigation continue normalement si le stockage local est indisponible.
    }
  }, [uid, pathname]);

  return null;
}
