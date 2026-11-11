# Aurora Teal Premium UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SciRun's mobile interface match the Aurora Teal preview approved on 2026-11-07 while preserving workout behavior and saved history.

**Architecture:** Keep the existing plain HTML, CSS, and JavaScript application. Adjust presentation and display-only rendering in place; derive all workout visuals from the current timer, and keep history values read-only. Replace the mismatched PWA and Android launcher artwork with one Aurora Teal identity.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node test runner, Playwright Chromium mobile viewports, Capacitor Android assets.

**Spec:** `C:/Users/adytz/.codex/visualizations/2026/11/05/01a1ada1-1a15-7003-b91c-643d7b4d206c/scirun-premium-preview.html` (approved interactive visual reference); current app is the draft PR #29 branch `codex/aurora-teal-refinement`.

## Global Constraints

- Mobile Android and iOS presentation only; no desktop visual tests and no APK in this change.
- Preserve timer timing, workout progression, skipped-interval rules, backup format, local storage, offline behavior, and every saved history entry.
- Standard remains Aurora Teal, with blue warm-up and cool-down, red run, and green walk; Energetic remains available.
- Show the next-speed cue at 10 seconds and pulse the ring at 5 seconds; reduced-motion users still receive the cue.
- In light mode, essential text and notification surfaces must remain legible, including partial statuses.
- Keep the four navigation destinations Panou, Istoric, Setări, Cont and the active-timer return control inside the next-workout card.

## Review Focus

- Existing history, including partial workouts: each entry appears once, is ordered as before, and is never rewritten.
- A running session opened from Panou: navigating back retains its timer preview and return control.
- Narrow 320 px Android viewport: controls remain at least 44 px high and no horizontal overflow appears.
- Dark, light, and high-contrast modes: status, speed cue, and settings text are readable against their actual surfaces.
- Phase changes and pause: the full workout background follows the real phase while ring color and timer remain in sync.

---

### Task 1: Dashboard and history information hierarchy

**Files:**
- Modify: `index.html`, `experience.js`, `experience.css`, `theme-graphite.css`
- Test: `tests/e2e/account-layout.spec.cjs`, `tests/e2e/dashboard-active-timer.spec.cjs`

**Interfaces:** Keep `renderDashboard()` and `renderHistory()` signatures and all state keys. Keep `suggestedSpeed`, `totalDistance`, `historyList`, and `dashboardTimerPreview` IDs used by the app.

- [ ] Add mobile assertions that one suggested-speed value appears on Panou, each saved session appears once in Istoric, the active-timer return button stays inside the next-workout card, and no history state changes after navigation.
- [ ] Run those tests and confirm they fail on current UI duplication.
- [ ] Remove the duplicate speed card from Panou while retaining total distance and the plan explanation; render one history timeline from the full saved list and remove the duplicate recent card.
- [ ] Tune mobile card spacing, type hierarchy, chart, and history rows toward the approved preview without hiding any metrics or saved entries.
- [ ] Run the focused mobile tests and confirm they pass.

### Task 2: Workout hierarchy and continuous liquid ring

**Files:**
- Modify: `workout-view.js`, `experience.css`, `theme-graphite.css`
- Test: `tests/e2e/workout-visual.spec.cjs`, `tests/e2e/mobile-preferences.spec.cjs`, `tests/workout-accessibility.test.cjs`

**Interfaces:** Keep `workoutVisualState()`, `renderWorkoutPage()`, and `updateWorkoutPage()` timing and phase state unchanged. Keep current timer and control IDs. Add only display nodes for the next interval duration and retain elapsed/total time elsewhere in the workout view.

- [ ] Add mobile assertions for the visible order phase → timer → suggested speed → next action, ring arc and inner liquid, next interval duration, 10-second cue, 5-second pulse, and reduced-motion behavior.
- [ ] Run the focused tests and confirm the expected visual/markup failures.
- [ ] Refine the ring track and liquid to the preview's continuous arc; pulse the whole ring without a detached halo and retain the current progress percentage.
- [ ] Make next interval and duration easy to scan, preserve elapsed/total time, and keep pause blue, skip green, stop red without button gradients.
- [ ] Run affected Node and mobile browser tests.

### Task 3: Settings, contrast, and mobile typography

**Files:**
- Modify: `experience.css`, `theme-graphite.css`, `palette-options.css`
- Test: `tests/e2e/mobile-preferences.spec.cjs`, `tests/e2e/workout-visual.spec.cjs`

**Interfaces:** Keep existing preference IDs and persistence handlers; keep Standard and Energetic palette choices.

- [ ] Add mobile checks for the selected/unselected toggle states and actual text-to-surface contrast in light mode, including partial history status and workout cue.
- [ ] Confirm focused checks fail where contrast or sizing is insufficient.
- [ ] Align settings cards, swatches, and toggles with the preview; raise secondary type where needed and correct the remaining light-theme colors.
- [ ] Re-run focused checks at 390 px and a narrow 320 px viewport.

### Task 4: One launcher and in-app identity

**Files:**
- Modify: `icon.svg`, `icon-192.png`, `icon-512.png`, Android mipmaps under `android/app/src/main/res/`, `theme-graphite.css`
- Test: `tests/android-package.test.cjs`

**Interfaces:** Keep existing manifest/icon paths and package identifiers. The Android asset script must continue to derive mipmaps from `icon-512.png`.

- [ ] Add a focused asset check that the SVG and PNG icon use Aurora Teal/graphite rather than the sunset artwork and that PNG dimensions remain 192 and 512.
- [ ] Confirm the asset check fails before replacing assets.
- [ ] Create matching vector and PNG launcher graphics from the approved preview; regenerate Android mipmaps without building an APK.
- [ ] Run the asset check and inspect the generated icons directly.

### Task 5: Mobile verification and publication to the existing draft PR

**Files:** All touched files in Tasks 1–4.

- [ ] Run the complete Node suite and focused mobile Playwright flows for Panou, an active workout, phase changes, Istoric, Setări, and Cont. Exclude desktop-only visual tests.
- [ ] Build web assets and inspect that all icon and font references are packaged; do not assemble an APK.
- [ ] Review the diff for unintended timer, progression, storage, backup, or offline changes.
- [ ] Commit the verified changes onto `codex/aurora-teal-refinement` (PR #29) with a branch-head lease and check remote CI.
