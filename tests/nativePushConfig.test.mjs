import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync(new URL('../native/android/google-services.json', import.meta.url), 'utf8'));
const capacitor = JSON.parse(fs.readFileSync(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const prepare = fs.readFileSync(new URL('../native/android/prepare-android.mjs', import.meta.url), 'utf8');

test('la configuration Firebase correspond à Pata Android', () => {
  assert.equal(config.project_info.project_id, 'pata-af482');
  assert.ok(config.client.some((client) => client.client_info.android_client_info.package_name === 'com.pata.app'));
});

test('Capacitor inclut le plugin FCM natif de la version 6', () => {
  assert.equal(pkg.dependencies['@capacitor/push-notifications'], '6.0.5');
  assert.deepEqual(capacitor.plugins.PushNotifications.presentationOptions, ['badge', 'sound', 'alert']);
});

test('la préparation Android copie la configuration Firebase et conserve la version attendue', () => {
  assert.ok(prepare.includes('native/android/google-services.json'));
  assert.ok(prepare.includes('android/app/google-services.json'));
  assert.ok(prepare.includes('versionCode 10'));
  assert.ok(prepare.includes('versionName "1.0.9"'));
});
