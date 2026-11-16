package com.pata.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

import androidx.annotation.NonNull;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
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
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;

/**
 * Refreshes the Premium finance widget from the same authenticated APIs used by
 * the dashboard. No periodic polling is installed: refreshes are requested when
 * the widget is added/updated or when the dashboard has refreshed its values.
 */
public class PataFinanceWidgetWorker extends Worker {
    private static final String PREFS = "PataFinanceWidget";
    private static final String WORK_NAME = "pata_finance_widget_refresh";
    private static final String BASE_URL = "https://www.pata-yam.site/api";

    public PataFinanceWidgetWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    static void schedule(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, PataQuickCaptureWidgetProvider.class));
        WorkManager workManager = WorkManager.getInstance(context);
        if (ids == null || ids.length == 0) {
            workManager.cancelUniqueWork(WORK_NAME);
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        PataQuickCaptureAuthStore.Session session = PataQuickCaptureAuthStore.read(context);
        if (!prefs.getBoolean("premium_enabled", false) || session == null
            || !session.uid.equals(prefs.getString("owner_uid", ""))) {
            workManager.cancelUniqueWork(WORK_NAME);
            return;
        }

        long now = System.currentTimeMillis();
        long lastRequested = prefs.getLong("last_refresh_requested_at", 0L);
        if (lastRequested > 0L && now - lastRequested < TimeUnit.MINUTES.toMillis(15)) return;
        prefs.edit().putLong("last_refresh_requested_at", now).apply();

        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(PataFinanceWidgetWorker.class)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 20, TimeUnit.SECONDS)
            .build();
        workManager.enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.KEEP, request);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        PataQuickCaptureAuthStore.Session session = PataQuickCaptureAuthStore.read(context);
        if (session == null || !prefs.getBoolean("premium_enabled", false)
            || !session.uid.equals(prefs.getString("owner_uid", ""))) {
            return Result.success();
        }

        HttpURLConnection connection = null;
        try {
            String token = refreshFirebaseSession(context, session);
            String today = doualaToday();
            String monthKey = today.substring(0, 7);
            String startDate = monthKey + "-01";

            JSONObject summary = getJson(BASE_URL + "/finance/global-summary?startDate="
                + startDate + "&endDate=" + today + "&excludeNeutral=true", token);
            if (!summary.optBoolean("success", false)) return Result.retry();

            JSONObject debtResponse = getJson(BASE_URL + "/debts/list", token);
            if (!debtResponse.optBoolean("success", false)) return Result.retry();

            long receivable = 0L;
            long payable = 0L;
            JSONArray debts = debtResponse.optJSONArray("debts");
            if (debts != null) {
                for (int i = 0; i < debts.length(); i++) {
                    JSONObject debt = debts.optJSONObject(i);
                    if (debt == null) continue;
                    String status = debt.optString("status", "");
                    if (!"active".equals(status) && !"partial".equals(status) && !"late".equals(status)) continue;
                    long remaining = Math.max(0L, debt.optLong("remaining", 0L));
                    if ("owed_to_me".equals(debt.optString("type", ""))) receivable += remaining;
                    else if ("i_owe".equals(debt.optString("type", ""))) payable += remaining;
                }
            }

            // Do not allow a queued refresh for an old account/session to overwrite
            // a widget after logout, account switch, or Premium cancellation.
            if (!prefs.getBoolean("premium_enabled", false)
                || !session.uid.equals(prefs.getString("owner_uid", ""))) return Result.success();

            long income = Math.max(0L, summary.optLong("totalIncome", 0L));
            long expense = Math.max(0L, summary.optLong("totalExpense", 0L));
            PataQuickCaptureWidgetProvider.updateFinanceSummary(
                context, income, expense, receivable, payable, monthKey);
            prefs.edit().putLong("last_refresh_succeeded_at", System.currentTimeMillis()).apply();
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

    private static String doualaToday() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("Africa/Douala"));
        return format.format(new Date());
    }

    private static JSONObject getJson(String address, String token) throws IOException {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(address).openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(20000);
            connection.setRequestProperty("Authorization", "Bearer " + token);
            int status = connection.getResponseCode();
            JSONObject body = readJson(connection, status);
            if (status == 401 || status == 403) throw new AuthUnavailableException(body.optString("error", "session_expired"));
            if (status < 200 || status >= 300) throw new IOException("HTTP " + status);
            return body;
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
            if (idToken.isEmpty() || !session.uid.equals(uid)) {
                throw new AuthUnavailableException("invalid_firebase_session");
            }
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
        InputStream stream = status >= 200 && status < 400
            ? connection.getInputStream() : connection.getErrorStream();
        if (stream == null) return new JSONObject();
        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            try {
                return new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8));
            } catch (Exception malformed) {
                return new JSONObject();
            }
        }
    }

    private static final class AuthUnavailableException extends Exception {
        AuthUnavailableException(String message) { super(message); }
    }
}
