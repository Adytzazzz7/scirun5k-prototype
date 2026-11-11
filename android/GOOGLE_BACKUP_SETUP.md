# SciRun Google Drive backup setup

The Android `GoogleBackup` Capacitor plugin stores immutable JSON snapshots in the
signed-in account's hidden Google Drive `appDataFolder`. It does not use Android
device backup, Firebase, Play Games Saved Games, or a Google client secret. The
existing manual JSON export remains available independently.

1. Create or choose a Google Cloud project and enable the Google Drive API.
2. Configure the OAuth consent screen for the account(s) that will use SciRun.
   Request `https://www.googleapis.com/auth/drive.appdata` when connecting.
3. Create an **Android** OAuth client for package `com.scirun.personal5k` and the
   SHA-1 fingerprint of the certificate that signs the installed app. Debug and
   personal release certificates require separate client entries when both are
   used. A sideloaded personal APK does not require Play Games setup.
4. Create a **Web application** OAuth client in the same project. Pass its
   public client ID to `GoogleBackup.signIn({ serverClientId })`; do not put a
   client secret or access token in the app or repository.
5. Test sign-in and Drive consent with an allowed account on an Android device
   that has Google Play services. Verify upload, list, download, sign-out, and
   restoring a snapshot on a second device before relying on cloud recovery.

The plugin methods are `signIn`, `getStatus`, `listBackups`, `uploadBackup`,
`downloadBackup`, and `signOut`. `listBackups()` returns only SciRun snapshots;
`downloadBackup({ id })` checks membership in that list. The web layer must
validate a downloaded bundle with `SciRunStateBackup.parseBundle` before any
restore, use the existing pre-import snapshot transaction, and avoid restoring
during an active workout or pending feedback. Upload only after a successful
local save. A failed cloud operation must never discard local data.

Drive's `appDataFolder` is hidden from the Drive UI. Sign-out forgets the local
account and clears Credential Manager's active state. It does not delete local
data, revoke the Drive grant, or call the Drive file deletion API. The user can
remove SciRun's access and data later from their Google account settings. Google
may delete the hidden folder if the user removes SciRun from My Drive;
keep an independent manual JSON export for important history. The iOS project
and its OAuth client configuration are separate from this Android setup.

Official references:

- https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation
- https://developer.android.com/identity/authorization
- https://developers.google.com/workspace/drive/api/guides/appdata
- https://capacitorjs.com/docs/android/custom-code
