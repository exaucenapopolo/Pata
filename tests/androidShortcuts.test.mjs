import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const expected = [
  { route: '/expenses?new=1', icon: '/shortcuts/expense.svg', nativeId: 'pata_new_expense' },
  { route: '/income?new=1', icon: '/shortcuts/income.svg', nativeId: 'pata_new_income' },
  { route: '/bills?new=1', icon: '/shortcuts/bill.svg', nativeId: 'pata_new_bill' },
  { route: '/cotisations', icon: '/shortcuts/cotisations.svg', nativeId: 'pata_cotisations' },
];

test('le manifeste PWA déclare quatre raccourcis installables et leurs icônes', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'));
  assert.equal(manifest.shortcuts?.length, 4);
  for (const item of expected) {
    const shortcut = manifest.shortcuts.find((entry) => entry.url === item.route);
    assert.ok(shortcut, 'Raccourci PWA absent : ' + item.route);
    assert.ok(shortcut.name && shortcut.short_name && shortcut.description);
    assert.equal(shortcut.icons?.[0]?.src, item.icon);
    assert.equal(shortcut.icons?.[0]?.type, 'image/svg+xml');
    assert.ok(fs.existsSync(path.join(root, 'public', item.icon.replace(/^\//, ''))), 'Icône absente : ' + item.icon);
  }
});

test('Android déclare les mêmes quatre actions avec identifiants, routes, icônes et libellés', () => {
  const shortcutsXml = fs.readFileSync(path.join(root, 'native/android/res/xml/pata_shortcuts.xml'), 'utf8');
  const valuesXml = fs.readFileSync(path.join(root, 'native/android/res/values/pata_shortcuts.xml'), 'utf8');
  const mainActivity = fs.readFileSync(path.join(root, 'native/android/com/pata/app/MainActivity.java'), 'utf8');
  assert.equal((shortcutsXml.match(/<shortcut\b/g) || []).length, 4);
  for (const item of expected) {
    assert.ok(shortcutsXml.includes('android:shortcutId="' + item.nativeId + '"'));
    assert.ok(shortcutsXml.includes('android:value="' + item.route + '"'));
  }
  for (const label of ['pata_shortcut_expense_short','pata_shortcut_income_short','pata_shortcut_bill_short','pata_shortcut_cotisations_short']) {
    assert.ok(valuesXml.includes('name="' + label + '"'));
  }
  for (const icon of ['ic_shortcut_expense.xml','ic_shortcut_income.xml','ic_shortcut_bill.xml','ic_shortcut_cotisations.xml']) {
    assert.ok(fs.existsSync(path.join(root, 'native/android/res/drawable', icon)), 'Icône Android absente : ' + icon);
  }
  assert.ok(mainActivity.includes('pata_shortcut_target'));
  assert.ok(mainActivity.includes('openShortcutOrNotificationTarget'));
});

test('la préparation Android copie explicitement les ressources dans le projet généré', () => {
  const prepare = fs.readFileSync(path.join(root, 'native/android/prepare-android.mjs'), 'utf8');
  assert.ok(prepare.includes('copyRequiredAndroidResource'));
  assert.ok(prepare.includes('android/app/src/main/res/xml'));
  assert.ok(prepare.includes('android/app/src/main/res/values'));
  assert.ok(prepare.includes('android/app/src/main/res/drawable'));
  assert.ok(prepare.includes('requiredShortcutResources'));
});

test('le raccourci facture ouvre bien le formulaire de création', () => {
  const page = fs.readFileSync(path.join(root, 'src/app/(app)/bills/page.js'), 'utf8');
  assert.ok(page.includes("params.get('new') === '1'"));
  assert.ok(page.includes("window.addEventListener('pata:bill-new'"));
  assert.ok(page.includes('setShowEditor(true)'));
});

if (process.env.PATA_ANDROID_PROJECT_DIR) {
  test('les ressources des raccourcis existent dans le projet Android généré', () => {
    const app = path.join(root, process.env.PATA_ANDROID_PROJECT_DIR, 'app/src/main');
    const required = [
      'res/xml/pata_shortcuts.xml',
      'res/values/pata_shortcuts.xml',
      'res/drawable/ic_shortcut_expense.xml',
      'res/drawable/ic_shortcut_income.xml',
      'res/drawable/ic_shortcut_bill.xml',
      'res/drawable/ic_shortcut_cotisations.xml',
    ];
    for (const relative of required) {
      assert.ok(fs.existsSync(path.join(app, relative)), 'Ressource générée absente : ' + relative);
    }
    const androidManifest = fs.readFileSync(path.join(app, 'AndroidManifest.xml'), 'utf8');
    assert.ok(androidManifest.includes('android.app.shortcuts'));
    assert.ok(androidManifest.includes('@xml/pata_shortcuts'));
  });
}
