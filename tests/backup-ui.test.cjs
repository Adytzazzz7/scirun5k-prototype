const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const backupSource = fs.readFileSync(path.join(root, 'state-backup.js'), 'utf8');
const pendingStoreSource = fs.readFileSync(path.join(root, 'pending-session-store.js'), 'utf8');
const NOW = Date.parse('2026-11-06T10:00:00.000Z');
const PRE_IMPORT_KEY = 'scirun.preImportBackup';

// Extract the callable declarations, then exercise them with a real backup parser.
// Balanced scanning allows the app to format these functions across multiple lines.
function declaration(name) {
  const match = new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(html);
  assert.ok(match, `${name} declaration exists`);
  const open = html.indexOf('{', match.index + match[0].length);
  assert.ok(open >= 0, `${name} has a body`);
  let depth = 0;
  let quote = null;
  let comment = null;
  for (let i = open; i < html.length; i++) {
    const char = html[i];
    const next = html[i + 1];
    if (comment === 'line') { if (char === '\n') comment = null; continue; }
    if (comment === 'block') { if (char === '*' && next === '/') { comment = null; i++; } continue; }
    if (quote) {
      if (char === '\\') { i++; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') { comment = 'line'; i++; continue; }
    if (char === '/' && next === '*') { comment = 'block'; i++; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return html.slice(match.index, i + 1);
  }
  throw new Error(`${name} body was not closed`);
}

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
      distanceKm: 2.3 }],
    blackoutDates: ['2026-11-08'], easyStreak: 1, moderateStreak: 0,
    hardStreak: 0, reduceNext: false, goalReached: false,
  };
}

function preferences() {
  return { lang: 'en', theme: 'light', palette: 'energetic',
    highContrast: true, timerSound: false, timerVibration: true };
}

function activeTimer() {
  return {
    level: 2,
    segments: [
      { type: 'warmup', seconds: 300, label: 'Warm-up', speed: 4.5 },
      { type: 'run', seconds: 60, label: 'Run · 1/1', speed: 6.5 },
      { type: 'cooldown', seconds: 300, label: 'Cool-down', speed: 4.5 },
    ],
    index: 1, segmentEnd: NOW + 25_000, remaining: 55, paused: false,
    total: 660, elapsed: 300, skippedSegments: 0, skippedRunSeconds: 0,
    scheduledDate: '2026-11-07',
  };
}

function pendingSession() {
  return {
    id: 42, level: 2, completion: 0.75, interrupted: true,
    completedNaturally: false, elapsed: 500, week: 2, sessionNumber: 1,
    scheduledDate: '2026-11-07', skippedRunSeconds: 30,
    longestRunSeconds: 60, selectedEffort: 'moderate',
    distanceDraft: '2.40', runFeelDraft: 'right', walkFeelDraft: 'tooSlow',
    goalContinuousDraft: false,
  };
}

function fileFrom(text, size = Buffer.byteLength(text)) {
  let reads = 0;
  return {
    file: { name: 'backup.json', type: 'application/json', size,
      text: async () => { reads++; return text; } },
    reads: () => reads,
  };
}

function containsRaw(value, expected) {
  if (value === expected) return true;
  if (Array.isArray(value)) return value.some(item => containsRaw(item, expected));
  if (value && typeof value === 'object') return Object.values(value).some(item => containsRaw(item, expected));
  return false;
}

