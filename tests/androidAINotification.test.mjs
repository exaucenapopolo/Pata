import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('la notification permanente conserve Saisir en premier et ajoute Parler avec Mč', () => {
  const plugin = read('native/android/com/pata/app/PataQuickCapturePlugin.java');
  const saisir = plugin.indexOf('"Saisir"');
  const speak = plugin.indexOf('"Parler avec Mč"');
  assert.ok(saisir >= 0 && speak > saisir);
  assert.match(plugin, /PataQuickCaptureReceiver\.ACTION_AI_REPLY/);
  assert.match(plugin, /PataQuickCaptureReceiver\.AI_REMOTE_KEY/);
});

test('la réponse Mč est distincte de la file de saisie rapide et passe par WorkManager', () => {
  const receiver = read('native/android/com/pata/app/PataQuickCaptureReceiver.java');
  const worker = read('native/android/com/pata/app/PataAIConversationWorker.java');
  assert.match(receiver, /AI_QUEUE\s*=\s*"pending_ai_notification_replies"/);
  assert.match(receiver, /ExistingWorkPolicy\.APPEND_OR_REPLACE/);
  assert.match(receiver, /PataAIConversationWorker\.class/);
  assert.match(worker, /notificationMode", true/);
  assert.match(worker, /\/api\/ai\/chat/);
  assert.doesNotMatch(worker, /\/api\/quick-capture/);
});

test('le résumé de notification reste stocké séparément de l’historique AssistantChat', () => {
  const api = read('src/app/api/[...path]/route.js');
  const worker = read('native/android/com/pata/app/PataAIConversationWorker.java');
  assert.match(api, /ai_notification_sessions/);
  assert.match(api, /notificationMode/);
  assert.match(api, /isPremiumAccount\(/);
  assert.match(api, /notificationSessionRef\.set\(/);
  assert.match(worker, /notificationMode", true/);
});

test('le build Android recopie le worker conversation natif', () => {
  const prepare = read('native/android/prepare-android.mjs');
  assert.match(prepare, /'PataAIConversationWorker\.java'/);
});
