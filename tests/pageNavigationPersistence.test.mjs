import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const income = read('../src/app/(app)/income/page.js');
const expenses = read('../src/app/(app)/expenses/page.js');
const dashboard = read('../src/app/(app)/dashboard/page.js');
const budgets = read('../src/app/(app)/budgets/page.js');
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
  assert.match(layout, /readPageScrollPosition\(storage, key\)/);
  assert.match(layout, /getSafePageStorage\(\)/);
  assert.match(layout, /writePageScrollPosition\(storage, key/);
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


test('la calculatrice conserve le vrai champ de montant et le clavier Android', () => {
  assert.match(keypad, /document\.addEventListener\('focusin', handleFocusIn, true\)/);
  assert.match(keypad, /input\.addEventListener\('input', handleNativeInput\)/);
  assert.match(keypad, /syncingCalculatorValueRef/);
  assert.doesNotMatch(keypad, /input\.readOnly = true/);
  assert.doesNotMatch(keypad, /setAttribute\('inputmode', 'none'\)/);
  assert.doesNotMatch(keypad, /expressionInputRef/);
  assert.doesNotMatch(keypad, /event\.preventDefault\(\);\s*void pasteClipboardAmount/);
});

test('la calculatrice garde ses touches de suppression liées au montant du formulaire', () => {
  assert.match(keypad, /applyMoneyKey\(current, key\)/);
  assert.match(keypad, /key\.action \|\| key\.label/);
  assert.match(keypad, /setInputValue\(input, value\)/);
  assert.match(keypad, /Fermer la calculatrice/);
});

test('les anciennes réponses PWA sont invalidées à la mise à jour', () => {
  assert.match(serviceWorker, /CACHE_VERSION = 'v8'/);
  assert.match(pwaRegister, /registration\.update\(\)/);
  assert.match(pwaRegister, /controllerchange/);
  assert.match(pwaRegister, /window\.location\.reload\(\)/);
});


test('le tableau de bord lit le compte avant de créer ses états persistés', () => {
  const component = dashboard.slice(dashboard.indexOf('export default function DashboardPage()'));
  const userDeclaration = component.indexOf('const { user } = useAuth();');
  const firstPersistentState = component.indexOf('usePersistentPageState(');
  assert.ok(userDeclaration >= 0 && firstPersistentState >= 0 && userDeclaration < firstPersistentState,
    'user doit être déclaré avant son utilisation dans les clés d’états persistés');
});

test('la catégorie cible du budget est déclarée avant le premier effet qui la lit', () => {
  const declaration = budgets.indexOf("const [targetCategoryId, setTargetCategoryId] = usePersistentPageState(");
  const firstUse = budgets.indexOf('if (!targetCategoryId && expenseCategories[0]?.id)');
  assert.ok(declaration >= 0 && firstUse >= 0 && declaration < firstUse,
    'targetCategoryId ne doit pas être référencé avant son initialisation');
});




test('le refus de lecture du presse-papiers laisse le clavier Android et le collage natif disponibles', () => {
  const start = keypad.indexOf('const pasteClipboardAmount');
  const end = keypad.indexOf("  useEffect(() => {", start);
  const pasteHandler = keypad.slice(start, end);
  assert.match(pasteHandler, /allowNativeContextMenuRef\.current = true/);
  assert.match(pasteHandler, /input\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(pasteHandler, /setActiveField\(null\)|activeInputRef\.current = null|input\.readOnly = true/);
  assert.match(keypad, /if \(allowNativeContextMenuRef\.current\)[\s\S]*?return; \/\/ Laisse Android afficher son menu système Coller\./);
});
