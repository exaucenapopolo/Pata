import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';

const ref = (uid) => doc(db, 'users', uid);

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
      const token = await user.getIdToken();
      await fetch('/api/profile/activity', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
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
  await updateDoc(ref(uid), { ...patch, updatedAt: serverTimestamp() });
  if (patch.displayName !== undefined && auth.currentUser?.uid === uid) {
    try {
      const token = await auth.currentUser.getIdToken();
      await fetch('/api/profile/activity', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
    } catch (error) {
      console.warn('Index du nom de profil non actualisé :', error?.message || error);
    }
  }
}
