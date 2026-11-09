package com.pata.app;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String PREFS = "PataSms";
    private static final String SHARED_TEXT = "shared_sms_text";
    private static final String SITE_ORIGIN = "https://www.pata-yam.site";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PataSmsPlugin.class);
        super.onCreate(savedInstanceState);
        captureSharedIntent(getIntent());
        openNotificationTarget(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureSharedIntent(intent);
        openNotificationTarget(intent);
    }

    private void captureSharedIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String type = intent.getType();
        if (type == null || !type.startsWith("text/")) return;
        CharSequence shared = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (shared == null || shared.length() == 0) return;
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        prefs.edit().putString(SHARED_TEXT, shared.toString()).apply();
    }

    private void openNotificationTarget(Intent intent) {
        if (intent == null) return;
        String target = intent.getStringExtra("pata_notification_target");
        if (target == null || !target.startsWith("/") || target.startsWith("//")) return;
        intent.removeExtra("pata_notification_target");
        try {
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
