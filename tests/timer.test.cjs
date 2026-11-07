const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = { Date, Math };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'timer-core.js'), 'utf8'), context);
const core = context.SciRunTimerCore;

function timerFixture() {
  return {
    segments: [
      { type: 'warmup', seconds: 10 },
      { type: 'run', seconds: 20 },
      { type: 'walk', seconds: 5 },
      { type: 'run', seconds: 30 },
      { type: 'cooldown', seconds: 10 },
    ],
    index: 0,
    segmentEnd: 10_000,
    remaining: 10,
    elapsed: 0,
    paused: false,
    skippedRunSeconds: 0,
  };
}

test('catches up through every elapsed segment after background suspension', () => {
  const timer = timerFixture();
  const progress = core.advanceTimer(timer, 52_000);
  assert.equal(progress.changed, true);
  assert.equal(progress.complete, false);
  assert.equal(timer.index, 3);
  assert.equal(timer.segmentEnd, 65_000);
  assert.equal(core.runCompletion(timer, 52_000), 0.74);
});

test('reports completion only after the final planned segment ends', () => {
  const timer = timerFixture();
  const progress = core.advanceTimer(timer, 75_000);
  assert.equal(progress.complete, true);
  assert.equal(timer.index, 4);
  assert.equal(core.runCompletion(timer, 75_000), 1);
});

test('keeps a paused timer frozen while restoring or catching up', () => {
  const timer = timerFixture();
  timer.paused = true;
  timer.remaining = 4;
  const progress = core.advanceTimer(timer, 90_000);
  assert.deepEqual({ ...progress }, { changed: false, complete: false });
  assert.equal(timer.index, 0);
  assert.equal(timer.remaining, 4);
});

test('skipping a partly completed run credits time already spent and keeps active elapsed accurate', () => {
  const timer = {
    segments: [
      { type: 'run', seconds: 60 },
      { type: 'walk', seconds: 30 },
      { type: 'run', seconds: 60 },
      { type: 'cooldown', seconds: 10 },
    ],
    index: 0,
    segmentEnd: 60_000,
    remaining: 60,
    elapsed: 0,
    paused: false,
  };

  assert.equal(core.runCompletion(timer, 30_000), 0.25);
  const skipped = core.skipSegment(timer, 30_000);
  assert.deepEqual({ ...skipped }, { changed: true, complete: false, skipped: true, elapsedSeconds: 30 });
  assert.equal(timer.index, 1);
  assert.equal(timer.elapsed, 30);
  assert.equal(core.runCompletion(timer, 30_000), 0.25);

  core.advanceTimer(timer, 65_000);
  assert.equal(timer.index, 2);
  assert.equal(timer.elapsed, 60);
  assert.equal(core.runCompletion(timer, 65_000), 35 / 120);
});

test('skipping the final cooldown ends the timer without crediting its unspent time', () => {
  const timer = {
    segments: [{ type: 'run', seconds: 60 }, { type: 'cooldown', seconds: 60 }],
    index: 1,
    segmentEnd: 120_000,
    remaining: 30,
    elapsed: 60,
    paused: false,
  };
  const skipped = core.skipSegment(timer, 90_000);
  assert.deepEqual({ ...skipped }, { changed: true, complete: true, skipped: true, elapsedSeconds: 30 });
  assert.equal(timer.skippedSegments, 1);
  assert.equal(timer.index, 1);
  assert.equal(timer.remaining, 30);
});

test('requires both a natural timer finish and full feedback for a complete session', () => {
  assert.equal(core.isFullSession(false, 1), false);
  assert.equal(core.isFullSession(true, 0.75), false);
  assert.equal(core.isFullSession(true, 1), true);
});

