package com.pata.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/**
 * Le tableau de bord est la source de vérité du widget financier.
 * Le worker ne lance plus de requêtes réseau : il réaffiche uniquement le cache
 * local alimenté par updateFinanceWidget(), ce qui évite de relire les mêmes
 * résumés financiers et dettes à chaque ajout/actualisation du widget.
 */
public class PataFinanceWidgetWorker extends Worker {
    public PataFinanceWidgetWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    static void schedule(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, PataQuickCaptureWidgetProvider.class));
        PataQuickCaptureWidgetProvider.updateWidgets(context, manager, ids);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, PataQuickCaptureWidgetProvider.class));
        PataQuickCaptureWidgetProvider.updateWidgets(context, manager, ids);
        return Result.success();
    }
}