function harness(options = {}) {
  const currentState = options.state || state();
  const prefs = options.preferences || preferences();
  const timer = options.activeTimer || null;
  const pending = options.pendingSession || null;
  const rawState = options.rawState ?? JSON.stringify(currentState, null, 2) + '\n';
  const values = new Map([
    ['scirun.state', rawState], ['scirun.lang', prefs.lang],
    ['scirun.theme', prefs.theme], ['scirun.palette', prefs.palette],
    ['scirun.highContrast', String(prefs.highContrast)],
    ['scirun.timerSound', String(prefs.timerSound)],
    ['scirun.timerVibration', String(prefs.timerVibration)],
  ]);
  if (timer) values.set('scirun.activeTimer', JSON.stringify(timer));
  if (pending) values.set('scirun.pendingSession', JSON.stringify(pending));
  let postSnapshotWrites = 0;
  let failSecondImportWrite = false;
  let sharedJson = null;
  const toasts = [];
  const elements = {
    importFile: { value: 'selected' }, importError: { textContent: '' },
    setupImportError: { textContent: '' },
    restorePreImport: { classList: { toggle: () => {} } },
  };
  const storage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem(key, value) {
      if (key !== PRE_IMPORT_KEY && failSecondImportWrite && ++postSnapshotWrites === 2) {
        throw new Error('quota exceeded');
      }
      values.set(key, String(value));
    },
    removeItem: key => values.delete(key),
  };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return NOW; }
  }
  const context = {
    Date: FixedDate, localStorage: storage, state: currentState,
    currentTimer: timer, pendingSession: pending, lang: prefs.lang,
    soundEnabled: prefs.timerSound, highContrastEnabled: prefs.highContrast,
    vibrationEnabled: prefs.timerVibration,
    stateStorageReadFailed: false, stateStorageCorrupt: false,
    TIMER_STORAGE_KEY: 'scirun.activeTimer', STAGES: Array(15).fill({}),
    window: { SciRunNative: { isNative: true, shareBackup: async json => { sharedJson = json; } },
      location: { reload: () => {} } },
    sessionStorage: { setItem: () => {} },
    document: { documentElement: { dataset: { theme: prefs.theme, palette: prefs.palette,
      contrast: prefs.highContrast ? 'high' : 'normal' } } },
    $: id => elements[id] || (elements[id] = { textContent: '', value: '' }),
    confirm: () => true,
    t: key => key,
    toast: message => toasts.push(message),
    renderAll: () => {}, showView: () => {}, setupForm: () => {},
    applyLanguage: () => {}, showWorkoutFeedback: () => {},
    renderWorkoutPage: () => {}, restoreTimer: () => {},
    stopTimerInterval: () => {}, updateStorageRecoveryNotice: () => {},
  };
  context.storageGet = key => storage.getItem(key);
  context.storageSet = (key, value) => {
    try { storage.setItem(key, value); return true; } catch { return false; }
  };
  context.storageRemove = key => {
    try { storage.removeItem(key); return true; } catch { return false; }
  };
  context.saveState = () => context.storageSet('scirun.state', JSON.stringify(context.state));
  context.persistTimer = () => context.currentTimer
    ? context.storageSet('scirun.activeTimer', JSON.stringify(context.currentTimer))
    : context.storageRemove('scirun.activeTimer');
  context.savePendingSession = () => context.pendingSession
    ? context.storageSet('scirun.pendingSession', JSON.stringify(context.pendingSession))
    : context.storageRemove('scirun.pendingSession');
  context.clearPendingSession = () => context.storageRemove('scirun.pendingSession');
  context.storageFailureText = () => 'storage unavailable';
  context.notifyStorageFailure = () => toasts.push('storage unavailable');
  context.applyTheme = (theme, persist = true) => {
    context.document.documentElement.dataset.theme = theme;
    return !persist || context.storageSet('scirun.theme', theme);
  };
  context.applyPalette = (palette, persist = true) => {
    context.document.documentElement.dataset.palette = palette;
    return !persist || context.storageSet('scirun.palette', palette);
  };
  context.applyHighContrast = (enabled, persist = true) => {
    context.document.documentElement.dataset.contrast = enabled ? 'high' : 'normal';
    return !persist || context.storageSet('scirun.highContrast', String(enabled));
  };
  vm.createContext(context);
  vm.runInContext(backupSource, context);
  vm.runInContext(pendingStoreSource, context);
  vm.runInContext([
    'backupPreferences', 'shareBackupText', 'exportRecoveryData',
    'restoreImportedBackup', 'updatePreImportAction', 'restorePreImportBackup',
    'importBackupFile', 'exportData',
  ].map(declaration).join('\n'), context);
  return {
    context, values, elements, toasts, shared: () => sharedJson,
    failSecondImportWrite: () => { failSecondImportWrite = true; },
  };
}

