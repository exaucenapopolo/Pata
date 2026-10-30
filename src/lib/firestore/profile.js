import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

const ref = (uid) => doc(db, 'users', uid);

export async function ensureUserProfile(user) {
  if (!user) return null;
  const snap = await getDoc(ref(user.uid));
  if (snap.exists()) return { id: user.uid, ...snap.data() };
  const data = {
    email: user.email,
    displayName: user.displayName || user.email?.split('@')[0] || 'Utilisateur',
    currency: 'XAF',
    penaltyDefault: 500,
    createdAt: serverTimestamp(),
  };
  await setDoc(ref(user.uid), data);
  return { id: user.uid, ...data };
}

export async function getUserProfile(uid) {
  const snap = await getDoc(ref(uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateUserProfile(uid, patch) {
  await updateDoc(ref(uid), { ...patch, updatedAt: serverTimestamp() });
}
