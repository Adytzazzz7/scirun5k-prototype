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
  for (const asset of ['./icon-192.png', './icon-512.png', './timer-core.js', './pending-session-store.js', './dashboard-metrics.js', './workout-view.js', './liquid-glass.css', './app.css']) {
    assert.ok(worker.includes(asset), `${asset} is precached`);
    assert.equal(fs.existsSync(path.join(root, asset.slice(2))), true, asset);
  }
  assert.equal(worker.includes('./icons/'), false);
  assert.equal(manifest.theme_color, '#000000');
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
  assert.match(html, /if\(!restorePendingSession\(\)\)restoreTimer\(\)/);
  assert.match(html, /state\.history\.push\(\{id:pendingSession\.id\|\|Date\.now\(\)/);
  assert.match(html, /selectedEffort=pendingSession\.selectedEffort\|\|null/);
  assert.match(view, /pendingSession\.selectedEffort=selectedEffort;savePendingSession\(\)/);
  assert.match(view, /pendingSession\.selectedRatio=selectedRatio;savePendingSession\(\)/);
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
  assert.deepEqual({ ...metrics.confirmedCapacity(history, stages, false) }, {
    value: '30 min', minutes: 30, source: 'completed-session',
  });
  assert.equal(metrics.confirmedCapacity(history.slice(0, 3), stages, false), null);
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
  for (const control of ['workoutPause', 'workoutSound', 'workoutFinish', 'workoutAbandon']) assert.ok(view.includes(control), control);
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
  const persistTimer = html.match(/function persistTimer\(\)\{[^\r\n]*\}/)?.[0];
  const resetApp = html.match(/function resetApp\(\){[^\r\n]*\}/)?.[0];
  assert.ok(persistTimer);
  assert.ok(resetApp);

  const values = new Map([
    ['scirun.activeTimer', '{"level":0}'],
    ['scirun.pendingSession', '{"id":"pending"}'],
    ['scirun.state', '{"profile":{"age":"30-39"}}'],
  ]);
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  let stopped = false;
  let activeView = null;
  const context = {
    localStorage: storage,
    TIMER_STORAGE_KEY: 'scirun.activeTimer',
    currentTimer: { index: 0 },
    pendingSession: { id: 'pending' },
    confirm: () => true,
    t: key => key,
    stopTimerInterval: () => { stopped = true; },
    loadState: () => ({ profile: null, level: 0, history: [] }),
    setupForm: () => {},
    showView: view => { activeView = view; },
    toast: () => {},
    lang: 'ro',
  };
  vm.createContext(context);
  vm.runInContext(storeSource, context);
  vm.runInContext(persistTimer, context);
  vm.runInContext(resetApp, context);
  context.resetApp();

  assert.equal(stopped, true);
  assert.equal(context.currentTimer, null);
  assert.equal(context.pendingSession, null);
  assert.equal(values.has('scirun.activeTimer'), false);
  assert.equal(values.has('scirun.pendingSession'), false);
  assert.equal(values.has('scirun.state'), false);
  assert.equal(activeView, 'onboarding');
});

test('timer restoration discards invalid snapshots and still resumes a valid timer', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const timerSource = fs.readFileSync(path.join(root, 'timer-core.js'), 'utf8');
  const restoreTimer = html.match(/function restoreTimer\(\){[^\r\n]*\}/)?.[0];
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
});

test('exportData attaches the download link and defers object URL cleanup', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const exportData = html.match(/function exportData\(\)\{[^\r\n]*\}/)?.[0];
  assert.ok(exportData);

  const events = [];
  const state = { profile: { age: '30-39' }, history: [] };
  const anchor = {
    href: '',
    download: '',
    click: () => events.push('click'),
    remove: () => events.push('remove'),
  };
  let createdBlob = null;
  let revokeCallback = null;
  const context = {
    state,
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
    toast: message => events.push('toast:' + message),
    t: key => key,
  };
  vm.createContext(context);
  vm.runInContext(exportData, context);
  context.exportData();

  assert.equal(anchor.href, 'blob:scirun-export');
  assert.equal(anchor.download, 'scirun5k-personal-data.json');
  assert.equal(createdBlob.options.type, 'application/json');
  assert.equal(JSON.parse(createdBlob.parts[0]).profile.age, '30-39');
  assert.deepEqual(events, ['create-url', 'create-anchor', 'append', 'click', 'remove', 'schedule:1000', 'toast:exportDone']);
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
