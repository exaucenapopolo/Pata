package com.pata.app;

import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

public class PataQuickCaptureTileService extends TileService {
    @Override
    public void onStartListening() {
        super.onStartListening();
        Tile tile = getQsTile();
        if (tile != null) {
            tile.setLabel("Pata · Dépense rapide");
            if (Build.VERSION.SDK_INT >= 29) tile.setSubtitle("Saisie immédiate");
            tile.setState(Tile.STATE_ACTIVE);
            tile.updateTile();
        }
    }

    @Override
    public void onClick() {
        super.onClick();
        Intent intent = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("pata_quick_capture", "expense");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startActivityAndCollapse(intent);
        else startActivity(intent);
    }
}
