// Pure timer calculations shared by the app and its Node regression tests.
(() => {
  function advanceTimer(timer, now = Date.now()) {
    if (timer.paused) return { changed: false, complete: false };
    const previousIndex = timer.index;
    while (timer.index < timer.segments.length - 1 && now >= timer.segmentEnd) {
      timer.index += 1;
      timer.segmentEnd += timer.segments[timer.index].seconds * 1000;
    }
    timer.remaining = Math.max(0, (timer.segmentEnd - now) / 1000);
    timer.elapsed = timer.segments.slice(0, timer.index).reduce((sum, segment) => sum + segment.seconds, 0);
    return { changed: timer.index !== previousIndex, complete: now >= timer.segmentEnd && timer.index === timer.segments.length - 1 };
  }

  function runCompletion(timer, now = Date.now()) {
    const planned = timer.segments.filter(segment => segment.type === 'run').reduce((sum, segment) => sum + segment.seconds, 0);
    const finished = timer.segments.slice(0, timer.index).filter(segment => segment.type === 'run').reduce((sum, segment) => sum + segment.seconds, 0);
    const current = timer.segments[timer.index];
    const remaining = timer.paused ? timer.remaining : Math.max(0, (timer.segmentEnd - now) / 1000);
    const currentRun = current.type === 'run' ? current.seconds - remaining : 0;
    const completed = Math.max(0, finished + currentRun - (timer.skippedRunSeconds || 0));
    return planned ? Math.min(1, completed / planned) : 0;
  }

  function isFullSession(completedNaturally, feedbackCompletion) {
    return completedNaturally === true && feedbackCompletion === 1;
  }

  globalThis.SciRunTimerCore = { advanceTimer, runCompletion, isFullSession };
})();

