export const PREMIUM_MONTHLY_PRICE = 2500;

const PREMIUM_BUNDLE_PRICES = Object.freeze({
  1: 2500,
  3: 6999,
  6: 12500,
  12: 25000,
});

const PREMIUM_BUNDLE_LABELS = Object.freeze({
  1: '',
  3: '501 FCFA économisés',
  6: '1 mois offert',
  12: '2 mois offerts',
});

/**
 * Source unique de vérité des tarifs Premium, utilisée par le client et le serveur.
 * Les montants sont recalculés côté serveur au moment de chaque paiement.
 * La remise de parrainage reste distincte de l'avantage lié à la durée.
 */
export function calculatePremiumPricing(months, referralDiscounted = false) {
  const parsedMonths = Math.floor(Number(months));
  const safeMonths = Number.isFinite(parsedMonths)
    ? Math.max(1, Math.min(12, parsedMonths))
    : 1;

  const regularAmount = safeMonths * PREMIUM_MONTHLY_PRICE;
  const bundleAmount = PREMIUM_BUNDLE_PRICES[safeMonths] ?? regularAmount;
  const bundleSavings = Math.max(0, regularAmount - bundleAmount);
  const referralDiscount = referralDiscounted
    ? Math.min(1250, bundleAmount)
    : 0;
  const totalAmount = Math.max(0, bundleAmount - referralDiscount);

  return {
    months: safeMonths,
    regularAmount,
    bundleAmount,
    bundleSavings,
    bundleLabel: PREMIUM_BUNDLE_LABELS[safeMonths] || '',
    referralDiscount,
    durationDiscount: bundleSavings,
    durationDiscountRate: 0,
    totalAmount,
    totalSavings: regularAmount - totalAmount,
  };
}