test('native export contains state, six preferences, and a frozen active workout', async () => {
  const running = activeTimer();
  const before = JSON.stringify(running);
  const h = harness({ activeTimer: running });
  await h.context.exportData();
  const exported = JSON.parse(h.shared());
  assert.equal(exported.app, 'scirun5k');
  assert.equal(exported.version, 2);
  assert.equal(exported.state.history[0].distanceKm, 2.3);
  assert.deepEqual(exported.preferences, preferences());
  assert.equal(exported.activeTimer.paused, true);
  assert.equal(exported.activeTimer.remaining, 25);
  assert.equal(exported.pendingSession, null);
  assert.equal(JSON.stringify(running), before);
});

test('native export preserves a pending feedback draft', async () => {
  const draft = pendingSession();
  const h = harness({ pendingSession: draft });
  await h.context.exportData();
  const exported = JSON.parse(h.shared());
  assert.equal(exported.activeTimer, null);
  assert.equal(exported.pendingSession.id, 42);
  assert.equal(exported.pendingSession.interrupted, true);
  assert.equal(exported.pendingSession.distanceDraft, '2.40');
  assert.equal(exported.pendingSession.runFeelDraft, 'right');
});

test('valid history still exports when saved visual preferences are stale', async () => {
  const h = harness();
  h.context.lang = 'xx';
  h.context.document.documentElement.dataset.theme = 'sepia';
  h.context.document.documentElement.dataset.palette = 'winter';
  await h.context.exportData();
  const exported = JSON.parse(h.shared());
  assert.equal(exported.state.history[0].id, 7);
  assert.equal(exported.preferences.lang, 'ro');
  assert.equal(exported.preferences.theme, 'dark');
  assert.equal(exported.preferences.palette, 'standard');
});

test('corrupt saved state exports its original bytes instead of a normalized replacement', async () => {
  const h = harness();
  const raw = '{"history": [broken';
  h.values.set('scirun.activeTimer', '{"paused":false}');
  h.values.set('scirun.pendingSession', '{"distanceDraft":"2.40"}');
  h.context.stateStorageCorrupt = true;
  h.context.stateRecoveryRaw = raw;
  await h.context.exportData();
  const recovery = JSON.parse(h.shared());
  assert.equal(recovery.app, 'scirun5k-raw-recovery');
  assert.equal(recovery.keys['scirun.state'], raw);
  assert.equal(recovery.keys['scirun.activeTimer'], '{"paused":false}');
  assert.equal(recovery.keys['scirun.pendingSession'], '{"distanceDraft":"2.40"}');
  assert.equal(h.values.get('scirun.state'), JSON.stringify(state(), null, 2) + '\n');
});

test('legacy import restores history and saves the exact prior state bytes for recovery', async () => {
  const h = harness();
  const priorRaw = h.values.get('scirun.state');
  const imported = state();
  imported.level = 3;
  imported.history.push({ id: 9, date: '2026-11-05', level: 2, status: 'partial',
    effort: 'moderate', completion: 0.6, timerCompletion: 0.6, elapsed: 700 });
  const input = fileFrom(JSON.stringify(imported));
  await h.context.importBackupFile(input.file);
  assert.equal(input.reads(), 1);
  assert.equal(JSON.parse(h.values.get('scirun.state')).history[1].id, 9);
  assert.equal(h.values.get('scirun.lang'), 'en');
  assert.ok(h.values.has(PRE_IMPORT_KEY));
  assert.equal(containsRaw(JSON.parse(h.values.get(PRE_IMPORT_KEY)), priorRaw), true);
});

test('version 2 import restores preferences and an unfinished feedback draft', async () => {
  const h = harness();
  const importedState = state();
  importedState.level = 3;
  const importedPrefs = { lang: 'ro', theme: 'dark', palette: 'standard',
    highContrast: false, timerSound: true, timerVibration: false };
  const draft = { ...pendingSession(), level: 3 };
  const bundle = h.context.SciRunStateBackup.createBundle(importedState, importedPrefs, null, draft, NOW);
  await h.context.importBackupFile(fileFrom(JSON.stringify(bundle)).file);
  assert.equal(JSON.parse(h.values.get('scirun.state')).level, 3);
  assert.equal(h.values.get('scirun.lang'), 'ro');
  assert.equal(h.values.get('scirun.theme'), 'dark');
  assert.equal(h.values.get('scirun.palette'), 'standard');
  assert.equal(h.values.get('scirun.highContrast'), 'false');
  assert.equal(h.values.get('scirun.timerSound'), 'true');
  assert.equal(h.values.get('scirun.timerVibration'), 'false');
  assert.equal(JSON.parse(h.values.get('scirun.pendingSession')).distanceDraft, '2.40');
});

