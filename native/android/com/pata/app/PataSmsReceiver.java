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
import androidx.core.content.ContextCompat;
import android.os.Build;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class PataSmsReceiver extends BroadcastReceiver {
    private static final String PREFS = "PataSms";
    private static final String PENDING = "pending_sms";
    private static final String CHANNEL = "pata_mobile_money";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) return;

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean("enabled", false)) return;
        if (prefs.getLong("premium_until", 0L) <= System.currentTimeMillis()) {
            prefs.edit().putBoolean("enabled", false).apply();
            return;
        }

        SmsMessage[] messages;
        try {
            messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        } catch (Exception error) {
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

        ParsedSms parsed = parse(sender, body.toString(), receivedAt);
        if (parsed == null) return;
        if (!storeIfNew(context, parsed)) return;
        showNotification(context, parsed);
    }

    private static class ParsedSms {
        String provider;
        String transactionHash;
        String eventType;
        String direction;
        int amount;
        String date;
        String time;
    }

    private ParsedSms parse(String sender, String body, long timestamp) {
        if (body == null || body.trim().isEmpty()) return null;
        String text = body.replaceAll("\\s+", " ").trim();
        String source = (sender + " " + text).toLowerCase(Locale.ROOT);
        if (Pattern.compile("(\\bechec\\b|\\bfailed\\b|\\brefuse\\b|\\bannule\\b|not completed|transaction rejected)", Pattern.CASE_INSENSITIVE).matcher(normalize(source)).find()) return null;

        String provider;
        if (source.matches("(?s).*(orange\\s*(money|cash)|\\bom\\b).*")) provider = "orange_money";
        else if (source.matches("(?s).*(\\bmtn\\b|momo|mobile\\s*money).*")) provider = "mtn_momo";
        else return null;

        String normalized = normalize(text);
        String eventType;
        if (Pattern.compile("\\b(retrait|retire|withdrawal|cash\\s*out)\\b", Pattern.CASE_INSENSITIVE).matcher(normalized).find()) eventType = "withdrawal";
        else if (Pattern.compile("(paiement\\s*reussi|payment\\s*successful|marchand|merchant|achat\\s*reussi)", Pattern.CASE_INSENSITIVE).matcher(normalized).find()) eventType = "payment";
        else if (Pattern.compile("(vous avez recu|transfert recu|recu de|credite|cash in|received)", Pattern.CASE_INSENSITIVE).matcher(normalized).find()) eventType = "receive";
        else if (Pattern.compile("(vous avez envoye|transfert effectue|transfert envoye|envoye a|transfert vers|debit|sent to)", Pattern.CASE_INSENSITIVE).matcher(normalized).find()) eventType = "send";
        else return null;

        String transactionId = findTransactionId(text);
        if (transactionId == null) return null;
        Integer amount = findAmount(text);
        if (amount == null || amount <= 0) return null;

        ParsedSms result = new ParsedSms();
        result.provider = provider;
        result.transactionHash = hash(provider + ":" + transactionId);
        result.eventType = eventType;
        result.direction = "receive".equals(eventType) ? "income" : "withdrawal".equals(eventType) ? "withdrawal" : "expense";
        result.amount = amount;
        Calendar calendar = Calendar.getInstance();
        calendar.setTimeInMillis(timestamp > 0 ? timestamp : System.currentTimeMillis());

        Matcher isoDate = Pattern.compile("\\b(\\d{4})[-/](\\d{1,2})[-/](\\d{1,2})\\b").matcher(text);
        Matcher localDate = Pattern.compile("\\b(\\d{1,2})[/-](\\d{1,2})[/-](\\d{2,4})\\b").matcher(text);
        try {
            if (isoDate.find()) {
                calendar.set(Calendar.YEAR, Integer.parseInt(isoDate.group(1)));
                calendar.set(Calendar.MONTH, Integer.parseInt(isoDate.group(2)) - 1);
                calendar.set(Calendar.DAY_OF_MONTH, Integer.parseInt(isoDate.group(3)));
            } else if (localDate.find()) {
                int year = Integer.parseInt(localDate.group(3));
                if (year < 100) year += year >= 70 ? 1900 : 2000;
                calendar.set(Calendar.YEAR, year);
                calendar.set(Calendar.MONTH, Integer.parseInt(localDate.group(2)) - 1);
                calendar.set(Calendar.DAY_OF_MONTH, Integer.parseInt(localDate.group(1)));
            }
        } catch (Exception ignored) {
            calendar.setTimeInMillis(timestamp > 0 ? timestamp : System.currentTimeMillis());
        }

        Matcher explicitTime = Pattern.compile("\\b([01]?\\d|2[0-3]):([0-5]\\d)\\b").matcher(text);
        if (explicitTime.find()) {
            calendar.set(Calendar.HOUR_OF_DAY, Integer.parseInt(explicitTime.group(1)));
            calendar.set(Calendar.MINUTE, Integer.parseInt(explicitTime.group(2)));
        }
        result.date = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(calendar.getTime());
        result.time = new SimpleDateFormat("HH:mm", Locale.ROOT).format(calendar.getTime());
        return result;
    }

    private static String normalize(String value) {
        return value.toLowerCase(Locale.ROOT)
            .replace('é', 'e').replace('è', 'e').replace('ê', 'e')
            .replace('à', 'a').replace('â', 'a').replace('ù', 'u')
            .replace('û', 'u').replace('ç', 'c');
    }

    private static String findTransactionId(String text) {
        Pattern[] patterns = new Pattern[] {
            Pattern.compile("(?:transaction\\s*(?:id|no\\.?|n[°o]|number)|id\\s*(?:de\\s*)?(?:transaction|operation)?|reference)\\s*[:#-]?\\s*([A-Z0-9][A-Z0-9._/-]{4,48})", Pattern.CASE_INSENSITIVE),
            Pattern.compile("\\b(MP\\d{6,}(?:[.-][A-Z0-9]+){1,4})\\b", Pattern.CASE_INSENSITIVE)
        };
        for (Pattern pattern : patterns) {
            Matcher matcher = pattern.matcher(text);
            if (matcher.find()) {
                String value = matcher.group(1).replaceAll("[.,;:)]+$", "").trim();
                if (value.length() >= 5) return value;
            }
        }
        return null;
    }

    private static Integer findAmount(String text) {
        String currency = "(?:FCFA|XAF|F\\s*\\.\\s*CFA|F\\s*CFA|CFA)";
        Pattern[] patterns = new Pattern[] {
            Pattern.compile("(?:montant(?:\\s+de\\s+la)?\\s+transaction|montant|somme)\\s*[:\\-]?\\s*(?:de\\s*)?([0-9][0-9\\s.,]{0,20})\\s*" + currency + "\\b", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(?:vous\\s+avez\\s+)?(?:re[cç]u|envoy[eé]|pay[eé]|retir[eé])\\s+(?:la\\s+somme\\s+de\\s+)?([0-9][0-9\\s.,]{0,20})\\s*" + currency + "\\b", Pattern.CASE_INSENSITIVE),
            Pattern.compile("([0-9][0-9\\s.,]{0,20})\\s*" + currency + "\\b", Pattern.CASE_INSENSITIVE)
        };
        for (Pattern pattern : patterns) {
            Matcher matcher = pattern.matcher(text);
            if (!matcher.find()) continue;
            String digits = matcher.group(1).replaceAll("[^0-9]", "");
            try {
                long amount = Long.parseLong(digits);
                if (amount > 0 && amount <= 1_000_000_000L) return (int) amount;
            } catch (Exception ignored) {
                // Continue with the next known amount format.
            }
        }
        return null;
    }

    private static String hash(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte item : bytes) result.append(String.format(Locale.ROOT, "%02x", item & 0xff));
            return result.toString();
        } catch (Exception error) {
            return "";
        }
    }

    private boolean storeIfNew(Context context, ParsedSms parsed) {
        synchronized (PataSmsReceiver.class) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray existing;
            try { existing = new JSONArray(prefs.getString(PENDING, "[]")); }
            catch (Exception error) { existing = new JSONArray(); }
            for (int index = 0; index < existing.length(); index++) {
                JSONObject item = existing.optJSONObject(index);
                if (item != null && parsed.transactionHash.equals(item.optString("transactionHash"))) return false;
            }
            try {
                JSONObject item = new JSONObject();
                item.put("provider", parsed.provider);
                item.put("transactionHash", parsed.transactionHash);
                item.put("eventType", parsed.eventType);
                item.put("direction", parsed.direction);
                item.put("amount", parsed.amount);
                item.put("date", parsed.date);
                item.put("time", parsed.time);
                item.put("ownerUid", prefs.getString("user_uid", ""));
                existing.put(item);
                JSONArray limited = new JSONArray();
                int start = Math.max(0, existing.length() - 30);
                for (int index = start; index < existing.length(); index++) limited.put(existing.getJSONObject(index));
                prefs.edit().putString(PENDING, limited.toString()).apply();
                return true;
            } catch (Exception error) {
                return false;
            }
        }
    }

    private void showNotification(Context context, ParsedSms parsed) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Import Mobile Money", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Transactions Mobile Money détectées par Pata");
            manager.createNotificationChannel(channel);
        }

        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (open == null) return;
        open.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        open.putExtra("pata_open_sms_import", true);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context, (int) (System.currentTimeMillis() & 0x7fffffff), open,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        String type = "income".equals(parsed.direction) ? "Revenu" : "withdrawal".equals(parsed.direction) ? "Retrait" : "Dépense";
        String provider = "mtn_momo".equals(parsed.provider) ? "MTN MoMo" : "Orange Money";
        String amount = String.format(Locale.FRANCE, "%,d FCFA", parsed.amount).replace(',', ' ');
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(context, CHANNEL)
            : new Notification.Builder(context);
        Notification notification = builder
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(type + " de " + amount + " détecté")
            .setContentText(provider + " — ouvre Pata pour vérifier et confirmer")
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build();
        manager.notify((parsed.transactionHash.hashCode() & 0x7fffffff), notification);
    }
}
