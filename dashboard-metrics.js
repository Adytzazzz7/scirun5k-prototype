// Presentation-only summaries derived from the existing session history.
(() => {
  function planProgress(history, sessionsPerWeek) {
    const total = Math.max(1, Math.round(sessionsPerWeek)) * 12;
    const done = history.filter(session => session.status === 'done').length;
    return { done, total, percent: Math.min(100, Math.round(done / total * 100)) };
  }

  function trainingStreak(history) {
    let streak = 0;
    for (let index = history.length - 1; index >= 0; index -= 1) {
      if (history[index].status !== 'done') break;
      streak += 1;
    }
    return streak;
  }

  function confirmedCapacity(history, stages, goalReached) {
    if (goalReached) return { value: '5 km', minutes: null, source: 'manual-goal' };
    const seconds = history
      .filter(session => session.status === 'done' && session.completion === 1)
      .map(session => stages[session.level])
      .filter(stage => stage && stage.type === 'continuous')
      .reduce((maximum, stage) => Math.max(maximum, stage.run), 0);
    return seconds ? { value: `${Math.round(seconds / 60)} min`, minutes: Math.round(seconds / 60), source: 'completed-session' } : null;
  }

  globalThis.SciRunDashboardMetrics = { planProgress, trainingStreak, confirmedCapacity };
})();

