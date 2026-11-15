package com.pata.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import java.text.NumberFormat;
import java.util.Locale;

public class PataQuickCaptureWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        updateWidgets(context, manager, appWidgetIds);
    }

    static void updateWidgets(Context context, AppWidgetManager manager, int[] ids) {
        SharedPreferences prefs = context.getSharedPreferences("PataQuickWidget", Context.MODE_PRIVATE);
        long amount = Math.max(0L, prefs.getLong("available_amount", 0L));
        long updatedAt = prefs.getLong("updated_at", 0L);
        String currency = prefs.getString("currency", "FCFA");
        String balance = updatedAt > 0
            ? NumberFormat.getIntegerInstance(Locale.FRANCE).format(amount).replace('\u202f', ' ')
            : "—";
        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.pata_quick_capture_widget);
            views.setTextViewText(R.id.pata_widget_balance, balance + " " + currency);
            PendingIntent capture = capturePendingIntent(context, id);
            views.setOnClickPendingIntent(R.id.pata_widget_root, capture);
            views.setOnClickPendingIntent(R.id.pata_widget_capture, capture);
            manager.updateAppWidget(id, views);
        }
    }

    static void adjustBalance(Context context, long delta) {
        SharedPreferences prefs = context.getSharedPreferences("PataQuickWidget", Context.MODE_PRIVATE);
        long updatedAt = prefs.getLong("updated_at", 0L);
        if (updatedAt <= 0L) return;
        long current = Math.max(0L, prefs.getLong("available_amount", 0L));
        long next = Math.max(0L, Math.min(1000000000L, current + delta));
        prefs.edit().putLong("available_amount", next).putLong("updated_at", System.currentTimeMillis()).apply();
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, PataQuickCaptureWidgetProvider.class));
        updateWidgets(context, manager, ids);
    }

    private static PendingIntent capturePendingIntent(Context context, int id) {
        Intent intent = new Intent(context, PataQuickCaptureActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, id + 9000, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
