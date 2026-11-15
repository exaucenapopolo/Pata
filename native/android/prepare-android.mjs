import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();

// Inclure le SDK Google dans le plugin d'authentification natif.
const variablesGradlePath = path.join(root, 'android/variables.gradle');
if (!fs.existsSync(variablesGradlePath)) {
  throw new Error('Le fichier android/variables.gradle est introuvable après la génération Android.');
}
let variablesGradle = fs.readFileSync(variablesGradlePath, 'utf8');
if (!/\brgcfaIncludeGoogle\s*=/.test(variablesGradle)) {
  const extBlock = variablesGradle.match(/\bext\s*\{/);
  if (!extBlock) throw new Error('Le bloc ext de android/variables.gradle est introuvable.');
  const insertAt = extBlock.index + extBlock[0].length;
  variablesGradle = variablesGradle.slice(0, insertAt) + '\n    rgcfaIncludeGoogle = true' + variablesGradle.slice(insertAt);
  fs.writeFileSync(variablesGradlePath, variablesGradle);
}
const javaSource = path.join(root, 'native/android/com/pata/app');
const javaTarget = path.join(root, 'android/app/src/main/java/com/pata/app');
fs.mkdirSync(javaTarget, { recursive: true });

// Firebase Android client configuration required by Capacitor Push Notifications.
const firebaseConfigSource = path.join(root, 'native/android/google-services.json');
const firebaseConfigTarget = path.join(root, 'android/app/google-services.json');
if (!fs.existsSync(firebaseConfigSource)) {
  throw new Error('native/android/google-services.json est obligatoire pour les notifications FCM Android.');
}
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigSource, 'utf8'));
const androidClient = firebaseConfig.client?.find(
  (client) => client.client_info?.android_client_info?.package_name === 'com.pata.app'
);
if (firebaseConfig.project_info?.project_id !== 'pata-af482' || !androidClient) {
  throw new Error('La configuration Firebase ne correspond pas à Pata Android (com.pata.app / pata-af482).');
}
fs.copyFileSync(firebaseConfigSource, firebaseConfigTarget);

// Reprend exactement l'icône configurée pour la PWA.
const assetsDir = path.join(root, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });
fs.copyFileSync(
  path.join(root, 'public/android-chrome-512x512.png'),
  path.join(assetsDir, 'icon.png')
);
fs.copyFileSync(
  path.join(root, 'public/android-chrome-512x512.png'),
  path.join(assetsDir, 'splash.png')
);
execFileSync('npx', [
  'capacitor-assets', 'generate', '--android',
  '--iconBackgroundColor', '#075b43',
  '--splashBackgroundColor', '#f5f8f6',
], { cwd: root, stdio: 'inherit' });

for (const file of [
  'MainActivity.java',
  'PataQuickCapturePlugin.java',
  'PataQuickCaptureReceiver.java',
  'PataQuickCaptureWidgetProvider.java',
  'PataQuickCaptureTileService.java',
  'PataSmsPlugin.java',
  'PataSmsReceiver.java',
  'PataMobileMoneyParser.java',
  'PataSmsSyncWorker.java',
]) {
  fs.copyFileSync(path.join(javaSource, file), path.join(javaTarget, file));
}

const iconResourceDir = path.join(root, 'android/app/src/main/res/drawable');
const largeIconDir = path.join(root, 'android/app/src/main/res/drawable-nodpi');
const valuesResourceDir = path.join(root, 'android/app/src/main/res/values');
const layoutResourceDir = path.join(root, 'android/app/src/main/res/layout');
fs.mkdirSync(iconResourceDir, { recursive: true });
fs.mkdirSync(largeIconDir, { recursive: true });
fs.mkdirSync(valuesResourceDir, { recursive: true });
fs.mkdirSync(layoutResourceDir, { recursive: true });
const shortcutsResourceDir = path.join(root, 'android/app/src/main/res/xml');
fs.mkdirSync(shortcutsResourceDir, { recursive: true });