test('PWA manifest and precache refer to existing root-level icons and timer code', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  for (const icon of manifest.icons) {
    assert.equal(fs.existsSync(path.join(root, icon.src.replace(/^\.\//, ''))), true, icon.src);
  }
  const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  for (const asset of ['./icon-192.png', './icon-512.png', './timer-core.js', './pending-session-store.js', './dashboard-metrics.js', './workout-view.js', './state-backup.js', './liquid-glass.css', './app.css']) {
    assert.ok(worker.includes(asset), `${asset} is precached`);
    assert.equal(fs.existsSync(path.join(root, asset.slice(2))), true, asset);
  }
  assert.equal(worker.includes('./icons/'), false);
  assert.equal(manifest.theme_color, '#06191d');
});

test('the selected theme and its font weights are available offline', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'theme-graphite.css'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(html, /href="theme-graphite\.css"/);
  for (const asset of ['theme-graphite.css', 'palette-options.css', 'fonts/Barlow-Regular.ttf', 'fonts/Barlow-SemiBold.ttf', 'fonts/Barlow-Bold.ttf', 'fonts/Barlow-Black.ttf']) {
    assert.ok(worker.includes("./" + asset), asset + ' is precached');
    assert.equal(fs.existsSync(path.join(root, asset)), true, asset);
  }
  for (const file of ['Barlow-Regular.ttf', 'Barlow-SemiBold.ttf', 'Barlow-Bold.ttf', 'Barlow-Black.ttf']) {
    assert.ok(css.includes('fonts/' + file), file + ' is referenced by the theme');
    assert.equal(fs.readFileSync(path.join(root, 'fonts', file)).readUInt32BE(0), 0x00010000, file + ' is a TrueType font');
  }
  assert.equal(fs.existsSync(path.join(root, 'fonts', 'OFL.txt')), true);
  assert.match(html, /href="palette-options\.css"/);
});

test('pending feedback sessions survive storage reloads and can be cleared', () => {
  const storeContext = {};
  vm.createContext(storeContext);
  vm.runInContext(fs.readFileSync(path.join(root, 'pending-session-store.js'), 'utf8'), storeContext);
  const store = storeContext.SciRunPendingSessionStore;
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  const session = { id: 'session-1', level: 2, completion: 0.4, elapsed: 300, completedNaturally: false };

  store.save(session, storage);
  assert.deepEqual(JSON.parse(values.get('scirun.pendingSession')), session);
  assert.equal(JSON.stringify(store.load(storage)), JSON.stringify(session));
  store.clear(storage);
  assert.equal(store.load(storage), null);
});

test('app restores pending feedback before attempting to resume an active timer', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const view = fs.readFileSync(path.join(root, 'workout-view.js'), 'utf8');
  assert.match(html, /<script src="pending-session-store\.js"><\/script>/);
  assert.match(html, /function savePendingSession\(\)/);
  const experience = fs.readFileSync(path.join(root, 'experience.js'), 'utf8');
  assert.match(experience, /if \(!restorePendingSession\(\)\) restoreTimer\(\)/);
  assert.match(html, /state\.history\.push\(\{id:pendingSession\.id\|\|Date\.now\(\)/);
  assert.match(html, /selectedEffort=pendingSession\.selectedEffort\|\|null/);
  assert.match(view, /pendingSession\.selectedEffort=selectedEffort/);
  assert.match(view, /pendingSession\.distanceDraft=distance/);
});

test('dashboard plan completion counts complete sessions only, not algorithm stages or partial sessions', () => {
  const dashboardContext = {};
  vm.createContext(dashboardContext);
  vm.runInContext(fs.readFileSync(path.join(root, 'dashboard-metrics.js'), 'utf8'), dashboardContext);
  const progress = dashboardContext.SciRunDashboardMetrics.planProgress([
    { status: 'done' }, { status: 'partial' }, { status: 'done' },
  ], 3);
  assert.deepEqual({ ...progress }, { done: 2, total: 36, percent: 6 });
});

test('dashboard streak stops at partial sessions and confirmed capacity requires a complete continuous session', () => {
  const dashboardContext = {};
  vm.createContext(dashboardContext);
  vm.runInContext(fs.readFileSync(path.join(root, 'dashboard-metrics.js'), 'utf8'), dashboardContext);
  const metrics = dashboardContext.SciRunDashboardMetrics;
  const history = [
    { status: 'done', completion: 1, level: 0 },
    { status: 'partial', completion: 0.75, level: 2 },
    { status: 'done', completion: 1, level: 2 },
    { status: 'done', completion: 1, level: 3 },
  ];
  const stages = [
    { type: 'interval', run: 900 }, { type: 'continuous', run: 1200 },
    { type: 'interval', run: 1000 }, { type: 'continuous', run: 1800 },
  ];
  assert.equal(metrics.trainingStreak(history), 2);
  assert.equal(metrics.trainingStreak([
    { status: 'done' }, { status: 'done', skippedRunSeconds: 60 }, { status: 'done' },
  ]), 1);
  assert.deepEqual({ ...metrics.confirmedCapacity(history, stages, false) }, {
    value: '30 min', minutes: 30, source: 'completed-session',
  });
  assert.equal(metrics.confirmedCapacity(history.slice(0, 3), stages, false), null);
  assert.equal(metrics.confirmedCapacity([
    { status: 'done', completion: 1, level: 3, skippedRunSeconds: 120 },
  ], stages, false), null);
  assert.deepEqual({ ...metrics.confirmedCapacity([], stages, true) }, {
    value: '5 km', minutes: null, source: 'manual-goal',
  });
});


test('workout timer is a dedicated view with distinct pause, finish, abandon, and feedback flows', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const view = fs.readFileSync(path.join(root, 'workout-view.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'liquid-glass.css'), 'utf8');
  assert.match(html, /<section id="workout" class="view workout-view"/);
  assert.match(html, /<script src="workout-view.js"><\/script>/);
  assert.doesNotMatch(html, /renderTimerModal|closeTimer/);
  for (const control of ['workoutPause', 'workoutSkip', 'workoutFinish', 'workoutAbandon', 'recommendedSpeed', 'phaseCountdown']) assert.ok(view.includes(control), control);
  assert.ok(view.includes('workoutRing'));
  assert.ok(view.includes('nextInterval'));
  assert.match(view, /renderWorkoutFeedbackPage/);
  assert.match(view, /feedback-discard-confirm/);
  assert.match(styles, /body\.workout-active \.topbar/);
  assert.match(styles, /\.workout-page[\s\S]*min-height:100svh/);
});
test('all inline application scripts parse as JavaScript', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) if (match[1].trim()) new vm.Script(match[1]);
});

test('reset clears the active timer and pending session before returning to onboarding', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const storeSource = fs.readFileSync(path.join(root, 'pending-session-store.js'), 'utf8');
  const storageHelpers = html.match(/let storageFailureNotified=false;[\s\S]*?function clearPendingSession\(\)\{[^\r\n]*\}/)?.[0];
  const persistTimer = html.match(/function persistTimer\(\)\{[^\r\n]*\}/)?.[0];
  const resetApp = html.match(/function resetApp\(\){[^\r\n]*\}/)?.[0];
  assert.ok(storageHelpers);
  assert.ok(persistTimer);
  assert.ok(resetApp);

  const values = new Map([
    ['scirun.activeTimer', '{"level":0}'],
    ['scirun.pendingSession', '{"id":"pending"}'],
    ['scirun.state', '{"profile":{"age":"30-39"}}'],
    ['scirun.preImportBackup', '{"keys":{"scirun.state":"older"}}'],
  ]);
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  let stopped = false;
  let cacheClears = 0;
  let activeView = null;
  const context = {
    localStorage: storage,
    TIMER_STORAGE_KEY: 'scirun.activeTimer',
    currentTimer: { index: 0 },
    pendingSession: { id: 'pending' },
    window: { SciRunNative: { isNative: true, clearBackupCache: async () => { cacheClears++; } } },
    confirm: () => true,
    t: key => key,
    stopTimerInterval: () => { stopped = true; },
    loadState: () => ({ profile: null, level: 0, history: [] }),
    setupForm: () => {},
    updateStorageRecoveryNotice: () => {},
    updatePreImportAction: () => {},
    showView: view => { activeView = view; },
    toast: () => {},
    lang: 'ro',
  };
  vm.createContext(context);
  vm.runInContext(storeSource, context);
  vm.runInContext(storageHelpers, context);
  vm.runInContext(persistTimer, context);
  vm.runInContext(resetApp, context);
  context.resetApp();

  assert.equal(stopped, true);
  assert.equal(context.currentTimer, null);
  assert.equal(context.pendingSession, null);
  assert.equal(values.has('scirun.activeTimer'), false);
  assert.equal(values.has('scirun.pendingSession'), false);
  assert.equal(values.has('scirun.state'), false);
  assert.equal(values.has('scirun.preImportBackup'), false);
  assert.equal(cacheClears, 1);
  assert.equal(activeView, 'onboarding');
});

test('timer restoration discards invalid snapshots and still resumes a valid timer', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const timerSource = fs.readFileSync(path.join(root, 'timer-core.js'), 'utf8');
  const storageHelpers = html.match(/let storageFailureNotified=false;[\s\S]*?function clearPendingSession\(\)\{[^\r\n]*\}/)?.[0];
  const restoreTimer = html.match(/function restoreTimer\(\){[^\r\n]*\}/)?.[0];
  assert.ok(storageHelpers);
  assert.ok(restoreTimer);

  function runRestore(rawTimer, hasProfile = true) {
    const values = new Map();
    if (rawTimer !== null) values.set('scirun.activeTimer', rawTimer);
    const notices = [];
    let rendered = 0;
    let intervalDelay = null;
    const context = {
      STAGES: Array.from({ length: 15 }, () => ({})),
      state: { profile: hasProfile ? {} : null, history: [] },
      stateStorageReadFailed: false,
      stateStorageCorrupt: false,
      TIMER_STORAGE_KEY: 'scirun.activeTimer',
      localStorage: {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
      },
      toast: message => notices.push(message),
      renderWorkoutPage: () => { rendered += 1; },
      tickTimer: () => {},
      setInterval: (callback, delay) => { intervalDelay = delay; return 7; },
      lang: 'en',
    };
    vm.createContext(context);
    vm.runInContext(timerSource, context);
    vm.runInContext(storageHelpers, context);
    vm.runInContext(restoreTimer, context);
    context.restoreTimer();
    return { context, values, notices, rendered: () => rendered, intervalDelay: () => intervalDelay };
  }

  for (const raw of ['{broken json', JSON.stringify({ level: 0 })]) {
    const result = runRestore(raw);
    assert.equal(result.values.has('scirun.activeTimer'), false);
    assert.equal(result.context.currentTimer, null);
    assert.equal(result.notices.length, 1);
    assert.equal(result.rendered(), 0);
  }

  const validTimer = JSON.stringify({
    level: 0,
    segments: [{ type: 'run', seconds: 60 }],
    index: 0,
    segmentEnd: Date.now() + 60_000,
    remaining: 60,
    paused: false,
    total: 60,
    elapsed: 0,
  });
  const missingProfile = runRestore(validTimer, false);
  assert.equal(missingProfile.values.has('scirun.activeTimer'), false);
  assert.equal(missingProfile.context.currentTimer, null);
  assert.equal(missingProfile.notices.length, 1);

  const resumed = runRestore(validTimer);
  assert.equal(resumed.values.has('scirun.activeTimer'), true);
  assert.equal(resumed.context.currentTimer.level, 0);
  assert.equal(resumed.context.workoutMode, 'timer');
  assert.equal(resumed.rendered(), 1);
  assert.equal(resumed.intervalDelay(), 250);
  assert.equal(resumed.notices.length, 0);
});

