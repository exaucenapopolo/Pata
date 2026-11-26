'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { getPageScrollStorageKey, readPageScrollPosition, writePageScrollPosition } from '@/lib/ui/pageScrollStorage.mjs';
import { getSafePageStorage } from '@/lib/ui/pageStateStorage.mjs';
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
import { NativeDatePicker } from '@/components/layout/NativeDatePicker';

export default function AppLayout({ children }) {
  const pathname = usePathname() || '/dashboard';
  const isPremiumPage = pathname === '/premium';
  const { loading, user } = useAuthGuard();
  const lastScrollPositionRef = useRef({ windowY: 0, mainY: 0 });

  useEffect(() => {
    if (!user?.uid || typeof window === 'undefined') return undefined;
    const key = getPageScrollStorageKey(user.uid, pathname);
    const main = document.querySelector('[data-pata-page-scroll]');
    let restoreCancelled = false;
    let restored = false;
    let observer = null;
    let firstFrame = 0;
    let secondFrame = 0;

    const currentPosition = () => ({
      windowY: window.scrollY || document.documentElement.scrollTop || 0,
      mainY: main?.scrollTop || 0,
    });
    lastScrollPositionRef.current = currentPosition();
    const storage = getSafePageStorage();
    const savePosition = () => writePageScrollPosition(storage, key, lastScrollPositionRef.current);
    let pendingSave = false;
    let pendingSaveFrame = 0;
    const queueSave = () => {
      lastScrollPositionRef.current = currentPosition();
      if (pendingSave) return;
      pendingSave = true;
      pendingSaveFrame = window.requestAnimationFrame(() => {
        pendingSave = false;
        pendingSaveFrame = 0;
        savePosition();
      });
    };

    const target = readPageScrollPosition(storage, key);
    let userInteracted = false;
    const cancelRestore = () => { userInteracted = true; };
    const tryRestore = () => {
      if (restoreCancelled || restored || userInteracted) return;
      const documentMax = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const mainMax = main ? Math.max(0, main.scrollHeight - main.clientHeight) : 0;
      const windowReady = target.windowY === 0 || documentMax >= target.windowY;
      const mainReady = !main || target.mainY === 0 || mainMax >= target.mainY;
      if (!windowReady || !mainReady) return;
      if (target.windowY > 0) window.scrollTo({ top: target.windowY, behavior: 'instant' });
      if (main && target.mainY > 0) main.scrollTop = target.mainY;
      lastScrollPositionRef.current = target;
      restored = true;
      observer?.disconnect();
    };

    const onLayoutChange = () => tryRestore();
    if (target.windowY > 0 || target.mainY > 0) {
      observer = new MutationObserver(onLayoutChange);
      if (main) observer.observe(main, { childList: true, subtree: true, attributes: true });
      else observer.observe(document.body, { childList: true, subtree: true });
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(tryRestore);
      });
    } else {
      lastScrollPositionRef.current = { windowY: 0, mainY: 0 };
    }

    window.addEventListener('scroll', queueSave, { passive: true });
    main?.addEventListener('scroll', queueSave, { passive: true });
    window.addEventListener('wheel', cancelRestore, { passive: true, once: true });
    window.addEventListener('touchstart', cancelRestore, { passive: true, once: true });
    window.addEventListener('pointerdown', cancelRestore, { passive: true, once: true });

    return () => {
      restoreCancelled = true;
      savePosition();
      observer?.disconnect();
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.cancelAnimationFrame(pendingSaveFrame);
      window.removeEventListener('scroll', queueSave);
      main?.removeEventListener('scroll', queueSave);
      window.removeEventListener('wheel', cancelRestore);
      window.removeEventListener('touchstart', cancelRestore);
      window.removeEventListener('pointerdown', cancelRestore);
    };
  }, [pathname, user?.uid]);

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
        <main data-pata-page-scroll="true" className={"mx-auto w-full max-w-[1500px] flex-1 min-w-0 " + (isPremiumPage ? "px-3 pb-2 pt-1 sm:px-5 sm:pt-2 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:px-8 lg:pb-3" : "px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pt-5 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:px-8 lg:pb-8")}>{children}</main>
        {!isPremiumPage && <div className="hidden shrink-0 lg:block"><Footer /></div>}
      </div>
      {!isPremiumPage && <MobileNav />}
      {!isPremiumPage && <AssistantButton />}
      <PinGate />
      <AppFeatureTour />
    </div>
  );
}
