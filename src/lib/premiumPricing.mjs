export const PREMIUM_MONTHLY_PRICE = 2500;
export const PREMIUM_LONG_TERM_DISCOUNT_RATE = 0.1;
export const PREMIUM_LONG_TERM_MONTHS = Object.freeze([6, 12]);

/**
 * Source unique de vérité des tarifs Premium, utilisée par le client et le serveur.
 * La remise de parrainage s'applique au premier mois, puis la remise de durée
 * s'applique au montant restant pour les forfaits de 6 ou 12 mois.
 */
export function calculatePremiumPricing(months, referralDiscounted = false) {
  const parsedMonths = Math.floor(Number(months));
  const safeMonths = Number.isFinite(parsedMonths)
    ? Math.max(1, Math.min(12, parsedMonths))
    : 1;

  const regularAmount = safeMonths * PREMIUM_MONTHLY_PRICE;
  const referralDiscount = referralDiscounted ? Math.min(1250, regularAmount) : 0;
  const amountAfterReferral = Math.max(0, regularAmount - referralDiscount);
  const hasLongTermDiscount = PREMIUM_LONG_TERM_MONTHS.includes(safeMonths);
  const durationDiscount = hasLongTermDiscount
    ? Math.round(amountAfterReferral * PREMIUM_LONG_TERM_DISCOUNT_RATE)
    : 0;
  const totalAmount = Math.max(0, amountAfterReferral - durationDiscount);

  return {
    months: safeMonths,
    regularAmount,
    referralDiscount,
    durationDiscount,
    durationDiscountRate: hasLongTermDiscount ? PREMIUM_LONG_TERM_DISCOUNT_RATE : 0,
    totalAmount,
    totalSavings: regularAmount - totalAmount,
  };
}