test('loadState normalizes malformed persisted fields while preserving valid profile and history data', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const loadState = html.match(/function loadState\(\)\{[^\r\n]*\}/)?.[0];
  assert.ok(loadState);

  const stored = {
    profile: { age: '30-39', trainingDays: { invalid: true } },
    level: 99,
    history: [
      { id: 'valid', date: '2026-11-03', level: 2, status: 'done' },
      null,
      { id: 'bad-date', date: 'yesterday', level: 1, status: 'done' },
      { id: 'bad-level', date: '2026-11-02', level: 99, status: 'done' },
      ['not', 'a', 'session'],
    ],
    easyStreak: -2,
    moderateStreak: '3',
    hardStreak: 1.5,
    reduceNext: 'false',
    goalReached: 1,
  };
  const context = {
    STAGES: Array.from({ length: 15 }, () => ({})),
    localStorage: { getItem: () => JSON.stringify(stored) },
  };
  vm.createContext(context);
  vm.runInContext(loadState, context);
  const state = context.loadState();

  assert.equal(state.profile.age, '30-39');
  assert.deepEqual(Array.from(state.profile.trainingDays), [1, 3, 5]);
  assert.equal(state.level, 0);
  assert.deepEqual(Array.from(state.history, session => session.id), ['valid']);
  assert.equal(state.easyStreak, 0);
  assert.equal(state.moderateStreak, 0);
  assert.equal(state.hardStreak, 0);
  assert.equal(state.reduceNext, false);
  assert.equal(state.goalReached, false);
  assert.equal(context.stateStorageCorrupt, true);
  assert.equal(context.stateRecoveryRaw, JSON.stringify(stored));
});

test('malformed main storage remains recoverable and cannot be overwritten at startup', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const loadState = html.match(/function loadState\(\)\{[^\r\n]*\}/)?.[0];
  const saveState = html.match(/function saveState\(\)\{[^\r\n]*\}/)?.[0];
  assert.ok(loadState && saveState);
  let writes = 0;
  const context = {
    STAGES: Array.from({ length: 15 }, () => ({})),
    localStorage: { getItem: () => '{broken-history' },
    stateStorageReadFailed: false, stateStorageCorrupt: false, stateRecoveryRaw: null,
    state: { profile: null, history: [] },
    storageSet: () => { writes++; return true; },
    notifyStorageFailure: () => {},
  };
  vm.createContext(context);
  vm.runInContext(loadState + '\n' + saveState, context);
  assert.equal(context.loadState().history.length, 0);
  assert.equal(context.stateStorageCorrupt, true);
  assert.equal(context.stateRecoveryRaw, '{broken-history');
  assert.equal(context.saveState(), false);
  assert.equal(writes, 0);
});

test('corrupt state is quarantined from rendering while its raw bytes remain exportable', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const startup = html.match(/let state = loadState\(\);\r?\n[^\r\n]*\r?\n[^\r\n]*/)?.[0];
  assert.ok(startup);
  const raw = '{"history":[{"status":"<img onerror=alert(1)>"}]}';
  const unsafe = { profile: { age: '<img src=x onerror=alert(1)>' }, history: [
    { status: '<img onerror=alert(1)>', date: '2026-11-03', level: 0 } ] };
  const context = {
    stateStorageReadFailed: false, stateStorageCorrupt: false, stateRecoveryRaw: null,
    storageGet: () => raw, loadState: () => unsafe, STAGES: [{}],
    SciRunStateBackup: { parse: () => { throw new Error('invalid'); } },
  };
  vm.createContext(context);
  vm.runInContext(startup, context);
  assert.equal(vm.runInContext('state.profile', context), null);
  assert.equal(vm.runInContext('state.history.length', context), 0);
  assert.equal(context.stateStorageCorrupt, true);
  assert.equal(context.stateRecoveryRaw, raw);
});

test('browser backup download attaches the link and defers object URL cleanup', async () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const shareBackupText = html.match(/async function shareBackupText\([^\r\n]*\}/)?.[0];
  assert.ok(shareBackupText);

  const events = [];
  const anchor = {
    href: '',
    download: '',
    click: () => events.push('click'),
    remove: () => events.push('remove'),
  };
  let createdBlob = null;
  let revokeCallback = null;
  const context = {
    window: {},
    Blob: class {
      constructor(parts, options) { createdBlob = { parts, options }; }
    },
    URL: {
      createObjectURL: blob => { assert.ok(blob); events.push('create-url'); return 'blob:scirun-export'; },
      revokeObjectURL: url => events.push('revoke:' + url),
    },
    document: {
      createElement: tag => { assert.equal(tag, 'a'); events.push('create-anchor'); return anchor; },
      body: { appendChild: node => { assert.equal(node, anchor); events.push('append'); } },
    },
    setTimeout: (callback, delay) => { revokeCallback = callback; events.push('schedule:' + delay); return 1; },
  };
  vm.createContext(context);
  vm.runInContext(shareBackupText, context);
  await context.shareBackupText('{"history":[]}', 'scirun5k-personal-data.json');

  assert.equal(anchor.href, 'blob:scirun-export');
  assert.equal(anchor.download, 'scirun5k-personal-data.json');
  assert.equal(createdBlob.options.type, 'application/json');
  assert.deepEqual(JSON.parse(createdBlob.parts[0]), { history: [] });
  assert.deepEqual(events, ['create-url', 'create-anchor', 'append', 'click', 'remove', 'schedule:1000']);
  assert.equal(typeof revokeCallback, 'function');
  assert.equal(events.some(event => event.startsWith('revoke:')), false);

  revokeCallback();
  assert.equal(events.at(-1), 'revoke:blob:scirun-export');
});

test('service worker fetches fresh responses, updates cache, and falls back offline', async () => {
  const source = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const handlers = {};
  const entries = new Map();
  const cache = {
    put: async (request, response) => {
      entries.set(typeof request === 'string' ? request : request.url, response);
    },
  };
  const context = {
    self: {
      location: { origin: 'https://scirun.test' },
      addEventListener: (name, handler) => { handlers[name] = handler; },
    },
    caches: {
      open: async () => cache,
      match: async request => entries.get(typeof request === 'string' ? request : request.url) || null,
    },
    fetch: async () => { throw new Error('network unavailable'); },
    URL,
    Response: { error: () => ({ error: true }) },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const request = { method: 'GET', url: 'https://scirun.test/index.html', mode: 'navigate' };
  const dispatch = request => {
    let response = null;
    handlers.fetch({ request, respondWith: promise => { response = promise; } });
    return response;
  };

  const freshResponse = { ok: true, version: 'fresh', clone: () => ({ version: 'cached-fresh' }) };
  context.fetch = async () => freshResponse;
  assert.equal(await dispatch(request), freshResponse);
  assert.equal(entries.get(request.url).version, 'cached-fresh');

  context.fetch = async () => { throw new Error('offline'); };
  assert.equal(await dispatch(request), entries.get(request.url));

  const offlineIndex = { version: 'offline-index' };
  entries.set('./index.html', offlineIndex);
  assert.equal(await dispatch({ method: 'GET', url: 'https://scirun.test/other-route', mode: 'navigate' }), offlineIndex);

  const offlineAsset = await dispatch({ method: 'GET', url: 'https://scirun.test/missing.js', mode: 'no-cors' });
  assert.equal(offlineAsset.error, true);

  let postIntercepted = false;
  handlers.fetch({ request: { method: 'POST', url: 'https://scirun.test/api', mode: 'cors' }, respondWith: () => { postIntercepted = true; } });
  assert.equal(postIntercepted, false);
});

test('local storage quota errors are reported without throwing from state and timer persistence', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const helpers = html.match(/let storageFailureNotified=false;[\s\S]*?function clearPendingSession\(\)\{[^\r\n]*\}/)?.[0];
  const saveState = html.match(/function saveState\(\)\{[^\r\n]*\}/)?.[0];
  const persistTimer = html.match(/function persistTimer\(\)\{[^\r\n]*\}/)?.[0];
  assert.ok(helpers);
  assert.ok(saveState);
  assert.ok(persistTimer);

  const notices = [];
  const context = {
    lang: 'ro',
    stateStorageReadFailed: false,
    stateStorageCorrupt: false,
    state: { profile: null, level: 0, history: [] },
    TIMER_STORAGE_KEY: 'scirun.activeTimer',
    currentTimer: { level: 0 },
    localStorage: {
      setItem: () => { throw new Error('quota exceeded'); },
      removeItem: () => { throw new Error('storage unavailable'); },
    },
    toast: message => notices.push(message),
  };
  vm.createContext(context);
  vm.runInContext(helpers + '\n' + saveState + '\n' + persistTimer, context);

  assert.equal(context.saveState(), false);
  assert.equal(context.persistTimer(), false);
  context.currentTimer = null;
  assert.equal(context.persistTimer(), false);
  assert.equal(notices.length, 1);
  assert.match(notices[0], /plină|indisponibilă/i);
});

