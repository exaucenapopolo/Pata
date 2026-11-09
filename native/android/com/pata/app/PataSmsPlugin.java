package com.pata.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;
import android.content.pm.PackageManager;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

@CapacitorPlugin(
    name = "PataSms",
    permissions = {
        @Permission(alias = "receiveSms", strings = { Manifest.permission.RECEIVE_SMS }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class PataSmsPlugin extends Plugin {
    private static final String PREFS = "PataSms";
    private static final String PENDING = "pending_sms";
    private static final String SHARED_TEXT = "shared_sms_text";

    @PluginMethod
    public void requestSmsPermission(PluginCall call) {
        if (getPermissionState("receiveSms") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("receiveSms", call, "smsPermissionCallback");
    }

    @PermissionCallback
    private void smsPermissionCallback(PluginCall call) {
        boolean granted = getPermissionState("receiveSms") == PermissionState.GRANTED;
        JSObject result = new JSObject();
        result.put("granted", granted);
        if (!granted) {
            result.put("reason", "Android n’a pas accordé RECEIVE_SMS. Sur certaines installations, cette permission doit être autorisée par l’installateur du paquet.");
        }
        call.resolve(result);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (android.os.Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(new JSObject().put("granted", true));
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", android.os.Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context context = getContext();
        boolean receiveGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED;
        boolean ignoringBattery = true;
        if (android.os.Build.VERSION.SDK_INT >= 23) {
            PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            ignoringBattery = power != null && power.isIgnoringBatteryOptimizations(context.getPackageName());
        }
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSObject result = new JSObject();
        result.put("receiveSmsGranted", receiveGranted);
        result.put("ignoringBatteryOptimizations", ignoringBattery);
        result.put("enabled", prefs.getBoolean("enabled", false));
        result.put("premiumUntilMillis", prefs.getLong("premium_until", 0L));
        call.resolve(result);
    }

    @PluginMethod
    public void setConfiguration(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        long premiumUntil = call.getLong("premiumUntilMillis", 0L);
        boolean hasPermission = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED;
        boolean validPremium = premiumUntil > System.currentTimeMillis();
        boolean actualEnabled = enabled && hasPermission && validPremium;
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("enabled", actualEnabled)
            .putLong("premium_until", premiumUntil)
            .apply();
        JSObject result = new JSObject();
        result.put("enabled", actualEnabled);
        result.put("receiveSmsGranted", hasPermission);
        call.resolve(result);
    }

    @PluginMethod
    public void getPendingSms(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray stored;
        try {
            stored = new JSONArray(prefs.getString(PENDING, "[]"));
        } catch (Exception error) {
            stored = new JSONArray();
        }
        JSArray items = new JSArray();
        for (int index = 0; index < stored.length(); index++) {
            JSONObject item = stored.optJSONObject(index);
            if (item != null) items.put(item);
        }
        JSObject result = new JSObject();
        result.put("items", items);
        call.resolve(result);
    }

    @PluginMethod
    public void clearPendingSms(PluginCall call) {
        JSArray hashes = call.getArray("transactionHashes");
        Set<String> accepted = new HashSet<>();
        if (hashes != null) {
            for (int i = 0; i < hashes.length(); i++) {
                String value = hashes.optString(i, "");
                if (!value.isEmpty()) accepted.add(value);
            }
        }
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray stored;
        try { stored = new JSONArray(prefs.getString(PENDING, "[]")); }
        catch (Exception error) { stored = new JSONArray(); }
        JSONArray remaining = new JSONArray();
        for (int i = 0; i < stored.length(); i++) {
            JSONObject item = stored.optJSONObject(i);
            if (item != null && !accepted.contains(item.optString("transactionHash", ""))) remaining.put(item);
        }
        prefs.edit().putString(PENDING, remaining.toString()).apply();
        call.resolve();
    }

    @PluginMethod
    public void getSharedSms(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSObject result = new JSObject();
        result.put("text", prefs.getString(SHARED_TEXT, ""));
        call.resolve(result);
    }

    @PluginMethod
    public void clearSharedSms(PluginCall call) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(SHARED_TEXT).apply();
        call.resolve();
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getContext().getPackageName()));
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                call.resolve();
            } catch (Exception secondError) {
                call.reject("Impossible d’ouvrir les réglages de batterie.", secondError);
            }
        }
    }
}
