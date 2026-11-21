package com.pata.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.speech.RecognizerIntent;
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
import java.util.ArrayList;

public class PataQuickCaptureActivity extends Activity {
    private static final int VOICE_REQUEST_CODE = 704;
    private EditText entry;
    private String captureMode = "any";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        captureMode = getIntent() == null ? "any" : getIntent().getStringExtra("pata_capture_mode");
        if (captureMode == null || !(captureMode.equals("expense") || captureMode.equals("income") || captureMode.equals("voice"))) captureMode = "any";
        setFinishOnTouchOutside(true);
        Window window = getWindow();
        if (window != null) {
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            WindowManager.LayoutParams params = window.getAttributes();
            params.dimAmount = 0.28f;
            window.setAttributes(params);
            window.setSoftInputMode(("voice".equals(captureMode) ? WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN : WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
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
        title.setText("expense".equals(captureMode) ? "Nouvelle dépense" : "income".equals(captureMode) ? "Nouveau revenu" : "voice".equals(captureMode) ? "Dicter une opération" : "Ajouter une opération");
        title.setTextColor(Color.rgb(15, 23, 42));
        title.setTextSize(18);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        root.addView(title, new LinearLayout.LayoutParams(-1, -2));

        TextView hint = new TextView(this);
        hint.setText("income".equals(captureMode) ? "Décris le revenu reçu et son montant." : "expense".equals(captureMode) ? "Décris ce que tu as payé et le montant." : "Écris ou dicte simplement ton opération. Pata reconnaît le montant, la catégorie et la date.");
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
        entry.setHint("income".equals(captureMode) ? "Ex. Salaire 100 000 FCFA" : "Ex. Taxi 500 FCFA, marché 2 000");
        entry.setImeOptions(EditorInfo.IME_ACTION_DONE);
        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(-1, -2);
        inputParams.topMargin = dp(16);
        root.addView(entry, inputParams);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams actionsParams = new LinearLayout.LayoutParams(-1, -2);
        actionsParams.topMargin = dp(16);

        Button dictate = new Button(this);
        dictate.setText("Dicter");
        dictate.setAllCaps(false);
        dictate.setOnClickListener(view -> startVoiceCapture());
        LinearLayout.LayoutParams dictateParams = new LinearLayout.LayoutParams(-2, dp(46));
        dictateParams.rightMargin = dp(6);
        actions.addView(dictate, dictateParams);

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
        if (\"voice\".equals(captureMode)) {
            entry.postDelayed(this::startVoiceCapture, 250);
        } else {
            entry.postDelayed(this::showKeyboard, 180);
        }
    }

    private void showKeyboard() {
        InputMethodManager keyboard = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (keyboard != null && entry != null) keyboard.showSoftInput(entry, InputMethodManager.SHOW_IMPLICIT);
    }

    private void startVoiceCapture() {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "fr-FR");
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "fr-FR");
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Décris ta dépense ou ton revenu");
        try {
            startActivityForResult(intent, VOICE_REQUEST_CODE);
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "La dictée vocale n’est pas disponible. Tu peux écrire ton opération.", Toast.LENGTH_LONG).show();
            showKeyboard();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != VOICE_REQUEST_CODE) return;
        if (resultCode == RESULT_OK && data != null) {
            ArrayList<String> phrases = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (phrases != null && !phrases.isEmpty() && entry != null) {
                entry.setText(phrases.get(0));
                entry.setSelection(entry.getText().length());
            }
        } else {
            showKeyboard();
        }
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
        if (\"expense\".equals(captureMode)) text = \"dépense \" + text;
        else if (\"income\".equals(captureMode)) text = \"revenu \" + text;
        PataQuickCaptureReceiver.enqueue(this, text, session.uid);
        Toast.makeText(this, "Saisie envoyée. Pata termine l’enregistrement.", Toast.LENGTH_SHORT).show();
        finish();
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }
}
