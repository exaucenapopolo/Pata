package com.pata.app;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public class PataSmsSyncWorker extends Worker {
    private static final String ENDPOINT = "https://www.pata-yam.site/api/sms-import";

    public PataSmsSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        String uid = getInputData().getString("uid");
        String deviceToken = getInputData().getString("deviceToken");
        String hash = getInputData().getString("transactionHash");
        if (uid == null || uid.isEmpty() || deviceToken == null || deviceToken.isEmpty() || hash == null || hash.isEmpty()) {
            PataSmsReceiver.recordDiagnostic(getApplicationContext(), "sync_credentials_missing", null,
                "Identifiants manquants. Ouvre Pata pour reconnecter cet appareil.");
            return Result.failure();
        }

        HttpURLConnection connection = null;
        try {
            JSONObject payload = new JSONObject();
            payload.put("action", "device");
            payload.put("uid", uid);
            payload.put("deviceToken", deviceToken);
            payload.put("transactionHash", hash);
            payload.put("provider", getInputData().getString("provider"));
            payload.put("eventType", getInputData().getString("eventType"));
            payload.put("direction", getInputData().getString("direction"));
            payload.put("amount", getInputData().getInt("amount", 0));
            payload.put("date", getInputData().getString("date"));
            payload.put("time", getInputData().getString("time"));
            payload.put("counterparty", getInputData().getString("counterparty"));

            connection = (HttpURLConnection) new URL(ENDPOINT).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(20000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            byte[] request = payload.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(request.length);
            try (OutputStream output = connection.getOutputStream()) { output.write(request); }

            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 400 ? connection.getInputStream() : connection.getErrorStream();
            StringBuilder text = new StringBuilder();
            if (stream != null) {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) text.append(line);
                }
            }
            JSONObject response = new JSONObject(text.length() == 0 ? "{}" : text.toString());
            if (status >= 200 && status < 300 && response.optBoolean("success", false)) {
                PataSmsReceiver.removePending(getApplicationContext(), hash);
                boolean duplicate = response.optBoolean("duplicate", false);
                PataSmsReceiver.recordDiagnostic(getApplicationContext(),
                    duplicate ? "already_registered" : "registered",
                    getInputData().getString("provider"),
                    duplicate ? "Transaction déjà enregistrée ; aucun doublon créé."
                        : "Transaction enregistrée. Notification et e-mail envoyés.");
                if (!duplicate) {
                    PataSmsReceiver.showProcessedNotification(getApplicationContext(),
                        getInputData().getString("direction"),
                        getInputData().getInt("amount", 0),
                        getInputData().getString("provider"),
                        response.optString("target", "/dashboard"));
                }
                return Result.success();
            }

            String error = response.optString("error", "Le serveur Pata n'a pas accepté l'import.");
            PataSmsReceiver.recordDiagnostic(getApplicationContext(), "server_rejected",
                getInputData().getString("provider"), error);
            if (status >= 500 || status == 408 || status == 409 || status == 429) return Result.retry();
            if (status == 401 || status == 403) {
                PataSmsReceiver.showStatusNotification(getApplicationContext(), "Import Mobile Money en pause",
                    "Ouvre Pata et reconnecte cet appareil pour reprendre la synchronisation.");
            }
            return Result.failure();
        } catch (Exception error) {
            PataSmsReceiver.recordDiagnostic(getApplicationContext(), "network_retry",
                getInputData().getString("provider"),
                "Connexion au serveur impossible. Pata réessaiera automatiquement.");
            return Result.retry();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
