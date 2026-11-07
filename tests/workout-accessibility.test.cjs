const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const workoutSource = fs.readFileSync(path.join(root, 'workout-view.js'), 'utf8');

function workoutHarness() {
  const elements = new Map();
  const document = { body: { id: 'body' }, activeElement: null, documentElement: { dataset: {} }, querySelectorAll: () => [] };
  document.activeElement = document.body;

  function element(id, attributes = {}) {
    const classes = new Set((attributes.class || '').split(/\s+/).filter(Boolean));
    return {
      id, attributes, isConnected: true, dataset: {}, textWrites: 0,
      classList: {
        contains: name => classes.has(name),
        toggle(name, force) {
          const shouldAdd = force === undefined ? !classes.has(name) : force;
          if (shouldAdd) classes.add(name); else classes.delete(name);
          return shouldAdd;
        },
      },
      style: { setProperty() {} },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return this.attributes[name] ?? null; },
      replaceWith(replacement) {
        this.isConnected = false;
        replacement.isConnected = true;
        elements.set(this.id, replacement);
      },
      querySelectorAll: () => [],
      addEventListener() {},
      focus() { document.activeElement = this; },
      get textContent() { return this._textContent || ''; },
      set textContent(value) { this._textContent = String(value); this.textWrites += 1; },
    };
  }

  const page = element('workout');
  page.contains = node => node !== page && node.isConnected && elements.get(node.id) === node;
  Object.defineProperty(page, 'innerHTML', {
    get() { return this._innerHTML || ''; },
    set(markup) {
      for (const node of elements.values()) node.isConnected = false;
      if (document.activeElement !== document.body && document.activeElement !== page) document.activeElement = document.body;
      elements.clear();
      this._innerHTML = markup;
      for (const match of markup.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
        const attributes = {};
        for (const attribute of match[0].matchAll(/([\w-]+)="([^"]*)"/g)) attributes[attribute[1]] = attribute[2];
        elements.set(match[1], element(match[1], attributes));
      }
    },
  });
  elements.set('workout', page);

  const now = 1_000_000;
  const timer = {
    level: 0, index: 0, paused: false, remaining: 60, segmentEnd: now + 60_000,
    total: 120, elapsed: 0,
    segments: [
      { type: 'warmup', seconds: 60, label: 'Warm-up', speed: 4 },
      { type: 'run', seconds: 60, label: 'Run', speed: 6 },
    ],
  };
  const context = {
    document,
    Date: class extends Date { static now() { return now; } },
    $: id => id === 'workout' ? page : elements.get(id) || null,
    showView() {},
    nextScheduledDate: () => '2026-11-06',
    getWeekNumber: () => 1,
    formatSeconds: value => `00:${String(Math.ceil(value)).padStart(2, '0')}`,
    lang: 'en',
    state: { history: [], profile: { runSpeed: 6, walkSpeed: 4, firstSessionFeedbackDone: true } },
    currentTimer: timer,
    pendingSession: null,
    workoutMode: 'timer',
    workoutReturnView: 'dashboard',
    selectedEffort: null,
    STAGES: [{ code: 'W1', name: { en: 'First workout', ro: 'Primul antrenament' } }],
    savePendingSession() {},
    saveFeedback() {},
    abandonWorkout() {},
    endTimer() {},
    t: key => key,
    togglePause() { timer.paused = !timer.paused; context.renderWorkoutPage(); },
    skipCurrentSegment() {
      timer.index += 1;
      timer.segmentEnd = now + timer.segments[timer.index].seconds * 1000;
      context.renderWorkoutPage();
    },
  };
  vm.createContext(context);
  vm.runInContext(workoutSource, context);
  return { context, document, page, timer, get: id => context.$(id) };
}

