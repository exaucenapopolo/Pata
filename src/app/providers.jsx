'use client';

import { AuthProvider } from '@/context/AuthContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { ThemeSync } from '@/components/ThemeSync';

export function AppProviders({ children }) {
  return (
    <AuthProvider>
      <LanguageProvider>
        <ThemeSync />
        {children}
      </LanguageProvider>
    </AuthProvider>
  );
}
