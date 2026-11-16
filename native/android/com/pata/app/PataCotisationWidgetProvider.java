package com.pata.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.NumberFormat;
import java.util.Locale;

public class PataCotisationWidgetProvider extends AppWidgetProvider {
    private static final String PREFS = "PataCotisationWidget";
    private static final int MAX_GROUPS = 3;

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
        try {
            groups = new JSONArray(prefs.getString("groups_json", "[]"));
        } catch (Exception ignored) {
            groups = new JSONArray();
        }

        for (int id : ids) {
            Bundle options = manager.getAppWidgetOptions(id);
            int minHeight = options == null
                ? 205
                : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 205);
            int maxRows = minHeight < 145 ? 1 : minHeight < 205 ? 2 : MAX_GROUPS;

            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.pata_cotisation_widget);
            views.setTextViewText(R.id.pata_cotisation_widget_count,
                groups.length() + (groups.length() > 1 ? " groupes" : " groupe"));

            int shown = Math.min(groups.length(), maxRows);
            int[] rowIds = {
                R.id.pata_cotisation_group_row_1,
                R.id.pata_cotisation_group_row_2,
                R.id.pata_cotisation_group_row_3
            };
            int[] nameIds = {
                R.id.pata_cotisation_group_name_1,
                R.id.pata_cotisation_group_name_2,
                R.id.pata_cotisation_group_name_3
            };
            int[] statusIds = {
                R.id.pata_cotisation_group_status_1,
                R.id.pata_cotisation_group_status_2,
                R.id.pata_cotisation_group_status_3
            };
            int[] progressIds = {
                R.id.pata_cotisation_group_progress_1,
                R.id.pata_cotisation_group_progress_2,
                R.id.pata_cotisation_group_progress_3
            };
            int[] amountIds = {
                R.id.pata_cotisation_group_amount_1,
                R.id.pata_cotisation_group_amount_2,
                R.id.pata_cotisation_group_amount_3
            };
            int[] activityIds = {
                R.id.pata_cotisation_group_activity_1,
                R.id.pata_cotisation_group_activity_2,
                R.id.pata_cotisation_group_activity_3
            };

            for (int index = 0; index < MAX_GROUPS; index++) {
                boolean visible = index < shown;
                views.setViewVisibility(rowIds[index], visible ? View.VISIBLE : View.GONE);
                if (!visible) continue;

                JSONObject group = groups.optJSONObject(index);
                if (group == null) {
                    views.setTextViewText(nameIds[index], "Cotisation");
                    views.setTextViewText(statusIds[index], "À actualiser");
                    views.setTextViewText(amountIds[index], "—");
                    views.setTextViewText(activityIds[index], "");
                    views.setProgressBar(progressIds[index], 100, 0, false);
                    continue;
                }

                String name = safeText(group.optString("name", "Cotisation"), 42);
                long collected = Math.max(0L, group.optLong("totalCollected", 0L));
                long target = Math.max(0L, group.optLong("targetAmount", 0L));
                int progress = target > 0
                    ? (int) Math.min(100L, Math.round((double) collected * 100d / (double) target))
                    : collected > 0 ? 100 : 0;

                views.setTextViewText(nameIds[index], name);
                views.setTextViewText(statusIds[index], statusLabel(group.optString("status", "OPEN"), progress));
                views.setProgressBar(progressIds[index], 100, progress, false);
                views.setTextViewText(amountIds[index],
                    formatMoney(collected) + " / " + (target > 0 ? formatMoney(target) : "Objectif à définir"));

                JSONObject payment = group.optJSONObject("latestPayment");
                JSONObject message = group.optJSONObject("latestMessage");
                StringBuilder activity = new StringBuilder();
                if (payment != null) {
                    activity.append("Versement · ")
                        .append(safeText(payment.optString("displayName", "Membre"), 22))
                        .append(" · ")
                        .append(formatMoney(Math.max(0L, payment.optLong("amount", 0L))));
                }
                if (message != null) {
                    if (activity.length() > 0) activity.append("\n");
                    activity.append(safeText(message.optString("authorName", "Membre"), 18))
                        .append(" · ")
                        .append(safeText(message.optString("text", ""), 64));
                }
                if (activity.length() == 0) activity.append("Aucune activité récente");
                views.setTextViewText(activityIds[index], activity.toString());
            }

            int remaining = Math.max(0, groups.length() - shown);
            views.setTextViewText(R.id.pata_cotisation_widget_more,
                remaining > 0 ? "+ " + remaining + " autre(s) groupe(s)" : "Appuie pour ouvrir tes cotisations");

            Intent open = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("pata_notification_target", "/cotisations");
            PendingIntent pending = PendingIntent.getActivity(context, id + 18000, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.pata_cotisation_widget_root, pending);
            manager.updateAppWidget(id, views);
        }
    }

    private static String statusLabel(String status, int progress) {
        String normalized = String.valueOf(status || "").toUpperCase(Locale.ROOT);
        if ("NOT_STARTED".equals(normalized)) return "PAS ENCORE DÉMARRÉE";
        if ("COMPLETE".equals(normalized) || "COMPLETED".equals(normalized) || progress >= 100) return "OBJECTIF ATTEINT";
        if ("CLOSED".equals(normalized) || "CANCELLED".equals(normalized)) return "TERMINÉE";
        return "EN COURS · " + progress + "%";
    }

    private static String safeText(String value, int maxLength) {
        String clean = String.valueOf(value == null ? "" : value).replaceAll("\\s+", " ").trim();
        return clean.length() > maxLength ? clean.substring(0, maxLength - 1) + "…" : clean;
    }

    private static String formatMoney(long amount) {
        return NumberFormat.getIntegerInstance(Locale.FRANCE).format(amount).replace('\u202f', ' ') + " F";
    }
}
