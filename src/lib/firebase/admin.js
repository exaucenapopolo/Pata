import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function ensureInit() {
  if (getApps().length) return;

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    throw new Error('Variables manquantes: FIREBASE_SERVICE_ACCOUNT_KEY est introuvable dans Vercel.');
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountKey);
    initializeApp({
      credential: cert(serviceAccount),
    });
  } catch (error) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY est invalide. Vérifie le JSON : ' + error.message);
  }
}

export const adminAuth = new Proxy({}, {
  get(_, prop) {
    ensureInit();
    const auth = getAuth();
    const value = auth[prop];
    return typeof value === 'function' ? value.bind(auth) : value;
  },
});

export const adminDb = new Proxy({}, {
  get(_, prop) {
    ensureInit();
    const db = getFirestore();
    const value = db[prop];
    return typeof value === 'function' ? value.bind(db) : value;
  },
});
