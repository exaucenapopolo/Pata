import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth, indexedDBLocalPersistence } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

function createFirebaseAuth() {
  // Dans l'APK, conserver la session du SDK JavaScript entre les ouvertures.
  if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
    try {
      return initializeAuth(app, { persistence: indexedDBLocalPersistence });
    } catch (error) {
      if (error?.code === 'auth/already-initialized') return getAuth(app);
      throw error;
    }
  }
  return getAuth(app);
}

function createFirestore() {
  // Le rendu serveur Next.js ne dispose pas d'IndexedDB : il garde le cache mémoire.
  // Dans le navigateur/PWA, le cache persistant conserve les documents déjà lus
  // et les écritures Firestore en attente, y compris après fermeture de l'application.
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return getFirestore(app);
  }

  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (error) {
    // Une instance peut déjà exister (HMR ou environnement de navigateur incompatible).
    // On garde alors Firestore utilisable avec son cache mémoire plutôt que de bloquer Pata.
    if (
      error?.code === 'failed-precondition'
      || error?.code === 'firestore/failed-precondition'
      || error?.code === 'already-initialized'
      || error?.code === 'firestore/failed-precondition'
    ) {
      return getFirestore(app);
    }
    console.warn('[PATA FIRESTORE PERSISTENCE]', error?.message || error);
    return getFirestore(app);
  }
}

export const auth = createFirebaseAuth();
export const db = createFirestore();

export async function initAnalytics() {
  if (typeof window === 'undefined') return null;
  try {
    const { getAnalytics, isSupported } = await import('firebase/analytics');
    if (await isSupported()) return getAnalytics(app);
  } catch {
    return null;
  }
  return null;
}

export default app;
