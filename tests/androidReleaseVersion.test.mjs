import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('la mise à jour Android utilise un code supérieur à la version distribuée', () => {
  const version = JSON.parse(read('public/android-version.json'));
  const prepare = read('native/android/prepare-android.mjs');
  const workflow = read('.github/workflows/android-apk.yml');
  assert.equal(version.version, '1.2.5');
  assert.equal(version.versionCode, 26);
  assert.match(prepare, /versionCode 26/);
  assert.match(prepare, /versionName "1.2.5"/);
  assert.match(workflow, /tag_name: android-v1.2.5/);
  assert.match(workflow, /name: Pata Android 1.2.5/);
});

test('le contrôle de mise à jour attend la disponibilité du nouvel APK signé', () => {
  const version = JSON.parse(read('public/android-version.json'));
  const checker = read('src/components/AndroidUpdateChecker.jsx');
  assert.equal(typeof version.downloadAvailable, 'boolean');
  assert.match(checker, /latest\.downloadAvailable === true/);
});
