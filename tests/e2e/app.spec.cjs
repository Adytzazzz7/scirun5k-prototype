const { expect, test } = require('@playwright/test');

test('creates a profile, restores a paused workout, and resets local data', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#onboarding')).toHaveClass(/active/);

  await page.locator('#safetyAck').check();
  await page.locator('#createPlan').click();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  const savedState = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(savedState.profile.safetyAck).toBe(true);

  await page.locator('#startWorkout').click();
  await expect(page.locator('#workout')).toHaveClass(/active/);
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

  await page.locator('#nav-profile').click();
  await expect(page.locator('#profile')).toHaveClass(/active/);
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
