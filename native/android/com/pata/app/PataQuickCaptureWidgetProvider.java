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
        String refreshed = updatedAt > 0 ? "Solde synchronisé avec Pata" : "Ouvre Pata pour synchroniser ton solde";
        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.pata_quick_capture_widget);
            views.setTextViewText(R.id.pata_widget_balance, balance + " " + currency);
            views.setTextViewText(R.id.pata_widget_status, refreshed);
            views.setOnClickPendingIntent(R.id.pata_widget_expense, launch(context, "expense", id * 10 + 1));
            views.setOnClickPendingIntent(R.id.pata_widget_income, launch(context, "income", id * 10 + 2));
            views.setOnClickPendingIntent(R.id.pata_widget_voice, launch(context, "voice", id * 10 + 3));
            views.setOnClickPendingIntent(R.id.pata_widget_refresh, launch(context, "dashboard", id * 10 + 4));
            manager.updateAppWidget(id, views);
        }
    }

    private static PendingIntent launch(Context context, String type, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if ("dashboard".equals(type)) intent.putExtra("pata_notification_target", "/dashboard");
        else intent.putExtra("pata_quick_capture", type);
        return PendingIntent.getActivity(context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
