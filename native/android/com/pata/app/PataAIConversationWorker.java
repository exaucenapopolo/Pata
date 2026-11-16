package com.pata.app;

import android.content.Context;
import android.net.Uri;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class PataAIConversationWorker extends Worker {
    private static final String API_URL = "https://www.pata-yam.site/api/ai/chat";

    public PataAIConversationWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        String id = getInputData().getString("ai_reply_id");
        if (id == null || id.isEmpty()) return Result.failure();
        JSONObject queued = PataQuickCaptureReceiver.findAI(context, id);
        if (queued == null) return Result.success();

        PataQuickCaptureAuthStore.Session session = PataQuickCaptureAuthStore.read(context);
        String owner = queued.optString("ownerUid", "");
        if (session == null || owner.isEmpty() || !owner.equals(session.uid)) {
            PataQuickCapturePlugin.showAIConversationReplyNotification(context,
                "Ouvre Pata et reconnecte-toi pour continuer avec Mč.");
            return Result.failure();
        }

        try {
            String idToken = refreshFirebaseSession(context, session);
            JSONObject request = new JSONObject();
            JSONArray messages = new JSONArray();
            JSONObject userMessage = new JSONObject();
            userMessage.put("role", "user");
            userMessage.put("content", queued.optString("text", "").trim());
            messages.put(userMessage);
            request.put("messages", messages);
            request.put("mode", "text");
            request.put("language", "fr");
            request.put("notificationMode", true);
            request.put("clientRequestId", id);
            String conversationId = PataQuickCaptureReceiver.resolveAIConversationId(
                context, queued.optString("conversationId", ""), owner);
            request.put("notificationConversationId", conversationId);
            HttpResult response = postJson(API_URL, request, idToken);
            JSONObject body = response.body;

            if (response.status >= 200 && response.status < 300 && body.optBoolean("success", false)) {
                String reply = body.optString("reply", "").trim();
                if (reply.isEmpty()) reply = "Je suis là. Peux-tu préciser ta demande ?";
                PataQuickCaptureReceiver.removeAI(context, id);
                PataQuickCapturePlugin.showAIConversationReplyNotification(context, "Mč · Pata", reply, "/dashboard", conversationId);
                PataQuickCapturePlugin.showPersistentNotification(context, null);
                return Result.success();
            }

            if (response.status == 401) {
                PataQuickCapturePlugin.showAIConversationReplyNotification(context,
                    "Session à actualiser. Ouvre Pata puis réessaie de parler avec Mč.");
                return Result.failure();
            }
            if (response.status == 403) {
                PataQuickCaptureReceiver.removeAI(context, id);
                PataQuickCapturePlugin.showAIConversationReplyNotification(context,
                    "La conversation Mč par notification est réservée à Pata Premium. Active Premium pour continuer.");
                return Result.success();
            }
            if (response.status >= 400 && response.status < 500) {
                PataQuickCaptureReceiver.removeAI(context, id);
                PataQuickCapturePlugin.showAIConversationReplyNotification(context,
                    shorten(body.optString("error", "Je n’ai pas pu traiter ce message. Ouvre Pata pour le reprendre."), 500));
                return Result.success();
            }
            return Result.retry();
        } catch (AuthUnavailableException error) {
            PataQuickCapturePlugin.showAIConversationReplyNotification(context,
                "Ouvre Pata et reconnecte-toi pour continuer avec Mč.");
            return Result.failure();
        } catch (IOException error) {
            return Result.retry();
        } catch (Exception error) {
            PataQuickCapturePlugin.showAIConversationReplyNotification(context,
                "Mč n’a pas pu répondre pour le moment. Réessaie dans la notification.");
            return Result.retry();
        }
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
        } catch (Exception error) {
            if (error instanceof IOException) throw (IOException) error;
            if (error instanceof AuthUnavailableException) throw (AuthUnavailableException) error;
            throw new AuthUnavailableException("refresh_failed");
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
            connection.setReadTimeout(45000);
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

    private static String shorten(String text, int max) {
        String value = text == null ? "" : text.trim();
        return value.length() <= max ? value : value.substring(0, max - 1) + "…";
    }

    private static final class HttpResult {
        final int status;
        final JSONObject body;
        HttpResult(int status, JSONObject body) { this.status = status; this.body = body; }
    }

    private static final class AuthUnavailableException extends Exception {
        AuthUnavailableException(String message) { super(message); }
    }
}