function ancestorRoles(markup, id) {
  const stack = [];
  const voidTags = new Set(['br', 'hr', 'img', 'input', 'link', 'meta', 'source']);
  for (const match of markup.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)) {
    const tag = match[1].toLowerCase();
    if (match[0].startsWith('</')) {
      while (stack.length && stack.pop().tag !== tag) {}
      continue;
    }
    const attributes = Object.fromEntries([...match[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(item => [item[1], item[2]]));
    if (attributes.id === id) return stack.map(item => item.role).filter(Boolean);
    if (!voidTags.has(tag) && !match[0].endsWith('/>')) stack.push({ tag, role: attributes.role });
  }
  return [];
}

test('pause and skip restore focus to the equivalent control after a workout rerender', () => {
  const { context, document, get } = workoutHarness();
  context.renderWorkoutPage();
  assert.equal(document.documentElement.dataset.workoutPhase, 'warmup');

  const originalPause = get('workoutPause');
  originalPause.focus();
  originalPause.onclick();
  assert.equal(document.documentElement.dataset.workoutPhase, 'warmup', 'pause keeps the real segment color');
  assert.notEqual(get('workoutPause'), originalPause);
  assert.equal(document.activeElement, get('workoutPause'));
  assert.equal(get('workoutAnnouncement').textContent, 'Paused');
  assert.equal(get('timerState').getAttribute('aria-live'), null);

  const originalSkip = get('workoutSkip');
  originalSkip.focus();
  originalSkip.onclick();
  assert.equal(document.documentElement.dataset.workoutPhase, 'run');
  assert.notEqual(get('workoutSkip'), originalSkip);
  assert.equal(document.activeElement, get('workoutSkip'));
});

test('ending from skip puts focus on the feedback heading when the control disappears', () => {
  const { context, document, get } = workoutHarness();
  context.renderWorkoutPage();
  const skip = get('workoutSkip');
  skip.focus();
  context.skipCurrentSegment = () => {
    context.currentTimer = null;
    context.pendingSession = { level: 0, week: 1, sessionNumber: 1, elapsed: 60, completion: 1, completedNaturally: true };
    context.renderWorkoutPage();
  };
  skip.onclick = context.skipCurrentSegment;
  skip.onclick();

  assert.equal(document.activeElement, get('workoutViewTitle'));
  assert.equal(get('workoutViewTitle').getAttribute('tabindex'), '-1');
});

test('phase and countdown announcements are outside image semantics and update only at meaningful boundaries', () => {
  const { context, page, timer, get } = workoutHarness();
  context.renderWorkoutPage();
  const live = get('workoutAnnouncement');
  assert.ok(live, 'a separate live status is rendered');
  assert.equal(live.getAttribute('role'), 'status');
  assert.equal(live.getAttribute('aria-atomic'), 'true');
  assert.ok(ancestorRoles(page.innerHTML, 'phaseCountdown').includes('img'));
  assert.ok(!ancestorRoles(page.innerHTML, 'workoutAnnouncement').includes('img'));
  assert.equal(get('currentInterval').getAttribute('aria-live'), null);
  assert.equal(get('phaseCountdown').getAttribute('aria-live'), null);

  const initialWrites = live.textWrites;
  context.updateWorkoutPage();
  context.updateWorkoutPage();
  assert.equal(live.textWrites, initialWrites, 'ordinary 250 ms ticks do not write to the live status');

  timer.segmentEnd = 1_009_800;
  context.updateWorkoutPage();
  assert.match(live.textContent, /In 10 seconds: Run/);
  const warningWrites = live.textWrites;
  context.updateWorkoutPage();
  timer.segmentEnd = 1_008_800;
  context.updateWorkoutPage();
  assert.equal(live.textWrites, warningWrites, 'the warning is announced once, not on each countdown tick');

  timer.index = 1;
  timer.segmentEnd = 1_060_000;
  context.renderWorkoutPage();
  assert.match(get('workoutAnnouncement').textContent, /Current interval: Run/);
});

test('a new workout announces its first phase after the previous session reaches feedback', () => {
  const { context, document, get, timer } = workoutHarness();
  context.renderWorkoutPage();
  assert.match(get('workoutAnnouncement').textContent, /Current interval: Warm-up/);
  context.currentTimer = null;
  context.pendingSession = { level: 0, week: 1, sessionNumber: 1, elapsed: 60, completion: 1, completedNaturally: true };
  context.renderWorkoutPage();
  assert.equal(document.documentElement.dataset.workoutPhase, undefined, 'feedback clears the phase background');
  context.pendingSession = null;
  context.currentTimer = timer;
  context.renderWorkoutPage();
  assert.match(get('workoutAnnouncement').textContent, /Current interval: Warm-up/);
});

test('the narrow workout glass control has an Android-sized touch height', () => {
  const css = fs.readFileSync(path.join(root, 'liquid-glass.css'), 'utf8');
  const narrow = css.match(/@media\(max-width:360px\)\{([^\r\n]*)/);
  assert.ok(narrow, 'the narrow workout breakpoint exists');
  const control = narrow[1].match(/\.glass-control\{([^}]*)\}/);
  assert.ok(control, 'the control has a narrow breakpoint rule');
  const minHeight = Number(control[1].match(/min-height:\s*(\d+)px/)?.[1]);
  assert.ok(minHeight >= 48, `expected at least 48px, got ${minHeight}px`);
});

test('skipped running does not ask for first-session speed calibration', () => {
  const complete = workoutHarness();
  complete.context.state.profile.firstSessionFeedbackDone = false;
  complete.context.currentTimer = null;
  complete.context.pendingSession = { level: 0, week: 1, sessionNumber: 1, elapsed: 60, completion: 1, completedNaturally: true, skippedRunSeconds: 0 };
  complete.context.renderWorkoutPage();
  assert.ok(complete.get('runPaceFeel'));
  assert.ok(complete.get('walkPaceFeel'));

  const skipped = workoutHarness();
  skipped.context.state.profile.firstSessionFeedbackDone = false;
  skipped.context.currentTimer = null;
  skipped.context.pendingSession = { level: 0, week: 1, sessionNumber: 1, elapsed: 60, completion: 1, completedNaturally: true, skippedRunSeconds: 30 };
  skipped.context.renderWorkoutPage();
  assert.equal(skipped.get('runPaceFeel'), null);
  assert.equal(skipped.get('walkPaceFeel'), null);
});
