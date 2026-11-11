package com.pata.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.database.Cursor;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;
import android.provider.ContactsContract;
import android.content.pm.PackageManager;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import androidx.activity.result.ActivityResult;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
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
    private static final String HINTS = "sms_local_hints";
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
        boolean notificationsGranted = android.os.Build.VERSION.SDK_INT < 33
            || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        boolean ignoringBattery = true;
        if (android.os.Build.VERSION.SDK_INT >= 23) {
            PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            ignoringBattery = power != null && power.isIgnoringBatteryOptimizations(context.getPackageName());
        }
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSObject result = new JSObject();
        result.put("receiveSmsGranted", receiveGranted);
        result.put("notificationsGranted", notificationsGranted);
        result.put("ignoringBatteryOptimizations", ignoringBattery);
        result.put("enabled", prefs.getBoolean("enabled", false));
        result.put("premiumUntilMillis", prefs.getLong("premium_until", 0L));
        result.put("userUid", prefs.getString("user_uid", ""));
        result.put("hasDeviceToken", !prefs.getString("device_token", "").isEmpty());
        result.put("lastSmsDiagnosticJson", prefs.getString("last_sms_diagnostic", "{}"));
        try {
            result.put("pendingCount", new JSONArray(prefs.getString(PENDING, "[]")).length());
        } catch (Exception ignored) {
            result.put("pendingCount", 0);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void setConfiguration(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        long premiumUntil = call.getLong("premiumUntilMillis", 0L);
        String userUid = call.getString("uid", "");
        String suppliedDeviceToken = call.getString("deviceToken", "");
        boolean hasPermission = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED;
        boolean validPremium = premiumUntil > System.currentTimeMillis();
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String previousUid = prefs.getString("user_uid", "");
        boolean sameAccount = previousUid.isEmpty() || previousUid.equals(userUid);
        SharedPreferences.Editor editor = prefs.edit()
            .putBoolean("enabled", false)
            .putLong("premium_until", premiumUntil)
            .putString("user_uid", userUid);
        if (!sameAccount) editor.remove("device_token");
        if (suppliedDeviceToken != null && !suppliedDeviceToken.isEmpty()) editor.putString("device_token", suppliedDeviceToken);
        if (!enabled) editor.remove("device_token");
        boolean hasDeviceToken = (suppliedDeviceToken != null && !suppliedDeviceToken.isEmpty())
            || (sameAccount && !prefs.getString("device_token", "").isEmpty());
        boolean actualEnabled = enabled && hasPermission && validPremium && !userUid.isEmpty() && hasDeviceToken;
        editor.putBoolean("enabled", actualEnabled).apply();
        JSObject result = new JSObject();
        result.put("enabled", actualEnabled);
        result.put("receiveSmsGranted", hasPermission);
        result.put("notificationsGranted", android.os.Build.VERSION.SDK_INT < 33
            || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED);
        result.put("hasDeviceToken", hasDeviceToken);
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
    public void retryPendingSync(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String uid = prefs.getString("user_uid", "");
        String token = prefs.getString("device_token", "");
        if (uid.isEmpty() || token.isEmpty() || !prefs.getBoolean("enabled", false)) {
            call.resolve(new JSObject().put("scheduled", 0));
            return;
        }
        JSONArray stored;
        try { stored = new JSONArray(prefs.getString(PENDING, "[]")); }
        catch (Exception error) { stored = new JSONArray(); }
        int scheduled = 0;
        for (int index = 0; index < stored.length(); index++) {
            JSONObject item = stored.optJSONObject(index);
            if (item == null || !uid.equals(item.optString("ownerUid", uid))) continue;
            PataSmsReceiver.enqueueSync(getContext(), item, uid, token);
            scheduled += 1;
        }
        call.resolve(new JSObject().put("scheduled", scheduled));
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
    public void saveLocalHints(PluginCall call) {
        String transactionHash = call.getString("transactionHash", "");
        if (!transactionHash.matches("[a-f0-9]{64}")) {
            call.reject("Empreinte de transaction invalide.");
            return;
        }
        String counterparty = call.getString("counterparty", "");
        Long balance = call.getLong("balance");
        JSONObject hint = new JSONObject();
        try {
            if (counterparty != null && counterparty.matches("[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’ .-]{0,59}")) {
                hint.put("counterparty", counterparty);
            }
            if (balance != null && balance >= 0L && balance <= 1_000_000_000L) {
                hint.put("balance", balance);
            }
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONObject all;
            try { all = new JSONObject(prefs.getString(HINTS, "{}")); }
            catch (Exception error) { all = new JSONObject(); }
            all.put(transactionHash, hint);
            prefs.edit().putString(HINTS, all.toString()).apply();
            call.resolve();
        } catch (Exception error) {
            call.reject("Impossible d’enregistrer les détails locaux.", error);
        }
    }

    @PluginMethod
    public void getLocalHints(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSObject result = new JSObject();
        result.put("hintsJson", prefs.getString(HINTS, "{}"));
        call.resolve(result);
    }

    @PluginMethod
    public void clearLocalHints(PluginCall call) {
        String transactionHash = call.getString("transactionHash", "");
        if (!transactionHash.matches("[a-f0-9]{64}")) {
            call.reject("Empreinte de transaction invalide.");
            return;
        }
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONObject all;
        try { all = new JSONObject(prefs.getString(HINTS, "{}")); }
        catch (Exception error) { all = new JSONObject(); }
        all.remove(transactionHash);
        prefs.edit().putString(HINTS, all.toString()).apply();
        call.resolve();
    }


    @PluginMethod
    public void pickContact(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI);
            startActivityForResult(call, intent, "contactPickerResult");
        } catch (Exception error) {
            call.reject("Le sélecteur de contacts n’est pas disponible sur cet appareil.", error);
        }
    }

    @ActivityCallback
    private void contactPickerResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.resolve(new JSObject().put("cancelled", true));
            return;
        }
        Uri contactUri = result.getData().getData();
        if (contactUri == null) {
            call.reject("Aucun contact n’a été sélectionné.");
            return;
        }
        String[] projection = {
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER
        };
        try (Cursor cursor = getContext().getContentResolver().query(contactUri, projection, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) {
                call.reject("Impossible de lire le contact sélectionné.");
                return;
            }
            int nameIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
            int phoneIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
            String displayName = nameIndex >= 0 ? cursor.getString(nameIndex) : "";
            String phone = phoneIndex >= 0 ? cursor.getString(phoneIndex) : "";
            JSObject response = new JSObject();
            response.put("cancelled", false);
            response.put("displayName", displayName == null ? "" : displayName.trim());
            response.put("phone", phone == null ? "" : phone.trim());
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Impossible de lire le contact choisi.", error);
        }
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
