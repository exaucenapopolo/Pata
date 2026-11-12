'use client';

import { AuthProvider } from '@/context/AuthContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { ThemeSync } from '@/components/ThemeSync';
import { LanguageSelectionGate } from '@/components/LanguageSelectionGate';

export function AppProviders({ children }) {
  return (
    <AuthProvider>
      <LanguageProvider>
        <LanguageSelectionGate>
          <ThemeSync />
          {children}
        </LanguageSelectionGate>
      </LanguageProvider>
    </AuthProvider>
  );
}
