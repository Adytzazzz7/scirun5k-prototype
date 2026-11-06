# SciRun 5K Personal Android APK Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task.

**Goal:** Produce an installable Android APK containing the finished SciRun 5K experience and its offline assets.

**Architecture:** Keep the current web app and training state format. Copy an explicit asset list into Capacitor's `webDir`, add an Android project, and use native plugins only where WebView behavior needs them. Generate a local APK and verify its contents and mobile flows.

**Tech Stack:** Vanilla JavaScript, Capacitor 8, Android Gradle Plugin, Android SDK, Node.js.

**Spec:** User requests in this conversation: Aurora Teal Standard and Energetic palettes, semantic phase colors, 10-second speed cue, no transition outline, existing data/history and offline use, then APK for personal Android installation.

## Global Constraints

- Preserve the timer, adaptive workout algorithms, saved history format, and JSON import behavior.
- Do not run desktop visual tests; verify mobile and Android behavior.
- Bundle all web assets locally. No hosted page is required to launch.
- An APK install starts with separate app storage; a browser PWA history requires JSON export and import.

## Review Focus

- An offline first launch must display the app and local fonts without network requests.
- A saved workout and unfinished timer must survive app restart.
- Backup export must produce a shareable JSON file on Android; import must restore history without silent replacement.
- The 10-second cue and five-second pulse must remain distinct at interval boundaries.
- A new APK build must retain the same Android app ID so updates preserve app storage.

### Task 1: Freeze the mobile experience

**Files:** `workout-view.js`, `experience.css`, `theme-graphite.css`, `sw.js`, affected tests.

- [x] Verify the speed cue appears at 10 seconds, with the pulse at 5 seconds.
- [x] Verify phase colors in both palettes and no transient timer outline.
- [x] Run Node and mobile browser regressions.

### Task 2: Package web assets and native integration

**Files:** `package.json`, `capacitor.config.json`, `scripts/build-web.cjs`, `native-bridge.js`, `experience.js`, `index.html`, build tests.

- [x] Add a deterministic web build containing only runtime assets and a native bridge bundle.
- [x] Add Android Capacitor dependencies and platform project.
- [x] Route Android backup sharing and interval haptics through native plugins, keeping browser fallbacks.
- [x] Verify data and timing behavior remains unchanged.

### Task 3: Build and validate APK

**Files:** `android/`, generated `dist/SciRun-5K-0.1.0-android.apk`, README instructions.

- [x] Install the required local Android build tools and accept their licenses.
- [x] Build the Android release APK, inspect package ID, version, signing, and bundled files.
- [x] Run Android emulator checks: offline launch, timer and cue flow, native haptics call, and backup share file creation. Mobile browser tests cover timer reload and backup restore. A full Android process restart and the physical vibration motor remain unverified.
- [x] Give the APK path only after all achievable checks pass, with any unverified device behavior clearly stated.
