package com.pata.app;

import android.app.Activity;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.Gravity;
import android.view.Window;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public class PataQuickCaptureActivity extends Activity {
    private EditText entry;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setFinishOnTouchOutside(true);
        Window window = getWindow();
        if (window != null) {
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            WindowManager.LayoutParams params = window.getAttributes();
            params.dimAmount = 0.28f;
            window.setAttributes(params);
            window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE
                | WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        }
        if (PataQuickCaptureAuthStore.read(this) == null) {
            Toast.makeText(this, "Ouvre Pata une fois pour connecter la saisie rapide.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(22), dp(20), dp(22), dp(18));
        root.setBackgroundColor(Color.WHITE);

        TextView title = new TextView(this);
        title.setText("Ajouter une opération");
        title.setTextColor(Color.rgb(15, 23, 42));
        title.setTextSize(18);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        root.addView(title, new LinearLayout.LayoutParams(-1, -2));

        TextView hint = new TextView(this);
        hint.setText("Écris simplement ce que tu as dépensé ou reçu. Pata reconnaît le montant, la catégorie et la date.");
        hint.setTextColor(Color.rgb(100, 116, 139));
        hint.setTextSize(12);
        LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(-1, -2);
        hintParams.topMargin = dp(7);
        root.addView(hint, hintParams);

        entry = new EditText(this);
        entry.setTextColor(Color.rgb(15, 23, 42));
        entry.setTextSize(16);
        entry.setSingleLine(false);
        entry.setMinLines(2);
        entry.setMaxLines(3);
        entry.setGravity(Gravity.TOP | Gravity.START);
        entry.setPadding(dp(12), dp(10), dp(12), dp(10));
        entry.setHint("Ex. Transport 500 FCFA ou salaire 100 000");
        entry.setImeOptions(EditorInfo.IME_ACTION_DONE);
        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(-1, -2);
        inputParams.topMargin = dp(16);
        root.addView(entry, inputParams);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams actionsParams = new LinearLayout.LayoutParams(-1, -2);
        actionsParams.topMargin = dp(16);

        Button cancel = new Button(this);
        cancel.setText("Annuler");
        cancel.setAllCaps(false);
        cancel.setOnClickListener(view -> finish());
        actions.addView(cancel, new LinearLayout.LayoutParams(-2, dp(46)));

        Button submit = new Button(this);
        submit.setText("Enregistrer");
        submit.setAllCaps(false);
        submit.setTextColor(Color.WHITE);
        submit.setBackgroundTintList(ColorStateList.valueOf(Color.rgb(7, 91, 67)));
        LinearLayout.LayoutParams submitParams = new LinearLayout.LayoutParams(-2, dp(46));
        submitParams.leftMargin = dp(8);
        actions.addView(submit, submitParams);
        submit.setOnClickListener(view -> submitCapture());
        root.addView(actions, actionsParams);
        setContentView(root);

        if (window != null) window.setLayout(
            (int) (getResources().getDisplayMetrics().widthPixels * 0.92f),
            WindowManager.LayoutParams.WRAP_CONTENT
        );
        entry.requestFocus();
        entry.postDelayed(() -> {
            InputMethodManager keyboard = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (keyboard != null) keyboard.showSoftInput(entry, InputMethodManager.SHOW_IMPLICIT);
        }, 180);
    }

    private void submitCapture() {
        String text = entry == null ? "" : entry.getText().toString().trim();
        if (text.isEmpty()) {
            if (entry != null) entry.setError("Décris ton opération.");
            return;
        }
        PataQuickCaptureAuthStore.Session session = PataQuickCaptureAuthStore.read(this);
        if (session == null) {
            Toast.makeText(this, "Session expirée. Ouvre Pata et reconnecte-toi.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        PataQuickCaptureReceiver.enqueue(this, text, session.uid);
        Toast.makeText(this, "Saisie envoyée. Pata termine l’enregistrement.", Toast.LENGTH_SHORT).show();
        finish();
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }
}