function copyRequiredAndroidResource(source, destination) {
  if (!fs.existsSync(source)) {
    throw new Error('Ressource Android obligatoire introuvable : ' + path.relative(root, source));
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  if (!fs.existsSync(destination)) {
    throw new Error('La copie de la ressource Android a échoué : ' + path.relative(root, destination));
  }
}

// Les ressources de raccourcis sont recopiées APRÈS cap sync, qui peut nettoyer res/.
for (const file of [
  'ic_shortcut_expense.xml',
  'ic_shortcut_income.xml',
  'ic_shortcut_cotisations.xml',
]) {
  copyRequiredAndroidResource(
    path.join(root, 'native/android/res/drawable', file),
    path.join(iconResourceDir, file)
  );
}
copyRequiredAndroidResource(
  path.join(root, 'native/android/res/xml/pata_shortcuts.xml'),
  path.join(shortcutsResourceDir, 'pata_shortcuts.xml')
);
copyRequiredAndroidResource(
  path.join(root, 'native/android/res/values/pata_shortcuts.xml'),
  path.join(valuesResourceDir, 'pata_shortcuts.xml')
);
fs.copyFileSync(path.join(root, 'native/android/res/drawable/ic_stat_pata.xml'), path.join(iconResourceDir, 'ic_stat_pata.xml'));
fs.copyFileSync(path.join(root, 'native/android/res/values/pata_colors.xml'), path.join(valuesResourceDir, 'pata_colors.xml'));
fs.copyFileSync(path.join(root, 'public/android-chrome-192x192.png'), path.join(largeIconDir, 'pata_notification_large.png'));
for (const [source, destination] of [
  ['native/android/res/layout/pata_quick_capture_widget.xml', 'android/app/src/main/res/layout/pata_quick_capture_widget.xml'],
  ['native/android/res/drawable/pata_widget_background.xml', 'android/app/src/main/res/drawable/pata_widget_background.xml'],
  ['native/android/res/drawable/ic_pata_widget_mic.xml', 'android/app/src/main/res/drawable/ic_pata_widget_mic.xml'],
  ['native/android/res/xml/pata_quick_widget_info.xml', 'android/app/src/main/res/xml/pata_quick_widget_info.xml'],
]) {
  copyRequiredAndroidResource(path.join(root, source), path.join(root, destination));
}

const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');
const permissions = [
  'android.permission.RECEIVE_SMS',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.INTERNET',
];
for (const permission of permissions) {
  if (!manifest.includes(permission)) {
    manifest = manifest.replace('<application', '    <uses-permission android:name="' + permission + '" />\n    <application');
  }
}
if (!manifest.includes('PataSmsReceiver')) {
  const receiver = '\n        <receiver\n            android:name="com.pata.app.PataSmsReceiver"\n            android:enabled="true"\n            android:exported="true">\n            <intent-filter android:priority="999">\n                <action android:name="android.provider.Telephony.SMS_RECEIVED" />\n            </intent-filter>\n        </receiver>\n';
  manifest = manifest.replace('</application>', receiver + '    </application>');
}
if (!manifest.includes('PataQuickCaptureReceiver')) {
  const quickCaptureReceiver = [
    '        <receiver android:name="com.pata.app.PataQuickCaptureReceiver" android:enabled="true" android:exported="false">',
    '            <intent-filter><action android:name="com.pata.app.QUICK_CAPTURE_REPLY" /></intent-filter>',
    '            <intent-filter><action android:name="android.intent.action.BOOT_COMPLETED" /></intent-filter>',
    '        </receiver>',
  ].join('\n');
  manifest = manifest.replace('</application>', quickCaptureReceiver + '\n    </application>');
}
if (!manifest.includes('PataQuickCaptureWidgetProvider')) {
  const widgetReceiver = [
    '        <receiver android:name="com.pata.app.PataQuickCaptureWidgetProvider" android:enabled="true" android:exported="true">',
    '            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>',
    '            <meta-data android:name="android.appwidget.provider" android:resource="@xml/pata_quick_widget_info" />',
    '        </receiver>',
  ].join('\n');
  manifest = manifest.replace('</application>', widgetReceiver + '\n    </application>');
}
if (!manifest.includes('PataQuickCaptureTileService')) {
  const tileService = [
    '        <service android:name="com.pata.app.PataQuickCaptureTileService" android:label="Pata · Dépense rapide" android:icon="@drawable/ic_stat_pata" android:permission="android.permission.BIND_QUICK_SETTINGS_TILE" android:exported="true">',
    '            <intent-filter><action android:name="android.service.quicksettings.action.QS_TILE" /></intent-filter>',
    '        </service>',
  ].join('\n');
  manifest = manifest.replace('</application>', tileService + '\n    </application>');
}
// Firebase Cloud Messaging : identité Pata et canal système par défaut.
if (!manifest.includes('com.google.firebase.messaging.default_notification_icon')) {
  const applicationTag = manifest.match(/<application\b[^>]*>/);
  if (!applicationTag) throw new Error('Balise application Android introuvable.');
  const firebaseMetadata = [
    '        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_pata" />',
    '        <meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/pata_notification_color" />',
    '        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="pata_general" />',
  ].join('\n');
  manifest = manifest.replace(applicationTag[0], applicationTag[0] + '\n' + firebaseMetadata);
}

// Android ne lit les raccourcis statiques que depuis l'activité MAIN/LAUNCHER.
manifest = manifest.replace(
  /<meta-data\b(?=[^>]*android:name=["']android\.app\.shortcuts["'])[^>]*\/>\s*/g,
  ''
);
const launcherActivityMatch = [...manifest.matchAll(/<(activity(?:-alias)?)\b[^>]*>[\s\S]*?<\/\1>/g)]
  .find((match) =>
    match[0].includes('android.intent.action.MAIN')
    && match[0].includes('android.intent.category.LAUNCHER')
  );
if (!launcherActivityMatch) {
  throw new Error('Activité Android MAIN/LAUNCHER introuvable pour déclarer les raccourcis Pata.');
}
const launcherActivityTag = /^<(activity(?:-alias)?)/.exec(launcherActivityMatch[0])?.[1];
if (!launcherActivityTag) {
  throw new Error('Balise de l’activité de lancement Android introuvable.');
}
const shortcutsMetadata = '            <meta-data android:name="android.app.shortcuts" android:resource="@xml/pata_shortcuts" />\n        ';
const updatedLauncherActivity = launcherActivityMatch[0].replace(
  '</' + launcherActivityTag + '>',
  shortcutsMetadata + '</' + launcherActivityTag + '>'
);
manifest = manifest.replace(launcherActivityMatch[0], updatedLauncherActivity);

if (!manifest.includes('android.intent.action.SEND')) {
  const filter = '\n            <intent-filter>\n                <action android:name="android.intent.action.SEND" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <data android:mimeType="text/plain" />\n            </intent-filter>\n';
  manifest = manifest.replace(/(<activity[^>]*android:name="[^"]*MainActivity"[^>]*>[\s\S]*?)(<\/activity>)/, '$1' + filter + '$2');
}
const mainShareActivity = manifest.match(/<activity\b[^>]*android:name="[^"]*MainActivity"[^>]*>[\s\S]*?<\/activity>/);
if (mainShareActivity) {
  const extraShareFilters = [];
  if (!manifest.includes('android:mimeType="image/*"')) {
    extraShareFilters.push('            <intent-filter><action android:name="android.intent.action.SEND" /><category android:name="android.intent.category.DEFAULT" /><data android:mimeType="image/*" /></intent-filter>');
    extraShareFilters.push('            <intent-filter><action android:name="android.intent.action.SEND_MULTIPLE" /><category android:name="android.intent.category.DEFAULT" /><data android:mimeType="image/*" /></intent-filter>');
  }
  if (!manifest.includes('android:mimeType="application/pdf"')) {
    extraShareFilters.push('            <intent-filter><action android:name="android.intent.action.SEND" /><category android:name="android.intent.category.DEFAULT" /><data android:mimeType="application/pdf" /></intent-filter>');
    extraShareFilters.push('            <intent-filter><action android:name="android.intent.action.SEND_MULTIPLE" /><category android:name="android.intent.category.DEFAULT" /><data android:mimeType="application/pdf" /></intent-filter>');
  }
  if (extraShareFilters.length) {
    const updatedShareActivity = mainShareActivity[0].replace('</activity>', extraShareFilters.join('\n') + '\n        </activity>');
    manifest = manifest.replace(mainShareActivity[0], updatedShareActivity);
  }
}
fs.writeFileSync(manifestPath, manifest);

// Échouer immédiatement si le manifeste référence une ressource non copiée.
const requiredShortcutResources = [
  'android/app/src/main/res/xml/pata_shortcuts.xml',
  'android/app/src/main/res/xml/pata_quick_widget_info.xml',
  'android/app/src/main/res/layout/pata_quick_capture_widget.xml',
  'android/app/src/main/res/drawable/pata_widget_background.xml',
  'android/app/src/main/res/drawable/ic_pata_widget_mic.xml',
  'android/app/src/main/res/values/pata_shortcuts.xml',
  'android/app/src/main/res/drawable/ic_shortcut_expense.xml',
  'android/app/src/main/res/drawable/ic_shortcut_income.xml',
  'android/app/src/main/res/drawable/ic_shortcut_cotisations.xml',
];
for (const relativePath of requiredShortcutResources) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    throw new Error('Raccourci Android incomplet : ressource absente ' + relativePath);
  }
}
const shortcutXml = fs.readFileSync(path.join(root, 'android/app/src/main/res/xml/pata_shortcuts.xml'), 'utf8');
if ((shortcutXml.match(/<shortcut\b/g) || []).length !== 3) {
  throw new Error('Le fichier Android doit déclarer exactement trois raccourcis Pata.');
}
const shortcutMetadataCount = (manifest.match(/android:name="android\.app\.shortcuts"/g) || []).length;
const finalLauncherActivity = [...manifest.matchAll(/<(activity(?:-alias)?)\b[^>]*>[\s\S]*?<\/\1>/g)]
  .find((match) =>
    match[0].includes('android.intent.action.MAIN')
    && match[0].includes('android.intent.category.LAUNCHER')
  );
if (
  shortcutMetadataCount !== 1
  || !finalLauncherActivity
  || !finalLauncherActivity[0].includes('android.app.shortcuts')
  || !finalLauncherActivity[0].includes('@xml/pata_shortcuts')
) {
  throw new Error('Les raccourcis Pata doivent être déclarés une seule fois dans l’activité MAIN/LAUNCHER.');
}

// WorkManager permet de synchroniser les SMS hors ligne puis de reprendre seul.
const gradlePath = path.join(root, 'android/app/build.gradle');
if (fs.existsSync(gradlePath)) {
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  const dependency = '    implementation "androidx.work:work-runtime:2.9.1"';
  if (!gradle.includes('androidx.work:work-runtime')) {
    const match = gradle.match(/dependencies\s*\{/);
    if (!match) throw new Error('Bloc dependencies introuvable dans android/app/build.gradle');
    const open = gradle.indexOf('{', match.index);
    let depth = 1;
    let close = open + 1;
    while (close < gradle.length && depth > 0) {
      if (gradle[close] === '{') depth += 1;
      else if (gradle[close] === '}') depth -= 1;
      close += 1;
    }
    if (depth !== 0) throw new Error('Bloc dependencies Gradle mal formé.');
    gradle = gradle.slice(0, close - 1) + '\n' + dependency + '\n' + gradle.slice(close - 1);
  }
  gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode 17');
  gradle = gradle.replace(/versionName\s+["'][^"']+["']/, 'versionName "1.1.6"');
  fs.writeFileSync(gradlePath, gradle);
}
console.log('Pata Android 1.1.6 : widget, notification persistante, tuile, partage et saisie vocale intégrés.');
