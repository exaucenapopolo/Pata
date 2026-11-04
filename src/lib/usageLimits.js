// src/lib/usageLimits.js
import { doc, getDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

export const FREE_LIMITS = {
  EXPENSES: 100,
  INCOMES: 5,
  GOALS: 2,
  BUDGETS: 5,
  DAILY_AI: 3,
};

export const PREMIUM_PRICE = 2500;

/**
 * Vérifie et incrémente le quota. Utilisé côté Client.
 * @param {string} uid
 * @param {string} type - 'expenses' | 'incomes' | 'goals' | 'budgets'
 * @returns {Promise<{allowed: boolean, current: number, limit: number}>}
 */
export async function checkAndIncrementQuota(uid, type) {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return { allowed: false, current: 0, limit: 0 };

  const data = userSnap.data();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Vérifier si l'utilisateur est Premium
  const premiumUntil = data.premiumUntil ? new Date(data.premiumUntil) : null;
  const isPremium = premiumUntil && premiumUntil > now;

  if (isPremium) {
    return { allowed: true, current: 0, limit: Infinity };
  }

  // Reset mensuel si on a changé de mois
  let stats = data.monthlyStats || {};
  if (stats.lastResetMonth !== currentMonth) {
    stats = {
      expenses: 0,
      incomes: 0,
      goals: 0,
      budgets: 0,
      lastResetMonth: currentMonth,
    };
  }

  const currentCount = stats[type] || 0;
  const limit = FREE_LIMITS[type.toUpperCase()];

  if (currentCount >= limit) {
    return { allowed: false, current: currentCount, limit };
  }

  // Incrémenter
  stats[type] = currentCount + 1;
  await updateDoc(userRef, { monthlyStats: stats });
  return { allowed: true, current: stats[type], limit };
}

/**
 * Vérifie et incrémente le quota IA quotidien
 */
export async function checkAndIncrementAIQuota(uid) {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return { allowed: false };

  const data = userSnap.data();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

  const premiumUntil = data.premiumUntil ? new Date(data.premiumUntil) : null;
  const isPremium = premiumUntil && premiumUntil > now;

  if (isPremium) return { allowed: true, remaining: Infinity };

  let dailyStats = data.dailyStats || {};
  if (dailyStats.lastResetDate !== todayStr) {
    dailyStats = { aiCount: 0, lastResetDate: todayStr };
  }

  const currentCount = dailyStats.aiCount || 0;
  if (currentCount >= FREE_LIMITS.DAILY_AI) {
    return { allowed: false, remaining: 0 };
  }

  dailyStats.aiCount = currentCount + 1;
  await updateDoc(userRef, { dailyStats });
  return { allowed: true, remaining: FREE_LIMITS.DAILY_AI - dailyStats.aiCount };
}
