const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'state-backup.js'), 'utf8');
const NOW = Date.parse('2026-11-06T10:00:00.000Z');

function backupApi() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.SciRunStateBackup;
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }

function state() {
  return {
    profile: {
      runStatus: 'known', runMinutes: 3, trainingDays: [1, 3, 5],
      sessionsPerWeek: 3, startDate: '2026-11-03', safetyAnswer: 'no',
      walkSpeed: 4.5, runSpeed: 6.5, firstSessionFeedbackDone: true,
    },
    level: 2,
    history: [{ id: 7, date: '2026-11-04', level: 1, status: 'done',
      effort: 'easy', completion: 1, timerCompletion: 1, elapsed: 1200,
      distanceKm: 2.3, skippedRunSeconds: 0 }],
    blackoutDates: ['2026-11-08'], easyStreak: 1, moderateStreak: 0,
    hardStreak: 0, reduceNext: false, goalReached: false,
  };
}

function preferences() {
  return { lang: 'ro', theme: 'dark', palette: 'standard',
    highContrast: false, timerSound: true, timerVibration: false };
}

function timer() {
  return {
    level: 2, factor: 1, startedAt: NOW - 335_000,
    segments: [
      { type: 'warmup', seconds: 300, label: 'Warm-up', speed: 4.5 },
      { type: 'run', seconds: 60, label: 'Run · 1/1', speed: 6.5 },
      { type: 'cooldown', seconds: 300, label: 'Cool-down', speed: 4.5 },
    ],
    index: 1, segmentEnd: NOW + 25_000, remaining: 55, paused: false,
    total: 660, elapsed: 300, scheduledDate: '2026-11-07',
    skippedSegments: 0, skippedRunSeconds: 0,
  };
}

function pending() {
  return {
    id: 42, level: 2, completion: 0.75, interrupted: true,
    completedNaturally: false, elapsed: 500, week: 2, sessionNumber: 1,
    scheduledDate: '2026-11-07', skippedSegments: 1,
    skippedRunSeconds: 30, longestRunSeconds: 60,
    selectedEffort: 'moderate', selectedRatio: 0.75,
    distanceDraft: '2.40', runFeelDraft: 'right', walkFeelDraft: 'tooSlow',
    goalContinuousDraft: false,
  };
}

function envelope(overrides = {}) {
  return { app: 'scirun5k', version: 2, state: state(),
    preferences: preferences(), activeTimer: null, pendingSession: null,
    ...overrides };
}

test('legacy direct-state JSON keeps the old parser result and has no new settings or session data', () => {
  const api = backupApi();
  const legacy = state();
  const existingResult = plain(api.parse(JSON.stringify(legacy), 15));
  const bundledResult = plain(api.parseBundle(JSON.stringify(legacy), 15));
  assert.deepEqual(bundledResult, {
    state: existingResult, preferences: null, activeTimer: null, pendingSession: null,
  });
  assert.equal(existingResult.history[0].distanceKm, 2.3);
});

test('version 2 round trip keeps complete state, preferences, and a pending feedback draft', () => {
  const api = backupApi();
  const sourceState = state();
  const sourcePreferences = preferences();
  const sourcePending = pending();
  sourceState.extraField = 'discard me';
  sourcePending.extraField = '<img src=x>';
  const exported = plain(api.createBundle(sourceState, sourcePreferences, null, sourcePending, NOW));
  const restored = plain(api.parseBundle(JSON.stringify(exported), 15));

  assert.deepEqual(Object.keys(exported), ['app', 'version', 'state', 'preferences', 'activeTimer', 'pendingSession']);
  assert.equal(exported.app, 'scirun5k');
  assert.equal(exported.version, 2);
  assert.deepEqual(restored.state, plain(api.parse(JSON.stringify(state()), 15)));
  assert.deepEqual(restored.preferences, sourcePreferences);
  assert.deepEqual(restored.pendingSession, {
    id: 42, level: 2, completion: 0.75, interrupted: true, completedNaturally: false,
    elapsed: 500, week: 2, sessionNumber: 1, scheduledDate: '2026-11-07',
    skippedRunSeconds: 30, longestRunSeconds: 60,
    selectedEffort: 'moderate', selectedRatio: 0.75, distanceDraft: '2.40',
    runFeelDraft: 'right', walkFeelDraft: 'tooSlow', goalContinuousDraft: false,
  });
  assert.equal(restored.activeTimer, null);
  assert.equal('extraField' in exported.state, false);
  assert.equal('extraField' in exported.pendingSession, false);
});

