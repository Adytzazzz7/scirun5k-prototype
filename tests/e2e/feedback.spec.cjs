const { expect, test } = require('@playwright/test');

test('saves completed workout feedback, advances the plan, and restores history after reload', async ({ page }) => {
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
  expect(initialState.easyStreak).toBe(0);

  for (let sessionNumber = 1; sessionNumber <= 2; sessionNumber += 1) {
    await page.locator('#startWorkout').click();
    await expect(page.locator('#workout')).toHaveClass(/active/);

    // Advance the browser clock so the normal timer interval completes every workout segment.
    await page.clock.fastForward(60 * 60 * 1000);
    await expect(page.locator('#saveFeedback')).toBeVisible();

    const pendingSession = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.pendingSession')));
    expect(pendingSession.completedNaturally).toBe(true);
    expect(pendingSession.completion).toBe(1);

    await page.locator('#workout [data-ratio="1"]').click();
    await page.locator('#workout [data-effort="easy"]').click();
    await page.locator('#saveFeedback').click();
    await expect(page.locator('#dashboard')).toHaveClass(/active/);

    const savedState = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
    expect(savedState.history).toHaveLength(sessionNumber);
    expect(savedState.history.at(-1).status).toBe('done');
    expect(savedState.history.at(-1).effort).toBe('easy');
  }

  const completedState = await page.evaluate(() => ({
    state: JSON.parse(localStorage.getItem('scirun.state')),
    activeTimer: localStorage.getItem('scirun.activeTimer'),
    pendingSession: localStorage.getItem('scirun.pendingSession'),
  }));
  expect(completedState.state.level).toBe(startingLevel + 1);
  expect(completedState.state.easyStreak).toBe(0);
  expect(completedState.state.history).toHaveLength(2);
  expect(completedState.activeTimer).toBeNull();
  expect(completedState.pendingSession).toBeNull();

  await page.reload();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  const restoredState = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(restoredState.level).toBe(startingLevel + 1);
  expect(restoredState.history).toHaveLength(2);
  expect(restoredState.history.every(session => session.status === 'done')).toBe(true);
  expect(pageErrors).toEqual([]);
});
