'use client';

import { useEffect } from 'react';
import { useProfile } from '@/hooks/useProfile';

export function ThemeSync() {
  const { profile } = useProfile();

  useEffect(() => {
    const theme = profile?.theme === 'dark' ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('pata-theme', theme); } catch { /* storage indisponible */ }
  }, [profile?.theme]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pata-theme');
      if (saved === 'dark' || saved === 'light') {
        document.documentElement.classList.toggle('dark', saved === 'dark');
        document.documentElement.dataset.theme = saved;
      }
    } catch { /* storage indisponible */ }
  }, []);

  return null;
}
