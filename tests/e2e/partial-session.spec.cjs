const { expect, test } = require('@playwright/test');
const { createProfile, startWorkout, submitWorkoutFeedback } = require('./helpers.cjs');

test('confirms stopping early, restores feedback, and saves one partial session', async ({ page }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);
  await page.clock.install({ time: new Date('2026-11-03T09:00:00Z') });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await createProfile(page);
  const startingLevel = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')).level);
  await startWorkout(page);
  const timeTo75PercentOfPlannedRunning = await page.evaluate(() => {
    const timer = JSON.parse(localStorage.getItem('scirun.activeTimer'));
    const targetRunningSeconds = timer.segments.filter(segment => segment.type === 'run')
      .reduce((total, segment) => total + segment.seconds, 0) * 0.75;
    let elapsedSeconds = 0, completedRunningSeconds = 0;
    for (const segment of timer.segments) {
      if (segment.type === 'run') {
        const remainingTarget = targetRunningSeconds - completedRunningSeconds;
        if (remainingTarget <= segment.seconds) return (elapsedSeconds + remainingTarget) * 1000;
        completedRunningSeconds += segment.seconds;
      }
      elapsedSeconds += segment.seconds;
    }
    throw new Error('Could not calculate partial workout time');
  });
  await page.clock.fastForward(timeTo75PercentOfPlannedRunning);
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('parțială'); await dialog.accept(); });
  await page.locator('#workoutFinish').click();
  await expect(page.locator('#saveFeedback')).toBeVisible();

  const pending = await page.evaluate(() => ({
    session: JSON.parse(localStorage.getItem('scirun.pendingSession')),
    activeTimer: localStorage.getItem('scirun.activeTimer'),
  }));
  expect(pending.session.completedNaturally).toBe(false);
  expect(pending.session.completion).toBeGreaterThan(0);
  expect(pending.session.completion).toBeLessThan(1);
  expect(pending.activeTimer).toBeNull();
  expect(await page.locator('.workout-feedback-note').textContent()).toContain('parțială');
  const sessionId = pending.session.id;

  await page.reload();
  await expect(page.locator('#saveFeedback')).toBeVisible();
  await submitWorkoutFeedback(page, { distance: '1.70', effort: 'easy' });
  await page.locator('#saveFeedback').click();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);

  const saved = await page.evaluate(() => ({
    state: JSON.parse(localStorage.getItem('scirun.state')),
    pending: localStorage.getItem('scirun.pendingSession'),
    timer: localStorage.getItem('scirun.activeTimer'),
  }));
  expect(saved.state.level).toBe(startingLevel);
  expect(saved.state.easyStreak).toBe(0);
  expect(saved.state.history).toHaveLength(1);
  expect(saved.state.history[0]).toMatchObject({ id: sessionId, status: 'partial', effort: 'easy', distanceKm: 1.7 });
  expect(saved.pending).toBeNull();
  expect(saved.timer).toBeNull();
  await page.reload();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  expect(pageErrors).toEqual([]);
});
