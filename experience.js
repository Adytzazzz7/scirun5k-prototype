(() => {
  const txt = (ro, en) => lang === 'ro' ? ro : en;
  const originalResetApp = resetApp;
  const originalImportBackupFile = importBackupFile;
  const originalBuildSegments = buildSegments;
  const originalTogglePause = togglePause;
  const dateLabel = (value, options = { day: 'numeric', month: 'short' }) => {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(lang === 'ro' ? 'ro-RO' : 'en-GB', options).format(date) : '—';
  };
  const effortNames = {
    veryEasy: txt('Foarte ușor', 'Very easy'), easy: txt('Ușor', 'Easy'),
    moderate: txt('Moderat', 'Moderate'), hard: txt('Greu', 'Hard'),
    exhausted: txt('Epuizant', 'Exhausting')
  };
  const paceNames = {
    tooSlow: txt('Prea lent', 'Too slow'), right: txt('Potrivit', 'About right'), tooFast: txt('Prea rapid', 'Too fast')
  };


  Object.assign(I18N.ro, { navHome: 'Panou', navProgress: 'Istoric', navProfile: 'Setări', effortExhausted: 'Epuizant', setupTitle: 'Începem cu nivelul tău actual.' });
  Object.assign(I18N.en, { navHome: 'Dashboard', navProgress: 'History', navProfile: 'Settings', effortExhausted: 'Exhausting', setupTitle: 'Start with your current level.' });

  function experienceStrings() {
    Object.assign(effortNames, { veryEasy: t('effortVeryEasy'), easy: t('effortEasy'), moderate: t('effortModerate'), hard: t('effortHard'), exhausted: txt('Epuizant', 'Exhausting') });
    document.querySelectorAll('[data-exp-ro]').forEach(el => {
      el.textContent = lang === 'ro' ? el.dataset.expRo : el.dataset.expEn;
    });
    document.querySelectorAll('[data-exp-ro]').forEach(el => { el.textContent = lang === 'ro' ? el.dataset.expRo : el.dataset.expEn; });
    $('setupStepLabel').textContent = txt('Pasul ' + ( $('setupStepTwo').classList.contains('hidden') ? '1' : '2') + ' din 2',
      'Step ' + ( $('setupStepTwo').classList.contains('hidden') ? '1' : '2') + ' of 2');
    $('setupStepDot1').classList.toggle('current', $('setupStepTwo').classList.contains('hidden'));
    $('setupStepDot2').classList.toggle('current', !$('setupStepTwo').classList.contains('hidden'));
    if ($('safetyAnswer')) { $('safetyAnswer').options[0].text = txt('Selectează', 'Select an answer'); $('safetyAnswer').options[1].text = txt('Nu', 'No'); $('safetyAnswer').options[2].text = txt('Da', 'Yes'); }
    if ($('safetyStop') && !$('safetyStop').classList.contains('hidden')) $('safetyStop').textContent = txt('Nu putem crea un plan acum. SciRun nu poate evalua această limitare sau adapta antrenamentul la ea. Cere sfatul unui specialist înainte să începi; poți reveni mai târziu.', 'We cannot create a plan right now. SciRun cannot assess this limitation or adapt training to it. Ask a specialist before you start; you can return later.');
    ['sessionsPerWeek', 'settingFrequency'].forEach(id => {
      const select = $(id);
      if (select) [2, 3, 4].forEach((n, i) => { if (select.options[i]) select.options[i].text = txt(n + ' sesiuni', n + ' workouts'); });
    });
    if ($('runStatus')) {
      $('runStatus').options[0].text = txt('Știu durata aproximativă', 'I know the approximate duration');
      $('runStatus').options[1].text = txt('Nu am alergat în ultimele 30 de zile', 'I have not run in the last 30 days');
      $('runStatus').options[2].text = txt('Nu știu / nu sunt sigur(ă)', 'I am not sure');
    }
    document.querySelectorAll('[data-day]').forEach(el => el.textContent = weekdayName(Number(el.dataset.day), true));
  }

  function setupExperienceForm(profile = null) {
    $('age').value = profile?.age || '30-39';
    $('sex').value = profile?.sex || '';
    $('steps').value = profile?.steps ?? '';
    $('runStatus').value = profile?.runStatus || 'unknown';
    $('runMinutes').value = profile?.runMinutes ?? '';
    $('safetyAck').checked = true;
    $('safetyAnswer').value = profile?.safetyAnswer || '';
    $('sessionsPerWeek').value = String(profile?.sessionsPerWeek || Math.min(3, profile?.trainingDays?.length || 3));
    const selectedDays = profile?.trainingDays || [1, 3, 5];
    document.querySelectorAll('#dayChoices input').forEach(c => c.checked = selectedDays.includes(Number(c.value)));
    $('safetyStop').classList.add('hidden');
    $('onboardError').textContent = '';
    $('scheduleError').textContent = '';
    $('setupStepOne').classList.remove('hidden');
    $('setupStepTwo').classList.add('hidden');
    toggleRunField();
    experienceStrings();
  }
  setupForm = setupExperienceForm;

  function showExperienceView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id));
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === id));
    document.body.classList.toggle('workout-active', id === 'workout');
    document.body.classList.toggle('setup-active', id === 'onboarding');
    if (id !== 'workout') window.scrollTo({ top: 0, behavior: 'auto' });
    manageWakeLock();
  }
  showView = showExperienceView;

  function chosenExperienceDays(selector) {
    return [...document.querySelectorAll(selector + ' input:checked')].map(c => Number(c.value)).sort((a, b) => a - b);
  }

  function continueSetup() {
    $('onboardError').textContent = '';
    const answer = $('safetyAnswer').value;
    if (answer === 'yes') {
      $('safetyStop').classList.remove('hidden');
      return;
    }
    $('safetyStop').classList.add('hidden');
    if (answer !== 'no') {
      $('onboardError').textContent = txt('Răspunde la întrebarea de siguranță ca să continui.', 'Answer the safety question to continue.');
      return;
    }
    if ($('runStatus').value === 'known'
      && (!Number.isFinite(Number($('runMinutes').value)) || Number($('runMinutes').value) < 0.1 || Number($('runMinutes').value) > 180)) {
      $('onboardError').textContent = txt('Introdu durata aproximativă a alergării continue.', 'Enter your approximate continuous running time.');
      return;
    }
    $('setupStepOne').classList.add('hidden');
    $('setupStepTwo').classList.remove('hidden');
    experienceStrings();
  }

  function saveExperienceProfile() {
    if ($('safetyAnswer').value !== 'no') { $('setupBack').click(); continueSetup(); return false; }
    const frequency = Number($('sessionsPerWeek').value);
    const days = chosenExperienceDays('#dayChoices');
    if (![2, 3, 4].includes(frequency) || days.length < frequency) {
      $('scheduleError').textContent = txt('Alege cel puțin ' + frequency + ' zile disponibile.', 'Choose at least ' + frequency + ' available days.');
      return false;
    }
    const runStatus = $('runStatus').value;
    const runMinutes = runStatus === 'known' ? Number($('runMinutes').value) : runStatus === 'none' ? 0 : null;
    if (!['known','none','unknown'].includes(runStatus) || (runStatus === 'known' && (!Number.isFinite(runMinutes) || runMinutes < 0.1 || runMinutes > 180))) { $('setupBack').click(); continueSetup(); return false; }
    const previous = JSON.parse(JSON.stringify(state));
    const profile = {
      runStatus, runMinutes, safetyAnswer: 'no', trainingDays: days,
      sessionsPerWeek: frequency, startDate: state.profile?.startDate || dateKey(new Date()),
      walkSpeed: state.profile?.walkSpeed ?? null, runSpeed: state.profile?.runSpeed ?? null,
      firstSessionFeedbackDone: state.profile?.firstSessionFeedbackDone === true
    };
    state.profile = profile;
    const startingLevel = stageForRunMinutes(runMinutes);
    if (!state.history.length) state.level = startingLevel;
    else if (startingLevel < state.level) state.level = startingLevel;
    else if (startingLevel > state.level) state.level = Math.min(startingLevel, state.level + 1);
    if (state.level !== previous.level) { state.easyStreak = 0; state.moderateStreak = 0; state.hardStreak = 0; state.reduceNext = false; state.lastPlanReason = txt('Plan actualizat după nivelul de alergare raportat.', 'Plan updated from your reported running capacity.'); }
    state.blackoutDates = Array.isArray(state.blackoutDates) ? state.blackoutDates : [];
    state.nextSessionDate = dateKey(experienceNextDate());
    if (!saveState()) {
      state = previous;
      $('scheduleError').textContent = storageFailureText();
      return false;
    }
    $('scheduleError').textContent = '';
    renderAll();
    showView('dashboard');
    toast(txt('Programul tău este pregătit.', 'Your plan is ready.'));
    return true;
  }
  saveProfile = saveExperienceProfile;

  function availableTrainingDays() {
    const p = state.profile;
    if (!p) return [1, 3, 5];
    const days = [...new Set(Array.isArray(p.trainingDays) ? p.trainingDays : [1, 3, 5])].sort((a, b) => a - b);
    const count = Math.max(2, Math.min(4, Number(p.sessionsPerWeek) || Math.min(3, days.length)));
    if (days.length <= count) return days;
    let best = days.slice(0, count), bestScore = Infinity;
    function choose(start, picked) {
      if (picked.length === count) {
        const gaps = picked.map((day, i) => ((picked[(i + 1) % picked.length] - day + 7) % 7) || 7);
        const score = gaps.reduce((sum, gap) => sum + Math.pow(gap - 7 / count, 2), 0);
        if (score < bestScore) { bestScore = score; best = [...picked]; }
        return;
      }
      for (let i = start; i <= days.length - (count - picked.length); i++) choose(i + 1, [...picked, days[i]]);
    }
    choose(0, []);
    return best;
  }
  recommendedDays = availableTrainingDays;

  function isUnavailable(date) {
    const key = dateKey(date);
    return (state.blackoutDates || []).includes(key);
  }

  function experienceNextDate(from = new Date()) {
    const start = localDay(from);
    const days = availableTrainingDays();
    for (let i = 0; i < 1095; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      if (days.includes(d.getDay()) && !isUnavailable(d)
        && !state.history.some(h => h.date === dateKey(d))) return d;
    }
    return start;
  }
  nextScheduledDate = experienceNextDate;

  function experiencePlanDates(count = 36) {
    const dates = [];
    const days = availableTrainingDays();
    let cursor = localDay(new Date());
    for (let i = 0; dates.length < count && i < 1095; i++) {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() + i);
      if (days.includes(d.getDay()) && !isUnavailable(d) && !state.history.some(h => h.date === dateKey(d))) dates.push(d);
    }
    return dates;
  }
  planDates = experiencePlanDates;

  function estimateReadyDate() {
    if (state.goalReached && state.goalDate) return new Date(state.goalDate + 'T12:00:00');
    const p = state.profile || {};
    const level = Math.max(0, Number(state.level) || 0);
    const pace = Number(p.runSpeed) > 0 ? Number(p.runSpeed) : 6;
    const targetMinutes = 300 / pace;
    const matchingStage = STAGES.findIndex(s => s.type === 'continuous' && s.run / 60 >= targetMinutes);
    const targetLevel = matchingStage >= 0 ? matchingStage : STAGES.length - 1;
    const finalStageMinutes = STAGES[STAGES.length - 1].run / 60;
    const achievedFinalMinutes = Math.max(finalStageMinutes, ...state.history.filter(s => s.status === 'done' && s.level === STAGES.length - 1 && !(s.skippedRunSeconds > 0)).map(s => (Number(s.longestRunSeconds) || STAGES.at(-1).run) / 60));
    const extraSessions = Math.ceil(Math.max(0, 300 / pace - achievedFinalMinutes) * 2);
    const sessionsLeft = Math.max(1, Math.ceil(Math.max(0, targetLevel - level) * 2.4 + extraSessions));
    const dates = experiencePlanDates(sessionsLeft);
    return dates.at(-1) || experienceNextDate();
  }

  function sessionDistance(session) {
    return Number.isFinite(Number(session.distanceKm)) ? Math.max(0, Number(session.distanceKm)) : null;
  }
  function completedCount() {
    return state.history.filter(s => s.status === 'done').length;
  }
  function totalRealDistance() {
    return state.history.reduce((sum, s) => sum + (sessionDistance(s) || 0), 0);
  }
  function longestContinuousMinutes(history = state.history) {
    return history.reduce((max, session) => {
      if (session.status !== 'done') return max;
      const stageData = STAGES[session.level];
      if ((Number(session.skippedRunSeconds) || 0) > 0) return max;
      return Math.max(max, Number.isFinite(session.longestRunSeconds) ? session.longestRunSeconds / 60 : stageData ? stageData.run / 60 : 0);
    }, 0);
  }
  function speedFor(type) {
    const p = state.profile || {};
    return type === 'run' ? Number(p.runSpeed) || 0 : Number(p.walkSpeed) || 0;
  }
  function kmText(km) {
    return (Math.round(km * 100) / 100).toLocaleString(lang === 'ro' ? 'ro-RO' : 'en-GB', { minimumFractionDigits: km % 1 ? 1 : 0, maximumFractionDigits: 2 }) + ' km';
  }
  function dateInWords(date) {
    const options = { day: 'numeric', month: 'short' };
    return dateLabel(date, options);
  }

  function drawDistanceChart() {
    const target = $('distanceChart');
    const sessions = state.history.filter(s => sessionDistance(s) !== null).slice(-6);
    if (sessions.length < 2) {
      target.innerHTML = '<div class="chart-empty">' + txt('Graficul apare după două sesiuni cu distanță raportată.', 'The chart appears after two sessions with a reported distance.') + '</div>';
      return;
    }
    const max = Math.max(0.1, ...sessions.map(sessionDistance));
    target.innerHTML = '<div class="distance-bars" role="img" aria-label="' + txt('Distanțe reale raportate pe sesiune', 'Actual distance reported per session') + '">' + sessions.map(s => {
      const value = sessionDistance(s);
      const height = Math.max(10, Math.round(value / max * 100));
      return '<div class="distance-column"><strong>' + kmText(value) + '</strong><div class="bar-track"><i style="height:' + height + '%"></i></div><small>' + dateLabel(s.completedAt || s.date, { day: 'numeric', month: 'short' }) + '</small></div>';
    }).join('') + '</div>';
  }

  function renderRecentSessions() {
    const target = $('recentSessions');
    const recent = [...state.history].sort((a, b) => String(b.completedAt || b.date).localeCompare(String(a.completedAt || a.date))).slice(0, 2);
    if (!recent.length) {
      target.innerHTML = '<div class="chart-empty">' + txt('Încă nu ai sesiuni salvate.', 'No sessions saved yet.') + '</div>';
      return;
    }
    target.innerHTML = recent.map(s => '<div class="recent-session"><div><strong>' + dateLabel(s.completedAt || s.date, { day: 'numeric', month: 'short', year: 'numeric' }) + '</strong><span>' + (s.status === 'done' ? txt('COMPLETĂ', 'COMPLETE') : txt('PARȚIALĂ', 'PARTIAL')) + '</span><small>' + (sessionDistance(s) === null ? txt('Distanță necompletată', 'No distance entered') : kmText(sessionDistance(s))) + ' · ' + effortNames[s.effort || 'moderate'] + '</small></div><b>' + (s.effort ? '✓' : '') + '</b></div>').join('');
  }

  function renderWeeklyView() {
    const target = $('weeklyView');
    const start = localDay(new Date());
    const rows = [];
    let planned = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = dateKey(d);
      const log = [...state.history].reverse().find(s => s.date === key);
      const scheduled = availableTrainingDays().includes(d.getDay());
      const unavailable = isUnavailable(d);
      if (scheduled && !unavailable) planned++;
      const status = unavailable ? txt('Indisponibilă', 'Unavailable')
        : log ? (log.status === 'done' ? txt('Completă', 'Complete') : txt('Parțială', 'Partial'))
        : scheduled ? txt('Programată', 'Scheduled') : txt('Liber', 'Free');
      rows.push('<div class="week-day ' + (log?.status === 'done' ? 'is-done' : unavailable ? 'is-off' : scheduled ? 'is-planned' : '') + '"><span>' + weekdayName(d.getDay(), true) + '</span><strong>' + dateLabel(d, { day: 'numeric' }) + '</strong><small>' + status + '</small></div>');
    }
    const doneThisWeek = state.history.filter(s => s.status === 'done' && s.completedAt
      && new Date(s.completedAt) >= start && new Date(s.completedAt) < new Date(start.getTime() + 7 * 86400000)).length;
    $('weekNote').textContent = txt(doneThisWeek + ' / ' + planned + ' sesiuni planificate în următoarele 7 zile.', doneThisWeek + ' / ' + planned + ' workouts scheduled over the next 7 days.');
    target.innerHTML = '<div class="week-days">' + rows.join('') + '</div>';
  }

  function renderDashboard() {
    if (!state.profile) return;
    const stageData = STAGES[Math.min(STAGES.length - 1, state.level)];
    const estimate = estimateReadyDate();
    const upcoming = experienceNextDate();
    const weeksOut = Math.max(1, getWeekNumber(upcoming));
    $('longestRun').textContent = longestContinuousMinutes() ? longestContinuousMinutes() + ' ' + txt('min', 'min') : '—';
    $('completeSessions').textContent = String(completedCount());
    $('goalDate').textContent = dateInWords(estimate);
    $('goalDateNote').textContent = txt('Orientativ · se actualizează după feedback', 'Estimated · updates after feedback');
    $('nextWorkoutTitle').textContent = stageData.name[lang];
    $('nextWorkoutDesc').textContent = stageData.desc[lang];
    $('nextWeekTag').textContent = txt('Săptămâna ' + weeksOut, 'Week ' + weeksOut);
    $('workoutTypeTag').textContent = stageData.type === 'continuous' ? txt('ALERGARE CONTINUĂ', 'CONTINUOUS RUN') : txt('INTERVALE PE TIMP', 'TIMED INTERVALS');
    const segments = buildSegments(state.level, state.reduceNext ? 0.8 : 1);
    $('workoutDuration').textContent = formatSeconds(segments.reduce((sum, item) => sum + item.seconds, 0));
    $('suggestedSpeed').textContent = speedFor('run') ? speedFor('run').toFixed(1) + ' km/h' : txt('La prima sesiune', 'First workout');
    $('longestRunPlan').textContent = formatSeconds(segments.filter(item => item.type === 'run').reduce((sum, item) => sum + item.seconds, 0));
    const chipClasses = { warmup: 'warmup', run: 'running', walk: 'walking', cooldown: 'cooldown' };
    const chipLabels = { warmup: txt('ÎNCĂLZIRE', 'WARM-UP'), run: txt('ALERGARE', 'RUN'), walk: txt('MERS', 'WALK'), cooldown: txt('REVENIRE', 'COOL-DOWN') };
    $('phaseChips').innerHTML = segments.map(segment => '<span class="phase-chip ' + chipClasses[segment.type] + '">● &nbsp; ' + formatSeconds(segment.seconds) + ' ' + chipLabels[segment.type] + '</span>').join('');
    $('planReason').textContent = state.lastPlanReason || txt('Ritmul și durata se adaptează după efortul raportat și distanța reală.', 'Pace and duration adapt to reported effort and actual distance.');
    $('homeRunSpeed').textContent = speedFor('run') ? speedFor('run').toFixed(1) + ' km/h' : '—';
    $('totalDistance').textContent = kmText(totalRealDistance());
    renderWeeklyView();
    drawDistanceChart();
    renderRecentSessions();
    updateGoalCelebration();
  }

  function renderHistory() {
    const total = totalRealDistance();
    $('historyComplete').textContent = String(completedCount());
    $('historyDistance').textContent = kmText(total);
    $('historyLongest').textContent = longestContinuousMinutes() ? longestContinuousMinutes() + ' ' + txt('min', 'min') : '—';
    const target = $('historyList');
    const entries = [...state.history].sort((a, b) => String(b.completedAt || b.date).localeCompare(String(a.completedAt || a.date)));
    if (!entries.length) {
      target.innerHTML = '<div class="empty history-empty">' + txt('Nicio sesiune salvată încă.', 'No saved workouts yet.') + '</div>';
      return;
    }
    target.innerHTML = entries.map(s => '<article class="history-entry"><div class="history-entry-head"><strong>' + dateLabel(s.completedAt || s.date, { day: 'numeric', month: 'short', year: 'numeric' }) + '</strong><span class="status ' + s.status + '">' + (s.status === 'done' ? txt('Completă', 'Complete') : txt('Parțială', 'Partial')) + '</span></div><div class="history-entry-data"><span>' + (sessionDistance(s) === null ? txt('Distanță necompletată', 'Distance not entered') : kmText(sessionDistance(s))) + '</span><span>' + formatSeconds(s.elapsed || 0) + '</span><span>' + effortNames[s.effort || 'moderate'] + '</span></div></article>').join('');
  }

  function renderSettings() {
    if (!state.profile) return;
    $('settingFrequency').value = String(state.profile.sessionsPerWeek || 3);
    document.querySelectorAll('#scheduleDays input').forEach(c => c.checked = (state.profile.trainingDays || []).includes(Number(c.value)));
    $('soundPreference').checked = soundEnabled;
    const unavailable = state.blackoutDates || [];
    $('clearUnavailable').classList.toggle('hidden', unavailable.length === 0);
    $('unavailableList').innerHTML = unavailable.length
      ? '<small>' + txt('Zile excluse: ', 'Unavailable dates: ') + unavailable.map(d => dateLabel(d)).join(', ') + '</small>'
      : '<small>' + txt('Nu ai marcat perioade indisponibile.', 'No unavailable dates marked.') + '</small>';
    if ($('profileInfo')) $('profileInfo').textContent = '';
  }

  function renderAllExperience() {
    experienceStrings();
    if (!state.profile || state.profile.safetyAnswer !== 'no') {
      showView('onboarding');
      return;
    }
    state.blackoutDates = Array.isArray(state.blackoutDates) ? state.blackoutDates : [];
    state.profile.sessionsPerWeek = Math.max(2, Math.min(4, Number(state.profile.sessionsPerWeek) || Math.min(3, state.profile.trainingDays?.length || 3)));
    if (!Array.isArray(state.profile.trainingDays) || state.profile.trainingDays.length < state.profile.sessionsPerWeek) state.profile.trainingDays = [1, 3, 5];
    renderDashboard();
    renderHistory();
    renderSettings();
  }
  renderAll = renderAllExperience;
  renderProfile = function () {};

  function saveScheduleSettings() {
    const frequency = Number($('settingFrequency').value);
    const days = chosenExperienceDays('#scheduleDays');
    const msg = $('scheduleSaveMessage');
    if (![2, 3, 4].includes(frequency) || days.length < frequency) {
      msg.textContent = txt('Alege cel puțin ' + frequency + ' zile disponibile.', 'Choose at least ' + frequency + ' available days.');
      msg.classList.add('form-error');
      return;
    }
    const snapshot = JSON.stringify(state);
    const oldDate = experienceNextDate();
    state.profile.sessionsPerWeek = frequency;
    state.profile.trainingDays = days;
    const next = experienceNextDate();
    state.nextSessionDate = dateKey(next);
    if (!saveState()) { state = JSON.parse(snapshot); renderAll(); msg.textContent = storageFailureText(); return; }
    msg.classList.remove('form-error');
    msg.textContent = txt('Program actualizat. Estimarea datei pentru 5 km a fost recalculată.', 'Schedule updated. The estimated 5 km date has been recalculated.');
    renderAll();
    if (dateKey(oldDate) !== dateKey(next)) toast(txt('Sesiunea a fost reprogramată pentru ' + weekdayName(next.getDay(), false) + '.', 'The workout has been rescheduled for ' + weekdayName(next.getDay(), false) + '.'));
  }

  function addUnavailableRange() {
    const fromValue = $('unavailableStart').value;
    const toValue = $('unavailableEnd').value || fromValue;
    const from = new Date(fromValue + 'T00:00:00');
    const to = new Date(toValue + 'T00:00:00');
    if (!fromValue || !Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to < from) {
      $('scheduleSaveMessage').textContent = txt('Alege o perioadă validă.', 'Choose a valid date range.');
      return;
    }
    const snapshot = JSON.stringify(state);
    const old = experienceNextDate();
    const days = [...(state.blackoutDates || [])];
    for (let d = new Date(from); d <= to && days.length < 500; d.setDate(d.getDate() + 1)) {
      const key = dateKey(d);
      if (!days.includes(key)) days.push(key);
    }
    state.blackoutDates = days.sort();
    state.nextSessionDate = dateKey(experienceNextDate());
    if (!saveState()) { state = JSON.parse(snapshot); renderAll(); $('scheduleSaveMessage').textContent = storageFailureText(); return; }
    const next = experienceNextDate();
    renderAll();
    if (old >= from && old <= to) toast(txt('Sesiunea a fost reprogramată pentru ' + weekdayName(next.getDay(), false) + '.', 'The workout has been rescheduled for ' + weekdayName(next.getDay(), false) + '.'));
  }

  function beginWorkout() {
    if (!state.profile || currentTimer || pendingSession) return;
    const level = startWorkoutLevel();
    const factor = state.reduceNext ? 0.8 : 1;
    state.reduceNext = false;
    if (!saveState()) { state.reduceNext = factor < 1; return; }
    const segments = buildSegments(level, factor).map(segment => ({
      ...segment,
      speed: segment.type === 'run' ? state.profile.runSpeed : state.profile.walkSpeed
    }));
    const now = Date.now();
    const position = workoutPosition();
    currentTimer = {
      level, factor, segments, index: 0, startedAt: now, remaining: segments[0].seconds,
      paused: false, skippedRunSeconds: 0, skippedSegments: 0,
      segmentEnd: now + segments[0].seconds * 1000,
      total: segments.reduce((sum, segment) => sum + segment.seconds, 0), elapsed: 0,
      scheduledDate: dateKey(experienceNextDate())
    };
    workoutMode = 'timer';
    if (!persistTimer()) { currentTimer = null; state.reduceNext = factor < 1; saveState(); toast(storageFailureText()); return; }
    showView('workout');
    renderWorkoutPage();
    timerInterval = setInterval(tickTimer, 250);
    playWorkoutCue('warmup');
    manageWakeLock();
  }

  function startExperienceWorkout() {
    if (!state.profile || state.profile.safetyAnswer !== 'no') { showView('onboarding'); toast(txt('Răspunde întâi la întrebarea de siguranță.', 'Answer the safety question first.')); return; }
    if (currentTimer) { workoutMode = 'timer'; showView('workout'); renderWorkoutPage(); return; }
    if (pendingSession) { showWorkoutFeedback(); return; }
    if (!(Number(state.profile.walkSpeed) > 0 && Number(state.profile.runSpeed) > 0)) {
      openModal('<div class="modalhead"><div><h2 id="modalTitle">' + txt('Calibrează banda', 'Set your treadmill speeds') + '</h2><p class="small muted">' + txt('Alege vitezele la care mersul și alergarea se simt confortabil. Le poți ajusta după prima sesiune.', 'Enter comfortable walking and running speeds. You can adjust them after your first workout.') + '</p></div></div><div class="formgrid"><label class="field">' + txt('Mers (km/h)', 'Walking (km/h)') + '<input id="calibrationWalk" type="number" min="2" max="9" step="0.1" value="' + (state.profile.walkSpeed || '') + '" placeholder="4.5"></label><label class="field">' + txt('Alergare (km/h)', 'Running (km/h)') + '<input id="calibrationRun" type="number" min="3" max="16" step="0.1" value="' + (state.profile.runSpeed || '') + '" placeholder="6.5"></label></div><p class="small" id="calibrationError" role="alert"></p><div class="timerbuttons"><button type="button" class="btn" id="saveCalibration">' + txt('Salvează și începe', 'Save and start') + ' →</button><button type="button" class="btn ghost" id="cancelCalibration">' + t('cancel') + '</button></div>');
      $('saveCalibration').onclick = () => {
        const walk = Number($('calibrationWalk').value), run = Number($('calibrationRun').value);
        if (!(walk >= 2 && walk <= 9 && run >= 3 && run <= 16 && run >= walk)) {
          $('calibrationError').textContent = txt('Introdu viteze valide; alergarea trebuie să fie cel puțin egală cu mersul.', 'Enter valid speeds; running speed must be at least the walking speed.');
          return;
        }
        const previousProfile = { ...state.profile };
        state.profile.walkSpeed = Math.round(walk * 10) / 10;
        state.profile.runSpeed = Math.round(run * 10) / 10;
        if (!saveState()) { state.profile = previousProfile; $('calibrationError').textContent = storageFailureText(); return; }
        closeModal();
        renderAll();
        beginWorkout();
      };
      $('cancelCalibration').onclick = closeModal;
      return;
    }
    beginWorkout();
  }
  startWorkout = startExperienceWorkout;
  buildSegments = function(level, factor = 1) {
    const segments = originalBuildSegments(level, factor);
    if (level === STAGES.length - 1 && Number(state.profile?.runSpeed) > 0) {
      const target = Math.max(STAGES[level].run, Math.ceil(18000 / state.profile.runSpeed / 30) * 30);
      const recent = [...state.history].reverse().find(item => item.status === 'done' && item.level === level && !(item.skippedRunSeconds > 0));
      const previous = Math.max(STAGES[level].run, Number(recent?.longestRunSeconds) || STAGES[level].run);
      const increase = recent && ['easy','veryEasy'].includes(recent.effort) ? 60 : recent?.effort === 'moderate' ? 30 : 0;
      const planned = Math.min(target, previous + increase);
      const run = segments.find(item => item.type === 'run');
      if (run) run.seconds = Math.max(300, Math.round(planned * factor));
    }
    return segments;
  };
  STAGES[STAGES.length - 1].name = { ro: 'Alergare continuă către 5 km', en: 'Continuous running towards 5 km' };

  let wakeLock = null;
  let wakeLockPending = false;
  let wakeLockDesired = false;
  function requestWakeLock() {
    if (!('wakeLock' in navigator) || wakeLockPending || (wakeLock && !wakeLock.released) || document.visibilityState !== 'visible') return;
    wakeLockPending = true;
    navigator.wakeLock.request('screen').then(lock => {
      if (!wakeLockDesired || document.visibilityState !== 'visible') { lock.release().catch(() => {}); return; }
      wakeLock = lock;
      lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
    }).catch(() => {}).finally(() => { wakeLockPending = false; });
  }
  function manageWakeLock() {
    wakeLockDesired = document.body.classList.contains('workout-active') && document.visibilityState === 'visible';
    if (wakeLockDesired) requestWakeLock();
    else if (wakeLock) { const lock = wakeLock; wakeLock = null; lock.release().catch(() => {}); }
  }

  playWorkoutCue = function (phase = 'run') {
    if (!soundEnabled) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const frequencies = { warmup: 520, run: 880, walk: 650, rest: 430, cooldown: 360 };
    try {
      workoutAudioContext = workoutAudioContext || new AudioContextClass();
      if (workoutAudioContext.state === 'suspended') workoutAudioContext.resume().catch(() => {});
      const osc = workoutAudioContext.createOscillator();
      const gain = workoutAudioContext.createGain();
      const now = workoutAudioContext.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequencies[phase] || 740, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.11, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      osc.connect(gain); gain.connect(workoutAudioContext.destination);
      osc.start(now); osc.stop(now + 0.29);
    } catch (e) {}
  };

  togglePause = function () {
    originalTogglePause();
    if (currentTimer) playWorkoutCue(currentTimer.paused ? 'rest' : currentTimer.segments[currentTimer.index]?.type || 'run');
  };

  tickTimer = function () {
    if (!currentTimer || currentTimer.paused) return;
    const progress = SciRunTimerCore.advanceTimer(currentTimer, Date.now());
    if (progress.complete) { endTimer(false); return; }
    if (progress.changed) {
      persistTimer();
      playWorkoutCue(currentTimer.segments[currentTimer.index]?.type || 'run');
      if (document.querySelector('.view.active')?.id === 'workout') renderWorkoutPage();
      return;
    }
    updateWorkoutPage();
  };

  skipCurrentSegment = function () {
    if (!currentTimer) return;
    const now = Date.now();
    const result = SciRunTimerCore.skipSegment(currentTimer, now);
    if (result.complete) {
      if (result.skipped) currentTimer.skippedElapsedSeconds = (currentTimer.skippedElapsedSeconds || 0) + Math.max(0, currentTimer.segments.at(-1).seconds - (result.elapsedSeconds || 0));
      currentTimer.index = currentTimer.segments.length - 1;
      currentTimer.remaining = 0;
      currentTimer.segmentEnd = now;
      persistTimer();
      endTimer(false);
      return;
    }
    persistTimer();
    playWorkoutCue(currentTimer.segments[currentTimer.index]?.type || 'run');
    renderWorkoutPage();
  };

  endTimer = function (interrupted = false) {
    if (!currentTimer) return;
    const timer = currentTimer;
    const progress = SciRunTimerCore.advanceTimer(timer, Date.now());
    const stopped = interrupted && !progress.complete;
    const completion = SciRunTimerCore.runCompletion(timer, Date.now());
    const elapsed = timer.elapsed + (timer.paused
      ? timer.segments[timer.index].seconds - timer.remaining
      : Math.max(0, timer.segments[timer.index].seconds - Math.max(0, (timer.segmentEnd - Date.now()) / 1000)));
    stopTimerInterval();
    const position = workoutPosition();
    pendingSession = {
      id: newSessionId(), level: timer.level, completion, interrupted: stopped,
      completedNaturally: !stopped && progress.complete,
      elapsed: Math.round(elapsed), week: position.week, sessionNumber: position.session,
      scheduledDate: timer.scheduledDate || dateKey(experienceNextDate()),
      skippedSegments: timer.skippedSegments || 0,
      skippedRunSeconds: timer.skippedRunSeconds || 0,
      longestRunSeconds: Math.max(0, ...timer.segments.filter(s => s.type === 'run').map(s => s.seconds))
    };
    if (!savePendingSession()) {
      pendingSession = null;
      currentTimer = timer;
      currentTimer.paused = true;
      currentTimer.remaining = Math.max(0, (timer.segmentEnd - Date.now()) / 1000);
      persistTimer();
      timerInterval = setInterval(tickTimer, 250);
      renderWorkoutPage();
      toast(storageFailureText());
      return;
    }
    currentTimer = null;
    persistTimer();
    showWorkoutFeedback();
  };

  saveFeedback = function () {
    if (!pendingSession) return;
    if (pendingSession.id && state.history.some(item => item.id === pendingSession.id)) {
      pendingSession = null; clearPendingSession(); renderAll(); showView('dashboard'); return;
    }
    const distanceInput = $('actualDistance');
    const distance = Number(distanceInput?.value);
    const effort = selectedEffort;
    if (!distanceInput || distanceInput.value.trim() === '' || !Number.isFinite(distance) || distance < 0 || distance > 100) {
      $('feedbackError').textContent = txt('Introdu distanța reală afișată de bandă.', 'Enter the actual distance shown by the treadmill.');
      return;
    }
    if (!effort) {
      $('feedbackError').textContent = t('chooseEffort');
      return;
    }
    const completedFully = pendingSession.completedNaturally === true;
    const needsSpeedFeedback = state.profile.firstSessionFeedbackDone !== true && Number(state.profile.runSpeed) > 0 && Number(state.profile.walkSpeed) > 0;
    const runFeel = needsSpeedFeedback ? $('runPaceFeel')?.value || '' : '';
    const walkFeel = needsSpeedFeedback ? $('walkPaceFeel')?.value || '' : '';
    if (needsSpeedFeedback && (!runFeel || !walkFeel)) {
      $('feedbackError').textContent = txt('Răspunde și la cele două întrebări despre viteza benzii.', 'Answer both treadmill speed questions as well.');
      return;
    }
    const snapshot = JSON.stringify(state);
    const status = completedFully ? 'done' : 'partial';
    let note = txt('Sesiunea parțială a fost salvată; nivelul programului rămâne neschimbat.', 'Partial workout saved; your plan level stays the same.');
    if (runFeel) {
      const adjust = feel => feel === 'tooSlow' ? 0.2 : feel === 'tooFast' ? -0.2 : 0;
      state.profile.runSpeed = Math.min(16, Math.max(3, Math.round((Number(state.profile.runSpeed) + adjust(runFeel)) * 10) / 10));
      state.profile.walkSpeed = Math.min(9, Math.max(2, Math.round((Number(state.profile.walkSpeed) + adjust(walkFeel)) * 10) / 10));
      state.profile.firstSessionFeedbackDone = true;
    }
    if (completedFully) {
      if (effort === 'exhausted') {
        state.level = Math.max(0, state.level - 1); state.reduceNext = true;
        state.easyStreak = 0; state.moderateStreak = 0; state.hardStreak = 0;
        if (Number(state.profile.runSpeed) > 0) state.profile.runSpeed = Math.max(3, Math.round((Number(state.profile.runSpeed) - 0.3) * 10) / 10);
        note = t('exhaustedStep');
      } else if (effort === 'hard') {
        state.reduceNext = true; state.easyStreak = 0; state.moderateStreak = 0;
        state.hardStreak = (state.hardStreak || 0) + 1;
        if (Number(state.profile.runSpeed) > 0) state.profile.runSpeed = Math.max(3, Math.round((Number(state.profile.runSpeed) - 0.2) * 10) / 10);
        note = t('reduceStep');
        if (state.hardStreak >= 2) { state.level = Math.max(0, state.level - 1); state.hardStreak = 0; }
      } else if (effort === 'veryEasy' || effort === 'easy') {
        state.easyStreak = (state.easyStreak || 0) + 1; state.moderateStreak = 0; state.hardStreak = 0;
        if (Number(state.profile.runSpeed) > 0) state.profile.runSpeed = Math.min(16, Math.round((Number(state.profile.runSpeed) + 0.1) * 10) / 10);
        if (state.easyStreak >= 2 && state.level < STAGES.length - 1) {
          state.level++; state.easyStreak = 0; note = t('nextStepEasy');
        } else note = t('repeatStep');
      } else {
        state.moderateStreak = (state.moderateStreak || 0) + 1; state.easyStreak = 0; state.hardStreak = 0;
        if (state.moderateStreak >= 3 && state.level < STAGES.length - 1) {
          state.level++; state.moderateStreak = 0; note = t('nextStepModerate');
        } else note = t('repeatStep');
      }
    }
    if (Number(state.profile.walkSpeed) > 0 && Number(state.profile.runSpeed) > 0) state.profile.walkSpeed = Math.min(Number(state.profile.walkSpeed), Number(state.profile.runSpeed));
    const scheduledDate = pendingSession.scheduledDate || dateKey(experienceNextDate());
    state.history.push({
      id: pendingSession.id || Date.now(), date: scheduledDate,
      completedAt: new Date().toISOString(), level: pendingSession.level, effort,
      completion: completedFully ? 1 : pendingSession.completion,
      timerCompletion: pendingSession.completion, status, elapsed: pendingSession.elapsed,
      week: pendingSession.week, distanceKm: Math.round(distance * 100) / 100,
      runFeel: runFeel || null, walkFeel: walkFeel || null,
      skippedRunSeconds: pendingSession.skippedRunSeconds || 0,
      longestRunSeconds: pendingSession.longestRunSeconds || STAGES[pendingSession.level].run,
      goalContinuous5k: distance >= 5 && completedFully && $('goalContinuous')?.checked === true
    });
    if (runFeel) state.profile.firstSessionFeedbackDone = true;
    if (state.history.at(-1).goalContinuous5k) {
      state.goalReached = true;
      state.goalDate = scheduledDate;
      state.achievementDistance = Math.round(distance * 100) / 100;
      note = txt('Felicitări! Ai alergat 5 km continuu.', 'Congratulations! You ran 5 km continuously.');
    }
    state.lastPlanReason = note;
    state.nextSessionDate = dateKey(experienceNextDate());
    if (!saveState()) {
      state = JSON.parse(snapshot);
      $('feedbackError').textContent = storageFailureText();
      return;
    }
    pendingSession = null;
    const pendingCleared = clearPendingSession();
    closeModal();
    workoutMode = 'timer';
    renderAll();
    showView('dashboard');
    toast(pendingCleared ? note : storageFailureText());
  };

  function resetExperience() {
    I18N.ro.resetConfirm = 'Planul, sesiunile, distanțele și medalia de pe acest dispozitiv vor fi șterse. Începi de la zero?';
    I18N.en.resetConfirm = 'Your plan, workouts, distances and medal on this device will be deleted. Start over?';
    return originalResetApp();
  }
  resetApp = resetExperience;
  openEditProfile = function () {
    if (currentTimer || pendingSession) { toast(txt('Încheie sesiunea înainte să schimbi nivelul de pornire.', 'Finish the workout before changing your starting level.')); return; }
    setupForm(state.profile);
    showView('onboarding');
    $('setupEyebrow')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  function resumeFromZero() {
    const btn = $('restartFromZero');
    if (btn) btn.onclick = resetExperience;
  }

  function updateGoalCelebration() {
    const box = $('goalCelebration');
    if (!box) return;
    box.classList.toggle('hidden', !state.goalReached);
    if (!state.goalReached) return;
    $('goalMedalText').textContent = txt('Felicitări! Ai alergat 5 km continuu.', 'Congratulations! You ran 5 km continuously.');
    $('goalMedalMeta').textContent = txt(kmText(state.achievementDistance || 5) + ' · ' + dateLabel(state.goalDate || new Date()), kmText(state.achievementDistance || 5) + ' · ' + dateLabel(state.goalDate || new Date()));
    resumeFromZero();
  }

  importBackupFile = async function(file) {
    await originalImportBackupFile(file);
    $('setupImportError').textContent = $('importError').textContent;
  };

  function bindExperienceControls() {
    $('restoreSetupBackup').onclick = () => { $('setupImportError').textContent = ''; $('importError').textContent = ''; $('importFile').click(); };
    $('setupContinue').onclick = continueSetup;
    $('setupBack').onclick = () => { $('setupStepTwo').classList.add('hidden'); $('setupStepOne').classList.remove('hidden'); experienceStrings(); };
    $('setupFrequency')?.addEventListener('change', experienceStrings);
    $('saveSchedule').onclick = saveScheduleSettings;
    $('addUnavailable').onclick = addUnavailableRange;
    $('clearUnavailable').onclick = () => { const previous = state.blackoutDates, previousNext = state.nextSessionDate; state.blackoutDates = []; state.nextSessionDate = dateKey(experienceNextDate()); if (!saveState()) { state.blackoutDates = previous; state.nextSessionDate = previousNext; return; } renderAll(); };
    $('editScheduleShortcut').onclick = () => { showView('settings'); $('settingFrequency').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    $('soundPreference').onchange = () => {
      soundEnabled = $('soundPreference').checked;
      storageSet('scirun.timerSound', soundEnabled ? 'true' : 'false');
      toast(txt('Preferința pentru semnale sonore a fost salvată.', 'Sound preference saved.'));
    };
    document.querySelectorAll('[data-go="history"]').forEach(b => b.onclick = () => showView('history'));
    $('resetApp').onclick = null;
    $('restartFromZero')?.addEventListener('click', resetExperience);
    document.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.id === 'createPlan') {
        event.preventDefault(); event.stopImmediatePropagation(); saveExperienceProfile();
      } else if (button.id === 'resetApp') {
        event.preventDefault(); event.stopImmediatePropagation(); resetExperience();
      } else if (button.id === 'editProfile') {
        event.preventDefault(); event.stopImmediatePropagation(); openEditProfile();
      } else if (button.id === 'restartFromZero') {
        event.preventDefault(); event.stopImmediatePropagation(); resetExperience();
      }
    }, true);
    window.addEventListener('pagehide', () => { persistTimer(); wakeLockDesired = false; if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        wakeLockDesired = false;
        persistTimer();
        if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
      } else manageWakeLock();
    });
  }

  function initExperience() {
    if (storageGet('scirun.timerSound') === null) {
      soundEnabled = true;
      storageSet('scirun.timerSound', 'true');
    } else soundEnabled = storageGet('scirun.timerSound') === 'true';
    state.blackoutDates = Array.isArray(state.blackoutDates) ? state.blackoutDates : [];
    if (state.profile) {
      delete state.profile.age; delete state.profile.sex; delete state.profile.steps; delete state.profile.safetyAck;
      if (state.profile.safetyAnswer !== 'no') state.profile.safetyAnswer = '';
      if (!state.profile.sessionsPerWeek) state.profile.sessionsPerWeek = Math.min(3, state.profile.trainingDays?.length || 3);
      if (!Array.isArray(state.profile.trainingDays) || state.profile.trainingDays.length < state.profile.sessionsPerWeek) state.profile.trainingDays = [1, 3, 5];
      if (state.profile.runSpeed == null) state.profile.runSpeed = null;
      if (state.profile.walkSpeed == null) state.profile.walkSpeed = null;
      if (typeof state.profile.firstSessionFeedbackDone !== 'boolean') state.profile.firstSessionFeedbackDone = false;
      saveState();
    }
    const savedTheme = storageGet('scirun.theme');
    applyTheme(savedTheme || 'dark', !savedTheme);
    setupExperienceForm(state.profile);
    experienceStrings();
    bindExperienceControls();
    applyLanguage();
    if (state.profile && state.profile.safetyAnswer === 'no') { renderAll(); showView('dashboard'); }
    else showView('onboarding');
    if (!restorePendingSession()) restoreTimer();
    if (currentTimer && state.profile?.safetyAnswer === 'no') { stopTimerInterval(); showView('workout'); renderWorkoutPage(); timerInterval = setInterval(tickTimer, 250); }
    else if (currentTimer) { currentTimer.paused = true; persistTimer(); showView('onboarding'); }
    else if (pendingSession) { showWorkoutFeedback(); }
    if (state.profile?.safetyAnswer === 'no' && !currentTimer && !pendingSession) {
      const next = experienceNextDate();
      const previous = state.nextSessionDate;
      state.nextSessionDate = dateKey(next);
      if (previous !== state.nextSessionDate) {
        saveState();
        if (previous && previous < dateKey(localDay(new Date())) && !state.history.some(s => s.date === previous)) {
          toast(txt('Sesiunea a fost reprogramată pentru ' + weekdayName(next.getDay(), false) + '.', 'The workout has been rescheduled for ' + weekdayName(next.getDay(), false) + '.'));
        }
      }
    }
  }

  window.addEventListener('load', initExperience, { once: true });
})();