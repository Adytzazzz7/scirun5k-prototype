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
  for (const asset of ['./icon-192.png', './icon-512.png', './timer-core.js']) {
    assert.ok(worker.includes(asset), `${asset} is precached`);
    assert.equal(fs.existsSync(path.join(root, asset.slice(2))), true, asset);
  }
  assert.equal(worker.includes('./icons/'), false);
});

