// src/lib/firestore/subscriptions.js
import { doc, updateDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

export const PREMIUM_PRICE = 2500;
export const PREMIUM_DURATION_DAYS = 30;

/**
 * Calcule les jours restants avant expiration
 */
export function getSubscriptionStatus(profile) {
  if (!profile?.premiumUntil) return { isPremium: false, daysLeft: 0, expiresAt: null };
  
  const now = new Date();
  const expires = new Date(profile.premiumUntil);
  const daysLeft = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
  
  return {
    isPremium: daysLeft > 0,
    daysLeft: Math.max(0, daysLeft),
    expiresAt: expires,
  };
}

/**
 * Active le premium après un paiement confirmé (appelé côté serveur)
 */
export async function activatePremium(uid, months = 1) {
  // Note: Cette fonction est réservée à l'usage Admin SDK côté serveur.
  // Côté client, on écoute simplement les changements du profil.
  console.log(`Activation premium pour ${uid} (${months} mois)`);
}
