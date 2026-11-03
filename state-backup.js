(() => {
  const AGES = new Set(['18-29', '30-39', '40-49', '50-59', '60-69', '70+']);
  const SEXES = new Set(['', 'female', 'male', 'intersex']);
  const RUN_STATUSES = new Set(['known', 'none', 'unknown']);
  const EFFORTS = new Set(['veryEasy', 'easy', 'moderate', 'hard', 'exhausted']);
  const HISTORY_STATUSES = new Set(['done', 'partial']);

  function invalidBackup() {
    return new Error('Invalid SciRun backup file');
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function isDateKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function validateProfile(profile) {
    if (profile === null) return null;
    if (!isRecord(profile)
      || !AGES.has(profile.age)
      || !SEXES.has(profile.sex)
      || !RUN_STATUSES.has(profile.runStatus)
      || !Array.isArray(profile.trainingDays)
      || profile.trainingDays.length < 2
      || profile.trainingDays.length > 3
      || profile.trainingDays.some(day => !Number.isInteger(day) || day < 0 || day > 6)
      || new Set(profile.trainingDays).size !== profile.trainingDays.length
      || profile.safetyAck !== true
      || !isDateKey(profile.startDate)) {
      throw invalidBackup();
    }

    const runIsValid = profile.runStatus === 'known'
      ? Number.isFinite(profile.runMinutes) && profile.runMinutes >= 0.1 && profile.runMinutes <= 180
      : profile.runStatus === 'none'
        ? profile.runMinutes === 0
        : profile.runMinutes === null;
    const stepsAreValid = profile.steps === null
      || (Number.isFinite(profile.steps) && profile.steps >= 0 && profile.steps <= 100000);
    if (!runIsValid || !stepsAreValid) throw invalidBackup();

    return {
      age: profile.age,
      sex: profile.sex,
      runStatus: profile.runStatus,
      runMinutes: profile.runMinutes,
      steps: profile.steps,
      trainingDays: [...profile.trainingDays],
      safetyAck: true,
      startDate: profile.startDate,
    };
  }

  function validateHistoryEntry(entry, stageCount) {
    if (!isRecord(entry)
      || !isDateKey(entry.date)
      || !Number.isInteger(entry.level)
      || entry.level < 0
      || entry.level >= stageCount) {
      throw invalidBackup();
    }
    if (entry.id !== undefined
      && !(typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 128)
      && !(Number.isSafeInteger(entry.id) && entry.id >= 0)) {
      throw invalidBackup();
    }
    if (entry.status !== undefined && !HISTORY_STATUSES.has(entry.status)) throw invalidBackup();
    if (entry.effort !== undefined && !EFFORTS.has(entry.effort)) throw invalidBackup();
    for (const key of ['completion', 'timerCompletion']) {
      if (entry[key] !== undefined
        && (!Number.isFinite(entry[key]) || entry[key] < 0 || entry[key] > 1)) {
        throw invalidBackup();
      }
    }
    if (entry.elapsed !== undefined && (!Number.isFinite(entry.elapsed) || entry.elapsed < 0)) {
      throw invalidBackup();
    }
    if (entry.week !== undefined && (!Number.isInteger(entry.week) || entry.week < 1 || entry.week > 12)) {
      throw invalidBackup();
    }
    if (entry.completedAt !== undefined
      && (typeof entry.completedAt !== 'string' || !Number.isFinite(Date.parse(entry.completedAt)))) {
      throw invalidBackup();
    }

    const sanitized = { date: entry.date, level: entry.level };
    for (const key of ['id', 'completedAt', 'effort', 'completion', 'timerCompletion', 'status', 'elapsed', 'week']) {
      if (entry[key] !== undefined) sanitized[key] = entry[key];
    }
    return sanitized;
  }

  function parse(text, stageCount) {
    if (typeof text !== 'string' || text.length > 5_000_000
      || !Number.isInteger(stageCount) || stageCount < 1) {
      throw invalidBackup();
    }

    let saved;
    try {
      saved = JSON.parse(text);
    } catch {
      throw invalidBackup();
    }
    if (!isRecord(saved)
      || !Object.hasOwn(saved, 'profile')
      || !Number.isInteger(saved.level)
      || saved.level < 0
      || saved.level >= stageCount
      || !Array.isArray(saved.history)
      || saved.history.length > 5000) {
      throw invalidBackup();
    }

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

    return {
      profile,
      level: saved.level,
      history,
      easyStreak: counter('easyStreak'),
      moderateStreak: counter('moderateStreak'),
      hardStreak: counter('hardStreak'),
      reduceNext: flag('reduceNext'),
      goalReached: flag('goalReached'),
    };
  }

  globalThis.SciRunStateBackup = Object.freeze({ parse });
})();