test('pending interruption status survives a backup round trip', () => {
  const api = backupApi();
  const draft = pending();
  draft.interrupted = false;
  const restored = plain(api.parseBundle(JSON.stringify(
    api.createBundle(state(), preferences(), null, draft, NOW)), 15));
  assert.equal(restored.pendingSession.interrupted, false);
});

test('running timer export freezes remaining time and leaves the live timer untouched', () => {
  const api = backupApi();
  const live = timer();
  const before = JSON.stringify(live);
  const exported = plain(api.createBundle(state(), preferences(), live, null, NOW));
  const restored = plain(api.parseBundle(JSON.stringify(exported), 15));

  assert.equal(JSON.stringify(live), before);
  assert.equal(restored.activeTimer.paused, true);
  assert.equal(restored.activeTimer.index, 1);
  assert.equal(restored.activeTimer.remaining, 25);
  assert.equal(restored.activeTimer.segmentEnd, NOW + 25_000);
  assert.equal(restored.activeTimer.elapsed, 300);
  assert.equal(restored.activeTimer.total, 660);
  assert.deepEqual(restored.activeTimer.segments, live.segments);
  assert.equal(restored.activeTimer.scheduledDate, '2026-11-07');
  assert.equal('startedAt' in restored.activeTimer, false);
  assert.equal('factor' in restored.activeTimer, false);
});

test('running timer export catches up crossed segments before pausing', () => {
  const api = backupApi();
  const live = timer();
  live.segmentEnd = NOW - 5_000;
  const restored = plain(api.parseBundle(JSON.stringify(
    api.createBundle(state(), preferences(), live, null, NOW)), 15));
  assert.equal(restored.activeTimer.paused, true);
  assert.equal(restored.activeTimer.index, 2);
  assert.equal(restored.activeTimer.remaining, 295);
  assert.equal(restored.activeTimer.elapsed, 360);
});

test('an already paused timer keeps its saved remaining time despite an old wall clock deadline', () => {
  const api = backupApi();
  const live = timer();
  live.paused = true;
  live.remaining = 20;
  live.segmentEnd = NOW - 2_000_000;
  const restored = plain(api.parseBundle(JSON.stringify(
    api.createBundle(state(), preferences(), live, null, NOW)), 15));
  assert.equal(restored.activeTimer.index, 1);
  assert.equal(restored.activeTimer.remaining, 20);
  assert.equal(restored.activeTimer.segmentEnd, NOW + 20_000);
});

test('a paused backup retains skipped interval counters used to calculate running credit', () => {
  const api = backupApi();
  const live = timer();
  live.index = 2;
  live.remaining = 280;
  live.segmentEnd = NOW + 280_000;
  live.elapsed = 312;
  live.skippedSegments = 1;
  live.skippedRunSeconds = 60;
  live.skippedRunElapsedSeconds = 12;
  live.skippedElapsedSeconds = 48;
  const restored = plain(api.parseBundle(JSON.stringify(
    api.createBundle(state(), preferences(), live, null, NOW)), 15));
  assert.equal(restored.activeTimer.elapsed, 312);
  assert.equal(restored.activeTimer.skippedSegments, 1);
  assert.equal(restored.activeTimer.skippedRunSeconds, 60);
  assert.equal(restored.activeTimer.skippedRunElapsedSeconds, 12);
  assert.equal(restored.activeTimer.skippedElapsedSeconds, 48);
});