test('saveFeedback rolls back in-memory progress and preserves feedback when storage fails', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const saveFeedback = html.match(/function saveFeedback\(\)\{[\s\S]*?\}\r?\nfunction openManualGoal/)?.[0]?.replace(/\r?\nfunction openManualGoal$/, '');
  assert.ok(saveFeedback);

  const feedbackError = { textContent: '' };
  const pending = { id: 'pending-1', level: 0, completion: 1, completedNaturally: true, elapsed: 120 };
  const context = {
    pendingSession: pending,
    state: { profile: {}, level: 0, history: [], easyStreak: 0, moderateStreak: 0, hardStreak: 0, reduceNext: false },
    selectedEffort: 'easy',
    selectedRatio: 1,
    STAGES: [{}, {}],
    SciRunTimerCore: { isFullSession: () => true },
    nextScheduledDate: () => new Date('2026-11-03T00:00:00Z'),
    getWeekNumber: () => 1,
    dateKey: () => '2026-11-03',
    saveState: () => false,
    storageFailureText: () => 'storage-error',
    t: key => key,
    $: () => feedbackError,
    alert: () => {},
  };
  vm.createContext(context);
  vm.runInContext(saveFeedback, context);
  context.saveFeedback();

  assert.equal(context.state.history.length, 0);
  assert.equal(context.state.easyStreak, 0);
  assert.equal(context.pendingSession.id, 'pending-1');
  assert.equal(feedbackError.textContent, 'storage-error');
});

test('pending session store reports quota failures instead of throwing', () => {
  const storeContext = {};
  vm.createContext(storeContext);
  vm.runInContext(fs.readFileSync(path.join(root, 'pending-session-store.js'), 'utf8'), storeContext);
  const store = storeContext.SciRunPendingSessionStore;
  const storage = {
    getItem: () => '{broken json',
    setItem: () => { throw new Error('quota exceeded'); },
    removeItem: () => { throw new Error('storage unavailable'); },
  };
  const session = { id: 'session-2', level: 1, completion: 0.5, elapsed: 120, completedNaturally: false };

  assert.equal(store.save(session, storage), false);
  assert.equal(store.clear(storage), false);
  assert.equal(store.load(storage), null);
});

test('profile and manual goal changes roll back when storage refuses the write', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const saveProfile = html.match(/function saveProfile\(\)\{[^\r\n]*\}/)?.[0];
  const openManualGoal = html.match(/function openManualGoal\(\)\{[^\r\n]*\}/)?.[0];
  assert.ok(saveProfile);
  assert.ok(openManualGoal);

  const previousProfile = { age: '30-39' };
  const fields = {
    onboardError: { textContent: '' },
    closeGoal: {},
    cancelGoal: {},
    confirmGoal: {},
    goalCheck: { checked: true },
    goalError: { textContent: '' },
  };
  const context = {
    state: { profile: previousProfile, level: 4, history: [], goalReached: false },
    readProfile: () => ({ safetyAck: true, trainingDays: [1, 3, 5], runStatus: 'known', runMinutes: 4 }),
    selectSpacedDays: days => days,
    dateKey: () => '2026-11-03',
    stageForRunMinutes: () => 2,
    saveState: () => false,
    storageFailureText: () => 'storage-error',
    $: id => fields[id],
    t: key => key,
    openModal: () => {},
    closeModal: () => {},
    showView: () => {},
    renderAll: () => {},
    toast: () => {},
    lang: 'en',
  };
  vm.createContext(context);
  vm.runInContext(saveProfile, context);
  vm.runInContext(openManualGoal, context);

  assert.equal(context.saveProfile(), false);
  assert.equal(context.state.profile, previousProfile);
  assert.equal(context.state.level, 4);
  assert.equal(fields.onboardError.textContent, 'storage-error');

  context.openManualGoal();
  fields.confirmGoal.onclick();
  assert.equal(context.state.goalReached, false);
});
test('startup preference reads tolerate inaccessible local storage', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const storageGet = html.match(/function storageGet\(key\)\{[^\r\n]*\}/)?.[0];
  assert.ok(storageGet);
  const context = { localStorage: { getItem: () => { throw new Error('storage unavailable'); } } };
  vm.createContext(context);
  vm.runInContext(storageGet, context);
  assert.equal(context.storageGet('scirun.lang'), null);
  assert.match(html, /let lang = storageGet\('scirun\.lang'\) === 'en' \? 'en' : 'ro';/);
  assert.match(html, /soundEnabled = storageGet\('scirun\.timerSound'\) === 'true'/);
  assert.match(html, /const savedTheme=storageGet\('scirun\.theme'\)/);
  assert.match(html, /if\(!storageGet\('scirun\.theme'\)\)/);
});

test('abandon keeps the workout in memory when storage cleanup fails', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const helpers = html.match(/let storageFailureNotified=false;[\s\S]*?function clearPendingSession\(\)\{[^\r\n]*\}/)?.[0];
  const abandonWorkout = html.match(/function abandonWorkout\(\)\{[^\r\n]*\}/)?.[0];
  assert.ok(helpers);
  assert.ok(abandonWorkout);
  const active = { level: 1 };
  const pending = { id: 'pending-3' };
  function makeContext(failPending, failTimer) {
    const notices = [];
    let stopped = 0, shown = 0, rendered = 0, pendingClearCalls = 0;
    const context = {
      localStorage: { removeItem: key => { if (failTimer && key === 'scirun.activeTimer') throw new Error('storage unavailable'); } },
      SciRunPendingSessionStore: { clear: () => { pendingClearCalls++; return failPending ? false : true; } },
      TIMER_STORAGE_KEY: 'scirun.activeTimer', lang: 'en', storageFailureNotified: false,
      stateStorageCorrupt: false,
      currentTimer: active, pendingSession: pending, workoutMode: 'abandon-confirm', workoutReturnView: 'dashboard',
      toast: message => notices.push(message), stopTimerInterval: () => { stopped++; },
      showView: () => { shown++; }, renderAll: () => { rendered++; },
    };
    vm.createContext(context);
    vm.runInContext(helpers + '\n' + abandonWorkout, context);
    return { context, notices, stopped: () => stopped, shown: () => shown, rendered: () => rendered, pendingClearCalls: () => pendingClearCalls };
  }
  for (const failures of [[true, false], [false, true]]) {
    const scenario = makeContext(...failures);
    assert.equal(scenario.context.abandonWorkout(), false);
    assert.equal(scenario.context.currentTimer, active);
    assert.equal(scenario.context.pendingSession, pending);
    assert.equal(scenario.context.workoutMode, 'abandon-confirm');
    assert.equal(scenario.stopped(), 0);
    assert.equal(scenario.shown(), 0);
    assert.equal(scenario.rendered(), 0);
    assert.equal(scenario.notices.length, 1);
    assert.equal(scenario.pendingClearCalls(), failures[1] ? 0 : 1);
  }
  const scenario = makeContext(false, false);
  assert.equal(scenario.context.abandonWorkout(), true);
  assert.equal(scenario.context.currentTimer, null);
  assert.equal(scenario.context.pendingSession, null);
  assert.equal(scenario.context.workoutMode, 'timer');
  assert.equal(scenario.stopped(), 1);
  assert.equal(scenario.shown(), 1);
  assert.equal(scenario.rendered(), 1);
  assert.equal(scenario.pendingClearCalls(), 1);
});

