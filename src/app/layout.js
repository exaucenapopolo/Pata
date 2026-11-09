import './globals.css';
import './theme-overrides.css';
import { AppProviders } from './providers';
import { PWARegister } from '@/components/PWARegister';

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
        </AppProviders>
      </body>
    </html>
  );
}