test('version 2 rejects unsupported envelopes, invalid state, and simultaneous sessions', () => {
  const api = backupApi();
  const invalid = [
    { ...envelope(), app: 'other-app' },
    { ...envelope(), version: 3 },
    { ...envelope(), version: '2' },
    { ...envelope(), state: { ...state(), level: 99 } },
    { ...envelope(), state: { ...state(), profile: null } , pendingSession: pending() },
    { ...envelope(), pendingSession: { ...pending(), id: 7 } },
    { ...envelope(), activeTimer: { ...timer(), paused: true, remaining: 25 }, pendingSession: pending() },
  ];
  for (const candidate of invalid) {
    assert.throws(() => api.parseBundle(JSON.stringify(candidate), 15), /Invalid SciRun backup file/);
  }
});

test('version 2 validates every preference enum and boolean', () => {
  const api = backupApi();
  const invalidPreferences = [
    { ...preferences(), lang: 'fr' },
    { ...preferences(), theme: 'solarized' },
    { ...preferences(), palette: '<img>' },
    { ...preferences(), highContrast: 'true' },
    { ...preferences(), timerSound: 1 },
    { ...preferences(), timerVibration: null },
    { ...preferences(), lang: undefined },
  ];
  for (const invalid of invalidPreferences) {
    assert.throws(() => api.parseBundle(JSON.stringify(envelope({ preferences: invalid })), 15),
      /Invalid SciRun backup file/);
  }
});

test('version 2 rejects malformed pending feedback and unsafe drafts', () => {
  const api = backupApi();
  const invalidPending = [
    { ...pending(), id: '' },
    { ...pending(), level: 15 },
    { ...pending(), completion: 1.1 },
    { ...pending(), interrupted: 'yes' },
    { ...pending(), completedNaturally: 'false' },
    { ...pending(), elapsed: -1 },
    { ...pending(), elapsed: 1.5 },
    { ...pending(), week: 0 },
    { ...pending(), sessionNumber: 0 },
    { ...pending(), scheduledDate: '2026-02-30' },
    { ...pending(), skippedRunSeconds: -1 },
    { ...pending(), skippedSegments: -1 },
    { ...pending(), selectedEffort: '<script>' },
    { ...pending(), selectedRatio: 1.1 },
    { ...pending(), distanceDraft: '<img src=x>' },
    { ...pending(), runFeelDraft: 'unknown' },
    { ...pending(), walkFeelDraft: '<script>' },
    { ...pending(), goalContinuousDraft: 'true' },
  ];
  for (const invalid of invalidPending) {
    assert.throws(() => api.parseBundle(JSON.stringify(envelope({ pendingSession: invalid })), 15),
      /Invalid SciRun backup file/);
  }
});

test('version 2 rejects malformed active timer segments, index, times, and unsafe labels', () => {
  const api = backupApi();
  const paused = { ...timer(), paused: true, remaining: 25 };
  const invalidTimers = [
    { ...paused, paused: false },
    { ...paused, index: 3 },
    { ...paused, remaining: 61 },
    { ...paused, segmentEnd: 'tomorrow' },
    { ...paused, total: 659 },
    { ...paused, elapsed: -1 },
    { ...paused, elapsed: 301 },
    { ...paused, segments: [{ type: 'run', seconds: 60 }] },
    { ...paused, segments: paused.segments.map((s, i) => i === 1 ? { ...s, type: 'other' } : s) },
    { ...paused, segments: paused.segments.map((s, i) => i === 1 ? { ...s, seconds: -1 } : s) },
    { ...paused, segments: paused.segments.map((s, i) => i === 1 ? { ...s, label: '<script>' } : s) },
    { ...paused, segments: paused.segments.map((s, i) => i === 1 ? { ...s, speed: -1 } : s) },
    { ...paused, skippedRunSeconds: -1 },
    { ...paused, skippedElapsedSeconds: 301 },
    { ...paused, scheduledDate: '2026-11-31' },
  ];
  for (const invalid of invalidTimers) {
    assert.throws(() => api.parseBundle(JSON.stringify(envelope({ activeTimer: invalid })), 15),
      /Invalid SciRun backup file/);
  }
});
