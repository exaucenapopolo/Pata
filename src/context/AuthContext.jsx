'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence,
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

  // Force la persistance locale dès le chargement : la session survit aux
  // rechargements et à la fermeture du navigateur (défaut Firebase, mais explicite).
  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => {
      /* persistance déjà active — aucune action requise */
    });
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const register = (email, password) =>
    createUserWithEmailAndPassword(auth, email, password);

  const loginWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (err) {
      // Annulation volontaire : on ne remonte pas d'erreur
      if (POPUP_DISMISSED_CODES.has(err.code)) return null;
      // Popup bloquée par le navigateur
      if (err.code === 'auth/popup-blocked') {
        const e = new Error(
          'Le navigateur a bloqué la fenêtre Google. Autorise les popups pour ce site, puis réessaie.'
        );
        e.code = err.code;
        throw e;
      }
      // Domaine non autorisé
      if (err.code === 'auth/unauthorized-domain') {
        const e = new Error(
          'Ce domaine n\u2019est pas autorisé dans Firebase. Ajoute-le dans Authentication → Settings → Authorized domains.'
        );
        e.code = err.code;
        throw e;
      }
      // Compte désactivé / annulé côté Google
      if (err.code === 'auth/account-exists-with-different-credential') {
        const e = new Error(
          'Un compte existe déjà avec cet email via une autre méthode de connexion.'
        );
        e.code = err.code;
        throw e;
      }
      throw err;
    }
  };

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, loginWithGoogle, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuthContext = () => useContext(AuthContext);
