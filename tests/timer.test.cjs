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
  assert.match(html, /SciRunPendingSessionStore\.save\(pendingSession\)/);
  assert.match(html, /if\(!restorePendingSession\(\)\)restoreTimer\(\)/);
  assert.match(html, /state\.history\.push\(\{id:pendingSession\.id\|\|Date\.now\(\)/);
  assert.match(html, /selectedEffort=pendingSession\.selectedEffort\|\|null/);
  assert.match(view, /pendingSession\.selectedEffort=selectedEffort;SciRunPendingSessionStore\.save\(pendingSession\)/);
  assert.match(view, /pendingSession\.selectedRatio=selectedRatio;SciRunPendingSessionStore\.save\(pendingSession\)/);
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



