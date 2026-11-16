package com.pata.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import androidx.core.app.RemoteInput;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

public class PataQuickCaptureReceiver extends BroadcastReceiver {
    static final String PREFS = "PataQuickCapture";
    static final String QUEUE = "pending_quick_captures";
    static final String REMOTE_KEY = "pata_quick_capture_reply";
    static final String ACTION_REPLY = "com.pata.app.QUICK_CAPTURE_REPLY";
    static final String ACTION_AI_REPLY = "com.pata.app.AI_NOTIFICATION_REPLY";
    static final String AI_REMOTE_KEY = "pata_ai_notification_reply";
    static final String AI_QUEUE = "pending_ai_notification_replies";
    static final String AI_ACTIVE_CONVERSATION = "active_ai_notification_conversation_id";
    static final String AI_ACTIVE_CONVERSATION_OWNER = "active_ai_notification_conversation_owner_uid";
    static final String ACTION_RESTORE = "com.pata.app.QUICK_CAPTURE_RESTORE";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
            || ACTION_RESTORE.equals(action)) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            if (prefs.getBoolean("persistent_enabled", false)) {
                PataQuickCapturePlugin.showPersistentNotification(context, null);
                PataQuickCaptureAuthStore.Session session = PataQuickCaptureAuthStore.read(context);
                if (session != null) schedulePendingAI(context, session.uid);
            }
            return;
        }
        if (ACTION_AI_REPLY.equals(action)) {
            Bundle results = RemoteInput.getResultsFromIntent(intent);
            if (results == null) return;
            CharSequence reply = results.getCharSequence(AI_REMOTE_KEY);
            String text = reply == null ? "" : reply.toString().trim();
            if (text.isEmpty()) return;
            PataQuickCaptureAuthStore.Session session = PataQuickCaptureAuthStore.read(context);
            enqueueAIReply(context, text, session == null ? "" : session.uid,
                intent.getStringExtra("pata_ai_conversation_id"));
            return;
        }
        if (!ACTION_REPLY.equals(action)) return;
        Bundle results = RemoteInput.getResultsFromIntent(intent);
        if (results == null) return;
        CharSequence reply = results.getCharSequence(REMOTE_KEY);
        String text = reply == null ? "" : reply.toString().trim();
        if (text.isEmpty()) return;
        PataQuickCaptureAuthStore.Session session = PataQuickCaptureAuthStore.read(context);
        enqueue(context, text, session == null ? "" : session.uid);
    }

    static String enqueue(Context context, String text, String ownerUid) {
        if (text == null || text.trim().isEmpty()) return "";
        if (ownerUid == null || ownerUid.trim().isEmpty()) {
            PataQuickCapturePlugin.showCaptureNeedsReviewNotification(context, "auth", "Ouvre Pata une fois pour connecter la saisie rapide.");
            return "";
        }
        String id = UUID.randomUUID().toString().replace("-", "");
        synchronized (PataQuickCaptureReceiver.class) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray queue;
            try { queue = new JSONArray(prefs.getString(QUEUE, "[]")); }
            catch (Exception ignored) { queue = new JSONArray(); }
            if (queue.length() >= 20) {
                JSONArray trimmed = new JSONArray();
                for (int i = Math.max(1, queue.length() - 18); i < queue.length(); i++) {
                    JSONObject item = queue.optJSONObject(i);
                    if (item != null) trimmed.put(item);
                }
                queue = trimmed;
            }
            JSONObject item = new JSONObject();
            try {
                item.put("id", id);
                item.put("text", text.trim().substring(0, Math.min(500, text.trim().length())));
                item.put("ownerUid", ownerUid);
                item.put("createdAt", System.currentTimeMillis());
                item.put("status", "pending");
                queue.put(item);
                prefs.edit().putString(QUEUE, queue.toString()).apply();
            } catch (Exception ignored) { return ""; }
        }
        schedule(context, id);
        PataQuickCapturePlugin.showPersistentNotification(context, null);
        return id;
    }

    static String resolveAIConversationId(Context context, String requestedId, String ownerUid) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        synchronized (PataQuickCaptureReceiver.class) {
            String owner = ownerUid == null ? "" : ownerUid.trim();
            String storedOwner = prefs.getString(AI_ACTIVE_CONVERSATION_OWNER, "");
            boolean accountChanged = !owner.isEmpty() && !owner.equals(storedOwner);

            String conversationId = accountChanged ? "" : (requestedId == null ? "" : requestedId.trim());
            conversationId = conversationId.replaceAll("[^a-zA-Z0-9_-]", "");
            if (conversationId.isEmpty() && !accountChanged) {
                conversationId = prefs.getString(AI_ACTIVE_CONVERSATION, "");
            }
            if (conversationId == null || conversationId.trim().isEmpty()) {
                conversationId = UUID.randomUUID().toString().replace("-", "");
            }

            SharedPreferences.Editor editor = prefs.edit().putString(AI_ACTIVE_CONVERSATION, conversationId);
            if (!owner.isEmpty()) editor.putString(AI_ACTIVE_CONVERSATION_OWNER, owner);
            editor.apply();
            return conversationId;
        }
    }

    static String enqueueAIReply(Context context, String text, String ownerUid, String conversationId) {
        if (text == null || text.trim().isEmpty()) return "";
        if (ownerUid == null || ownerUid.trim().isEmpty()) {
            PataQuickCapturePlugin.showAIConversationReplyNotification(context,
                "Reconnecte-toi à Pata pour parler avec Mč.");
            return "";
        }
        String id = UUID.randomUUID().toString().replace("-", "");
        String resolvedConversationId = resolveAIConversationId(context, conversationId, ownerUid);
        synchronized (PataQuickCaptureReceiver.class) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray queue;
            try { queue = new JSONArray(prefs.getString(AI_QUEUE, "[]")); }
            catch (Exception ignored) { queue = new JSONArray(); }
            if (queue.length() >= 12) {
                JSONArray trimmed = new JSONArray();
                for (int i = Math.max(1, queue.length() - 10); i < queue.length(); i++) {
                    JSONObject item = queue.optJSONObject(i);
                    if (item != null) trimmed.put(item);
                }
                queue = trimmed;
            }
            JSONObject item = new JSONObject();
            try {
                item.put("id", id);
                item.put("text", text.trim().substring(0, Math.min(1200, text.trim().length())));
                item.put("ownerUid", ownerUid);
                item.put("conversationId", resolvedConversationId);
                item.put("createdAt", System.currentTimeMillis());
                queue.put(item);
                prefs.edit().putString(AI_QUEUE, queue.toString()).apply();
            } catch (Exception ignored) { return ""; }
        }
        scheduleAIReply(context, id);
        PataQuickCapturePlugin.showPersistentNotification(context, null);
        return id;
    }

    static void scheduleAIReply(Context context, String id) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED).build();
        Data input = new Data.Builder().putString("ai_reply_id", id).build();
        OneTimeWorkRequest work = new OneTimeWorkRequest.Builder(PataAIConversationWorker.class)
            .setInputData(input).setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 20, TimeUnit.SECONDS).build();
        // Les réponses sont ajoutées à une seule chaîne pour conserver l'ordre des échanges.
        WorkManager.getInstance(context).enqueueUniqueWork(
            "pata_ai_notification_conversation", ExistingWorkPolicy.APPEND_OR_REPLACE, work);
    }

    static void schedulePendingAI(Context context, String uid) {
        if (uid == null || uid.isEmpty()) return;
        JSONArray queue;
        try { queue = new JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(AI_QUEUE, "[]")); }
        catch (Exception ignored) { return; }
        for (int i = 0; i < queue.length(); i++) {
            JSONObject item = queue.optJSONObject(i);
            if (item == null || !uid.equals(item.optString("ownerUid", ""))) continue;
            scheduleAIReply(context, item.optString("id", ""));
        }
    }

    static JSONObject findAI(Context context, String id) {
        synchronized (PataQuickCaptureReceiver.class) {
            JSONArray queue;
            try { queue = new JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(AI_QUEUE, "[]")); }
            catch (Exception ignored) { return null; }
            for (int i = 0; i < queue.length(); i++) {
                JSONObject item = queue.optJSONObject(i);
                if (item != null && id.equals(item.optString("id"))) return item;
            }
        }
        return null;
    }

    static void removeAI(Context context, String id) {
        synchronized (PataQuickCaptureReceiver.class) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray queue;
            try { queue = new JSONArray(prefs.getString(AI_QUEUE, "[]")); }
            catch (Exception ignored) { queue = new JSONArray(); }
            JSONArray remaining = new JSONArray();
            for (int i = 0; i < queue.length(); i++) {
                JSONObject item = queue.optJSONObject(i);
                if (item != null && !id.equals(item.optString("id"))) remaining.put(item);
            }
            prefs.edit().putString(AI_QUEUE, remaining.toString()).apply();
        }
    }

    static void clearPendingAI(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .remove(AI_QUEUE).remove(AI_ACTIVE_CONVERSATION)
            .remove(AI_ACTIVE_CONVERSATION_OWNER).apply();
        WorkManager.getInstance(context).cancelUniqueWork("pata_ai_notification_conversation");
    }

    static void schedule(Context context, String id) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED).build();
        Data input = new Data.Builder().putString("capture_id", id).build();
        OneTimeWorkRequest work = new OneTimeWorkRequest.Builder(PataQuickCaptureWorker.class)
            .setInputData(input).setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 20, TimeUnit.SECONDS).build();
        WorkManager.getInstance(context).enqueueUniqueWork(
            "pata_quick_capture_" + id, ExistingWorkPolicy.KEEP, work);
    }

    static void schedulePending(Context context, String uid) {
        if (uid == null || uid.isEmpty()) return;
        JSONArray queue;
        try { queue = new JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(QUEUE, "[]")); }
        catch (Exception ignored) { return; }
        for (int i = 0; i < queue.length(); i++) {
            JSONObject item = queue.optJSONObject(i);
            if (item == null || !uid.equals(item.optString("ownerUid", ""))) continue;
            if ("pending".equals(item.optString("status", "pending"))) {
                schedule(context, item.optString("id", ""));
            }
        }
    }

    static JSONObject find(Context context, String id) {
        synchronized (PataQuickCaptureReceiver.class) {
            JSONArray queue;
            try { queue = new JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(QUEUE, "[]")); }
            catch (Exception ignored) { return null; }
            for (int i = 0; i < queue.length(); i++) {
                JSONObject item = queue.optJSONObject(i);
                if (item != null && id.equals(item.optString("id"))) return item;
            }
        }
        return null;
    }

    static void updateStatus(Context context, String id, String status) {
        synchronized (PataQuickCaptureReceiver.class) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray queue;
            try { queue = new JSONArray(prefs.getString(QUEUE, "[]")); }
            catch (Exception ignored) { return; }
            for (int i = 0; i < queue.length(); i++) {
                JSONObject item = queue.optJSONObject(i);
                if (item != null && id.equals(item.optString("id"))) {
                    try { item.put("status", status); } catch (Exception ignored) { }
                    break;
                }
            }
            prefs.edit().putString(QUEUE, queue.toString()).apply();
        }
    }

    static void remove(Context context, String id) {
        synchronized (PataQuickCaptureReceiver.class) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray queue;
            try { queue = new JSONArray(prefs.getString(QUEUE, "[]")); }
            catch (Exception ignored) { queue = new JSONArray(); }
            JSONArray remaining = new JSONArray();
            for (int i = 0; i < queue.length(); i++) {
                JSONObject item = queue.optJSONObject(i);
                if (item != null && !id.equals(item.optString("id"))) remaining.put(item);
            }
            prefs.edit().putString(QUEUE, remaining.toString()).apply();
        }
    }
}
