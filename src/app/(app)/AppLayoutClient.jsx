'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { MobileNav } from '@/components/layout/MobileNav';
import { Footer } from '@/components/layout/Footer';
import { PremiumReminder } from '@/components/PremiumReminder'; // 🟢 Nouveau
import { AssistantButton } from '@/components/ai/AssistantButton';
import { NotificationNudge } from '@/components/NotificationNudge';
import { NativePushManager } from '@/components/NotificationSettings';
import { FirstAccessPermissions } from '@/components/FirstAccessPermissions';
import { PushMessageListener } from '@/components/PushMessageListener';
import { NotificationOpportunityTrigger } from '@/components/NotificationOpportunityTrigger';
import { PinGate } from '@/components/security/PinGate';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { SmsImportCoordinator } from '@/components/SmsImportCoordinator';
import { QuickCaptureCoordinator } from '@/components/QuickCaptureCoordinator';
import { AndroidUpdateChecker } from '@/components/AndroidUpdateChecker';
import { AppFeatureTour } from '@/components/AppFeatureTour';
import { AppLoadingScreen } from '@/components/layout/AppLoadingScreen';
import { AppNavigationProgress } from '@/components/layout/AppNavigationProgress';
import { PageUsageTracker } from '@/components/layout/PageUsageTracker';
import { NativeHaptics } from '@/components/layout/NativeHaptics';
import { MoneyKeypad } from '@/components/layout/MoneyKeypad';
import { NativeDatePicker } from '@/components/layout/NativeDatePicker';

export default function AppLayout({ children }) {
  const pathname = usePathname() || '/dashboard';
  const isPremiumPage = pathname === '/premium';
  const { loading, user } = useAuthGuard();

  if (loading || !user) {
    return (
      <AppLoadingScreen />
    );
  }

  return (
    <div className="pata-app-shell relative isolate min-h-[100dvh] bg-[#f0f6f1] lg:flex lg:h-[100dvh] lg:overflow-hidden">
      <AppNavigationProgress />
      <NativeHaptics />
      <MoneyKeypad />
      <NativeDatePicker />
      <PageUsageTracker uid={user.uid} />
      {!isPremiumPage && <Sidebar />}
      <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col lg:h-full lg:overflow-hidden">
        <Header />
        <AndroidUpdateChecker />
        <SmsImportCoordinator />
        <QuickCaptureCoordinator />
        {!isPremiumPage && <PremiumReminder />}
        <NativePushManager />
        <FirstAccessPermissions />
        <NotificationNudge />
        <PushMessageListener />
        <NotificationOpportunityTrigger user={user} />
        <main className={"mx-auto w-full max-w-[1500px] flex-1 min-w-0 " + (isPremiumPage ? "px-3 pb-2 pt-1 sm:px-5 sm:pt-2 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:px-8 lg:pb-3" : "px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pt-5 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:px-8 lg:pb-8")}>{children}</main>
        {!isPremiumPage && <div className="hidden shrink-0 lg:block"><Footer /></div>}
      </div>
      {!isPremiumPage && <MobileNav />}
      {!isPremiumPage && <AssistantButton />}
      <PinGate />
      <AppFeatureTour />
    </div>
  );
}
