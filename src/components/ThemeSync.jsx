'use client';

import { useEffect } from 'react';
import { useProfile } from '@/hooks/useProfile';

function applyTheme(theme) {
  const normalized = theme === 'dark' ? 'dark' : 'light';
  const root = document.documentElement;
  root.classList.toggle('dark', normalized === 'dark');
  root.dataset.theme = normalized;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', normalized === 'dark' ? '#101a16' : '#075b43');
}

export function ThemeSync() {
  const { profile, loading } = useProfile();

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pata-theme');
      if (saved === 'dark' || saved === 'light') applyTheme(saved);
    } catch { /* stockage local indisponible */ }
  }, []);

  useEffect(() => {
    if (loading) return;
    const theme = profile?.theme === 'dark' ? 'dark' : 'light';
    applyTheme(theme);
    try { localStorage.setItem('pata-theme', theme); } catch { /* stockage local indisponible */ }
  }, [loading, profile?.theme]);

  return null;
}
