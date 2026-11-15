package com.pata.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.TypedValue;
import android.widget.RemoteViews;
import java.text.DecimalFormat;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.TimeZone;

public class PataQuickCaptureWidgetProvider extends AppWidgetProvider {
    private static final String PREFS = "PataFinanceWidget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        updateWidgets(context, manager, ids);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        super.onAppWidgetOptionsChanged(context, manager, appWidgetId, newOptions);
        updateWidgets(context, manager, new int[] { appWidgetId });
    }

    static void updateWidgets(Context context, AppWidgetManager manager, int[] ids) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String month = prefs.getString("month_key", "");
        boolean current = currentDoualaMonth().equals(month);
        long income = current ? Math.max(0L, prefs.getLong("income_total", 0L)) : 0L;
        long expense = current ? Math.max(0L, prefs.getLong("expense_total", 0L)) : 0L;
        long balance = income - expense;

        for (int id : ids) {
            Bundle options = manager.getAppWidgetOptions(id);
            int minWidth = options == null ? 250 : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
            boolean compact = minWidth < 235;
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.pata_quick_capture_widget);
            views.setTextViewText(R.id.pata_widget_period, compact ? "CE MOIS · FCFA" : "CE MOIS · MONTANTS EN FCFA");
            views.setTextViewText(R.id.pata_widget_income, formatMoney(income, compact));
            views.setTextViewText(R.id.pata_widget_expense, formatMoney(expense, compact));
            views.setTextViewText(R.id.pata_widget_balance, formatMoney(balance, compact));
            views.setTextViewTextSize(R.id.pata_widget_income, TypedValue.COMPLEX_UNIT_SP, compact ? 13 : 16);
            views.setTextViewTextSize(R.id.pata_widget_expense, TypedValue.COMPLEX_UNIT_SP, compact ? 13 : 16);
            views.setTextViewTextSize(R.id.pata_widget_balance, TypedValue.COMPLEX_UNIT_SP, compact ? 13 : 16);

            Intent intent = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("pata_notification_target", "/dashboard");
            PendingIntent openDashboard = PendingIntent.getActivity(context, id + 9000, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.pata_widget_root, openDashboard);
            manager.updateAppWidget(id, views);
        }
    }

    static void updateFinanceSummary(Context context, long income, long expense, String monthKey) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putLong("income_total", Math.max(0L, income))
            .putLong("expense_total", Math.max(0L, expense))
            .putString("month_key", monthKey == null ? currentDoualaMonth() : monthKey)
            .putLong("updated_at", System.currentTimeMillis())
            .apply();
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, PataQuickCaptureWidgetProvider.class));
        updateWidgets(context, manager, ids);
    }

    static void adjustMonthlyTotal(Context context, String type, long amount, String date) {
        if (amount <= 0 || (!"income".equals(type) && !"expense".equals(type))) return;
        String operationMonth = date != null && date.matches("\\d{4}-\\d{2}-\\d{2}")
            ? date.substring(0, 7) : currentDoualaMonth();
        String currentMonth = currentDoualaMonth();
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!currentMonth.equals(operationMonth) || !operationMonth.equals(prefs.getString("month_key", ""))) return;
        long income = Math.max(0L, prefs.getLong("income_total", 0L));
        long expense = Math.max(0L, prefs.getLong("expense_total", 0L));
        if ("income".equals(type)) income += amount;
        else expense += amount;
        updateFinanceSummary(context, income, expense, operationMonth);
    }

    private static String formatMoney(long value, boolean compact) {
        if (compact) {
            if (value >= 1000000000L) return new DecimalFormat("0.#").format(value / 1000000000d) + "Md";
            if (value >= 1000000L) return new DecimalFormat("0.#").format(value / 1000000d) + "M";
            if (value >= 1000L) return new DecimalFormat("0.#").format(value / 1000d) + "k";
        }
        return NumberFormat.getIntegerInstance(Locale.FRANCE).format(value).replace('\u202f', ' ');
    }

    private static String currentDoualaMonth() {
        java.text.SimpleDateFormat format = new java.text.SimpleDateFormat("yyyy-MM", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("Africa/Douala"));
        return format.format(new java.util.Date());
    }
}
