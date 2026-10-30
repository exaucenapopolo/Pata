import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function ensureInit() {
  if (getApps().length) return;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Variables Firebase Admin manquantes : FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY. ' +
      'Configure-les dans Vercel → Settings → Environment Variables.'
    );
  }

  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
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
