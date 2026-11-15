package com.pata.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import androidx.core.app.RemoteInput;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

public class PataQuickCaptureReceiver extends BroadcastReceiver {
    static final String PREFS = "PataQuickCapture";
    static final String QUEUE = "pending_quick_captures";
    static final String REMOTE_KEY = "pata_quick_capture_reply";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            if (prefs.getBoolean("persistent_enabled", false)) {
                PataQuickCapturePlugin.showPersistentNotification(context, "Pata est prêt pour tes saisies rapides.");
            }
            return;
        }
        if (!"com.pata.app.QUICK_CAPTURE_REPLY".equals(intent.getAction())) return;
        Bundle results = RemoteInput.getResultsFromIntent(intent);
        if (results == null) return;
        CharSequence reply = results.getCharSequence(REMOTE_KEY);
        String text = reply == null ? "" : reply.toString().trim();
        if (text.isEmpty()) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        enqueue(context, text, prefs.getString("quick_capture_uid", ""));
        PataQuickCapturePlugin.showPersistentNotification(context, "Saisie reçue. Appuie ici pour vérifier et confirmer.");
    }

    static void enqueue(Context context, String text, String ownerUid) {
        if (text == null || text.trim().isEmpty()) return;
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
                item.put("id", UUID.randomUUID().toString().replace("-", ""));
                item.put("text", text.trim().substring(0, Math.min(500, text.trim().length())));
                item.put("ownerUid", ownerUid == null ? "" : ownerUid);
                item.put("createdAt", System.currentTimeMillis());
                queue.put(item);
                prefs.edit().putString(QUEUE, queue.toString()).apply();
            } catch (Exception ignored) { }
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
