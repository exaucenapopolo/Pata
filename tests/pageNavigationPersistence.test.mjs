import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const income = read('../src/app/(app)/income/page.js');
const expenses = read('../src/app/(app)/expenses/page.js');
const layout = read('../src/app/(app)/AppLayoutClient.jsx');
const calendar = read('../src/components/layout/NativeDatePicker.jsx');
const keypad = read('../src/components/layout/MoneyKeypad.jsx');
const serviceWorker = read('../public/sw.js');
const pwaRegister = read('../src/components/PWARegister.jsx');

test('la fiche d’un revenu permet de créer une dépense avec cette source préselectionnée', () => {
  assert.match(income, /Ajouter une dépense à cette source/);
  assert.match(income, /incomeSourceId=' \+ encodeURIComponent\(selectedIncome\.id\)/);
  assert.match(expenses, /params\.get\('incomeSourceId'\)/);
  assert.match(expenses, /incomeSourceId: validIncomeSourceId/);
  assert.match(expenses, /incomeSourceName: validIncomeSourceId !== 'all' \? incomeSourceName/);
});

test('les filtres et fiches sélectionnées des pages Revenus et Dépenses sont persistés', () => {
  assert.match(income, /usePersistentPageState\('income', 'month'/);
  assert.match(income, /usePersistentPageState\('income', 'filterCategory'/);
  assert.match(income, /usePersistentPageState\('income', 'selectedIncome'/);
  assert.match(income, /usePersistentPageState\('income', 'editorOpen'/);
  assert.match(expenses, /usePersistentPageState\('expenses', 'filterCategory'/);
  assert.match(expenses, /usePersistentPageState\('expenses', 'filterIncomeSource'/);
  assert.match(expenses, /usePersistentPageState\('expenses', 'form'/);
  assert.match(expenses, /usePersistentPageState\('expenses', 'selectedExpense'/);
});

test('la position de chaque page est sauvegardée et restaurée dans les conteneurs mobile et desktop', () => {
  assert.match(layout, /getPageScrollStorageKey\(user\.uid, pathname\)/);
  assert.match(layout, /readPageScrollPosition\(window\.localStorage, key\)/);
  assert.match(layout, /writePageScrollPosition\(window\.localStorage, key/);
  assert.match(layout, /data-pata-page-scroll="true"/);
  assert.match(layout, /new MutationObserver\(onLayoutChange\)/);
});

test('le calendrier personnalisé neutralise le sélecteur natif et propose une fermeture explicite', () => {
  assert.match(calendar, /input\.type = 'text'/);
  assert.match(calendar, /input\.type = original\.type/);
  assert.match(calendar, /Fermer le calendrier/);
  assert.match(calendar, /language === 'en' \? 'Close' : 'Fermer'/);
});

test('la calculatrice permet le collage par bouton, appui long et clic droit', () => {
  assert.match(keypad, /ClipboardPaste/);
  assert.match(keypad, /normalizeClipboardAmount/);
  assert.match(keypad, /contextmenu/);
  assert.match(keypad, /setTimeout\(openPasteMenu, 550\)/);
  assert.match(keypad, /pasteClipboardAmount/);
  assert.match(keypad, /Fermer la calculatrice/);
});

test('les anciennes réponses PWA sont invalidées à la mise à jour', () => {
  assert.match(serviceWorker, /CACHE_VERSION = 'v8'/);
  assert.match(pwaRegister, /registration\.update\(\)/);
  assert.match(pwaRegister, /controllerchange/);
  assert.match(pwaRegister, /window\.location\.reload\(\)/);
});
