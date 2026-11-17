'use client';

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
      <Sidebar />
      <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col lg:h-full lg:overflow-hidden">
        <Header />
        <AndroidUpdateChecker />
        <SmsImportCoordinator />
        <QuickCaptureCoordinator />
        <PremiumReminder />  {/* 🟢 Bandeau d'alerte */}
        <NativePushManager />
        <FirstAccessPermissions />
        <NotificationNudge />
        <PushMessageListener />
        <NotificationOpportunityTrigger user={user} />
        <main className="mx-auto w-full max-w-[1500px] flex-1 min-w-0 px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pt-5 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:px-8 lg:pb-8">{children}</main>
        <div className="hidden shrink-0 lg:block"><Footer /></div>
      </div>
      <MobileNav />
      <AssistantButton />
      <PinGate />
      <AppFeatureTour />
    </div>
  );
}
