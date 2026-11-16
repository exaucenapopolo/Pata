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
  assert.match(api, /notificationChatRef/);
  assert.match(api, /source: 'notification'/);
  assert.match(api, /processedRequestIds/);
  assert.match(api, /sanitizeNotificationReply\(reply, 420\)/);
  assert.match(worker, /notificationMode", true/);
});

test('le build Android recopie le worker conversation natif', () => {
  const prepare = read('native/android/prepare-android.mjs');
  assert.match(prepare, /'PataAIConversationWorker\.java'/);
});

test('le composeur vocal peut afficher la réponse Mč dans une notification Android', () => {
  const plugin = read('native/android/com/pata/app/PataQuickCapturePlugin.java');
  const coordinator = read('src/components/QuickCaptureCoordinator.jsx');
  const worker = read('native/android/com/pata/app/PataAIConversationWorker.java');
  assert.match(plugin, /public void showAIConversationReply\(PluginCall call\)/);
  assert.match(plugin, /showAIConversationReplyNotification\(getContext\(\), title, message, "\/dashboard", conversationId\)/);
  assert.match(coordinator, /notificationConversationId: voiceChatConversationId/);
  assert.match(coordinator, /conversationId: voiceChatConversationId/);
  assert.match(plugin, /pata_ai_conversation_id/);
  assert.match(worker, /notificationConversationId/);
  assert.match(coordinator, /PataQuickCapture\.showAIConversationReply\(/);
  assert.match(coordinator, /notificationMode: true/);
});

test('la saisie vocale garde Saisie comme option principale devant Mč', () => {
  const coordinator = read('src/components/QuickCaptureCoordinator.jsx');
  const saisie = coordinator.indexOf('<strong className="block text-sm">Saisie</strong>');
  const ai = coordinator.indexOf('<strong className="block text-sm">Causer avec Mč</strong>');
  assert.ok(saisie >= 0 && ai > saisie);
  assert.match(coordinator, /startVoiceCapture\(\)/);
});


test('les réponses depuis la notification permanente réutilisent une conversation Mč stable', () => {
  const receiver = read('native/android/com/pata/app/PataQuickCaptureReceiver.java');
  const worker = read('native/android/com/pata/app/PataAIConversationWorker.java');
  assert.match(receiver, /AI_ACTIVE_CONVERSATION\s*=\s*"active_ai_notification_conversation_id"/);
  assert.match(receiver, /resolveAIConversationId\(Context context, String requestedId, String ownerUid\)/);
  assert.match(receiver, /AI_ACTIVE_CONVERSATION_OWNER\s*=\s*"active_ai_notification_conversation_owner_uid"/);
  assert.match(receiver, /!owner\.equals\(storedOwner\)/);
  assert.match(receiver, /item\.put\("conversationId", resolvedConversationId\)/);
  assert.match(receiver, /remove\(AI_QUEUE\)\.remove\(AI_ACTIVE_CONVERSATION\)/);
  assert.match(receiver, /remove\(AI_ACTIVE_CONVERSATION_OWNER\)/);
  assert.match(worker, /resolveAIConversationId\(/);
  assert.match(worker, /queued\.optString\("conversationId", ""\), owner/);
});

test('Mč recharge les derniers messages de la conversation de notification avant de répondre', () => {
  const api = read('src/app/api/[...path]/route.js');
  assert.match(api, /notificationChatRef \? notificationChatRef\.get\(\)/);
  assert.match(api, /previousNotificationMessages/);
  assert.match(api, /\.\.\.previousNotificationMessages, \.\.\.history/);
  assert.match(api, /isContextualFollowUp/);
  assert.match(api, /selectAIToolsForIntent\(AI_TOOLS, latestIntent, latestUserText\)/);
});
