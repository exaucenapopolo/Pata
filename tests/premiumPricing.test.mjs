import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePremiumPricing } from '../src/lib/premiumPricing.mjs';

test('conserve le tarif mensuel et applique les réductions uniquement à 6 et 12 mois', () => {
  assert.equal(calculatePremiumPricing(1).totalAmount, 2500);
  assert.equal(calculatePremiumPricing(3).totalAmount, 7500);
  assert.equal(calculatePremiumPricing(6).totalAmount, 13500);
  assert.equal(calculatePremiumPricing(12).totalAmount, 27000);
});

test('calcule exactement les économies de 10 %', () => {
  assert.equal(calculatePremiumPricing(6).durationDiscount, 1500);
  assert.equal(calculatePremiumPricing(6).totalSavings, 1500);
  assert.equal(calculatePremiumPricing(12).durationDiscount, 3000);
  assert.equal(calculatePremiumPricing(12).totalSavings, 3000);
});

test('cumule la remise de parrainage et celle de durée', () => {
  assert.equal(calculatePremiumPricing(1, true).totalAmount, 1250);
  assert.equal(calculatePremiumPricing(3, true).totalAmount, 6250);
  assert.equal(calculatePremiumPricing(6, true).totalAmount, 12375);
  assert.equal(calculatePremiumPricing(12, true).totalAmount, 25875);
});

test('borne les durées et protège les entrées invalides', () => {
  assert.equal(calculatePremiumPricing(0).months, 1);
  assert.equal(calculatePremiumPricing(18).months, 12);
  assert.equal(calculatePremiumPricing('abc').months, 1);
});
