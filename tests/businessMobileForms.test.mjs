import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const businessPage = fs.readFileSync('src/app/(app)/businesses/[businessId]/page.jsx', 'utf8');
const teamPage = fs.readFileSync('src/app/(app)/businesses/[businessId]/team/page.jsx', 'utf8');
const styles = fs.readFileSync('src/app/globals.css', 'utf8');

test('les espaces entreprise conservent une largeur fluide et évitent les débordements des champs', () => {
  assert.match(businessPage, /business-workspace mx-auto w-full min-w-0 max-w-6xl/);
  assert.match(teamPage, /business-workspace mx-auto w-full min-w-0 max-w-4xl/);
  assert.match(styles, /\.business-workspace form input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\)/);
  assert.match(styles, /max-width: 100%;\s*min-width: 0;/);
});

test('les formulaires entreprise passent en une colonne sur les petits écrans', () => {
  assert.match(styles, /@media \(max-width: 479px\)[\s\S]*?\.business-workspace form \.grid-cols-2,[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important/);
  assert.match(styles, /\.business-workspace form \.grid-cols-3/);
});

test('les fenêtres de l’équipe restent accessibles au-dessus du clavier et des zones système', () => {
  assert.match(teamPage, /max-h-\[calc\(100dvh-env\(safe-area-inset-top\)-env\(safe-area-inset-bottom\)-1rem\)\]/);
  assert.match(teamPage, /overflow-y-auto overscroll-contain/);
  assert.match(teamPage, /pb-\[calc\(env\(safe-area-inset-bottom\)\+\.5rem\)\]/);
});
