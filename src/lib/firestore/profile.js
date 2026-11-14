import { doc, getDoc, setDoc, updateDoc, serverTimestamp, increment } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { db, auth } from '@/lib/firebase/client';

const ref = (uid) => doc(db, 'users', uid);

async function syncProfileActivity(user) {
  if (!user) return;
  const token = await user.getIdToken();
  const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web';
  const passwordLoginEnabled = Array.isArray(user.providerData)
    && user.providerData.some((provider) => provider.providerId === 'password');
  await fetch('/api/profile/activity', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, passwordLoginEnabled }),
  });
}

export async function ensureUserProfile(user) {
  if (!user) return null;
  const userRef = ref(user.uid);
  const snap = await getDoc(userRef);
  const existing = snap.exists() ? snap.data() || {} : {};
  // An older auth activity hook could leave a skeletal user document before
  // profile setup. Treat a document without createdAt as not initialized yet.
  const created = !snap.exists() || !existing.createdAt;
  const email = user.email || existing.email || '';
  let localLanguage = null;
  let hasPendingLanguageChoice = false;
  try {
    const value = window.localStorage.getItem('pata-language');
    localLanguage = value === 'fr' || value === 'en' ? value : null;
    hasPendingLanguageChoice = window.localStorage.getItem('pata-language-pending') === '1';
  } catch {
    // Utilisateur en environnement sans stockage local.
  }
  const preferredLanguage = hasPendingLanguageChoice && localLanguage
    ? localLanguage
    : ['fr', 'en'].includes(existing.language)
      ? existing.language
      : localLanguage || 'fr';
  const defaults = {
    email,
    displayName: existing.displayName || email.split('@')[0] || 'Utilisateur',
    currency: existing.currency || 'XAF',
    language: preferredLanguage,
    currencyRates: existing.currencyRates || { XAF: 1, EUR: 1 / 655.957, USD: 1 / 600 },
    currencyRateUpdatedAt: existing.currencyRateUpdatedAt || new Date().toISOString(),
    ...(created ? { appTourCompleted: false } : {}),
    ...(!existing.createdAt ? { createdAt: serverTimestamp() } : {}),
  };
  const patch = {};
  Object.entries(defaults).forEach(([key, value]) => {
    if (key === 'language' && hasPendingLanguageChoice && localLanguage) {
      if (existing.language !== value) patch[key] = value;
    } else if (existing[key] === undefined || existing[key] === null || existing[key] === '') {
      patch[key] = value;
    }
  });
  if (Object.keys(patch).length) await setDoc(userRef, patch, { merge: true });
  if (hasPendingLanguageChoice) {
    try { window.localStorage.removeItem('pata-language-pending'); } catch { /* stockage local indisponible */ }
  }
  // Le nouvel utilisateur devient immédiatement trouvable par son nom dans
  // l’autocomplétion des dettes, sans lecture globale des profils.
  if (created) {
    try {
      await syncProfileActivity(user);
    } catch (error) {
      console.warn('Index du nom de profil non synchronisé :', error?.message || error);
    }
  }
  return { id: user.uid, ...existing, ...patch, created };
}

export async function getUserProfile(uid) {
  const snap = await getDoc(ref(uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateUserProfile(uid, patch) {
  const update = { ...patch, updatedAt: serverTimestamp() };
  if (Object.prototype.hasOwnProperty.call(patch, 'photoURL')) {
    update.photoChangeCount = increment(1);
    update.photoUpdatedAt = serverTimestamp();
    update.hasProfilePhoto = Boolean(patch.photoURL);
  }
  await updateDoc(ref(uid), update);
  if ((patch.displayName !== undefined || patch.photoURL !== undefined) && auth.currentUser?.uid === uid) {
    try {
      await syncProfileActivity(auth.currentUser);
    } catch (error) {
      console.warn('Index du profil non actualisé :', error?.message || error);
    }
  }
}