test('state read failures preserve saved sessions and block overwriting until a successful read', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const loadState = html.match(/function loadState\(\)\{[^\r\n]*\}/)?.[0];
  const saveState = html.match(/function saveState\(\)\{[^\r\n]*\}/)?.[0];
  const restorePendingSession = html.match(/function restorePendingSession\(\)\{[^\r\n]*\}/)?.[0];
  const restoreTimer = html.match(/function restoreTimer\(\)\{[^\r\n]*\}/)?.[0];
  assert.ok(loadState);
  assert.ok(saveState);
  assert.ok(restorePendingSession);
  assert.ok(restoreTimer);
  assert.match(html, /let stateStorageReadFailed=false;let stateStorageCorrupt=false;let stateRecoveryRaw=null;\s+let state = loadState\(\);/);

  let reads = 0, writes = 0, pendingLoads = 0, pendingClears = 0, removals = 0, notices = 0;
  const context = {
    stateStorageReadFailed: false,
    stateStorageCorrupt: false,
    state: {},
    TIMER_STORAGE_KEY: 'scirun.activeTimer',
    localStorage: {
      getItem: () => { reads++; throw new Error('storage unavailable'); },
    },
    storageSet: () => { writes++; return true; },
    storageRemove: () => { removals++; return true; },
    notifyStorageFailure: () => { notices++; },
    SciRunPendingSessionStore: { load: () => { pendingLoads++; return { id: 'pending-preserved' }; } },
    clearPendingSession: () => { pendingClears++; return true; },
    showWorkoutFeedback: () => {},
    toast: () => {},
  };
  vm.createContext(context);
  vm.runInContext(loadState + '\n' + saveState + '\n' + restorePendingSession + '\n' + restoreTimer, context);

  assert.equal(context.loadState().profile, null);
  assert.equal(context.stateStorageReadFailed, true);
  assert.equal(context.saveState(), false);
  assert.equal(context.restorePendingSession(), false);
  context.restoreTimer();
  assert.equal(reads, 1);
  assert.equal(writes, 0);
  assert.equal(pendingLoads, 0);
  assert.equal(pendingClears, 0);
  assert.equal(removals, 0);
  assert.ok(notices > 0);

  context.localStorage.getItem = () => null;
  assert.equal(context.loadState().profile, null);
  assert.equal(context.stateStorageReadFailed, false);
  assert.equal(context.saveState(), true);
  assert.equal(writes, 1);
});

test('reset rolls back saved data and leaves the app unchanged when cleanup fails', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const storeSource = fs.readFileSync(path.join(root, 'pending-session-store.js'), 'utf8');
  const helpers = html.match(/let storageFailureNotified=false;[\s\S]*?function clearPendingSession\(\)\{[^\r\n]*\}/)?.[0];
  const resetApp = html.match(/function resetApp\(\)\{[^\r\n]*\}/)?.[0];
  assert.ok(helpers);
  assert.ok(resetApp);

  const initial = [
    ['scirun.state', '{"profile":{"age":"30-39"}}'],
    ['scirun.activeTimer', '{"level":0}'],
    ['scirun.pendingSession', '{"id":"pending"}'],
  ];
  function run(failRemovalKey = null, failReadKey = null) {
    const values = new Map(initial);
    let removeCalls = 0, stopped = 0, activeView = null, setupCalls = 0, loads = 0;
    const notices = [];
    const savedState = { profile: { age: '30-39' }, level: 2, history: [] };
    const activeTimer = { index: 0 };
    const pending = { id: 'pending' };
    const context = {
      localStorage: {
        getItem: key => { if (key === failReadKey) throw new Error('storage unavailable'); return values.get(key) ?? null; },
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => { removeCalls++; if (key === failRemovalKey) throw new Error('storage unavailable'); values.delete(key); },
      },
      TIMER_STORAGE_KEY: 'scirun.activeTimer', stateStorageReadFailed: false,
      stateStorageCorrupt: false,
      currentTimer: activeTimer, pendingSession: pending, state: savedState,
      confirm: () => true, t: key => key, lang: 'ro',
      stopTimerInterval: () => { stopped++; },
      loadState: () => { loads++; return { profile: null, level: 0, history: [] }; },
      updateStorageRecoveryNotice: () => {},
      updatePreImportAction: () => {},
      setupForm: () => { setupCalls++; },
      showView: view => { activeView = view; },
      toast: message => notices.push(message),
    };
    vm.createContext(context);
    vm.runInContext(storeSource, context);
    vm.runInContext(helpers + '\n' + resetApp, context);
    const result = context.resetApp();
    return { result, values, context, savedState, activeTimer, pending, notices, removeCalls: () => removeCalls, stopped: () => stopped, activeView: () => activeView, setupCalls: () => setupCalls, loads: () => loads };
  }

  for (const key of ['scirun.activeTimer', 'scirun.pendingSession', 'scirun.state']) {
    const scenario = run(key);
    assert.equal(scenario.result, false);
    assert.equal(scenario.values.size, initial.length);
    for (const [key, value] of initial) assert.equal(scenario.values.get(key), value);
    assert.equal(scenario.context.state, scenario.savedState);
    assert.equal(scenario.context.currentTimer, scenario.activeTimer);
    assert.equal(scenario.context.pendingSession, scenario.pending);
    assert.equal(scenario.stopped(), 0);
    assert.equal(scenario.activeView(), null);
    assert.equal(scenario.setupCalls(), 0);
    assert.equal(scenario.loads(), 0);
    assert.equal(scenario.notices.length, 1);
  }

  const readFailure = run(null, 'scirun.pendingSession');
  assert.equal(readFailure.result, false);
  assert.equal(readFailure.values.size, initial.length);
  for (const [key, value] of initial) assert.equal(readFailure.values.get(key), value);
  assert.equal(readFailure.removeCalls(), 0);
  assert.equal(readFailure.context.state, readFailure.savedState);
  assert.equal(readFailure.notices.length, 1);
});


