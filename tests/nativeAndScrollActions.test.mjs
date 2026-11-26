import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shouldShowScrollAction } from '../src/lib/ui/scrollActionVisibility.mjs';

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

test('le bouton flottant apparaît uniquement après avoir dépassé le seuil de défilement', () => {
  assert.equal(shouldShowScrollAction({ windowY: 0, mainY: 0, threshold: 240 }), false);
  assert.equal(shouldShowScrollAction({ windowY: 240, mainY: 0, threshold: 240 }), false);
  assert.equal(shouldShowScrollAction({ windowY: 241, mainY: 0, threshold: 240 }), true);
});

test('le bouton flottant tient compte du défilement du document comme du conteneur principal', () => {
  assert.equal(shouldShowScrollAction({ windowY: 0, mainY: 520 }), true);
  assert.equal(shouldShowScrollAction({ windowY: 330, mainY: 0 }), true);
  assert.equal(shouldShowScrollAction({ windowY: -10, mainY: -4 }), false);
});

test('les pages Dépenses et Revenus exposent un raccourci Ajouter qui disparaît en haut de page', () => {
  const expenses = read('../src/app/(app)/expenses/page.js');
  const income = read('../src/app/(app)/income/page.js');
  const component = read('../src/components/layout/ScrollAwareAddButton.jsx');
  assert.ok(expenses.includes('<ScrollAwareAddButton'));
  assert.ok(expenses.includes('visible={!selectionMode && !open'));
  assert.ok(income.includes('<ScrollAwareAddButton'));
  assert.ok(income.includes('visible={!open && !selectedIncome'));
  assert.ok(component.includes("window.addEventListener('scroll'"));
  assert.ok(component.includes("pageScroller?.addEventListener('scroll'"));
  assert.ok(component.includes('fixed left-4'));
  assert.ok(component.includes('shouldShowScrollAction'));
});

test('les actions de sélection restent fixes, visibles et ouvrent le menu au-dessus du bouton', () => {
  const page = read('../src/app/(app)/expenses/page.js');
  const dock = read('../src/components/layout/ExpenseSelectionActionDock.jsx');
  assert.ok(page.includes('<ExpenseSelectionActionDock'));
  assert.ok(!page.includes('bulkOptionsMenuRef'));
  assert.ok(!page.includes('MoreVertical'));
  assert.ok(dock.includes('createPortal('));
  assert.ok(dock.includes('fixed left-4'));
  assert.ok(dock.includes('aria-haspopup="menu"'));
  assert.ok(dock.includes('role="menu"'));
  assert.ok(dock.includes('closeOnOutsidePointer'));
  assert.ok(dock.includes('closeOnEscape'));
  for (const action of ['Modifier ensemble', 'Changer la date', 'Regrouper les revenus', 'Supprimer']) {
    assert.ok(dock.includes(action), 'action manquante : ' + action);
  }
});

test('l’APK utilise le site distant et le runtime natif vérifie les nouvelles versions web sans service worker PWA', () => {
  const config = JSON.parse(read('../capacitor.config.json'));
  const registration = read('../src/components/PWARegister.jsx');
  const route = read('../src/app/api/app-version/route.js');
  const nextConfig = read('../next.config.js');
  assert.equal(config.server.url, 'https://www.pata-yam.site');
  assert.ok(registration.includes('Capacitor.isNativePlatform()'));
  assert.ok(registration.includes('disablePwaWorkerInNativeWebView'));
  assert.ok(registration.includes('getRegistrations()'));
  assert.ok(registration.includes('registration.unregister()'));
  assert.ok(registration.includes('window.caches.delete'));
  assert.ok(registration.includes("App.addListener('appStateChange'"));
  assert.ok(registration.includes("fetch('/api/app-version'"));
  assert.ok(route.includes("dynamic = 'force-dynamic'"));
  assert.ok(route.includes("'Cache-Control': 'no-store"));
  assert.ok(route.includes('VERCEL_GIT_COMMIT_SHA'));
  assert.ok(nextConfig.includes('NEXT_PUBLIC_APP_BUILD_ID'));
});
