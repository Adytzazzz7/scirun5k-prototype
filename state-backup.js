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
  globalThis.SciRunStateBackup = Object.freeze({ parse });
})();