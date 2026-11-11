# Google Drive backup on iOS (prepared source)

The repository currently has an Android Capacitor project but no `ios/` project. `native/ios/GoogleBackupPlugin.swift` is ready to copy into an iOS app target when that project is created; it is not compiled by the current Windows build. It exposes the same `GoogleBackup` methods as Android: `signIn`, `getStatus`, `listBackups`, `uploadBackup`, `downloadBackup`, and `signOut`.

## Configure the iOS app

1. Create the iOS Capacitor platform on a Mac with Xcode, using the same application identity and web source as the Android build. Add the [GoogleSignIn-iOS Swift package](https://github.com/google/GoogleSignIn-iOS) to the app target.
2. In the **same Google Cloud project** as the Android OAuth client, enable the Google Drive API and create an **iOS** OAuth client for the final iOS bundle identifier. Configure the OAuth consent screen with the `https://www.googleapis.com/auth/drive.appdata` scope.
3. Put the iOS OAuth client ID in `Info.plist` as `GIDClientID`. Add its reversed client ID as a URL scheme under `CFBundleURLTypes`. The `serverClientId` argument passed by the shared JavaScript API is accepted for parity with Android but is not used by this direct client-side iOS Drive flow. `GIDServerClientID` is only needed if a future backend must receive an ID token.
4. Copy both Swift files from `native/ios/` into the iOS app target. In Capacitor 8.6's `SceneDelegate.scene(_:willConnectTo:options:)`, instantiate `SciRunBridgeViewController()` as `window?.rootViewController` in place of the template's `CAPBridgeViewController()`.
5. Capacitor 8.5 and later route custom URL schemes through `SceneDelegate`, not `AppDelegate`. In `scene(_:openURLContexts:)`, pass each URL to `GIDSignIn.sharedInstance.handle(context.url)`, then preserve the template's `SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)` call for Capacitor's own URL handling. Add `import GoogleSignIn` to `SceneDelegate.swift`.

The plugin asks for Drive permission through the native Google sign-in screen. It stores OAuth tokens inside GoogleSignIn's native session, uses an ephemeral URL session for Drive requests, and returns only account display fields and backup JSON to JavaScript. Downloads are read as a bounded byte stream (5 MB maximum, checked against both `Content-Length` and actual bytes), and backup listing stops after 20 pages. Each upload creates a new snapshot in the app's hidden Drive `appDataFolder`; it never updates an older snapshot. The app must validate a downloaded JSON bundle and obtain the user's confirmation before replacing local history. Keep manual JSON export and restore available as a separate recovery path.

## Validation when iOS becomes available

Compile in Xcode and check sign-in, cancelled consent, sign-out, offline use, Drive permission denial, upload, list, and restore on a physical iPhone. Also check that an Android snapshot appears on iOS for the same Google account and that neither device silently replaces the other's newer history. The current Windows repository cannot run this native iOS validation.

References: [Capacitor local iOS plugins](https://capacitorjs.com/docs/ios/custom-code), [Capacitor 8.5 scene lifecycle](https://capacitorjs.com/docs/updating/8-5), [Google iOS setup](https://developers.google.com/identity/sign-in/ios/start-integrating), [Google iOS Drive authorization](https://developers.google.com/identity/sign-in/ios/api-access), [Drive appDataFolder](https://developers.google.com/workspace/drive/api/guides/appdata).
