'use client';

import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { MobileNav } from '@/components/layout/MobileNav';
import { Footer } from '@/components/layout/Footer';
import { PremiumReminder } from '@/components/PremiumReminder'; // 🟢 Nouveau
import { AssistantButton } from '@/components/ai/AssistantButton';
import { SmartBackButton } from '@/components/layout/SmartBackButton';
import { NotificationNudge } from '@/components/NotificationNudge';
import { NotificationInbox } from '@/components/NotificationInbox';
import { PinGate } from '@/components/security/PinGate';
import { useAuthGuard } from '@/hooks/useAuthGuard';

export default function AppLayout({ children }) {
  const { loading, user } = useAuthGuard();

  if (loading || !user) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#f5f8f6]"><div className="flex flex-col items-center gap-3"><img src="/android-chrome-192x192.png" alt="Pata" className="h-12 w-12 rounded-2xl" /><div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-1/2 animate-pulse rounded-full bg-brand-600" /></div></div></div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#f5f8f6] lg:flex lg:h-[100dvh] lg:overflow-hidden">
      <Sidebar />
      <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col lg:h-full lg:overflow-hidden">
        <Header />
        <PremiumReminder />  {/* 🟢 Bandeau d'alerte */}
        <NotificationNudge />
        <NotificationInbox />
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-2.5 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pt-6 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:px-8 lg:pb-8"><SmartBackButton />{children}</main>
        <div className="hidden shrink-0 lg:block"><Footer /></div>
      </div>
      <MobileNav />
      <AssistantButton />
      <PinGate />
    </div>
  );
}
