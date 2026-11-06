const { expect, test } = require('@playwright/test');
const { createProfile, startWorkout } = require('./helpers.cjs');

test('creates a treadmill profile, restores a paused workout, and resets local data', async ({ page }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);
  await page.clock.install({ time: new Date('2026-11-03T09:00:00Z') });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await createProfile(page);
  const savedState = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(savedState.profile.safetyAnswer).toBe('no');
  expect(savedState.profile.sessionsPerWeek).toBe(3);
  expect(savedState.profile.age).toBeUndefined();
  expect(savedState.profile.sex).toBeUndefined();

  await startWorkout(page);
  const pauseButton = page.locator('#workoutPause');
  await expect(pauseButton).toContainText('Pauză');
  await pauseButton.click();
  await expect(pauseButton).toContainText('Continuă');
  const pausedTimer = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.activeTimer')));
  expect(pausedTimer.paused).toBe(true);

  await page.reload();
  await expect(page.locator('#workout')).toHaveClass(/active/);
  await expect(page.locator('#workoutPause')).toContainText('Continuă');
  await page.locator('#workoutPause').click();
  await expect(page.locator('#workoutPause')).toContainText('Pauză');
  const resumedTimer = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.activeTimer')));
  expect(resumedTimer.paused).toBe(false);
  const displayedBefore = await page.locator('#timerBig').textContent();
  await page.clock.fastForward(2_000);
  await expect(page.locator('#timerBig')).not.toHaveText(displayedBefore);

  await page.locator('#workoutBack').click();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  await page.locator('#nav-account').click();
  await expect(page.locator('#account')).toHaveClass(/active/);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#resetApp').click();
  await expect(page.locator('#onboarding')).toHaveClass(/active/);

  const remainingData = await page.evaluate(() => ({
    state: localStorage.getItem('scirun.state'),
    timer: localStorage.getItem('scirun.activeTimer'),
    pending: localStorage.getItem('scirun.pendingSession'),
  }));
  expect(remainingData).toEqual({ state: null, timer: null, pending: null });
  expect(pageErrors).toEqual([]);
});


test('stops configuration when a running limitation is reported', async ({ page }) => {
  await page.goto('/');
  await page.locator('#safetyAnswer').selectOption('yes');
  await page.locator('#setupContinue').click();
  await expect(page.locator('#safetyStop')).toBeVisible();
  await expect(page.locator('#setupStepTwo')).not.toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('scirun.state'))).toBeNull();
});
