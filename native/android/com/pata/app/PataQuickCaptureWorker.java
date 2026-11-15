package com.pata.app;

import android.content.Context;
import android.net.Uri;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.NumberFormat;
import java.util.Locale;

public class PataQuickCaptureWorker extends Worker {
    private static final String API_URL = "https://www.pata-yam.site/api/quick-capture";
    public PataQuickCaptureWorker(@NonNull Context context, @NonNull WorkerParameters params) { super(context, params); }

    @NonNull @Override
    public Result doWork() {
        Context context = getApplicationContext();
        String id = getInputData().getString("capture_id");
        if (id == null || id.isEmpty()) return Result.failure();
        JSONObject capture = PataQuickCaptureReceiver.find(context, id);
        if (capture == null) return Result.success();

        PataQuickCaptureAuthStore.Session session = PataQuickCaptureAuthStore.read(context);
        String owner = capture.optString("ownerUid", "");
        if (session == null || owner.isEmpty() || !owner.equals(session.uid)) {
            markForReview(context, id, "Connexion à vérifier. Ouvre Pata pour sécuriser ta session.");
            return Result.failure();
        }

        try {
            String idToken = refreshFirebaseSession(context, session);
            JSONObject request = new JSONObject();
            request.put("text", capture.optString("text", ""));
            request.put("idempotencyKey", id);
            HttpResult response = postJson(API_URL, request, idToken);
            JSONObject body = response.body;

            if (response.status >= 200 && response.status < 300 && body.optBoolean("success", false)) {
                JSONObject recognized = body.optJSONObject("recognized");
                long amount = recognized == null ? body.optLong("amount", 0L) : recognized.optLong("amount", 0L);
                String type = recognized == null ? "" : recognized.optString("type", "");
                String category = categoryLabel(recognized == null ? "" : recognized.optString("categoryId", ""));
                PataQuickCaptureReceiver.remove(context, id);
                if (amount > 0 && ("income".equals(type) || "expense".equals(type))) {
                    PataQuickCaptureWidgetProvider.adjustBalance(context, "income".equals(type) ? amount : -amount);
                }
                String amountLabel = amount > 0
                    ? NumberFormat.getIntegerInstance(Locale.FRANCE).format(amount).replace('\u202f', ' ') + " FCFA"
                    : "Opération";
                PataQuickCapturePlugin.showPersistentNotification(context,
                    "Enregistré : " + amountLabel + (category.isEmpty() ? "" : " · " + category));
                return Result.success();
            }

            String message = body.optString("error", "Cette opération doit être vérifiée.");
            if (body.optBoolean("needsReview", false) || body.optBoolean("confirmationRequired", false)
                || response.status == 401 || response.status == 403 || response.status == 409
                || (response.status >= 400 && response.status < 500)) {
                markForReview(context, id, "À vérifier dans Pata : " + shorten(message, 92));
                return Result.success();
            }
            return Result.retry();
        } catch (AuthUnavailableException error) {
            markForReview(context, id, "Reconnecte-toi à Pata pour terminer une saisie en attente.");
            return Result.failure();
        } catch (IOException error) {
            return Result.retry();
        } catch (Exception error) {
            markForReview(context, id, "Une saisie est conservée et doit être vérifiée dans Pata.");
            return Result.failure();
        }
    }

    private static void markForReview(Context context, String id, String message) {
        PataQuickCaptureReceiver.updateStatus(context, id, "review");
        PataQuickCapturePlugin.showPersistentNotification(context, message);
    }

    private static String refreshFirebaseSession(Context context, PataQuickCaptureAuthStore.Session session)
        throws IOException, AuthUnavailableException {
        String address = "https://securetoken.googleapis.com/v1/token?key=" + Uri.encode(session.apiKey);
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(address).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(15000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            String form = "grant_type=refresh_token&refresh_token=" + Uri.encode(session.refreshToken);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(form.getBytes(StandardCharsets.UTF_8));
            }
            int status = connection.getResponseCode();
            JSONObject body = readJson(connection, status);
            if (status != 200) throw new AuthUnavailableException(body.optString("error", "refresh_failed"));
            String idToken = body.optString("id_token", "");
            String rotated = body.optString("refresh_token", session.refreshToken);
            String uid = body.optString("user_id", session.uid);
            if (idToken.isEmpty() || !session.uid.equals(uid)) throw new AuthUnavailableException("invalid_firebase_session");
            PataQuickCaptureAuthStore.updateRefreshToken(context, rotated);
            return idToken;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static HttpResult postJson(String address, JSONObject payload, String token) throws IOException {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(address).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(20000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Authorization", "Bearer " + token);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(payload.toString().getBytes(StandardCharsets.UTF_8));
            }
            int status = connection.getResponseCode();
            return new HttpResult(status, readJson(connection, status));
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static JSONObject readJson(HttpURLConnection connection, int status) throws IOException {
        InputStream stream = status >= 200 && status < 400 ? connection.getInputStream() : connection.getErrorStream();
        if (stream == null) return new JSONObject();
        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            try { return new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8)); }
            catch (Exception malformed) { return new JSONObject(); }
        }
    }

    private static String categoryLabel(String value) {
        switch (value) {
            case "transport": return "Transport";
            case "food": return "Nourriture";
            case "housing": return "Logement";
            case "internet": return "Internet";
            case "health": return "Santé";
            case "leisure": return "Loisirs";
            case "salary": return "Salaire";
            case "business": return "Activité";
            case "sales": return "Vente";
            case "commission": return "Commission";
            case "other_income": return "Autre revenu";
            case "other": return "Autre dépense";
            default: return "";
        }
    }

    private static String shorten(String value, int max) {
        String clean = value == null ? "" : value.trim();
        return clean.length() <= max ? clean : clean.substring(0, max - 1) + "…";
    }

    private static final class HttpResult {
        final int status; final JSONObject body;
        HttpResult(int status, JSONObject body) { this.status = status; this.body = body; }
    }
    private static final class AuthUnavailableException extends Exception {
        AuthUnavailableException(String message) { super(message); }
    }
}
