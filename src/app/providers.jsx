'use client';

import { AuthProvider } from '@/context/AuthContext';

export function AppProviders({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}