test('backup import validates exported state and sanitizes history fields', () => {
  const backupContext = {};
  vm.createContext(backupContext);
  vm.runInContext(fs.readFileSync(path.join(root, 'state-backup.js'), 'utf8'), backupContext);
  const profile = {
    age: '30-39', sex: '', runStatus: 'none', runMinutes: 0, steps: null,
    trainingDays: [1, 3, 5], safetyAck: true, startDate: '2026-11-03',
    ignoredField: '<script>not persisted</script>',
  };
  const saved = {
    profile, level: 2,
    history: [{
      id: 123, date: '2026-11-03', level: 2, status: 'done', effort: 'easy',
      completion: 1, timerCompletion: 1, elapsed: 600, week: 1,
      completedAt: '2026-11-03T12:00:00.000Z',
      ignoredField: '<script>not persisted</script>',
    }],
    easyStreak: 1, moderateStreak: 0, hardStreak: 0, reduceNext: false, goalReached: false,
  };
  const imported = backupContext.SciRunStateBackup.parse(JSON.stringify(saved), 15);
  assert.deepEqual(JSON.parse(JSON.stringify(imported)), {
    profile: {
      age: '30-39', sex: '', runStatus: 'none', runMinutes: 0, steps: null,
      trainingDays: [1, 3, 5], safetyAck: true, startDate: '2026-11-03',
      sessionsPerWeek: 3, walkSpeed: null, runSpeed: null,
      firstSessionFeedbackDone: false,
    },
    level: 2, blackoutDates: [],
    history: [{
      id: 123, date: '2026-11-03', level: 2, status: 'done', effort: 'easy',
      completion: 1, timerCompletion: 1, elapsed: 600, week: 1,
      completedAt: '2026-11-03T12:00:00.000Z',
    }],
    easyStreak: 1, moderateStreak: 0, hardStreak: 0, reduceNext: false, goalReached: false,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(
    backupContext.SciRunStateBackup.parse(JSON.stringify({ profile: null, level: 0, history: [] }), 15),
  )), {
    profile: null, level: 0, history: [], blackoutDates: [],
    easyStreak: 0, moderateStreak: 0, hardStreak: 0, reduceNext: false, goalReached: false,
  });
});

test('backup import rejects malformed, unsafe, or structurally incomplete data', () => {
  const backupContext = {};
  vm.createContext(backupContext);
  vm.runInContext(fs.readFileSync(path.join(root, 'state-backup.js'), 'utf8'), backupContext);
  const profile = {
    age: '30-39', sex: '', runStatus: 'none', runMinutes: 0, steps: null,
    trainingDays: [1, 3, 5], safetyAck: true, startDate: '2026-11-03',
  };
  const valid = { profile, level: 2, history: [] };
  const invalidBackups = [
    '{broken json',
    JSON.stringify({ profile, level: 99, history: [] }),
    JSON.stringify({ ...valid, profile: { ...profile, age: '<img src=x onerror=alert(1)>' } }),
    JSON.stringify({ ...valid, history: [{ date: '2026-02-30', level: 1 }] }),
    JSON.stringify({ ...valid, history: [{ date: '2026-11-03', level: 1, status: '<script>' }] }),
    JSON.stringify({ ...valid, easyStreak: -1 }),
    JSON.stringify({ ...valid, profile: null, history: [{ date: '2026-11-03', level: 1 }] }),
  ];

  for (const backup of invalidBackups) {
    assert.throws(
      () => backupContext.SciRunStateBackup.parse(backup, 15),
      /Invalid SciRun backup file/,
    );
  }
});

test('treadmill backup preserves real distances, speed feedback, temporary availability, and the 5 km achievement', () => {
  const backupContext = {};
  vm.createContext(backupContext);
  vm.runInContext(fs.readFileSync(path.join(root, 'state-backup.js'), 'utf8'), backupContext);
  const saved = {
    profile: {
      runStatus: 'known', runMinutes: 3, safetyAnswer: 'no',
      trainingDays: [1, 2, 3, 4], sessionsPerWeek: 4, startDate: '2026-11-03',
      walkSpeed: 4.5, runSpeed: 6.5, firstSessionFeedbackDone: true,
    },
    level: 4,
    history: [
      {
        id: 'partial-1', date: '2026-11-03', level: 3, status: 'partial', effort: 'hard',
        completion: 0.7, timerCompletion: 0.7, elapsed: 800, distanceKm: 1.42,
        runFeel: 'tooFast', walkFeel: 'right', skippedRunSeconds: 30, goalContinuous5k: false,
      },
      {
        id: 'goal-1', date: '2026-11-05', level: 4, status: 'done', effort: 'moderate',
        completion: 1, timerCompletion: 1, elapsed: 2400, distanceKm: 5.12,
        runFeel: null, walkFeel: null, skippedRunSeconds: 0, goalContinuous5k: true,
      },
    ],
    blackoutDates: ['2026-11-06', '2026-11-07', '2026-11-06'],
    easyStreak: 0, moderateStreak: 1, hardStreak: 0, reduceNext: false,
    goalReached: true, goalDate: '2026-11-05', achievementDistance: 5.12,
    lastPlanReason: 'Sesiune salvată.',
  };
  const restored = JSON.parse(JSON.stringify(backupContext.SciRunStateBackup.parse(JSON.stringify(saved), 15)));
  assert.deepEqual(restored.profile, saved.profile);
  assert.deepEqual(restored.history, saved.history);
  assert.deepEqual(restored.blackoutDates, ['2026-11-06', '2026-11-07']);
  assert.equal(restored.goalReached, true);
  assert.equal(restored.goalDate, '2026-11-05');
  assert.equal(restored.achievementDistance, 5.12);
  assert.equal(restored.lastPlanReason, 'Sesiune salvată.');
});

test('treadmill backup rejects unsafe schedules, impossible distances, and malformed availability data', () => {
  const backupContext = {};
  vm.createContext(backupContext);
  vm.runInContext(fs.readFileSync(path.join(root, 'state-backup.js'), 'utf8'), backupContext);
  const profile = {
    runStatus: 'known', runMinutes: 3, safetyAnswer: 'no',
    trainingDays: [1, 2, 3], sessionsPerWeek: 3, startDate: '2026-11-03',
    walkSpeed: 4.5, runSpeed: 6.5, firstSessionFeedbackDone: true,
  };
  const valid = { profile, level: 2, history: [] };
  const entry = { date: '2026-11-03', level: 2, status: 'done', distanceKm: 2.4 };
  const invalid = [
    { ...valid, profile: { ...profile, safetyAnswer: 'yes', safetyAck: true } },
    { ...valid, profile: { ...profile, sessionsPerWeek: 4 } },
    { ...valid, profile: { ...profile, sessionsPerWeek: 1 } },
    { ...valid, profile: { ...profile, sessionsPerWeek: 2.5 } },
    { ...valid, profile: { ...profile, trainingDays: [1, 1, 2] } },
    { ...valid, profile: { ...profile, walkSpeed: 10 } },
    { ...valid, profile: { ...profile, runSpeed: 2 } },
    { ...valid, history: [{ ...entry, distanceKm: -0.1 }] },
    { ...valid, history: [{ ...entry, distanceKm: 100.01 }] },
    { ...valid, history: [{ ...entry, distanceKm: '2.4' }] },
    { ...valid, history: [{ ...entry, runFeel: 'unknown' }] },
    { ...valid, history: [{ ...entry, skippedRunSeconds: -1 }] },
    { ...valid, history: [{ ...entry, goalContinuous5k: 'true' }] },
    { ...valid, blackoutDates: ['2026-02-30'] },
    { ...valid, blackoutDates: new Array(501).fill('2026-11-03') },
    { ...valid, goalDate: '2026-11-31' },
    { ...valid, achievementDistance: 4.99 },
  ];
  for (const saved of invalid) {
    assert.throws(
      () => backupContext.SciRunStateBackup.parse(JSON.stringify(saved), 15),
      /Invalid SciRun backup file/,
    );
  }
});


