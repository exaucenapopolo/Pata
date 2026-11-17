import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePremiumPricing } from '../src/lib/premiumPricing.mjs';

test('conserve le tarif mensuel et applique les nouveaux forfaits', () => {
  assert.equal(calculatePremiumPricing(1).totalAmount, 2500);
  assert.equal(calculatePremiumPricing(3).totalAmount, 6999);
  assert.equal(calculatePremiumPricing(6).totalAmount, 12500);
  assert.equal(calculatePremiumPricing(12).totalAmount, 25000);
});

test('calcule les économies et les mois offerts', () => {
  assert.equal(calculatePremiumPricing(3).bundleSavings, 501);
  assert.equal(calculatePremiumPricing(6).bundleSavings, 2500);
  assert.equal(calculatePremiumPricing(12).bundleSavings, 5000);
  assert.equal(calculatePremiumPricing(3).bundleLabel, '501 FCFA économisés');
  assert.equal(calculatePremiumPricing(6).bundleLabel, '1 mois offert');
  assert.equal(calculatePremiumPricing(12).bundleLabel, '2 mois offerts');
});

test('garde la remise de parrainage indépendante de l’avantage multi-mois', () => {
  assert.equal(calculatePremiumPricing(1, true).totalAmount, 1250);
  assert.equal(calculatePremiumPricing(3, true).totalAmount, 5749);
  assert.equal(calculatePremiumPricing(6, true).totalAmount, 11250);
  assert.equal(calculatePremiumPricing(12, true).totalAmount, 23750);
  assert.equal(calculatePremiumPricing(3, true).totalSavings, 1751);
  assert.equal(calculatePremiumPricing(6, true).totalSavings, 3750);
  assert.equal(calculatePremiumPricing(12, true).totalSavings, 6250);
});

test('borne les durées et protège les entrées invalides', () => {
  assert.equal(calculatePremiumPricing(0).months, 1);
  assert.equal(calculatePremiumPricing(18).months, 12);
  assert.equal(calculatePremiumPricing('abc').months, 1);
});
