const { expect, test } = require('@playwright/test');

test('restores an interrupted workout for feedback and saves it once as partial', async ({ page }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);
  await page.clock.install({ time: new Date('2026-11-03T09:00:00Z') });

  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#onboarding')).toHaveClass(/active/);
  await page.locator('#safetyAck').check();
  await page.locator('#createPlan').click();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  const initialState = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  const startingLevel = initialState.level;

  await page.locator('#startWorkout').click();
  await expect(page.locator('#workout')).toHaveClass(/active/);
  const timeTo75PercentOfPlannedRunning = await page.evaluate(() => {
    const timer = JSON.parse(localStorage.getItem('scirun.activeTimer'));
    const plannedRunningSeconds = timer.segments
      .filter(segment => segment.type === 'run')
      .reduce((total, segment) => total + segment.seconds, 0);
    const targetRunningSeconds = plannedRunningSeconds * 0.75;
    let elapsedSeconds = 0;
    let completedRunningSeconds = 0;

    for (const segment of timer.segments) {
      if (segment.type === 'run') {
        const remainingTarget = targetRunningSeconds - completedRunningSeconds;
        if (remainingTarget <= segment.seconds) {
          return (elapsedSeconds + remainingTarget) * 1000;
        }
        completedRunningSeconds += segment.seconds;
      }
      elapsedSeconds += segment.seconds;
    }
    throw new Error('Could not calculate the partial workout time');
  });
  await page.clock.fastForward(timeTo75PercentOfPlannedRunning);
  await page.locator('#workoutFinish').click();
  await expect(page.locator('#saveFeedback')).toBeVisible();

  const interruptedSession = await page.evaluate(() => ({
    session: JSON.parse(localStorage.getItem('scirun.pendingSession')),
    activeTimer: localStorage.getItem('scirun.activeTimer'),
  }));
  expect(interruptedSession.session.completedNaturally).toBe(false);
  expect(interruptedSession.session.completion).toBeGreaterThan(0);
  expect(interruptedSession.session.completion).toBeLessThan(1);
  expect(interruptedSession.activeTimer).toBeNull();
  expect(await page.locator('.workout-feedback-note').textContent()).toContain('parțială');
  const sessionId = interruptedSession.session.id;

  await page.reload();
  await expect(page.locator('#saveFeedback')).toBeVisible();
  await expect(page.locator('.workout-feedback-note')).toContainText('parțială');
  const restoredPending = await page.evaluate(() => ({
    session: JSON.parse(localStorage.getItem('scirun.pendingSession')),
    savedHistory: JSON.parse(localStorage.getItem('scirun.state')).history,
  }));
  expect(restoredPending.session.id).toBe(sessionId);
  expect(restoredPending.session.completedNaturally).toBe(false);
  expect(restoredPending.savedHistory).toHaveLength(0);

  await page.locator('#workout [data-ratio="0.75"]').click();
  await page.locator('#workout [data-effort="easy"]').click();
  await page.locator('#saveFeedback').click();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);

  const savedState = await page.evaluate(() => ({
    state: JSON.parse(localStorage.getItem('scirun.state')),
    pendingSession: localStorage.getItem('scirun.pendingSession'),
    activeTimer: localStorage.getItem('scirun.activeTimer'),
  }));
  expect(savedState.state.level).toBe(startingLevel);
  expect(savedState.state.easyStreak).toBe(0);
  expect(savedState.state.history).toHaveLength(1);
  expect(savedState.state.history[0]).toMatchObject({
    id: sessionId,
    status: 'partial',
    effort: 'easy',
    completion: 0.75,
  });
  expect(savedState.pendingSession).toBeNull();
  expect(savedState.activeTimer).toBeNull();

  await page.reload();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  const restoredState = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(restoredState.level).toBe(startingLevel);
  expect(restoredState.history).toHaveLength(1);
  expect(restoredState.history[0].id).toBe(sessionId);
  expect(restoredState.history[0].status).toBe('partial');
  expect(pageErrors).toEqual([]);
});
