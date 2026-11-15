import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const expected = [
  {
    route: '/expenses?new=1',
    icon: '/shortcuts/expense.svg',
    pngIcon: '/shortcuts/expense.png',
    nativeId: 'pata_new_expense',
    nativeData: 'https://www.pata-yam.site/expenses?new=1',
  },
  {
    route: '/income?new=1',
    icon: '/shortcuts/income.svg',
    pngIcon: '/shortcuts/income.png',
    nativeId: 'pata_new_income',
    nativeData: 'https://www.pata-yam.site/income?new=1',
  },
  {
    route: '/cotisations',
    icon: '/shortcuts/cotisations.svg',
    pngIcon: '/shortcuts/cotisations.png',
    nativeId: 'pata_cotisations',
    nativeData: 'https://www.pata-yam.site/cotisations',
  },
];

test('le manifeste PWA ne publie que les trois raccourcis prioritaires', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'));
  assert.equal(manifest.shortcuts?.length, 3);
  assert.deepEqual(manifest.shortcuts.map((entry) => entry.url), expected.map((item) => item.route));
  for (const item of expected) {
    const shortcut = manifest.shortcuts.find((entry) => entry.url === item.route);
    assert.ok(shortcut, 'Raccourci PWA absent : ' + item.route);
    assert.ok(shortcut.name && shortcut.short_name && shortcut.description);
    assert.equal(shortcut.icons?.[0]?.src, item.pngIcon);
    assert.equal(shortcut.icons?.[0]?.type, 'image/png');
    assert.ok(shortcut.icons?.some((icon) => icon.src === item.icon && icon.type === 'image/svg+xml'));
    assert.ok(fs.existsSync(path.join(root, 'public', item.pngIcon.slice(1))), 'Icône PNG absente : ' + item.pngIcon);
    assert.ok(fs.existsSync(path.join(root, 'public', item.icon.replace(/^\//, ''))), 'Icône absente : ' + item.icon);
  }
  assert.equal(manifest.shortcuts.some((entry) => entry.url.startsWith('/bills')), false);
});

test('Android déclare les mêmes trois raccourcis avec des intents conformes', () => {
  const shortcutsXml = fs.readFileSync(path.join(root, 'native/android/res/xml/pata_shortcuts.xml'), 'utf8');
  const valuesXml = fs.readFileSync(path.join(root, 'native/android/res/values/pata_shortcuts.xml'), 'utf8');
  const mainActivity = fs.readFileSync(path.join(root, 'native/android/com/pata/app/MainActivity.java'), 'utf8');
  assert.equal((shortcutsXml.match(/<shortcut\b/g) || []).length, 3);
  assert.equal((shortcutsXml.match(/<extra\b/g) || []).length, 0);
  for (const item of expected) {
    assert.ok(shortcutsXml.includes('android:shortcutId="' + item.nativeId + '"'));
    assert.ok(shortcutsXml.includes('android:data="' + item.nativeData + '"'));
  }
  for (const label of ['pata_shortcut_expense_short','pata_shortcut_income_short','pata_shortcut_cotisations_short']) {
    assert.ok(valuesXml.includes('name="' + label + '"'));
  }
  for (const icon of ['ic_shortcut_expense.xml','ic_shortcut_income.xml','ic_shortcut_cotisations.xml']) {
    assert.ok(fs.existsSync(path.join(root, 'native/android/res/drawable', icon)), 'Icône Android absente : ' + icon);
  }
  assert.ok(mainActivity.includes('getShortcutTargetFromData'));
  assert.ok(mainActivity.includes('pata_notification_target'));
  assert.ok(mainActivity.includes('openShortcutOrNotificationTarget'));
});

test('la préparation Android attache les raccourcis à l’activité principale de lancement', () => {
  const prepare = fs.readFileSync(path.join(root, 'native/android/prepare-android.mjs'), 'utf8');
  assert.ok(prepare.includes('copyRequiredAndroidResource'));
  assert.ok(prepare.includes('android/app/src/main/res/xml'));
  assert.ok(prepare.includes('android/app/src/main/res/values'));
  assert.ok(prepare.includes('android/app/src/main/res/drawable'));
  assert.ok(prepare.includes('requiredShortcutResources'));
  assert.ok(prepare.includes('android.intent.category.LAUNCHER'));
  assert.ok(prepare.includes('launcherActivityMatch'));
});

if (process.env.PATA_ANDROID_PROJECT_DIR) {
  test('les ressources et la métadonnée existent dans le manifeste Android généré', () => {
    const app = path.join(root, process.env.PATA_ANDROID_PROJECT_DIR, 'app/src/main');
    const required = [
      'res/xml/pata_shortcuts.xml',
      'res/values/pata_shortcuts.xml',
      'res/drawable/ic_shortcut_expense.xml',
      'res/drawable/ic_shortcut_income.xml',
      'res/drawable/ic_shortcut_cotisations.xml',
    ];
    for (const relative of required) {
      assert.ok(fs.existsSync(path.join(app, relative)), 'Ressource générée absente : ' + relative);
    }
    const androidManifest = fs.readFileSync(path.join(app, 'AndroidManifest.xml'), 'utf8');
    const launcherActivity = (androidManifest.match(/<(activity(?:-alias)?)\b[\s\S]*?<\/\1>/g) || [])
      .find((block) =>
        block.includes('android.intent.action.MAIN')
        && block.includes('android.intent.category.LAUNCHER')
      );
    assert.ok(launcherActivity, 'Activité MAIN/LAUNCHER introuvable dans AndroidManifest.xml');
    assert.ok(launcherActivity.includes('android.app.shortcuts'));
    assert.ok(launcherActivity.includes('@xml/pata_shortcuts'));
    const remainingManifest = androidManifest.replace(launcherActivity, '');
    assert.equal((remainingManifest.match(/android:name="android\.app\.shortcuts"/g) || []).length, 0);
    assert.equal((launcherActivity.match(/android:name="android\.app\.shortcuts"/g) || []).length, 1);
  });
}
