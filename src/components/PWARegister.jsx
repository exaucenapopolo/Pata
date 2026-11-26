'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

const APP_BUILD_ID = process.env.NEXT_PUBLIC_APP_BUILD_ID || 'local';
const NATIVE_WORKER_RELOAD_KEY = 'pata-native-worker-cleanup-reload-v1';
const PATA_CACHE_PATTERN = /^pata-(?:cache|static|pages|rsc)-/;

function getNativeReloadMarker() {
  try { return window.sessionStorage.getItem(NATIVE_WORKER_RELOAD_KEY) === '1'; }
  catch { return false; }
}

function setNativeReloadMarker(value) {
  try {
    if (value) window.sessionStorage.setItem(NATIVE_WORKER_RELOAD_KEY, '1');
    else window.sessionStorage.removeItem(NATIVE_WORKER_RELOAD_KEY);
  } catch { /* WebView storage can be unavailable; cleanup still proceeds. */ }
}

async function disablePwaWorkerInNativeWebView() {
  const hadController = Boolean(navigator.serviceWorker?.controller);
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
    await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
  }
  if ('caches' in window) {
    const cacheNames = await window.caches.keys().catch(() => []);
    await Promise.all(cacheNames
      .filter((name) => PATA_CACHE_PATTERN.test(name))
      .map((name) => window.caches.delete(name).catch(() => false)));
  }
  if (hadController && !getNativeReloadMarker()) {
    setNativeReloadMarker(true);
    window.location.reload();
    return true;
  }
  if (!hadController) setNativeReloadMarker(false);
  return false;
}

export function PWARegister() {
  useEffect(() => {
    let active = true;

    if (Capacitor.isNativePlatform()) {
      let checkingBuild = false;
      let appStateListenerPromise = null;
      let appStateListener = null;

      const checkRemoteWebBuild = async () => {
        if (!active || checkingBuild || !APP_BUILD_ID || APP_BUILD_ID === 'local') return false;
        checkingBuild = true;
        try {
          const response = await fetch('/api/app-version', {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' },
          });
          if (!response.ok) return false;
          const payload = await response.json();
          const remoteBuildId = String(payload?.buildId || '');
          if (active && remoteBuildId && remoteBuildId !== APP_BUILD_ID) {
            window.location.reload();
            return true;
          }
        } catch (error) {
          console.warn('[PATA NATIVE WEB UPDATE]', error?.message || error);
        } finally {
          checkingBuild = false;
        }
        return false;
      };

      const startNativeRuntime = async () => {
        try {
          if ('serviceWorker' in navigator) {
            const reloaded = await disablePwaWorkerInNativeWebView();
            if (reloaded || !active) return;
          }
          if (await checkRemoteWebBuild() || !active) return;
          appStateListenerPromise = App.addListener('appStateChange', ({ isActive }) => {
            if (isActive) void checkRemoteWebBuild();
          });
          appStateListenerPromise.then((listener) => {
            if (active) appStateListener = listener;
            else listener.remove();
          }).catch((error) => {
            console.warn('[PATA NATIVE WEB UPDATE LISTENER]', error?.message || error);
          });
        } catch (error) {
          console.warn('[PATA NATIVE WEB STARTUP]', error?.message || error);
        }
      };

      void startNativeRuntime();
      return () => {
        active = false;
        if (appStateListener) appStateListener.remove();
        else appStateListenerPromise?.then((listener) => listener.remove()).catch(() => {});
      };
    }

    if (!('serviceWorker' in navigator)) return undefined;
    let hadControllerAtStart = Boolean(navigator.serviceWorker.controller);
    const handleControllerChange = () => {
      if (hadControllerAtStart && active) {
        window.location.reload();
        return;
      }
      hadControllerAtStart = true;
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    const registerAppWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });
        await registration.update().catch(() => {});
      } catch (error) {
        if (active) console.warn('[PATA PWA WORKER]', error?.message || error);
      }
    };
    void registerAppWorker();
    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  return null;
}
