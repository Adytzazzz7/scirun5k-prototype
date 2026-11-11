package com.scirun.personal5k;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.IntentSender;
import android.os.Build;
import android.os.Bundle;

/** Bridges Google AuthorizationClient's PendingIntent into Capacitor's Intent callback. */
public final class GoogleAuthorizationActivity extends Activity {
    public static final String EXTRA_PENDING_INTENT = "scirun.google.pendingIntent";
    private static final int REQUEST_AUTHORIZE = 71;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (savedInstanceState != null) return;

        PendingIntent pendingIntent;
        if (Build.VERSION.SDK_INT >= 33) {
            pendingIntent = getIntent().getParcelableExtra(EXTRA_PENDING_INTENT, PendingIntent.class);
        } else {
            pendingIntent = getIntent().getParcelableExtra(EXTRA_PENDING_INTENT);
        }
        if (pendingIntent == null) {
            setResult(RESULT_CANCELED);
            finish();
            return;
        }
        try {
            startIntentSenderForResult(pendingIntent.getIntentSender(), REQUEST_AUTHORIZE,
                null, 0, 0, 0);
        } catch (IntentSender.SendIntentException exception) {
            setResult(RESULT_CANCELED);
            finish();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_AUTHORIZE) {
            setResult(resultCode, data);
            finish();
        }
    }
}
