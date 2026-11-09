import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const javaSource = path.join(root, 'native/android/com/pata/app');
const javaTarget = path.join(root, 'android/app/src/main/java/com/pata/app');
fs.mkdirSync(javaTarget, { recursive: true });
for (const file of ['MainActivity.java', 'PataSmsPlugin.java', 'PataSmsReceiver.java']) {
  fs.copyFileSync(path.join(javaSource, file), path.join(javaTarget, file));
}

const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');
if (!manifest.includes('android.permission.RECEIVE_SMS')) {
  manifest = manifest.replace('<application', '  <uses-permission android:name="android.permission.RECEIVE_SMS" />\n  <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n  <application');
}
if (!manifest.includes('PataSmsReceiver')) {
  const receiver = `
        <receiver
            android:name="com.pata.app.PataSmsReceiver"
            android:enabled="true"
            android:exported="true">
            <intent-filter android:priority="999">
                <action android:name="android.provider.Telephony.SMS_RECEIVED" />
            </intent-filter>
        </receiver>
`;
  manifest = manifest.replace('</application>', receiver + '    </application>');
}
if (!manifest.includes('android.intent.action.SEND')) {
  const filter = `
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>
`;
  manifest = manifest.replace(/(<activity[^>]*android:name="[^"]*MainActivity"[^>]*>[\s\S]*?)(<\/activity>)/, '$1' + filter + '$2');
}
fs.writeFileSync(manifestPath, manifest);

const gradlePath = path.join(root, 'android/app/build.gradle');
if (fs.existsSync(gradlePath)) {
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode 1');
  gradle = gradle.replace(/versionName\s+["'][^"']+["']/, 'versionName "1.0.0"');
  fs.writeFileSync(gradlePath, gradle);
}
console.log('Pata native SMS receiver, Sharesheet and manifest configured.');
