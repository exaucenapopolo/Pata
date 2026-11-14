'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/client';

const AuthContext = createContext({ user: null, loading: true });

// Codes d'erreur "popup fermée par l'utilisateur" : ce ne sont pas de vrais échecs,
// l'utilisateur a simplement annulé. On ne doit pas afficher d'erreur.
const POPUP_DISMISSED_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
]);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        try {
          const token = await u.getIdToken();
          const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web';
          const passwordLoginEnabled = Array.isArray(u.providerData)
            && u.providerData.some((provider) => provider.providerId === 'password');
          await fetch('/api/profile/activity', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform, passwordLoginEnabled }),
          });
        } catch (error) { console.warn('Activité du compte non synchronisée :', error?.message); }
      }
    });
    return unsub;
  }, []);

  const login = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const register = (email, password) =>
    createUserWithEmailAndPassword(auth, email, password);

  const loginWithGoogle = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        // Ouvrir Google dans l'interface Android native, puis reprendre la
        // session dans Firebase JS pour garder le même compte et les mêmes données.
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        const nativeResult = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
        const idToken = nativeResult?.credential?.idToken;
        if (!idToken) throw new Error('Google n’a pas pu confirmer la connexion. Réessaie.');
        const googleCredential = GoogleAuthProvider.credential(idToken);
        const result = await signInWithCredential(auth, googleCredential);
        return result.user;
      }
      // Le site et la PWA conservent leur parcours de connexion actuel.
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (err) {
      if (POPUP_DISMISSED_CODES.has(err.code)) return null;
      if (err.code === 'auth/popup-blocked') {
        const e = new Error('Le navigateur a bloqué la fenêtre Google. Autorise les fenêtres de connexion, puis réessaie.');
        e.code = err.code; throw e;
      }
      if (err.code === 'auth/unauthorized-domain') {
        const e = new Error('La connexion Google n’est pas autorisée pour cette adresse. Réessaie depuis le site Pata.');
        e.code = err.code; throw e;
      }
      if (err.code === 'auth/account-exists-with-different-credential') {
        const e = new Error('Un compte existe déjà avec cet email. Utilise la méthode de connexion déjà associée à ce compte.');
        e.code = err.code; throw e;
      }
      if (Capacitor.isNativePlatform()) {
        const e = new Error('La connexion Google sur cet appareil n’est pas encore configurée. Utilise temporairement ton adresse e-mail et ton mot de passe, ou connecte-toi sur le site Pata.');
        e.code = err.code || 'auth/native-google-failed'; throw e;
      }
      throw err;
    }
  };

  const logout = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (uid && typeof window !== 'undefined') window.localStorage.removeItem('pata-pin-last-background:' + uid);
    } catch { /* sessionStorage peut être indisponible */ }
    return signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, loginWithGoogle, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuthContext = () => useContext(AuthContext);