function experienceContext(overrides = {}) {
  const fixedNow = Date.parse('2026-11-03T09:00:00Z');
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow; }
  }
  const stages = [{ type:'interval', run:30, walk:90, reps:8, name:{ro:'Start',en:'Start'} },
    { type:'continuous', run:2700, walk:0, reps:1, name:{ro:'Final',en:'Final'} }];
  const context = {
    Date: FixedDate, Math, Number, JSON, Intl, Set,
    lang:'ro', I18N:{ro:{},en:{}}, STAGES:stages,
    state:{profile:{safetyAnswer:'no',runStatus:'known',runMinutes:3,startDate:'2026-11-03',
      trainingDays:[1,2,3],sessionsPerWeek:3,runSpeed:6.5,walkSpeed:4.5,firstSessionFeedbackDone:true},
      level:0,history:[],blackoutDates:[],easyStreak:0,moderateStreak:0,hardStreak:0,reduceNext:false,goalReached:false},
    resetApp:()=>true, importBackupFile:async()=>{}, togglePause:()=>{},
    buildSegments:(level,factor=1)=>[{type:'warmup',seconds:300},{type:'run',seconds:Math.round(stages[level].run*factor)},{type:'cooldown',seconds:300}],
    window:{addEventListener:()=>{}}, document:{querySelectorAll:()=>[]},
    localDay:(date)=>{const d=new FixedDate(date);d.setHours(0,0,0,0);return d;},
    dateKey:date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'),
    t:key=>key, pendingSession:null, currentTimer:null, selectedEffort:'moderate',
    selectedRatio:1, workoutMode:'timer', timerInterval:null, TIMER_STORAGE_KEY:'scirun.activeTimer',
    soundEnabled:false, workoutAudioContext:null, ...overrides,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,'timer-core.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'experience.js'),'utf8'),context);
  return context;
}

test('the current scheduler accepts consecutive available days and excludes logged or unavailable dates', () => {
  const context=experienceContext();
  assert.deepEqual(Array.from(context.recommendedDays()),[1,2,3]);
  context.state.blackoutDates=['2026-11-03','2026-11-04'];
  assert.equal(context.dateKey(context.nextScheduledDate()),'2026-11-09');
  context.state.history=[{date:'2026-11-09',status:'done'}];
  const dates=Array.from(context.planDates(2),context.dateKey);
  assert.deepEqual(dates,['2026-11-10','2026-11-11']);
  context.state.profile.trainingDays=[0,1,2,3,4,5,6];
  const spaced=Array.from(context.recommendedDays());
  assert.equal(spaced.length,3);
  assert.ok(spaced.every((day,i)=>((spaced[(i+1)%3]-day+7)%7)>=2));
});

test('editing a training profile keeps legacy personal fields and saved history', () => {
  const fields = {
    safetyAnswer: { value: 'no' }, sessionsPerWeek: { value: '3' },
    runStatus: { value: 'known' }, runMinutes: { value: '3' },
    scheduleError: { textContent: '' },
  };
  const context = experienceContext({
    $: id => fields[id],
    document: { querySelectorAll: selector => selector === '#dayChoices input:checked'
      ? [{ value: '1' }, { value: '3' }, { value: '5' }] : [] },
    saveState: () => true, renderAll: () => {}, showView: () => {}, toast: () => {},
    stageForRunMinutes: () => 0,
  });
  context.renderAll = () => {};
  context.showView = () => {};
  Object.assign(context.state.profile, { age: '30-39', sex: 'female', steps: 7000, safetyAck: true });
  context.state.history = [{ id: 'saved-session', date: '2026-11-02', status: 'done', level: 0 }];
  assert.equal(context.saveProfile(), true);
  assert.equal(context.state.profile.age, '30-39');
  assert.equal(context.state.profile.sex, 'female');
  assert.equal(context.state.profile.steps, 7000);
  assert.equal(context.state.profile.safetyAck, true);
  assert.equal(context.state.history[0].id, 'saved-session');
});

test('the final stage extends gradually toward 5 km at calibrated speed', () => {
  const context=experienceContext();
  context.state.level=1;
  assert.equal(context.buildSegments(1).find(s=>s.type==='run').seconds,2700);
  context.state.history=[{status:'done',level:1,effort:'moderate',longestRunSeconds:2700}];
  assert.equal(context.buildSegments(1).find(s=>s.type==='run').seconds,2730);
  context.state.history.push({status:'done',level:1,effort:'easy',longestRunSeconds:2730});
  assert.equal(context.buildSegments(1).find(s=>s.type==='run').seconds,2790);
  assert.equal(context.buildSegments(1,.8).find(s=>s.type==='run').seconds,2232);
});

test('a failed pending-session write preserves a recoverable active timer', () => {
  let persisted=0,rendered=0;
  const context=experienceContext({
    stopTimerInterval:()=>{}, workoutPosition:()=>({week:1,session:1}),newSessionId:()=> 'finished-1',
    savePendingSession:()=>false,persistTimer:()=>{persisted++;return true;},setInterval:()=>77,
    renderWorkoutPage:()=>{rendered++;},toast:()=>{},storageFailureText:()=> 'storage full'
  });
  context.currentTimer={level:0,segments:[{type:'run',seconds:60}],index:0,paused:false,
    segmentEnd:context.Date.now()-1000,remaining:0,total:60,elapsed:0,skippedSegments:0};
  context.endTimer(false);
  assert.ok(context.currentTimer);
  assert.equal(context.currentTimer.paused,true);
  assert.equal(context.pendingSession,null);
  assert.equal(persisted,1);
  assert.equal(rendered,1);
});

test('completed skipped workouts save real total distance without requiring a continuous 5 km claim', () => {
  const fields={actualDistance:{value:'5.20'},goalContinuous:{checked:false},feedbackError:{textContent:''}};
  const context=experienceContext({
    $:id=>fields[id],saveState:()=>true,clearPendingSession:()=>true,closeModal:()=>{},toast:()=>{},
    storageFailureText:()=> 'storage full'
  });
  context.pendingSession={id:'skipped-done',level:0,completedNaturally:true,completion:.5,
    elapsed:1000,week:1,scheduledDate:'2026-11-03',skippedRunSeconds:30,longestRunSeconds:30};
  context.renderAll=()=>{};
  context.showView=()=>{};
  context.saveFeedback();
  assert.equal(context.state.history.length,1);
  assert.equal(context.state.history[0].status,'done');
  assert.equal(context.state.history[0].completion,1);
  assert.equal(context.state.history[0].distanceKm,5.2);
  assert.equal(context.state.goalReached,false);
  assert.equal(context.pendingSession,null);
});

test('a finished workout with skipped running stays in history without advancing training', () => {
  const fields={actualDistance:{value:'5.20'},goalContinuous:{checked:true},feedbackError:{textContent:''}};
  const context=experienceContext({
    $:id=>fields[id],saveState:()=>true,clearPendingSession:()=>true,closeModal:()=>{},toast:()=>{},
    storageFailureText:()=> 'storage full'
  });
  context.state.easyStreak=1;
  context.selectedEffort='easy';
  context.pendingSession={id:'skipped-easy',level:0,completedNaturally:true,completion:.5,
    elapsed:1000,week:1,scheduledDate:'2026-11-03',skippedRunSeconds:30,longestRunSeconds:30};
  context.renderAll=()=>{};
  context.showView=()=>{};
  context.saveFeedback();
  assert.equal(context.state.history[0].status,'done');
  assert.equal(context.state.history[0].skippedRunSeconds,30);
  assert.equal(context.state.level,0);
  assert.equal(context.state.easyStreak,0);
  assert.equal(context.state.profile.runSpeed,6.5);
  assert.equal(context.state.goalReached,false);
});

