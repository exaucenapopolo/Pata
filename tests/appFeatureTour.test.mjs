import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/components/AppFeatureTour.jsx', 'utf8');

test('le guide automatique se limite aux trois premiers apprentissages', () => {
  assert.match(source, /FIRST_TOUR_STEPS\s*=\s*\{/);
  assert.match(source, /fr:\s*TOUR_STEPS\.fr\.filter\(\(_, index\) => index <= 2\)/);
  assert.match(source, /en:\s*TOUR_STEPS\.en\.filter\(\(_, index\) => index <= 2\)/);
  assert.match(source, /setFullGuide\(false\)/);
});

test('le guide complet reste accessible manuellement depuis les paramètres', () => {
  assert.match(source, /fullGuide\s*\?\s*\(isEnglish \? TOUR_STEPS\.en : TOUR_STEPS\.fr\)/);
  assert.match(source, /const startTour = useCallback\(\(\) => \{[\s\S]*?setFullGuide\(true\)/);
  assert.match(source, /if \(!startRequest[\s\S]*?setFullGuide\(true\)/);
  const frenchSteps = source.slice(source.indexOf('  fr: ['), source.indexOf('  en: ['));
  assert.equal((frenchSteps.match(/target:/g) || []).length, 13);
});
