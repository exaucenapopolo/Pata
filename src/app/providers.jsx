'use client';

import { AuthProvider } from '@/context/AuthContext';
import { ThemeSync } from '@/components/ThemeSync';

export function AppProviders({ children }) {
  return <AuthProvider><ThemeSync />{children}</AuthProvider>;
}
