import './globals.css';
import { AppProviders } from './providers';
import { PWARegister } from '@/components/PWARegister';

export const metadata = {
  title: 'Pata — Gère ton argent',
  description: 'Suivi de dépenses, budgets intelligents, épargne disciplinée et objectifs financiers.',
  manifest: '/manifest.json',
  themeColor: '#059669',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Pata',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#059669',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <AppProviders>
          {children}
          <PWARegister />
        </AppProviders>
      </body>
    </html>
  );
}
