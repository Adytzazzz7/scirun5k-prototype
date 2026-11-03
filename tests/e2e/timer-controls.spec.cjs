const { expect, test } = require('@playwright/test');
const { createProfile, startWorkout } = require('./helpers.cjs');

test('skips immediately, retains the workout when abandonment is cancelled, and discards on confirmation', async ({ page }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await createProfile(page);
  await startWorkout(page);
  const originalTimer = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.activeTimer')));
  const dialogs=[];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.locator('#workoutSkip').click();
  await expect(page.locator('#workoutPause')).toBeVisible();
  const skippedTimer = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.activeTimer')));
  expect(skippedTimer.index).toBe(originalTimer.index + 1);
  expect(skippedTimer.skippedSegments).toBe(1);
  expect(dialogs).toEqual([]);

  await page.locator('#workoutAbandon').click();
  await expect(page.locator('#confirmAbandon')).toBeVisible();
  await page.locator('#keepWorkout').click();
  await expect(page.locator('#workoutPause')).toBeVisible();
  const keptTimer = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.activeTimer')));
  expect(keptTimer.index).toBe(skippedTimer.index);

  await page.locator('#workoutAbandon').click();
  await page.locator('#confirmAbandon').click();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  const discardedState = await page.evaluate(() => ({
    state: JSON.parse(localStorage.getItem('scirun.state')),
    activeTimer: localStorage.getItem('scirun.activeTimer'),
    pendingSession: localStorage.getItem('scirun.pendingSession'),
  }));
  expect(discardedState.state.profile.safetyAnswer).toBe('no');
  expect(discardedState.state.history).toHaveLength(0);
  expect(discardedState.activeTimer).toBeNull();
  expect(discardedState.pendingSession).toBeNull();
  await page.reload();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  expect(pageErrors).toEqual([]);
});


test('skipping a timer interval does not turn an otherwise completed workout into a partial session', async ({ page }) => {
  const { createProfile, startWorkout, submitWorkoutFeedback } = require('./helpers.cjs');
  test.setTimeout(60_000);
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);
  await page.clock.install({ time: new Date('2026-11-03T09:00:00Z') });
  await createProfile(page);
  await startWorkout(page);

  for (let i = 0; i < 2; i += 1) {
    await page.locator('#workoutSkip').click();
  }
  await page.clock.fastForward(60 * 60 * 1000);
  await expect(page.locator('#saveFeedback')).toBeVisible();
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.pendingSession')));
  expect(pending.completedNaturally).toBe(true);
  expect(pending.skippedRunSeconds).toBeGreaterThan(0);

  await submitWorkoutFeedback(page, { distance: '1.80', effort: 'moderate' });
  await page.locator('#saveFeedback').click();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(state.history).toHaveLength(1);
  expect(state.history[0].status).toBe('done');
  expect(state.history[0].completion).toBe(1);
  expect(state.history[0].distanceKm).toBe(1.8);
});
