package com.pata.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.provider.OpenableColumns;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    private static final String PREFS = "PataSms";
    private static final String SHARED_TEXT = "shared_sms_text";
    private static final String QUICK_PREFS = "PataQuickCapture";
    private static final String SITE_ORIGIN = "https://www.pata-yam.site";
    private static final long MAX_SHARED_BYTES = 12L * 1024L * 1024L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PataSmsPlugin.class);
        registerPlugin(PataQuickCapturePlugin.class);
        super.onCreate(savedInstanceState);
        createPataNotificationChannel();
        captureSharedIntent(getIntent());
        openShortcutOrNotificationTarget(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureSharedIntent(intent);
        openShortcutOrNotificationTarget(intent);
    }

    private void createPataNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            "pata_general",
            "Notifications Pata",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Messages importants et alertes envoyés par Pata.");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(channel);
    }

    private void captureSharedIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)
            && !Intent.ACTION_VIEW.equals(action)) return;

        String mimeType = intent.getType();
        CharSequence sharedText = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        Uri streamUri = null;
        try {
            if (Intent.ACTION_VIEW.equals(action)) {
                streamUri = intent.getData();
            } else if (Intent.ACTION_SEND.equals(action)) {
                Object extra = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (extra instanceof Uri) streamUri = (Uri) extra;
            } else {
                ArrayList<Uri> streams = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (streams != null && !streams.isEmpty()) streamUri = streams.get(0);
            }
        } catch (Exception ignored) { }

        SharedPreferences prefs = getSharedPreferences(QUICK_PREFS, MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.remove("shared_file_error");
        if (sharedText != null) editor.putString("shared_text", sharedText.toString().trim());
        else editor.putString("shared_text", "");

        if (streamUri != null) {
            String resolvedMime = getContentResolver().getType(streamUri);
            if (resolvedMime == null) resolvedMime = mimeType;
            if (isSupportedSharedFileMime(resolvedMime)) {
                saveSharedFile(streamUri, resolvedMime, editor);
            } else {
                String oldPath = prefs.getString("shared_file_path", "");
                if (!oldPath.isEmpty()) new File(oldPath).delete();
                editor.remove("shared_file_path").remove("shared_mime_type").remove("shared_file_name");
            }
        } else {
            String oldPath = prefs.getString("shared_file_path", "");
            if (!oldPath.isEmpty()) new File(oldPath).delete();
            editor.remove("shared_file_path").remove("shared_mime_type").remove("shared_file_name");
        }
        editor.apply();

        // Compatibilité avec le flux historique d'import SMS partagé.
        if (sharedText != null && mimeType != null && mimeType.startsWith("text/")) {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putString(SHARED_TEXT, sharedText.toString()).apply();
        }
    }

    private boolean isSupportedSharedFileMime(String mimeType) {
        if (mimeType == null) return false;
        String normalized = mimeType.trim().toLowerCase(java.util.Locale.ROOT);
        return normalized.startsWith("image/")
            || normalized.startsWith("text/")
            || "application/pdf".equals(normalized);
    }

    private void saveSharedFile(Uri uri, String mimeType, SharedPreferences.Editor editor) {
        File target = new File(getCacheDir(), "pata-shared-" + System.currentTimeMillis());
        String oldPath = getSharedPreferences(QUICK_PREFS, MODE_PRIVATE).getString("shared_file_path", "");
        if (!oldPath.isEmpty()) new File(oldPath).delete();
        long total = 0L;
        try (InputStream input = getContentResolver().openInputStream(uri);
             FileOutputStream output = new FileOutputStream(target)) {
            if (input == null) return;
            byte[] buffer = new byte[32768];
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_SHARED_BYTES) {
                    output.close();
                    target.delete();
                    editor.remove("shared_file_path").remove("shared_mime_type").remove("shared_file_name");
                    editor.putString("shared_file_error", "Le fichier partagé dépasse 12 Mo.");
                    return;
                }
                output.write(buffer, 0, read);
            }
            editor.putString("shared_file_path", target.getAbsolutePath());
            editor.putString("shared_mime_type", mimeType);
            editor.putString("shared_file_name", getDisplayName(uri));
            editor.remove("shared_file_error");
        } catch (Exception error) {
            target.delete();
            editor.remove("shared_file_path").remove("shared_mime_type").remove("shared_file_name");
            editor.putString("shared_file_error", "Impossible de lire le fichier partagé.");
        }
    }

    private String getDisplayName(Uri uri) {
        try (Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) {
                    String value = cursor.getString(index);
                    if (value != null) return value.substring(0, Math.min(120, value.length()));
                }
            }
        } catch (Exception ignored) { }
        return "Document partagé";
    }

    private String getShortcutTargetFromData(Intent intent) {
        Uri data = intent.getData();
        if (data == null || !"https".equalsIgnoreCase(data.getScheme())) return null;
        String host = data.getHost();
        if (!"www.pata-yam.site".equalsIgnoreCase(host)
            && !"pata-yam.site".equalsIgnoreCase(host)) return null;
        String path = data.getPath();
        if (!"/expenses".equals(path) && !"/income".equals(path) && !"/cotisations".equals(path)) return null;
        String query = data.getEncodedQuery();
        return path + (query == null || query.isEmpty() ? "" : "?" + query);
    }

    // Les raccourcis Android, la notification, le widget et la tuile ouvrent le même flux.
    private void openShortcutOrNotificationTarget(Intent intent) {
        if (intent == null) return;

        String quickType = intent.getStringExtra("pata_quick_capture");
        intent.removeExtra("pata_quick_capture");
        if (quickType != null && ("expense".equals(quickType) || "income".equals(quickType) || "voice".equals(quickType))) {
            getSharedPreferences(QUICK_PREFS, MODE_PRIVATE).edit()
                .putString("launch_request_type", quickType).apply();
        }

        String target = intent.getStringExtra("pata_shortcut_target");
        intent.removeExtra("pata_shortcut_target");
        if (target == null) target = getShortcutTargetFromData(intent);
        if (target == null) target = intent.getStringExtra("pata_notification_target");
        intent.removeExtra("pata_notification_target");

        if (target == null || !target.startsWith("/") || target.startsWith("//")
            || target.contains("\\") || target.contains("://")) return;
        try {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            String destination = SITE_ORIGIN + target;
            String javascript = "window.location.assign(" + JSONObject.quote(destination) + ");";
            getBridge().getWebView().postDelayed(
                () -> getBridge().getWebView().evaluateJavascript(javascript, null),
                900
            );
        } catch (Exception ignored) {
            // Le lancement normal de Pata reste disponible si la WebView n'est pas encore prête.
        }
    }
}
