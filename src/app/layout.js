import './globals.css';
import './theme-overrides.css';
import { AppProviders } from './providers';
import { PWARegister } from '@/components/PWARegister';
import { PWAInstallButton } from '@/components/PWAInstallButton';

export const metadata = {
  title: 'Pata — Gère ton argent',
  description: 'Pata aide chacun à suivre ses revenus, maîtriser ses dépenses, organiser ses budgets et construire son épargne.',
  applicationName: 'Pata',
  keywords: ['Pata', 'gestion financière', 'budget personnel', 'dépenses', 'revenus', 'épargne'],
  icons: {
    icon: [
      { url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [{ url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' }],
  },
  manifest: '/manifest.json',
  themeColor: '#075b43',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Pata' },
  formatDetection: { telephone: false },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#075b43',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-[#f5f8f6] text-slate-900 antialiased">
        <AppProviders>
          {children}
          <PWARegister />
          <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[90] flex justify-end px-4 sm:px-6 md:bottom-5">
            <div className="pointer-events-auto"><PWAInstallButton /></div>
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
