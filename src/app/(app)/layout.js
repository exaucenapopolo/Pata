import AppLayoutClient from './AppLayoutClient';

export const metadata = {
  robots: { index: false, follow: true, noarchive: true },
};

export default function AppLayout({ children }) {
  return <AppLayoutClient>{children}</AppLayoutClient>;
}