test('skipped running does not require or apply first-session speed calibration', () => {
  const fields={actualDistance:{value:'2.10'},goalContinuous:{checked:false},feedbackError:{textContent:''}};
  const context=experienceContext({
    $:id=>fields[id],saveState:()=>true,clearPendingSession:()=>true,closeModal:()=>{},toast:()=>{},
    storageFailureText:()=> 'storage full'
  });
  context.state.profile.firstSessionFeedbackDone=false;
  context.pendingSession={id:'skipped-calibration',level:0,completedNaturally:true,completion:.8,
    elapsed:1000,week:1,scheduledDate:'2026-11-03',skippedRunSeconds:30,longestRunSeconds:30};
  context.renderAll=()=>{};
  context.showView=()=>{};
  context.saveFeedback();
  assert.equal(context.state.history.length,1);
  assert.equal(context.state.history[0].runFeel,null);
  assert.equal(context.state.profile.firstSessionFeedbackDone,false);
  assert.equal(context.state.profile.runSpeed,6.5);
  assert.equal(fields.feedbackError.textContent,'');
});


test('workout renders share one wake lock and late requests release after leaving the workout', async () => {
  let active=false, requests=0, releases=0, resolveLock;
  const context=experienceContext({
    $: id => id === 'heroStartLabel' ? {} : null,
    document:{visibilityState:'visible',querySelectorAll:()=>[],documentElement:{dataset:{workoutPhase:'run'}},
      body:{classList:{toggle:(name,value)=>{if(name==='workout-active')active=value;},contains:()=>active}}},
    window:{addEventListener:()=>{},scrollTo:()=>{}},
    navigator:{wakeLock:{request:()=>{requests++;return new Promise(resolve=>{resolveLock=resolve;});}}}
  });
  context.showView('workout');
  context.showView('workout');
  assert.equal(requests,1);
  context.showView('dashboard');
  assert.equal(context.document.documentElement.dataset.workoutPhase,undefined);
  resolveLock({release:()=>{releases++;return Promise.resolve();},addEventListener:()=>{},released:false});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(releases,1);
  context.showView('workout');
  assert.equal(requests,2);
});


test('legacy pending workouts remain reportable before treadmill speeds have been calibrated', () => {
  const fields={actualDistance:{value:'2.10'},goalContinuous:{checked:false},feedbackError:{textContent:''}};
  const context=experienceContext({
    $:id=>fields[id],saveState:()=>true,clearPendingSession:()=>true,closeModal:()=>{},toast:()=>{},
    storageFailureText:()=> 'storage full'
  });
  context.state.profile.runSpeed=null;
  context.state.profile.walkSpeed=null;
  context.state.profile.firstSessionFeedbackDone=false;
  context.selectedEffort='easy';
  context.pendingSession={id:'legacy-done',level:0,completedNaturally:true,completion:1,
    elapsed:1000,week:1,scheduledDate:'2026-11-03'};
  context.renderAll=()=>{};
  context.showView=()=>{};
  context.saveFeedback();
  assert.equal(fields.feedbackError.textContent,'');
  assert.equal(context.state.history.length,1);
  assert.equal(context.state.profile.runSpeed,null);
  assert.equal(context.state.profile.walkSpeed,null);
  assert.equal(context.state.profile.firstSessionFeedbackDone,false);
});


test('workout visual colors anticipate the next phase without changing the timer', () => {
  const viewContext={};
  vm.createContext(viewContext);
  vm.runInContext(fs.readFileSync(path.join(root,'workout-view.js'),'utf8'),viewContext);
  const visual=viewContext.workoutVisualState;
  const run={type:'run',seconds:60},walk={type:'walk',seconds:60};
  assert.deepEqual(Array.from(visual(run,walk,11,false).rgb),[244,116,130]);
  assert.equal(visual(run,walk,11,false).anticipating,false);
  const ten=visual(run,walk,10,false);
  assert.equal(ten.mix,0);
  assert.equal(ten.anticipating,true);
  assert.equal(ten.imminent,false);
  const five=visual(run,walk,5,false);
  assert.equal(five.mix,.5);
  assert.equal(five.imminent,true);
  assert.notDeepEqual(Array.from(five.rgb),[244,116,130]);
  assert.notDeepEqual(Array.from(five.rgb),[88,214,161]);
  assert.equal(visual(run,walk,1,false).mix,.9);
  assert.deepEqual(Array.from(visual(run,walk,0,false).rgb),[88,214,161]);
  assert.equal(run.seconds,60);
  assert.equal(walk.seconds,60);
});

test('warm-up and cool-down use blue, while pause stays mint without urgency', () => {
  const viewContext={};
  vm.createContext(viewContext);
  vm.runInContext(fs.readFileSync(path.join(root,'workout-view.js'),'utf8'),viewContext);
  const visual=viewContext.workoutVisualState;
  for(const type of ['warmup','cooldown']){
    assert.deepEqual(Array.from(visual({type},null,1,false).rgb),type==='warmup'?[111,169,255]:[137,194,238]);
  }
  assert.deepEqual(Array.from(visual({type:'rest'},null,1,false).rgb),[86,220,196]);
  const paused=visual({type:'run'},{type:'walk'},2,true);
  assert.deepEqual(Array.from(paused.rgb),[86,220,196]);
  assert.equal(paused.phase,'rest');
  assert.equal(paused.mix,0);
  assert.equal(paused.imminent,false);
  const final=visual({type:'run'},null,1,false);
  assert.equal(final.mix,0);
  assert.equal(final.imminent,false);
});

test('workout phases read the selected palette without changing timer segments', () => {
  const values = {
    '--phase-run-rgb': '255, 101, 117',
    '--phase-walk-rgb': '103, 217, 148',
    '--phase-warmup-rgb': '111, 181, 255',
    '--phase-cooldown-rgb': '137, 210, 232',
    '--phase-rest-rgb': '238, 188, 147',
  };
  const viewContext = {
    document: { documentElement: {} },
    getComputedStyle: () => ({ getPropertyValue: key => values[key] || '' }),
  };
  vm.createContext(viewContext);
  vm.runInContext(fs.readFileSync(path.join(root, 'workout-view.js'), 'utf8'), viewContext);
  for (const [phase, expected] of [
    ['run', [255, 101, 117]], ['walk', [103, 217, 148]],
    ['warmup', [111, 181, 255]], ['cooldown', [137, 210, 232]],
    ['rest', [238, 188, 147]],
  ]) {
    assert.deepEqual(Array.from(viewContext.workoutPhaseRgb(phase)), expected);
  }
});


test('session progress includes warm-up, running, walking and cool-down stages', () => {
  const viewContext={};
  vm.createContext(viewContext);
  vm.runInContext(fs.readFileSync(path.join(root,'workout-view.js'),'utf8'),viewContext);
  const progress=viewContext.workoutSessionProgress;
  const segments=[{type:'warmup',seconds:10},{type:'run',seconds:20},{type:'walk',seconds:5},{type:'cooldown',seconds:10}];
  assert.deepEqual({...progress(segments,0,10)},{total:4,current:1,completed:0,within:0,value:0,percent:0});
  assert.equal(progress(segments,0,5).percent,12.5);
  assert.equal(progress(segments,1,10).percent,37.5);
  const walking=progress(segments,2,1);
  assert.equal(walking.current,3);
  assert.equal(walking.total,4);
  assert.equal(walking.percent,70);
  const final=progress(segments,3,0);
  assert.equal(final.current,4);
  assert.equal(final.percent,100);
  assert.equal(progress([],0,0).percent,0);
});
