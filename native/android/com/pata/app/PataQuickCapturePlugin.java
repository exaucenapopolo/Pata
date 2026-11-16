package com.pata.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.pdf.PdfRenderer;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.speech.RecognizerIntent;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import androidx.activity.result.ActivityResult;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.ArrayList;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "PataQuickCapture",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class PataQuickCapturePlugin extends Plugin {
    private static final String PREFS = "PataQuickCapture";
    private static final String CHANNEL = "pata_quick_capture";
    private static final int NOTIFICATION_ID = 74021;
    private static final int NOTIFICATION_EVENT_BASE = 75000;
    private static final String EVENT_CHANNEL = "pata_quick_capture_events";
    private static final String QUEUE = "pending_quick_captures";

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("permission_prompt_attempted", true).apply();
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(new JSObject().put("granted", notificationsAllowed(getContext())));
            return;
        }
        requestPermissionForAlias("notifications", call, "quickNotificationPermissionCallback");
    }

    @PermissionCallback
    private void quickNotificationPermissionCallback(PluginCall call) {
        call.resolve(new JSObject().put("granted", notificationsAllowed(getContext())));
    }

    @PluginMethod
    public void setAuthSession(PluginCall call) {
        String uid = call.getString("uid", "");
        String refreshToken = call.getString("refreshToken", "");
        String apiKey = call.getString("apiKey", "");
        try {
            PataQuickCaptureAuthStore.save(getContext(), uid, refreshToken, apiKey);
            PataQuickCaptureReceiver.schedulePending(getContext(), uid);
            PataCotisationWidgetWorker.schedule(getContext());
            call.resolve(new JSObject().put("saved", true));
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "Impossible de sécuriser la session Pata." : error.getMessage(), error);
        }
    }

    @PluginMethod
    public void clearAuthSession(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putBoolean("persistent_enabled", false)
            .putBoolean("persistent_disabled_by_user", false)
            .remove("quick_capture_uid").apply();
        PataQuickCaptureAuthStore.clear(getContext());
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(NOTIFICATION_ID);
        PataCotisationWidgetProvider.updateData(getContext(), new JSONArray(), "");
        androidx.work.WorkManager.getInstance(getContext()).cancelUniqueWork("pata_cotisations_widget_refresh_now");
        androidx.work.WorkManager.getInstance(getContext()).cancelUniqueWork("pata_cotisations_widget_periodic");
        call.resolve(new JSObject().put("cleared", true));
    }

    @PluginMethod
    public void getPersistentNotificationStatus(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        call.resolve(new JSObject()
            .put("enabled", prefs.getBoolean("persistent_enabled", false))
            .put("permissionPromptAttempted", prefs.getBoolean("permission_prompt_attempted", false))
            .put("userDisabled", prefs.getBoolean("persistent_disabled_by_user", false))
            .put("permissionGranted", notificationsAllowed(getContext())));
    }

    @PluginMethod
    public void setPersistentNotification(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        String uid = call.getString("uid", "");
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (enabled) {
            if (uid == null || uid.trim().isEmpty()) {
                call.reject("Compte Pata invalide. Reconnecte-toi avant d’activer la saisie rapide.");
                return;
            }
            if (!notificationsAllowed(getContext())) {
                call.reject("Autorise les notifications Pata dans les réglages Android.");
                return;
            }
            PataQuickCaptureAuthStore.Session session = PataQuickCaptureAuthStore.read(getContext());
            if (session == null || !uid.equals(session.uid)) {
                call.reject("Ouvre Pata une fois pour sécuriser la session avant d’activer la notification.");
                return;
            }
            prefs.edit().putBoolean("persistent_enabled", true)
                .putBoolean("persistent_disabled_by_user", false)
                .putString("quick_capture_uid", uid).apply();
            showPersistentNotification(getContext(), null);
            call.resolve(new JSObject().put("enabled", true));
        } else {
            prefs.edit().putBoolean("persistent_enabled", false)
                .putBoolean("persistent_disabled_by_user", call.getBoolean("userInitiated", false))
                .remove("quick_capture_uid").apply();
            NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.cancel(NOTIFICATION_ID);
            call.resolve(new JSObject().put("enabled", false));
        }
    }

    static boolean notificationsAllowed(Context context) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        return Build.VERSION.SDK_INT < 33
            || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void ensurePersistentNotification(PluginCall call) {
        String uid = call.getString("uid", "");
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        PataQuickCaptureAuthStore.Session session = PataQuickCaptureAuthStore.read(getContext());
        boolean enabled = prefs.getBoolean("persistent_enabled", false)
            && uid != null && uid.equals(session == null ? "" : session.uid)
            && notificationsAllowed(getContext());
        if (enabled) showPersistentNotification(getContext(), null);
        call.resolve(new JSObject().put("enabled", enabled));
    }

    static void showPersistentNotification(Context context, String ignoredStatus) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean("persistent_enabled", false) || !notificationsAllowed(context)) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Saisie rapide Pata", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Accès permanent à la saisie rapide des opérations Pata.");
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }

        Intent open = new Intent(context, PataQuickCaptureActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending = PendingIntent.getActivity(context, 741, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent replyIntent = new Intent(context, PataQuickCaptureReceiver.class)
            .setAction(PataQuickCaptureReceiver.ACTION_REPLY);
        int mutableFlag = Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0;
        PendingIntent replyPending = PendingIntent.getBroadcast(context, 745, replyIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | mutableFlag);
        Intent restoreIntent = new Intent(context, PataQuickCaptureReceiver.class)
            .setAction(PataQuickCaptureReceiver.ACTION_RESTORE);
        PendingIntent restorePending = PendingIntent.getBroadcast(context, 746, restoreIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        RemoteInput remoteInput = new RemoteInput.Builder(PataQuickCaptureReceiver.REMOTE_KEY)
            .setLabel("Ex. 500 transport ou salaire 100 000 FCFA").build();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_pata)
            .setContentTitle("Pata · Saisie rapide")
            .setContentText("Réponds ici : 500 transport · salaire 100 000.")
            .setContentIntent(openPending)
            .setDeleteIntent(restorePending)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setLocalOnly(true)
            .addAction(new NotificationCompat.Action.Builder(
                R.drawable.ic_shortcut_expense, "Saisir", replyPending)
                .addRemoteInput(remoteInput)
                .setAllowGeneratedReplies(true)
                .build());
        Notification notification = builder.build();
        notification.flags |= Notification.FLAG_NO_CLEAR;
        manager.notify(NOTIFICATION_ID, notification);
    }

    static void showCaptureResultNotification(Context context, String captureId, String message) {
        showCaptureEvent(context, captureId, "Opération enregistrée", message, "/dashboard");
    }

    static void showCaptureNeedsReviewNotification(Context context, String captureId, String message) {
        showCaptureEvent(context, captureId, "Une précision est nécessaire", message, "/dashboard");
    }

    static void showCaptureFollowUpNotification(Context context, String captureId, String title, String message, String targetPath) {
        showCaptureEvent(context, captureId, title, message, targetPath);
    }

    private static void showCaptureEvent(Context context, String captureId, String title, String message, String targetPath) {
        if (!notificationsAllowed(context)) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                EVENT_CHANNEL, "Confirmations de saisie Pata", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Confirmations ponctuelles et demandes de précision pour les saisies rapides.");
            channel.setShowBadge(true);
            manager.createNotificationChannel(channel);
        }
        Intent open = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("pata_notification_target", targetPath == null || targetPath.trim().isEmpty() ? "/dashboard" : targetPath);
        PendingIntent content = PendingIntent.getActivity(context,
            76000 + Math.abs((captureId == null ? "" : captureId).hashCode() % 100000),
            open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new NotificationCompat.Builder(context, EVENT_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_pata)
            .setContentTitle(title)
            .setContentText(message == null ? "" : message)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(message == null ? "" : message))
            .setContentIntent(content)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setOngoing(false)
            .setOnlyAlertOnce(true)
            .build();
        int id = NOTIFICATION_EVENT_BASE + Math.abs((captureId == null ? "" : captureId).hashCode() % 100000);
        manager.notify(id, notification);
    }

    @PluginMethod
    public void getPendingCaptures(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray stored;
        try { stored = new JSONArray(prefs.getString(QUEUE, "[]")); }
        catch (Exception ignored) { stored = new JSONArray(); }
        JSArray items = new JSArray();
        for (int i = 0; i < stored.length(); i++) {
            JSONObject item = stored.optJSONObject(i);
            if (item != null) items.put(item);
        }
        call.resolve(new JSObject().put("items", items));
    }

    @PluginMethod
    public void clearPendingCapture(PluginCall call) {
        PataQuickCaptureReceiver.remove(getContext(), call.getString("id", ""));
        call.resolve();
    }

    @PluginMethod
    public void getLaunchRequest(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String type = prefs.getString("launch_request_type", "");
        prefs.edit().remove("launch_request_type").apply();
        call.resolve(new JSObject().put("type", type));
    }

    @PluginMethod
    public void startVoiceCapture(PluginCall call) {
        try {
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "fr-FR");
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "fr-FR");
            intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Décris ta dépense ou ton revenu");
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            startActivityForResult(call, intent, "voiceCaptureResult");
        } catch (Exception error) {
            call.reject("La reconnaissance vocale Android n’est pas disponible sur cet appareil.", error);
        }
    }

    @ActivityCallback
    private void voiceCaptureResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) {
            call.resolve(new JSObject().put("cancelled", true).put("text", ""));
            return;
        }
        ArrayList<String> phrases = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        String text = phrases == null || phrases.isEmpty() ? "" : phrases.get(0);
        call.resolve(new JSObject().put("cancelled", false).put("text", text == null ? "" : text));
    }

    @PluginMethod
    public void getSharedContent(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String text = prefs.getString("shared_text", "");
        String path = prefs.getString("shared_file_path", "");
        String mime = prefs.getString("shared_mime_type", "");
        String fileName = prefs.getString("shared_file_name", "");
        String sharedFileError = prefs.getString("shared_file_error", "");
        JSObject result = new JSObject();
        result.put("text", text);
        result.put("mimeType", mime);
        result.put("sourceMimeType", mime);
        result.put("fileName", fileName);
        if (!sharedFileError.isEmpty()) result.put("fileError", sharedFileError);
        if (!path.isEmpty()) {
            File file = new File(path);
            if (!file.isFile() || file.length() > 12L * 1024L * 1024L) {
                result.put("fileError", "Le fichier partagé est absent ou dépasse 12 Mo.");
                call.resolve(result);
                return;
            }
            try {
                byte[] bytes;
                if ("application/pdf".equalsIgnoreCase(mime)) {
                    try (ParcelFileDescriptor descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
                         PdfRenderer renderer = new PdfRenderer(descriptor)) {
                        if (renderer.getPageCount() < 1) throw new IllegalStateException("PDF vide.");
                        PdfRenderer.Page page = renderer.openPage(0);
                        int width = page.getWidth();
                        int height = page.getHeight();
                        float scale = Math.min(1f, 1800f / Math.max(width, height));
                        Bitmap bitmap = Bitmap.createBitmap(Math.max(1, (int) (width * scale)),
                            Math.max(1, (int) (height * scale)), Bitmap.Config.ARGB_8888);
                        bitmap.eraseColor(android.graphics.Color.WHITE);
                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                        page.close();
                        ByteArrayOutputStream output = new ByteArrayOutputStream();
                        bitmap.compress(Bitmap.CompressFormat.JPEG, 84, output);
                        bitmap.recycle();
                        bytes = output.toByteArray();
                        result.put("pageCount", renderer.getPageCount());
                        result.put("mimeType", "image/jpeg");
                    }
                } else {
                    Bitmap bitmap = BitmapFactory.decodeFile(path);
                    if (bitmap == null) throw new IllegalStateException("Image illisible.");
                    int width = bitmap.getWidth();
                    int height = bitmap.getHeight();
                    float scale = Math.min(1f, 1800f / Math.max(width, height));
                    Bitmap resized = scale < 1f
                        ? Bitmap.createScaledBitmap(bitmap, Math.max(1, (int) (width * scale)), Math.max(1, (int) (height * scale)), true)
                        : bitmap;
                    ByteArrayOutputStream output = new ByteArrayOutputStream();
                    resized.compress(Bitmap.CompressFormat.JPEG, 84, output);
                    if (resized != bitmap) resized.recycle();
                    bitmap.recycle();
                    bytes = output.toByteArray();
                    result.put("mimeType", "image/jpeg");
                }
                String base64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP);
                result.put("fileBase64", base64);
            } catch (Exception error) {
                result.put("fileError", "Le fichier partagé n’a pas pu être préparé pour l’analyse.");
                call.resolve(result);
                return;
            }
        }
        call.resolve(result);
    }

    @PluginMethod
    public void clearSharedContent(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String path = prefs.getString("shared_file_path", "");
        if (!path.isEmpty()) new File(path).delete();
        prefs.edit().remove("shared_text").remove("shared_file_path")
            .remove("shared_mime_type").remove("shared_file_name")
            .remove("shared_file_error").apply();
        call.resolve();
    }

    @PluginMethod
    public void adjustWidgetBalance(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences("PataQuickWidget", Context.MODE_PRIVATE);
        long updatedAt = prefs.getLong("updated_at", 0L);
        if (updatedAt <= 0L) {
            call.resolve(new JSObject().put("updated", false).put("reason", "not_initialized"));
            return;
        }
        long delta = call.getLong("delta", 0L);
        long current = Math.max(0L, prefs.getLong("available_amount", 0L));
        long next = Math.max(0L, Math.min(1000000000L, current + delta));
        prefs.edit().putLong("available_amount", next).putLong("updated_at", System.currentTimeMillis()).apply();
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        int[] ids = manager.getAppWidgetIds(new ComponentName(getContext(), PataQuickCaptureWidgetProvider.class));
        PataQuickCaptureWidgetProvider.updateWidgets(getContext(), manager, ids);
        call.resolve(new JSObject().put("updated", true).put("availableAmount", next));
    }

    @PluginMethod
    public void updateWidget(PluginCall call) {
        long amount = Math.max(0L, Math.min(1000000000L, call.getLong("availableAmount", 0L)));
        String currency = call.getString("currency", "FCFA");
        SharedPreferences prefs = getContext().getSharedPreferences("PataQuickWidget", Context.MODE_PRIVATE);
        prefs.edit().putLong("available_amount", amount)
            .putString("currency", currency == null ? "FCFA" : currency)
            .putLong("updated_at", System.currentTimeMillis()).apply();
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        int[] ids = manager.getAppWidgetIds(new ComponentName(getContext(), PataQuickCaptureWidgetProvider.class));
        PataQuickCaptureWidgetProvider.updateWidgets(getContext(), manager, ids);
        call.resolve(new JSObject().put("updated", true));
    }

    @PluginMethod
    public void isFinanceWidgetInstalled(PluginCall call) {
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        int[] ids = manager.getAppWidgetIds(new ComponentName(getContext(), PataQuickCaptureWidgetProvider.class));
        call.resolve(new JSObject().put("installed", ids != null && ids.length > 0));
    }

    @PluginMethod
    public void updateFinanceWidget(PluginCall call) {
        long income = Math.max(0L, Math.min(1000000000000L, call.getLong("incomeTotal", 0L)));
        long expense = Math.max(0L, Math.min(1000000000000L, call.getLong("expenseTotal", 0L)));
        long receivable = Math.max(0L, Math.min(1000000000000L, call.getLong("receivableTotal", 0L)));
        long payable = Math.max(0L, Math.min(1000000000000L, call.getLong("payableTotal", 0L)));
        String monthKey = call.getString("monthKey", "");
        PataQuickCaptureWidgetProvider.updateFinanceSummary(getContext(), income, expense, receivable, payable, monthKey);
        call.resolve(new JSObject().put("updated", true));
    }

    @PluginMethod
    public void clearFinanceWidget(PluginCall call) {
        PataQuickCaptureWidgetProvider.updateFinanceSummary(getContext(), 0L, 0L, 0L, 0L, "");
        call.resolve(new JSObject().put("updated", true));
    }
}
