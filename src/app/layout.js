import './globals.css';
import './theme-overrides.css';
import { AppProviders } from './providers';
import { PWARegister } from '@/components/PWARegister';
import { PWAInstallButton } from '@/components/PWAInstallButton';

const SITE_URL = 'https://www.pata-yam.site';
const SITE_DESCRIPTION = 'Application de gestion de budget au Cameroun : suis tes revenus, dépenses, budgets, dettes, factures, épargne et cotisations avec Pata.';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Pata — application de gestion de budget et finances personnelles',
    template: '%s | Pata',
  },
  description: SITE_DESCRIPTION,
  applicationName: 'Pata',
  keywords: [
    'application de gestion de budget',
    'gestion financière personnelle',
    'suivi des dépenses et revenus',
    'budget personnel Cameroun',
    'gestion financière Cameroun',
    'épargne et objectifs',
    'suivi Mobile Money',
    'MTN MoMo',
    'Orange Money',
    'cotisations et tontines',
    'Pata',
  ],
  creator: 'NAPOPOLO EXAUCE',
  publisher: 'Pata',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
  openGraph: {
    type: 'website',
    locale: 'fr_CM',
    url: SITE_URL,
    siteName: 'Pata',
    title: 'Pata — application de gestion de budget et finances personnelles',
    description: SITE_DESCRIPTION,
    images: [{ url: '/android-chrome-512x512.png', width: 512, height: 512, alt: 'Pata, application de gestion financière' }],
  },
  twitter: {
    card: 'summary',
    title: 'Pata — gestion de budget et finances personnelles',
    description: SITE_DESCRIPTION,
    images: ['/android-chrome-512x512.png'],
  },
  icons: {
    icon: [
      { url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' }],
  },
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Pata' },
  formatDetection: { telephone: false },
  alternates: { canonical: '/' },
};

const websiteStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Pata',
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  inLanguage: 'fr-CM',
  publisher: { '@type': 'Organization', name: 'Pata', url: SITE_URL },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#075b43',
};

export default function RootLayout({ children }) {
  const structuredData = JSON.stringify(websiteStructuredData).replace(/</g, '\\u003c');

  return (
    <html lang="fr">
      <body className="min-h-screen bg-[#f5f8f6] text-slate-900 antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
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
