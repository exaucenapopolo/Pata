package com.pata.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.appwidget.AppWidgetManager;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
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
import java.util.concurrent.TimeUnit;

public class PataCotisationWidgetWorker extends Worker {
    private static final String API_URL = "https://www.pata-yam.site/api/cotisations/widget";
    private static final String UNIQUE_PERIODIC = "pata_cotisations_widget_periodic";

    public PataCotisationWidgetWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    static void schedule(Context context) {
        WorkManager workManager = WorkManager.getInstance(context);
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] widgetIds = manager.getAppWidgetIds(new ComponentName(context, PataCotisationWidgetProvider.class));
        if (widgetIds.length == 0) {
            workManager.cancelUniqueWork("pata_cotisations_widget_refresh_now");
            workManager.cancelUniquePeriodicWork(UNIQUE_PERIODIC);
            return;
        }

        // Pas de rafraîchissement réseau périodique : une mise à jour ponctuelle
        // à l'installation, puis au retour dans Pata, avec un délai minimal de 30 min.
        workManager.cancelUniquePeriodicWork(UNIQUE_PERIODIC);
        if (PataQuickCaptureAuthStore.read(context) == null) return;
        SharedPreferences prefs = context.getSharedPreferences("PataCotisationWidget", Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        long lastRefreshRequestedAt = prefs.getLong("last_refresh_requested_at", 0L);
        if (lastRefreshRequestedAt > 0L && now - lastRefreshRequestedAt < TimeUnit.MINUTES.toMillis(30)) return;
        prefs.edit().putLong("last_refresh_requested_at", now).apply();
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED).build();
        OneTimeWorkRequest immediate = new OneTimeWorkRequest.Builder(PataCotisationWidgetWorker.class)
            .setConstraints(constraints).build();
        workManager.enqueueUniqueWork(
            "pata_cotisations_widget_refresh_now", ExistingWorkPolicy.KEEP, immediate);
    }
    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        PataQuickCaptureAuthStore.Session session = PataQuickCaptureAuthStore.read(context);
        if (session == null) return Result.success();
        HttpURLConnection connection = null;
        try {
            String token = refreshFirebaseSession(context, session);
            connection = (HttpURLConnection) new URL(API_URL).openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(20000);
            connection.setRequestProperty("Authorization", "Bearer " + token);
            int status = connection.getResponseCode();
            JSONObject response = readJson(connection, status);
            if (status == 401 || status == 403) return Result.failure();
            if (status < 200 || status >= 300 || !response.optBoolean("success", false)) return Result.retry();
            JSONArray groups = response.optJSONArray("groups");
            PataCotisationWidgetProvider.updateData(
                context, groups == null ? new JSONArray() : groups,
                response.optString("updatedAt", ""));
            return Result.success();
        } catch (AuthUnavailableException error) {
            return Result.failure();
        } catch (IOException error) {
            return Result.retry();
        } catch (Exception error) {
            return Result.retry();
        } finally {
            if (connection != null) connection.disconnect();
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

    private static final class AuthUnavailableException extends Exception {
        AuthUnavailableException(String message) { super(message); }
    }
}
