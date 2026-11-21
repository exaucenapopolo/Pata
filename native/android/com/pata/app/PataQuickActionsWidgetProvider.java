package com.pata.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

public class PataQuickActionsWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.pata_quick_actions_widget);
            views.setOnClickPendingIntent(R.id.pata_quick_action_expense, createIntent(context, id, "expense", 1));
            views.setOnClickPendingIntent(R.id.pata_quick_action_income, createIntent(context, id, "income", 2));
            views.setOnClickPendingIntent(R.id.pata_quick_action_voice, createIntent(context, id, "voice", 3));
            manager.updateAppWidget(id, views);
        }
    }

    private PendingIntent createIntent(Context context, int widgetId, String mode, int action) {
        Intent intent = new Intent(context, PataQuickCaptureActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra("pata_capture_mode", mode);
        int requestCode = widgetId * 10 + action;
        return PendingIntent.getActivity(context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
