# SciRun 5K Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task by task.

**Goal:** Protect personal workout history, correct skipped-run progress, improve mobile accessibility, and produce an Android update that can be installed over the existing personal APK.

**Architecture:** Keep the existing vanilla JavaScript state and timer model. Add explicit recovery and versioned backup handling around storage; adjust only credit derived from skipped running; harden the Capacitor package and focused mobile UI interactions. Preserve the app ID and signing key.

**Tech Stack:** Vanilla JavaScript, Node tests, mobile Playwright, Capacitor 8, Android Gradle.

**Spec:** User approved implementation after the 2026-11-06 audit; chose “session finished, without progress” after skipped running and manual JSON backup only.

## Global Constraints

- Do not discard valid workout history or change stored IDs/dates when migrating.
- Preserve the approved Aurora Teal/Energetic themes and existing timer controls.
- Do not run desktop UI tests; verify mobile browser and Android.
- Do not publish or change the app ID/signing key.

## Review Focus

- Malformed main storage must not be overwritten by app startup or a new profile.
- Import failure must leave existing state, active timer, draft feedback and preferences intact.
- Legacy JSON backups must still restore their history.
- Skipped running must remain visible in history but never prove continuous running or increase training level.
- The update must install over version 0.1.0 and retain local history.

### Task 1: Safe storage and backup

**Files:** `index.html`, `experience.js`, `state-backup.js`, `pending-session-store.js`, `tests/timer.test.cjs`, mobile backup tests.

- [ ] Add failing tests for corrupt main storage, oversized import, legacy backup, and backup round trip.
- [ ] Preserve raw corrupt state and block automatic overwrite until explicit restore/reset.
- [ ] Export versioned state plus preferences and recoverable session state; validate before replacement.
- [ ] Make import transactional, including a pre-import recovery copy.
- [ ] Verify affected Node and mobile tests.

### Task 2: Accurate progress and recovery

**Files:** `experience.js`, `dashboard-metrics.js`, `timer-core.js` only if necessary, `tests/timer.test.cjs`, mobile flow tests.

- [ ] Add failing skipped-run and long-suspension cases.
- [ ] Keep skipped session status `done` in history, but exclude it from capacity and level progression.
- [ ] Distinguish scheduled date from actual completion date in summaries without rewriting history.
- [ ] Verify affected Node and mobile tests.

### Task 3: Android update integrity

**Files:** `android/`, `capacitor.config.json`, `scripts/build-web.cjs`, `scripts/build-personal-apk.ps1`, `src/native-bridge.js`, Android package tests.

- [ ] Add failing checks for native script order, disabled OS backup, Android package ID and version increment.
- [ ] Guard the app against WebView versions older than its required JavaScript/CSS features.
- [ ] Clean generated backup cache files after reset and fix native test package name.
- [ ] Build and inspect signed version 0.1.1 with versionCode 2.

### Task 4: Mobile accessibility and localization

**Files:** `index.html`, `experience.js`, `workout-view.js`, CSS and mobile tests.

- [ ] Add failing checks for modal focus and workout focus after controls rerender.
- [ ] Manage dialog focus, restore control focus and announce phase transitions once.
- [ ] Increase undersized touch targets and fix remaining untranslated labels/states.
- [ ] Verify mobile viewports, reduced motion and light/dark contrast.

### Task 5: Release verification

- [ ] Run all Node tests and the mobile Playwright suite only.
- [ ] Install 0.1.1 over 0.1.0 on an emulator without clearing app data; check history and offline launch.
- [ ] Verify APK signature, package ID, version and SHA-256; inspect Git diff and signing-file ignore rules.
- [ ] Deliver the updated APK and report physical-device checks that remain unverified.
