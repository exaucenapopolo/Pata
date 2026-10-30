import './globals.css';
import { AppProviders } from './providers';

export const metadata = {
  title: 'Pata — Gère ton argent, discipline ton épargne',
  description:
    'Suivi de dépenses, budgets intelligents, épargne disciplinée et objectifs financiers.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
    }
