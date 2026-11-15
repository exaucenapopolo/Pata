package com.pata.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class PataQuickCaptureAuthStore {
    private static final String PREFS = "PataQuickCapture";
    private static final String KEY_ALIAS = "pata.quick.capture.auth.v1";
    private static final String TOKEN_KEY = "refresh_token_encrypted";

    static final class Session {
        final String uid;
        final String refreshToken;
        final String apiKey;
        Session(String uid, String refreshToken, String apiKey) {
            this.uid = uid; this.refreshToken = refreshToken; this.apiKey = apiKey;
        }
    }

    private PataQuickCaptureAuthStore() { }

    static synchronized void save(Context context, String uid, String refreshToken, String apiKey) throws Exception {
        if (uid == null || uid.trim().isEmpty()) throw new IllegalArgumentException("Compte Pata invalide.");
        if (refreshToken == null || refreshToken.trim().isEmpty()) throw new IllegalArgumentException("Session Firebase indisponible. Ouvre Pata et reconnecte-toi.");
        if (apiKey == null || apiKey.trim().isEmpty()) throw new IllegalArgumentException("Configuration Firebase indisponible.");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] encrypted = cipher.doFinal(refreshToken.getBytes(StandardCharsets.UTF_8));
        String packed = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)
            + "." + Base64.encodeToString(encrypted, Base64.NO_WRAP);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(TOKEN_KEY, packed).putString("quick_capture_uid", uid)
            .putString("firebase_api_key", apiKey).apply();
    }

    static synchronized Session read(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String uid = prefs.getString("quick_capture_uid", "");
        String apiKey = prefs.getString("firebase_api_key", "");
        String packed = prefs.getString(TOKEN_KEY, "");
        if (uid == null || uid.isEmpty() || apiKey == null || apiKey.isEmpty() || packed == null || packed.isEmpty()) return null;
        try {
            int separator = packed.indexOf('.');
            if (separator <= 0 || separator >= packed.length() - 1) return null;
            byte[] iv = Base64.decode(packed.substring(0, separator), Base64.NO_WRAP);
            byte[] cipherText = Base64.decode(packed.substring(separator + 1), Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
            String token = new String(cipher.doFinal(cipherText), StandardCharsets.UTF_8);
            return token.isEmpty() ? null : new Session(uid, token, apiKey);
        } catch (Exception error) {
            prefs.edit().remove(TOKEN_KEY).apply();
            return null;
        }
    }

    static synchronized void updateRefreshToken(Context context, String refreshToken) throws Exception {
        Session current = read(context);
        if (current != null) save(context, current.uid, refreshToken, current.apiKey);
    }

    static synchronized void clear(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .remove(TOKEN_KEY).remove("quick_capture_uid").remove("firebase_api_key").apply();
        try {
            KeyStore store = KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            if (store.containsAlias(KEY_ALIAS)) store.deleteEntry(KEY_ALIAS);
        } catch (Exception ignored) { }
    }

    private static SecretKey getOrCreateKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return (SecretKey) store.getKey(KEY_ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true).setKeySize(256).build());
        return generator.generateKey();
    }
}
