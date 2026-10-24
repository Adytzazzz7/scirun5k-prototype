// Pure timer calculations shared by the app and its Node regression tests.
(() => {
  function advanceTimer(timer, now = Date.now()) {
    if (timer.finished === true || timer.index >= timer.segments.length) {
      return { changed: false, complete: true };
    }
    if (timer.paused) return { changed: false, complete: false };
    const previousIndex = timer.index;
    while (timer.index < timer.segments.length - 1 && now >= timer.segmentEnd) {
      timer.index += 1;
      timer.segmentEnd += timer.segments[timer.index].seconds * 1000;
    }
    timer.remaining = Math.max(0, (timer.segmentEnd - now) / 1000);
    timer.elapsed = Math.max(0,
      timer.segments.slice(0, timer.index).reduce((sum, segment) => sum + segment.seconds, 0)
      - (timer.skippedElapsedSeconds || 0)
    );
    return { changed: timer.index !== previousIndex, complete: now >= timer.segmentEnd && timer.index === timer.segments.length - 1 };
  }

  function runCompletion(timer, now = Date.now()) {
    const planned = timer.segments.filter(segment => segment.type === 'run').reduce((sum, segment) => sum + segment.seconds, 0);
    const finished = timer.segments.slice(0, timer.index).filter(segment => segment.type === 'run').reduce((sum, segment) => sum + segment.seconds, 0);
    const current = timer.segments[timer.index];
    const remaining = timer.paused ? timer.remaining : Math.max(0, (timer.segmentEnd - now) / 1000);
    const currentRun = current && current.type === 'run' ? current.seconds - remaining : 0;
    // Skipping closes the interval for timer progress; actual active time is
    // tracked separately and stays accurate in feedback and history.
    const completed = Math.max(0, finished + currentRun);
    return planned ? Math.min(1, completed / planned) : 0;
  }

  function skipSegment(timer, now = Date.now()) {
    const progress = advanceTimer(timer, now);
    if (progress.complete) return { changed: progress.changed, complete: true, skipped: false };

    const segment = timer.segments[timer.index];
    if (!segment) return { changed: false, complete: true, skipped: false };

    const remaining = timer.paused
      ? Math.max(0, timer.remaining || 0)
      : Math.max(0, (timer.segmentEnd - now) / 1000);
    const skippedSeconds = Math.min(segment.seconds, remaining);
    const elapsedSeconds = Math.max(0, segment.seconds - skippedSeconds);
    const isLastSegment = timer.index + 1 >= timer.segments.length;

    timer.skippedSegments = (timer.skippedSegments || 0) + 1;
    if (segment.type === 'run') {
      timer.skippedRunSeconds = (timer.skippedRunSeconds || 0) + segment.seconds;
      timer.skippedRunElapsedSeconds = (timer.skippedRunElapsedSeconds || 0) + elapsedSeconds;
    }
    timer.skippedElapsedSeconds = (timer.skippedElapsedSeconds || 0) + skippedSeconds;
    timer.elapsed = Math.max(0, (timer.elapsed || 0) + elapsedSeconds);
    if (isLastSegment) {
      timer.index += 1;
      timer.remaining = 0;
      timer.segmentEnd = now;
      timer.finished = true;
      return { changed: true, complete: true, skipped: true, elapsedSeconds };
    }
    timer.index += 1;
    timer.remaining = timer.segments[timer.index].seconds;
    timer.segmentEnd = now + timer.remaining * 1000;

    return { changed: true, complete: false, skipped: true, elapsedSeconds };
  }

  function isFullSession(completedNaturally, feedbackCompletion) {
    return completedNaturally === true && feedbackCompletion === 1;
  }

  globalThis.SciRunTimerCore = { advanceTimer, runCompletion, skipSegment, isFullSession };
})();

