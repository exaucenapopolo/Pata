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
fs.mkdirSync(iconResourceDir, { recursive: true });
fs.mkdirSync(largeIconDir, { recursive: true });
fs.mkdirSync(valuesResourceDir, { recursive: true });
fs.copyFileSync(path.join(root, 'native/android/res/drawable/ic_stat_pata.xml'), path.join(iconResourceDir, 'ic_stat_pata.xml'));
fs.copyFileSync(path.join(root, 'native/android/res/values/pata_colors.xml'), path.join(valuesResourceDir, 'pata_colors.xml'));
fs.copyFileSync(path.join(root, 'public/android-chrome-192x192.png'), path.join(largeIconDir, 'pata_notification_large.png'));

const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');
const permissions = [
  'android.permission.RECEIVE_SMS',
  'android.permission.POST_NOTIFICATIONS',
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

if (!manifest.includes('android.intent.action.SEND')) {
  const filter = '\n            <intent-filter>\n                <action android:name="android.intent.action.SEND" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <data android:mimeType="text/plain" />\n            </intent-filter>\n';
  manifest = manifest.replace(/(<activity[^>]*android:name="[^"]*MainActivity"[^>]*>[\s\S]*?)(<\/activity>)/, '$1' + filter + '$2');
}
fs.writeFileSync(manifestPath, manifest);

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
  gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode 12');
  gradle = gradle.replace(/versionName\s+["'][^"']+["']/, 'versionName "1.1.1"');
  fs.writeFileSync(gradlePath, gradle);
}
console.log('Pata Android 1.1.0 : connexion Google native, import SMS et notifications conservés.');
