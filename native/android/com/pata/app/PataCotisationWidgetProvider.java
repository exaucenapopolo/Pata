package com.pata.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.NumberFormat;
import java.util.Locale;

public class PataCotisationWidgetProvider extends AppWidgetProvider {
    private static final String PREFS = "PataCotisationWidget";

    @Override
    public void onEnabled(Context context) {
        super.onEnabled(context);
        PataCotisationWidgetWorker.schedule(context);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        updateWidgets(context, manager, ids);
        PataCotisationWidgetWorker.schedule(context);
    }

    @Override
    public void onDisabled(Context context) {
        super.onDisabled(context);
        PataCotisationWidgetWorker.schedule(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        super.onAppWidgetOptionsChanged(context, manager, id, options);
        updateWidgets(context, manager, new int[] { id });
    }

    static void updateData(Context context, JSONArray groups, String updatedAt) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("groups_json", groups == null ? "[]" : groups.toString())
            .putString("updated_at", updatedAt == null ? "" : updatedAt)
            .apply();
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, PataCotisationWidgetProvider.class));
        updateWidgets(context, manager, ids);
    }

    static void updateWidgets(Context context, AppWidgetManager manager, int[] ids) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray groups;
        try { groups = new JSONArray(prefs.getString("groups_json", "[]")); }
        catch (Exception ignored) { groups = new JSONArray(); }

        for (int id : ids) {
            Bundle options = manager.getAppWidgetOptions(id);
            int minHeight = options == null ? 150 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 150);
            int maxRows = minHeight < 135 ? 2 : minHeight < 190 ? 3 : 5;
            StringBuilder summary = new StringBuilder();
            int shown = Math.min(groups.length(), maxRows);
            for (int i = 0; i < shown; i++) {
                JSONObject group = groups.optJSONObject(i);
                if (group == null) continue;
                if (summary.length() > 0) summary.append("\n");
                String name = group.optString("name", "Cotisation");
                long collected = group.optLong("totalCollected", 0L);
                long target = group.optLong("targetAmount", 0L);
                summary.append(name).append(" · ")
                    .append(formatMoney(collected)).append(" / ").append(formatMoney(target));
                JSONObject payment = group.optJSONObject("latestPayment");
                if (payment != null) {
                    summary.append("\n↳ Versement : ")
                        .append(payment.optString("displayName", "Membre"))
                        .append(" · ").append(formatMoney(payment.optLong("amount", 0L)));
                }
                JSONObject message = group.optJSONObject("latestMessage");
                if (message != null) {
                    summary.append("\n↳ ")
                        .append(message.optString("authorName", "Membre"))
                        .append(" : ").append(message.optString("text", ""));
                }
            }
            if (groups.length() == 0) summary.append("Aucun groupe de cotisation pour le moment.");
            else if (groups.length() > shown) summary.append("\n+ ").append(groups.length() - shown).append(" autre(s) groupe(s)");

            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.pata_cotisation_widget);
            views.setTextViewText(R.id.pata_cotisation_widget_groups, summary.toString());
            views.setTextViewText(R.id.pata_cotisation_widget_count, groups.length() + " groupe(s)");
            Intent open = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("pata_notification_target", "/cotisations");
            PendingIntent pending = PendingIntent.getActivity(context, id + 18000, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.pata_cotisation_widget_root, pending);
            manager.updateAppWidget(id, views);
        }
    }

    private static String formatMoney(long amount) {
        return NumberFormat.getIntegerInstance(Locale.FRANCE).format(amount).replace('\u202f', ' ') + " F";
    }
}
