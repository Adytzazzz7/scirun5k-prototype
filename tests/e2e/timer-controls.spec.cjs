const { expect, test } = require('@playwright/test');

test('skips a segment, keeps the workout when abandonment is cancelled, and discards it on confirmation', async ({ page }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);

  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#onboarding')).toHaveClass(/active/);
  await page.locator('#safetyAck').check();
  await page.locator('#createPlan').click();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  await page.locator('#startWorkout').click();
  await expect(page.locator('#workout')).toHaveClass(/active/);

  const originalTimer = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.activeTimer')));
  await page.locator('#workoutSkip').click();
  await expect(page.locator('#workoutPause')).toBeVisible();
  const skippedTimer = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.activeTimer')));
  expect(skippedTimer.index).toBe(originalTimer.index + 1);
  expect(skippedTimer.skippedSegments).toBe(1);

  await page.locator('#workoutAbandon').click();
  await expect(page.locator('#confirmAbandon')).toBeVisible();
  await page.locator('#keepWorkout').click();
  await expect(page.locator('#workoutPause')).toBeVisible();
  const keptTimer = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.activeTimer')));
  expect(keptTimer.index).toBe(skippedTimer.index);
  expect(keptTimer.skippedSegments).toBe(1);

  await page.locator('#workoutAbandon').click();
  await page.locator('#confirmAbandon').click();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);

  const discardedState = await page.evaluate(() => ({
    state: JSON.parse(localStorage.getItem('scirun.state')),
    activeTimer: localStorage.getItem('scirun.activeTimer'),
    pendingSession: localStorage.getItem('scirun.pendingSession'),
  }));
  expect(discardedState.state.profile.safetyAck).toBe(true);
  expect(discardedState.state.history).toHaveLength(0);
  expect(discardedState.activeTimer).toBeNull();
  expect(discardedState.pendingSession).toBeNull();

  await page.reload();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  const restoredState = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(restoredState.history).toHaveLength(0);
  expect(localStorage).toBeDefined();
  expect(pageErrors).toEqual([]);
});
