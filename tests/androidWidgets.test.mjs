import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('le widget financier déclare un espace compatible avec le layout à cinq indicateurs', () => {
  const info = read('native/android/res/xml/pata_quick_widget_info.xml');
  const cotisationInfo = read('native/android/res/xml/pata_cotisation_widget_info.xml');
  assert.match(info, /android:minWidth="250dp"/);
  assert.match(info, /android:minHeight="205dp"/);
  assert.match(info, /android:minResizeWidth="180dp"/);
  assert.match(info, /android:minResizeHeight="130dp"/);
  assert.match(info, /android:updatePeriodMillis="0"/);
  assert.match(info, /android:initialLayout="@layout\/pata_quick_capture_widget"/);
  assert.match(info, /android:previewLayout="@layout\/pata_quick_capture_widget"/);
  assert.match(cotisationInfo, /android:minHeight="205dp"/);
});

test('toutes les vues manipulées par RemoteViews existent dans le layout financier', () => {
  const java = read('native/android/com/pata/app/PataQuickCaptureWidgetProvider.java');
  const layout = read('native/android/res/layout/pata_quick_capture_widget.xml');
  const referencedIds = [...java.matchAll(/R\.id\.([A-Za-z0-9_]+)/g)].map((match) => match[1]);
  const uniqueIds = [...new Set(referencedIds)];
  for (const id of uniqueIds) {
    assert.match(layout, new RegExp('android:id="@\\+id/' + id + '"'), 'missing widget view id: ' + id);
  }
  for (const metric of ['pata_widget_income', 'pata_widget_expense', 'pata_widget_balance', 'pata_widget_receivable', 'pata_widget_payable']) {
    assert.match(layout, new RegExp('android:id="@\\+id/' + metric + '"'));
  }
});

test('les drawables du widget financier sont copiés après cap sync', () => {
  const prepare = read('native/android/prepare-android.mjs');
  const layout = read('native/android/res/layout/pata_quick_capture_widget.xml');
  for (const [, drawable] of layout.matchAll(/@drawable\/([a-z0-9_]+)/g)) {
    assert.ok(prepare.includes("'native/android/res/drawable/" + drawable + ".xml'"), 'drawable not copied: ' + drawable);
  }
});

test('le fournisseur financier et ses deux actions Capacitor restent déclarés', () => {
  const prepare = read('native/android/prepare-android.mjs');
  const provider = read('native/android/com/pata/app/PataQuickCaptureWidgetProvider.java');
  const plugin = read('native/android/com/pata/app/PataQuickCapturePlugin.java');
  assert.match(prepare, /PataQuickCaptureWidgetProvider/);
  assert.match(provider, /public void onUpdate\(/);
  assert.match(plugin, /public void isFinanceWidgetInstalled\(/);
  assert.match(plugin, /public void updateFinanceWidget\(/);
});

test('les mises à jour de Quick Capture alimentent le même cache que le widget financier', () => {
  const provider = read('native/android/com/pata/app/PataQuickCaptureWidgetProvider.java');
  const plugin = read('native/android/com/pata/app/PataQuickCapturePlugin.java');
  const coordinator = read('src/components/QuickCaptureCoordinator.jsx');
  assert.match(provider, /getSharedPreferences\(PREFS, Context\.MODE_PRIVATE\)/);
  assert.match(provider, /private static final String PREFS = "PataFinanceWidget"/);
  assert.match(plugin, /PataQuickCaptureWidgetProvider\.adjustMonthlyTotal\(getContext\(\), type, amount, date\)/);
  assert.match(coordinator, /type: draft\.type === 'income' \? 'income' : 'expense'/);
});
