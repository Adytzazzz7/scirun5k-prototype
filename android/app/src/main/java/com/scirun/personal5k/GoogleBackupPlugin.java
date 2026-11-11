package com.scirun.personal5k;

import android.accounts.Account;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import java.io.IOException;
import java.util.Collections;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Google account sign-in and immutable Drive backups, with OAuth tokens kept native and transient. */
@CapacitorPlugin(name = "GoogleBackup")
public final class GoogleBackupPlugin extends Plugin {
    private static final String DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
    private static final String PREFS = "scirun.googleBackup";
    private static final String KEY_EMAIL = "email";
    private static final String KEY_NAME = "displayName";
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private String pendingEmail;
    private String pendingName;

    @PluginMethod
    public void signIn(PluginCall call) {
        String serverClientId = call.getString("serverClientId");
        if (serverClientId == null || !serverClientId.endsWith(".apps.googleusercontent.com")) {
            call.reject("A Google Web OAuth client ID is required", "CONFIG_REQUIRED");
            return;
        }
        if (!claim(call)) return;
        try {
            GetGoogleIdOption option = new GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false)
                .setServerClientId(serverClientId)
                .build();
            GetCredentialRequest request = new GetCredentialRequest.Builder()
                .addCredentialOption(option)
                .build();
            CredentialManager.create(getActivity()).getCredentialAsync(
                getActivity(), request, null, ContextCompat.getMainExecutor(getActivity()),
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse response) {
                        try {
                            if (!GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(
                                response.getCredential().getType())) {
                                fail(call, "A Google account was not selected", "GOOGLE_SIGN_IN_FAILED");
                                return;
                            }
                            GoogleIdTokenCredential credential = GoogleIdTokenCredential.createFrom(
                                response.getCredential().getData());
                            String email = credential.getId();
                            if (email == null || email.trim().isEmpty()) {
                                fail(call, "Google did not return an account", "GOOGLE_SIGN_IN_FAILED");
                                return;
                            }
                            pendingEmail = email.trim();
                            pendingName = credential.getDisplayName();
                            requestDrivePermission(call);
                        } catch (Exception exception) {
                            fail(call, "Google sign-in could not be completed", "GOOGLE_SIGN_IN_FAILED");
                        }
                    }

                    @Override
                    public void onError(GetCredentialException exception) {
                        fail(call, "Google sign-in was canceled or unavailable", "GOOGLE_SIGN_IN_FAILED");
                    }
                });
        } catch (Exception exception) {
            fail(call, "Google sign-in could not start", "GOOGLE_SIGN_IN_FAILED");
        }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        String email = preferences().getString(KEY_EMAIL, null);
        JSObject status = new JSObject();
        boolean signedIn = email != null && !email.isEmpty();
        status.put("signedIn", signedIn);
        status.put("email", signedIn ? email : org.json.JSONObject.NULL);
        String name = preferences().getString(KEY_NAME, "");
        status.put("displayName", signedIn ? name : "");
        status.put("accountLabel", signedIn ? (name.isEmpty() ? email : name) : "");
        status.put("accountId", signedIn ? email.toLowerCase(Locale.ROOT) : "");
        call.resolve(status);
    }

    @PluginMethod
    public void listBackups(PluginCall call) {
        if (!claim(call)) return;
        withDriveToken(call, token -> network.execute(() -> {
            try {
                succeed(call, DriveSnapshotStore.listBackups(token));
            } catch (Exception exception) {
                fail(call, safeDriveError(exception), "GOOGLE_DRIVE_FAILED");
            }
        }));
    }

    @PluginMethod
    public void uploadBackup(PluginCall call) {
        String json = call.getString("json");
        if (json == null || json.getBytes(java.nio.charset.StandardCharsets.UTF_8).length
            > DriveSnapshotStore.MAX_BACKUP_BYTES) {
            call.reject("SciRun backup exceeds the 5 MB limit", "INVALID_BACKUP");
            return;
        }
        if (!claim(call)) return;
        withDriveToken(call, token -> network.execute(() -> {
            try {
                succeed(call, DriveSnapshotStore.uploadBackup(token, json));
            } catch (Exception exception) {
                fail(call, safeDriveError(exception), "GOOGLE_DRIVE_FAILED");
            }
        }));
    }

    @PluginMethod
    public void downloadBackup(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("A SciRun backup ID is required", "INVALID_BACKUP_ID");
            return;
        }
        if (!claim(call)) return;
        withDriveToken(call, token -> network.execute(() -> {
            try {
                succeed(call, DriveSnapshotStore.downloadBackup(token, id));
            } catch (Exception exception) {
                fail(call, safeDriveError(exception), "GOOGLE_DRIVE_FAILED");
            }
        }));
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        if (!claim(call)) return;
        if (!preferences().edit().remove(KEY_EMAIL).remove(KEY_NAME).commit()) {
            fail(call, "Google account status could not be cleared", "STORAGE_FAILED");
            return;
        }
        // Keep remote backups and the Drive grant; this only disconnects SciRun locally.
        clearCredentialState(call);
    }

    private void requestDrivePermission(PluginCall call) {
        AuthorizationRequest request = driveRequest(pendingEmail);
        Identity.getAuthorizationClient(getActivity()).authorize(request)
            .addOnSuccessListener(result -> {
                if (result.hasResolution()) {
                    Intent intent = new Intent(getActivity(), GoogleAuthorizationActivity.class);
                    intent.putExtra(GoogleAuthorizationActivity.EXTRA_PENDING_INTENT,
                        result.getPendingIntent());
                    startActivityForResult(call, intent, "onDriveConsentResult");
                } else {
                    finishSignIn(call, result);
                }
            })
            .addOnFailureListener(exception ->
                fail(call, "Google Drive access was not granted", "GOOGLE_DRIVE_CONSENT_FAILED"));
    }

    @ActivityCallback
    private void onDriveConsentResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) {
            busy.set(false);
            clearPendingSignIn();
            return;
        }
        if (activityResult.getResultCode() != Activity.RESULT_OK || activityResult.getData() == null) {
            fail(call, "Google Drive access was canceled", "GOOGLE_DRIVE_CONSENT_FAILED");
            return;
        }
        try {
            AuthorizationResult result = Identity.getAuthorizationClient(getActivity())
                .getAuthorizationResultFromIntent(activityResult.getData());
            finishSignIn(call, result);
        } catch (Exception exception) {
            fail(call, "Google Drive access could not be completed", "GOOGLE_DRIVE_CONSENT_FAILED");
        }
    }

    private void finishSignIn(PluginCall call, AuthorizationResult result) {
        if (pendingEmail == null || !hasDriveAccess(result)) {
            fail(call, "Google Drive permission was not granted", "GOOGLE_DRIVE_CONSENT_FAILED");
            return;
        }
        if (!preferences().edit().putString(KEY_EMAIL, pendingEmail)
            .putString(KEY_NAME, pendingName == null ? "" : pendingName).commit()) {
            fail(call, "Google account status could not be saved", "STORAGE_FAILED");
            return;
        }
        clearPendingSignIn();
        busy.set(false);
        getStatus(call);
    }

    private void withDriveToken(PluginCall call, TokenConsumer consumer) {
        String email = preferences().getString(KEY_EMAIL, null);
        if (email == null || email.isEmpty()) {
            fail(call, "Connect a Google account first", "GOOGLE_NOT_CONNECTED");
            return;
        }
        try {
            Identity.getAuthorizationClient(getActivity()).authorize(driveRequest(email))
                .addOnSuccessListener(result -> {
                    if (result.hasResolution() || !hasDriveAccess(result)) {
                        fail(call, "Google Drive permission must be renewed", "GOOGLE_RECONNECT_REQUIRED");
                        return;
                    }
                    try {
                        consumer.accept(result.getAccessToken());
                    } catch (Exception exception) {
                        fail(call, "Google Drive backup could not start", "GOOGLE_DRIVE_FAILED");
                    }
                })
                .addOnFailureListener(exception ->
                    fail(call, "Google Drive authorization is unavailable", "GOOGLE_AUTH_FAILED"));
        } catch (Exception exception) {
            fail(call, "Google Drive authorization could not start", "GOOGLE_AUTH_FAILED");
        }
    }

    private AuthorizationRequest driveRequest(String email) {
        return new AuthorizationRequest.Builder()
            .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_SCOPE)))
            .setAccount(googleAccount(email))
            .build();
    }

    private Account googleAccount(String email) {
        return new Account(email, "com.google");
    }

    private boolean hasDriveAccess(AuthorizationResult result) {
        return result != null && result.getAccessToken() != null
            && !result.getAccessToken().isEmpty()
            && result.getGrantedScopes() != null
            && result.getGrantedScopes().contains(DRIVE_SCOPE);
    }

    private void clearCredentialState(PluginCall call) {
        try {
            CredentialManager.create(getActivity()).clearCredentialStateAsync(
                new ClearCredentialStateRequest(ClearCredentialStateRequest.TYPE_CLEAR_CREDENTIAL_STATE), null,
                ContextCompat.getMainExecutor(getActivity()),
                new CredentialManagerCallback<Void, ClearCredentialException>() {
                    @Override
                    public void onResult(Void ignored) {
                        busy.set(false);
                        call.resolve();
                    }

                    @Override
                    public void onError(ClearCredentialException exception) {
                        // The Drive grant and local account state have already been removed.
                        busy.set(false);
                        call.resolve();
                    }
                });
        } catch (Exception exception) {
            busy.set(false);
            call.resolve();
        }
    }

    private boolean claim(PluginCall call) {
        if (busy.compareAndSet(false, true)) return true;
        call.reject("Another Google backup operation is in progress", "GOOGLE_BUSY");
        return false;
    }

    private void succeed(PluginCall call, JSObject value) {
        main.post(() -> {
            busy.set(false);
            call.resolve(value);
        });
    }

    private void fail(PluginCall call, String message, String code) {
        main.post(() -> {
            clearPendingSignIn();
            busy.set(false);
            call.reject(message, code);
        });
    }

    private void clearPendingSignIn() {
        pendingEmail = null;
        pendingName = null;
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String safeDriveError(Exception exception) {
        if (exception instanceof IOException && exception.getMessage() != null) {
            return exception.getMessage();
        }
        return "Google Drive backup failed";
    }

    @Override
    protected void handleOnDestroy() {
        network.shutdownNow();
        super.handleOnDestroy();
    }

    private interface TokenConsumer {
        void accept(String accessToken);
    }

}
