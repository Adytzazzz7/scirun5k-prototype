(() => {
  const RUN_STATUSES = new Set(['known', 'none', 'unknown']);
  const EFFORTS = new Set(['veryEasy', 'easy', 'moderate', 'hard', 'exhausted']);
  const FEELS = new Set(['tooSlow', 'right', 'tooFast']);
  const HISTORY_STATUSES = new Set(['done', 'partial']);
  const AGES = new Set(['18-29', '30-39', '40-49', '50-59', '60-69', '70+']);
  const SEXES = new Set(['', 'female', 'male', 'intersex']);
  function invalidBackup() { return new Error('Invalid SciRun backup file'); }
  function isRecord(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
  function isDateKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function validateProfile(profile) {
    if (profile === null) return null;
    const safetyAnswerValid = profile?.safetyAnswer === undefined
      ? profile?.safetyAck === true
      : profile.safetyAnswer === 'no' || profile.safetyAnswer === '';
    if (!isRecord(profile) || !RUN_STATUSES.has(profile.runStatus)
      || !Array.isArray(profile.trainingDays) || profile.trainingDays.length < 2
      || profile.trainingDays.length > 7
      || profile.trainingDays.some(day => !Number.isInteger(day) || day < 0 || day > 6)
      || new Set(profile.trainingDays).size !== profile.trainingDays.length
      || !isDateKey(profile.startDate)
      || !safetyAnswerValid) throw invalidBackup();
    const sessionsPerWeek = profile.sessionsPerWeek === undefined
      ? Math.min(3, profile.trainingDays.length) : profile.sessionsPerWeek;
    if (!Number.isInteger(sessionsPerWeek) || sessionsPerWeek < 2 || sessionsPerWeek > 4
      || sessionsPerWeek > profile.trainingDays.length) throw invalidBackup();
    const runIsValid = profile.runStatus === 'known'
      ? Number.isFinite(profile.runMinutes) && profile.runMinutes >= 0.1 && profile.runMinutes <= 180
      : profile.runStatus === 'none' ? profile.runMinutes === 0 : profile.runMinutes === null;
    if (!runIsValid) throw invalidBackup();
    if (profile.age !== undefined && !AGES.has(profile.age)) throw invalidBackup();
    if (profile.sex !== undefined && !SEXES.has(profile.sex)) throw invalidBackup();
    if (profile.steps !== undefined && profile.steps !== null
      && (!Number.isFinite(profile.steps) || profile.steps < 0 || profile.steps > 100000)) throw invalidBackup();
    for (const [key, min, max] of [['walkSpeed', 2, 9], ['runSpeed', 3, 16]]) {
      if (profile[key] !== undefined && profile[key] !== null
        && (!Number.isFinite(profile[key]) || profile[key] < min || profile[key] > max)) throw invalidBackup();
    }
    if (profile.firstSessionFeedbackDone !== undefined && typeof profile.firstSessionFeedbackDone !== 'boolean') throw invalidBackup();
    return {
      runStatus: profile.runStatus,
      runMinutes: profile.runMinutes,
      trainingDays: [...profile.trainingDays],
      sessionsPerWeek,
      ...(profile.safetyAnswer === 'no' || profile.safetyAnswer === '' ? { safetyAnswer: profile.safetyAnswer } : {}),
      ...(profile.safetyAnswer === undefined ? { safetyAck: true } : {}),
      startDate: profile.startDate,
      walkSpeed: profile.walkSpeed ?? null,
      runSpeed: profile.runSpeed ?? null,
      firstSessionFeedbackDone: profile.firstSessionFeedbackDone === true,
      ...(profile.age !== undefined ? { age: profile.age } : {}),
      ...(profile.sex !== undefined ? { sex: profile.sex } : {}),
      ...(profile.steps !== undefined ? { steps: profile.steps } : {})
    };
  }
  function validateHistoryEntry(entry, stageCount) {
    if (!isRecord(entry) || !isDateKey(entry.date)
      || !Number.isInteger(entry.level) || entry.level < 0 || entry.level >= stageCount) throw invalidBackup();
    if (entry.id !== undefined
      && !(typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 128)
      && !(Number.isSafeInteger(entry.id) && entry.id >= 0)) throw invalidBackup();
    if (entry.status !== undefined && !HISTORY_STATUSES.has(entry.status)) throw invalidBackup();
    if (entry.effort !== undefined && !EFFORTS.has(entry.effort)) throw invalidBackup();
    for (const key of ['completion', 'timerCompletion']) {
      if (entry[key] !== undefined && (!Number.isFinite(entry[key]) || entry[key] < 0 || entry[key] > 1)) throw invalidBackup();
    }
    if (entry.elapsed !== undefined && (!Number.isFinite(entry.elapsed) || entry.elapsed < 0)) throw invalidBackup();
    if (entry.week !== undefined && (!Number.isInteger(entry.week) || entry.week < 1 || entry.week > 12)) throw invalidBackup();
    if (entry.completedAt !== undefined && (typeof entry.completedAt !== 'string' || !Number.isFinite(Date.parse(entry.completedAt)))) throw invalidBackup();
    if (entry.distanceKm !== undefined && (!Number.isFinite(entry.distanceKm) || entry.distanceKm < 0 || entry.distanceKm > 100)) throw invalidBackup();
    if (entry.longestRunSeconds !== undefined && (!Number.isFinite(entry.longestRunSeconds) || entry.longestRunSeconds < 0 || entry.longestRunSeconds > 86400)) throw invalidBackup();
    if (entry.skippedRunSeconds !== undefined && (!Number.isFinite(entry.skippedRunSeconds) || entry.skippedRunSeconds < 0 || entry.skippedRunSeconds > 86400)) throw invalidBackup();
    for (const key of ['runFeel', 'walkFeel']) if (entry[key] != null && !FEELS.has(entry[key])) throw invalidBackup();
    if (entry.goalContinuous5k !== undefined && typeof entry.goalContinuous5k !== 'boolean') throw invalidBackup();
    const sanitized = { date: entry.date, level: entry.level };
    for (const key of ['id', 'completedAt', 'effort', 'completion', 'timerCompletion', 'status', 'elapsed', 'week',
      'distanceKm', 'runFeel', 'walkFeel', 'goalContinuous5k', 'skippedRunSeconds', 'longestRunSeconds']) if (entry[key] !== undefined) sanitized[key] = entry[key];
    return sanitized;
  }
  function parse(text, stageCount) {
    if (typeof text !== 'string' || text.length > 5_000_000 || !Number.isInteger(stageCount) || stageCount < 1) throw invalidBackup();
    let saved;
    try { saved = JSON.parse(text); } catch { throw invalidBackup(); }
    if (!isRecord(saved) || !Object.hasOwn(saved, 'profile') || !Number.isInteger(saved.level)
      || saved.level < 0 || saved.level >= stageCount || !Array.isArray(saved.history) || saved.history.length > 5000) throw invalidBackup();
    const profile = validateProfile(saved.profile);
    if (!profile && saved.history.length > 0) throw invalidBackup();
    const history = saved.history.map(entry => validateHistoryEntry(entry, stageCount));
    function counter(key) {
      if (saved[key] === undefined) return 0;
      if (!Number.isInteger(saved[key]) || saved[key] < 0) throw invalidBackup();
      return saved[key];
    }
    function flag(key) {
      if (saved[key] === undefined) return false;
      if (typeof saved[key] !== 'boolean') throw invalidBackup();
      return saved[key];
    }
    let blackoutDates = [];
    if (saved.blackoutDates !== undefined) {
      if (!Array.isArray(saved.blackoutDates) || saved.blackoutDates.length > 500
        || saved.blackoutDates.some(d => !isDateKey(d))) throw invalidBackup();
      blackoutDates = [...new Set(saved.blackoutDates)];
    }
    if (saved.nextSessionDate !== undefined && !isDateKey(saved.nextSessionDate)) throw invalidBackup();
    if (saved.goalDate !== undefined && !isDateKey(saved.goalDate)) throw invalidBackup();
    if (saved.achievementDistance !== undefined
      && (!Number.isFinite(saved.achievementDistance) || saved.achievementDistance < 5 || saved.achievementDistance > 100)) throw invalidBackup();
    return {
      profile, level: saved.level, history, blackoutDates,
      easyStreak: counter('easyStreak'), moderateStreak: counter('moderateStreak'),
      hardStreak: counter('hardStreak'), reduceNext: flag('reduceNext'),
      goalReached: flag('goalReached'),
      ...(saved.nextSessionDate ? { nextSessionDate: saved.nextSessionDate } : {}),
      ...(saved.goalDate ? { goalDate: saved.goalDate } : {}),
      ...(saved.achievementDistance !== undefined ? { achievementDistance: saved.achievementDistance } : {}),
      ...(typeof saved.lastPlanReason === 'string' ? { lastPlanReason: saved.lastPlanReason.slice(0, 300) } : {})
    };
  }
  const LANGUAGES = new Set(['ro', 'en']);
  const THEMES = new Set(['dark', 'light']);
  const PALETTES = new Set(['standard', 'energetic']);
  const SEGMENT_TYPES = new Set(['warmup', 'run', 'walk', 'cooldown']);

  function validatePreferences(value) {
    if (!isRecord(value) || !LANGUAGES.has(value.lang) || !THEMES.has(value.theme)
      || !PALETTES.has(value.palette)) throw invalidBackup();
    for (const key of ['highContrast', 'timerSound', 'timerVibration']) {
      if (typeof value[key] !== 'boolean') throw invalidBackup();
    }
    return {
      lang: value.lang, theme: value.theme, palette: value.palette,
      highContrast: value.highContrast, timerSound: value.timerSound,
      timerVibration: value.timerVibration
    };
  }

  function validSessionId(id) {
    return (typeof id === 'string' && id.length > 0 && id.length <= 128)
      || (Number.isSafeInteger(id) && id >= 0);
  }

  function boundedNumber(value, min, max) {
    return Number.isFinite(value) && value >= min && value <= max;
  }

  function validatePendingSession(value, stageCount) {
    if (value === null) return null;
    if (!isRecord(value) || !validSessionId(value.id)
      || !Number.isInteger(value.level) || value.level < 0 || value.level >= stageCount
      || !boundedNumber(value.completion, 0, 1)
      || typeof value.completedNaturally !== 'boolean'
      || !Number.isInteger(value.elapsed) || !boundedNumber(value.elapsed, 0, 86_400)) throw invalidBackup();
    if (value.interrupted !== undefined && typeof value.interrupted !== 'boolean') throw invalidBackup();
    if (value.week !== undefined && (!Number.isInteger(value.week) || value.week < 1 || value.week > 12)) throw invalidBackup();
    if (value.sessionNumber !== undefined && (!Number.isInteger(value.sessionNumber) || value.sessionNumber < 1 || value.sessionNumber > 7)) throw invalidBackup();
    if (value.scheduledDate !== undefined && !isDateKey(value.scheduledDate)) throw invalidBackup();
    if (value.skippedRunSeconds !== undefined && !boundedNumber(value.skippedRunSeconds, 0, 86_400)) throw invalidBackup();
    if (value.skippedSegments !== undefined && (!Number.isInteger(value.skippedSegments)
      || value.skippedSegments < 0 || value.skippedSegments > 101)) throw invalidBackup();
    if (value.longestRunSeconds !== undefined && !boundedNumber(value.longestRunSeconds, 0, 86_400)) throw invalidBackup();
    if (value.selectedEffort != null && !EFFORTS.has(value.selectedEffort)) throw invalidBackup();
    if (value.selectedRatio != null && !boundedNumber(value.selectedRatio, 0, 1)) throw invalidBackup();
    if (value.distanceDraft !== undefined && (typeof value.distanceDraft !== 'string'
      || value.distanceDraft.length > 32
      || (value.distanceDraft !== '' && (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.distanceDraft)
        || !boundedNumber(Number(value.distanceDraft), 0, 100))))) throw invalidBackup();
    for (const key of ['runFeelDraft', 'walkFeelDraft']) {
      if (value[key] !== undefined && value[key] !== '' && !FEELS.has(value[key])) throw invalidBackup();
    }
    if (value.goalContinuousDraft !== undefined && typeof value.goalContinuousDraft !== 'boolean') throw invalidBackup();
    const pending = {
      id: value.id, level: value.level, completion: value.completion,
      completedNaturally: value.completedNaturally, elapsed: value.elapsed
    };
    for (const key of ['interrupted', 'week', 'sessionNumber', 'scheduledDate', 'skippedRunSeconds',
      'longestRunSeconds', 'selectedEffort', 'selectedRatio', 'distanceDraft',
      'runFeelDraft', 'walkFeelDraft', 'goalContinuousDraft']) {
      if (value[key] !== undefined) pending[key] = value[key];
    }
    return pending;
  }

  function validateTimer(value, stageCount, requirePaused) {
    if (value === null) return null;
    if (!isRecord(value) || !Number.isInteger(value.level) || value.level < 0 || value.level >= stageCount
      || !Array.isArray(value.segments) || value.segments.length < 3 || value.segments.length > 101
      || value.segments.length % 2 !== 1) throw invalidBackup();
    const segments = value.segments.map((segment, index) => {
      const expected = index === 0 ? 'warmup'
        : index === value.segments.length - 1 ? 'cooldown'
          : index % 2 === 1 ? 'run' : 'walk';
      if (!isRecord(segment) || !SEGMENT_TYPES.has(segment.type) || segment.type !== expected
        || !Number.isInteger(segment.seconds) || segment.seconds <= 0 || segment.seconds > 86_400) throw invalidBackup();
      if (segment.label !== undefined && (typeof segment.label !== 'string'
        || segment.label.length < 1 || segment.label.length > 120
        || /[<>&"'`\u0000-\u001f]/.test(segment.label))) throw invalidBackup();
      const speedMin = segment.type === 'run' ? 3 : 2;
      const speedMax = segment.type === 'run' ? 16 : 9;
      if (segment.speed !== undefined && segment.speed !== null
        && !boundedNumber(segment.speed, speedMin, speedMax)) throw invalidBackup();
      return {
        type: segment.type, seconds: segment.seconds,
        ...(segment.label !== undefined ? { label: segment.label } : {}),
        ...(segment.speed !== undefined ? { speed: segment.speed } : {})
      };
    });
    const total = segments.reduce((sum, segment) => sum + segment.seconds, 0);
    if (total > 86_400 || value.total !== total
      || !Number.isInteger(value.index) || value.index < 0 || value.index >= segments.length
      || !boundedNumber(value.remaining, 0, segments[value.index].seconds)
      || !boundedNumber(value.segmentEnd, 1, 8.64e15)
      || typeof value.paused !== 'boolean' || (requirePaused && !value.paused)
      || !boundedNumber(value.elapsed, 0, total)) throw invalidBackup();
    const runTotal = segments.filter(segment => segment.type === 'run')
      .reduce((sum, segment) => sum + segment.seconds, 0);
    if (value.skippedSegments !== undefined && (!Number.isInteger(value.skippedSegments)
      || value.skippedSegments < 0 || value.skippedSegments > segments.length)) throw invalidBackup();
    if (value.skippedRunSeconds !== undefined && !boundedNumber(value.skippedRunSeconds, 0, runTotal)) throw invalidBackup();
    if (value.skippedRunElapsedSeconds !== undefined
      && !boundedNumber(value.skippedRunElapsedSeconds, 0, value.skippedRunSeconds || 0)) throw invalidBackup();
    if (value.skippedElapsedSeconds !== undefined
      && !boundedNumber(value.skippedElapsedSeconds, 0, total)) throw invalidBackup();
    if (value.scheduledDate !== undefined && !isDateKey(value.scheduledDate)) throw invalidBackup();
    const preceding = segments.slice(0, value.index)
      .reduce((sum, segment) => sum + segment.seconds, 0);
    const skippedElapsed = value.skippedElapsedSeconds || 0;
    if (skippedElapsed > preceding
      || Math.abs(value.elapsed - (preceding - skippedElapsed)) > 0.001) throw invalidBackup();
    const timer = {
      level: value.level, segments, index: value.index,
      segmentEnd: value.segmentEnd, remaining: value.remaining,
      paused: value.paused, total, elapsed: value.elapsed
    };
    for (const key of ['scheduledDate', 'skippedSegments', 'skippedRunSeconds',
      'skippedRunElapsedSeconds', 'skippedElapsedSeconds']) {
      if (value[key] !== undefined) timer[key] = value[key];
    }
    return timer;
  }

  function pauseTimerAt(value, now) {
    if (!boundedNumber(now, 1, 8.64e15)) throw invalidBackup();
    const timer = validateTimer(value, 1_000, false);
    if (timer === null) return null;
    let index = timer.index;
    let end = timer.segmentEnd;
    if (!timer.paused) {
      while (index < timer.segments.length - 1 && now >= end) {
        index += 1;
        end += timer.segments[index].seconds * 1000;
      }
    }
    const remaining = timer.paused ? timer.remaining
      : Math.min(timer.segments[index].seconds, Math.max(0, (end - now) / 1000));
    const preceding = timer.segments.slice(0, index)
      .reduce((sum, segment) => sum + segment.seconds, 0);
    return {
      ...timer, index, remaining, paused: true,
      segmentEnd: now + remaining * 1000,
      elapsed: Math.max(0, preceding - (timer.skippedElapsedSeconds || 0))
    };
  }

  function validateSessionPair(state, activeTimer, pendingSession) {
    if ((activeTimer || pendingSession) && !state.profile) throw invalidBackup();
    if (activeTimer && pendingSession) throw invalidBackup();
    if (pendingSession && state.history.some(entry => entry.id === pendingSession.id)) throw invalidBackup();
  }

  function createBundle(state, preferences, activeTimer, pendingSession, now = Date.now()) {
    let stateText;
    try { stateText = JSON.stringify(state); } catch { throw invalidBackup(); }
    const cleanState = parse(stateText, 1_000);
    const cleanPreferences = validatePreferences(preferences);
    const cleanTimer = activeTimer == null ? null : pauseTimerAt(activeTimer, now);
    const cleanPending = pendingSession == null ? null : validatePendingSession(pendingSession, 1_000);
    validateSessionPair(cleanState, cleanTimer, cleanPending);
    const bundle = {
      app: 'scirun5k', version: 2, state: cleanState, preferences: cleanPreferences,
      activeTimer: cleanTimer, pendingSession: cleanPending
    };
    if (JSON.stringify(bundle).length > 5_000_000) throw invalidBackup();
    return bundle;
  }

  function parseBundle(text, stageCount) {
    if (typeof text !== 'string' || text.length > 5_000_000
      || !Number.isInteger(stageCount) || stageCount < 1) throw invalidBackup();
    let saved;
    try { saved = JSON.parse(text); } catch { throw invalidBackup(); }
    if (!isRecord(saved)) throw invalidBackup();
    const isEnvelope = ['app', 'state', 'preferences', 'activeTimer', 'pendingSession']
      .some(key => Object.hasOwn(saved, key));
    if (!isEnvelope) {
      return { state: parse(text, stageCount), preferences: null, activeTimer: null, pendingSession: null };
    }
    if (saved.app !== 'scirun5k' || saved.version !== 2
      || !Object.hasOwn(saved, 'state') || !Object.hasOwn(saved, 'preferences')
      || !Object.hasOwn(saved, 'activeTimer') || !Object.hasOwn(saved, 'pendingSession')) throw invalidBackup();
    const state = parse(JSON.stringify(saved.state), stageCount);
    const preferences = validatePreferences(saved.preferences);
    const activeTimer = validateTimer(saved.activeTimer, stageCount, true);
    const pendingSession = validatePendingSession(saved.pendingSession, stageCount);
    validateSessionPair(state, activeTimer, pendingSession);
    return { state, preferences, activeTimer, pendingSession };
  }

  globalThis.SciRunStateBackup = Object.freeze({ parse, createBundle, parseBundle });
})();
