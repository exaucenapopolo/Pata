// src/lib/firebase/admin.js
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!serviceAccountKey) {
    throw new Error(
      'La variable FIREBASE_SERVICE_ACCOUNT_KEY est manquante. Configure-la dans Vercel.'
    );
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountKey);
    initializeApp({
      credential: cert(serviceAccount),
    });
  } catch (error) {
    console.error('Erreur de parsing du JSON:', error);
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_KEY est invalide. Assure-toi de coller le JSON complet.'
    );
  }
}

export const adminAuth = getAuth();
export const adminDb = getFirestore();