test('version 2 import stores a timer as paused with its saved remaining time', async () => {
  const h = harness();
  const bundle = h.context.SciRunStateBackup.createBundle(
    state(), preferences(), activeTimer(), null, NOW);
  await h.context.importBackupFile(fileFrom(JSON.stringify(bundle)).file);
  const restored = JSON.parse(h.values.get('scirun.activeTimer'));
  assert.equal(restored.paused, true);
  assert.equal(restored.remaining, 25);
  assert.equal(restored.index, 1);
});

test('Account can restore the exact data from before the last import', async () => {
  assert.match(html, /id="restorePreImport"/);
  const h = harness();
  const originalRaw = h.values.get('scirun.state');
  const incoming = state();
  incoming.level = 4;
  await h.context.importBackupFile(fileFrom(JSON.stringify(incoming)).file);
  const importedRaw = h.values.get('scirun.state');
  assert.notEqual(importedRaw, originalRaw);
  assert.equal(h.context.restorePreImportBackup(), true);
  assert.equal(h.values.get('scirun.state'), originalRaw);
  assert.equal(h.values.get('scirun.lang'), preferences().lang);
  assert.equal(containsRaw(JSON.parse(h.values.get(PRE_IMPORT_KEY)), importedRaw), true);
});

test('failed restoration leaves the current history and recovery copy intact', async () => {
  const h = harness();
  const incoming = state();
  incoming.level = 4;
  await h.context.importBackupFile(fileFrom(JSON.stringify(incoming)).file);
  const before = new Map(h.values);
  h.failSecondImportWrite();
  assert.equal(h.context.restorePreImportBackup(), false);
  assert.deepEqual([...h.values].sort(), [...before].sort());
});

test('an oversized file is rejected before its contents are read or stored', async () => {
  const h = harness();
  const before = new Map(h.values);
  const input = fileFrom('{}', 5_000_001);
  await h.context.importBackupFile(input.file);
  assert.equal(input.reads(), 0);
  assert.deepEqual([...h.values].sort(), [...before].sort());
  assert.notEqual(h.elements.importError.textContent, '');
});

test('a failed import write rolls back state and preferences while retaining the recovery snapshot', async () => {
  const h = harness();
  const before = new Map(h.values);
  const importedState = state();
  importedState.level = 3;
  const importedPrefs = { lang: 'ro', theme: 'dark', palette: 'standard',
    highContrast: false, timerSound: true, timerVibration: false };
  const bundle = h.context.SciRunStateBackup.createBundle(
    importedState, importedPrefs, null, pendingSession(), NOW);
  h.failSecondImportWrite();
  await h.context.importBackupFile(fileFrom(JSON.stringify(bundle)).file);
  const recovery = h.values.get(PRE_IMPORT_KEY);
  assert.ok(recovery);
  assert.equal(containsRaw(JSON.parse(recovery), before.get('scirun.state')), true);
  h.values.delete(PRE_IMPORT_KEY);
  assert.deepEqual([...h.values].sort(), [...before].sort());
  assert.equal(JSON.stringify(h.context.state), JSON.stringify(state()));
  assert.equal(h.context.currentTimer, null);
  assert.equal(h.context.pendingSession, null);
  assert.notEqual(h.elements.importError.textContent, '');
});

test('an import read failure preserves every stored value', async () => {
  const h = harness();
  const before = new Map(h.values);
  h.context.localStorage.getItem = () => { throw new Error('storage unavailable'); };
  await h.context.importBackupFile(fileFrom(JSON.stringify(state())).file);
  assert.deepEqual([...h.values].sort(), [...before].sort());
  assert.equal(h.values.has(PRE_IMPORT_KEY), false);
  assert.notEqual(h.elements.importError.textContent, '');
});
