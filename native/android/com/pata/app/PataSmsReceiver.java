package com.pata.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import androidx.core.content.ContextCompat;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

public class PataSmsReceiver extends BroadcastReceiver {
    static final String PREFS = "PataSms";
    static final String PENDING = "pending_sms";
    private static final String CHANNEL = "pata_mobile_money";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) {
            recordDiagnostic(context, "permission_missing", null, "RECEIVE_SMS non accordée.");
            return;
        }
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean("enabled", false)) {
            recordDiagnostic(context, "disabled", null, "Import automatique désactivé.");
            return;
        }
        if (prefs.getLong("premium_until", 0L) <= System.currentTimeMillis()) {
            prefs.edit().putBoolean("enabled", false).apply();
            recordDiagnostic(context, "premium_expired", null, "Abonnement Premium inactif.");
            return;
        }

        SmsMessage[] messages;
        try { messages = Telephony.Sms.Intents.getMessagesFromIntent(intent); }
        catch (Exception error) {
            recordDiagnostic(context, "sms_read_error", null, "Impossible de lire le SMS système.");
            return;
        }
        if (messages == null || messages.length == 0) return;

        StringBuilder body = new StringBuilder();
        String sender = "";
        long receivedAt = System.currentTimeMillis();
        for (SmsMessage message : messages) {
            if (message == null) continue;
            if (sender.isEmpty()) sender = message.getOriginatingAddress() == null ? "" : message.getOriginatingAddress();
            body.append(message.getMessageBody() == null ? "" : message.getMessageBody()).append(' ');
            receivedAt = message.getTimestampMillis();
        }
        if (body.length() == 0) return;

        JSONObject parsed = PataMobileMoneyParser.parse(sender, body.toString(), receivedAt);
        if (parsed == null) {
            recordDiagnostic(context, "unrecognized", detectProvider(sender, body.toString()),
                "SMS reçu mais format non reconnu. Aucun contenu brut n'a été conservé.");
            return;
        }

        String uid = prefs.getString("user_uid", "");
        String deviceToken = prefs.getString("device_token", "");
        try {
            parsed.put("ownerUid", uid);
            parsed.put("receivedAt", receivedAt);
            parsed.put("status", "queued");
        } catch (Exception ignored) { }
        if (!storeIfNew(context, parsed)) {
            recordDiagnostic(context, "duplicate", parsed.optString("provider"), "Transaction déjà mise en file.");
            return;
        }

        if (uid.isEmpty() || deviceToken.isEmpty()) {
            recordDiagnostic(context, "account_link_required", parsed.optString("provider"),
                "SMS reconnu. Ouvre Paramètres > Import SMS pour relier cet appareil au compte.");
            showStatusNotification(context, "SMS Mobile Money détecté",
                "Ouvre Pata pour relier cet appareil et terminer l'enregistrement.");
            return;
        }
        enqueueSync(context, parsed, uid, deviceToken);
        recordDiagnostic(context, "recognized_waiting_sync", parsed.optString("provider"),
            "SMS reconnu ; synchronisation automatique programmée.");
    }

    static void enqueueSync(Context context, JSONObject parsed, String uid, String deviceToken) {
        Data input = new Data.Builder()
            .putString("uid", uid)
            .putString("deviceToken", deviceToken)
            .putString("transactionHash", parsed.optString("transactionHash"))
            .putString("provider", parsed.optString("provider"))
            .putString("eventType", parsed.optString("eventType"))
            .putString("direction", parsed.optString("direction"))
            .putInt("amount", parsed.optInt("amount", 0))
            .putString("date", parsed.optString("date"))
            .putString("time", parsed.optString("time"))
            .putString("counterparty", parsed.optString("counterparty", ""))
            .build();
        Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        OneTimeWorkRequest work = new OneTimeWorkRequest.Builder(PataSmsSyncWorker.class)
            .setInputData(input)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork(
            "pata-sms-" + parsed.optString("transactionHash"), ExistingWorkPolicy.KEEP, work);
    }

    static boolean storeIfNew(Context context, JSONObject parsed) {
        synchronized (PataSmsReceiver.class) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray stored;
            try { stored = new JSONArray(prefs.getString(PENDING, "[]")); }
            catch (Exception error) { stored = new JSONArray(); }
            String hash = parsed.optString("transactionHash");
            for (int i = 0; i < stored.length(); i++) {
                JSONObject item = stored.optJSONObject(i);
                if (item != null && hash.equals(item.optString("transactionHash"))) return false;
            }
            stored.put(parsed);
            JSONArray limited = new JSONArray();
            int start = Math.max(0, stored.length() - 50);
            for (int i = start; i < stored.length(); i++) {
                JSONObject item = stored.optJSONObject(i);
                if (item != null) limited.put(item);
            }
            prefs.edit().putString(PENDING, limited.toString()).apply();
            return true;
        }
    }

    static void removePending(Context context, String hash) {
        synchronized (PataSmsReceiver.class) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray stored;
            try { stored = new JSONArray(prefs.getString(PENDING, "[]")); }
            catch (Exception error) { stored = new JSONArray(); }
            JSONArray remaining = new JSONArray();
            for (int i = 0; i < stored.length(); i++) {
                JSONObject item = stored.optJSONObject(i);
                if (item != null && !hash.equals(item.optString("transactionHash"))) remaining.put(item);
            }
            prefs.edit().putString(PENDING, remaining.toString()).apply();
        }
    }

    static void recordDiagnostic(Context context, String status, String provider, String message) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONObject data = new JSONObject();
            data.put("status", status);
            data.put("provider", provider == null ? "" : provider);
            data.put("message", message == null ? "" : message);
            data.put("receivedAt", System.currentTimeMillis());
            data.put("pendingCount", new JSONArray(prefs.getString(PENDING, "[]")).length());
            prefs.edit().putString("last_sms_diagnostic", data.toString()).apply();
        } catch (Exception ignored) { }
    }

    static void showProcessedNotification(Context context, String direction, int amount, String provider, String target) {
        String title = "income".equals(direction) ? "Nouveau revenu enregistré" : "Nouvelle dépense enregistrée";
        String operator = "mtn_momo".equals(provider) ? "MTN MoMo" : "Orange Money";
        String value = String.format(java.util.Locale.FRANCE, "%,d FCFA", amount).replace(',', ' ');
        showNotification(context, title, value + " · " + operator + " · Touchez pour ouvrir Pata.", target);
    }

    static void showStatusNotification(Context context, String title, String body) {
        showNotification(context, title, body, "/settings");
    }

    private static void showNotification(Context context, String title, String body, String target) {
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Transactions Mobile Money", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Transactions reconnues et enregistrées automatiquement par Pata.");
            manager.createNotificationChannel(channel);
        }
        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (open == null) return;
        open.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        open.putExtra("pata_notification_target", target == null ? "/dashboard" : target);
        PendingIntent pending = PendingIntent.getActivity(context, (int) (System.currentTimeMillis() & 0x7fffffff), open,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, CHANNEL) : new Notification.Builder(context);
        manager.notify((int) (System.currentTimeMillis() & 0x7fffffff),
            builder.setSmallIcon(android.R.drawable.stat_notify_chat).setContentTitle(title)
                .setContentText(body).setAutoCancel(true).setContentIntent(pending).build());
    }

    private static String detectProvider(String sender, String body) {
        String source = normalize(sender + " " + body);
        if (source.contains("orange") || source.contains("omcm")) return "orange_money";
        if (source.contains("mtn") || source.contains("momo")) return "mtn_momo";
        return "";
    }

    private static String normalize(String value) {
        return java.text.Normalizer.normalize(value == null ? "" : value, java.text.Normalizer.Form.NFD)
            .replaceAll("\\p{M}+", "").toLowerCase(java.util.Locale.ROOT);
    }
}
