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
            }
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
