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

test('requires both a natural timer finish and full feedback for a complete session', () => {
  assert.equal(core.isFullSession(false, 1), false);
  assert.equal(core.isFullSession(true, 0.75), false);
  assert.equal(core.isFullSession(true, 1), true);
});

test('PWA manifest and precache refer to existing root-level icons and timer code', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) {
    assert.equal(fs.existsSync(path.join(root, icon.src.replace(/^\.\//, ''))), true, icon.src);
  }
  const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  for (const asset of ['./icon-192.png', './icon-512.png', './timer-core.js', './dashboard-metrics.js', './workout-view.js', './liquid-glass.css', './app.css']) {
    assert.ok(worker.includes(asset), `${asset} is precached`);
    assert.equal(fs.existsSync(path.join(root, asset.slice(2))), true, asset);
  }
  assert.equal(worker.includes('./icons/'), false);
  assert.equal(manifest.theme_color, '#000000');
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



