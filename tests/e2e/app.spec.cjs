const { expect, test } = require('@playwright/test');

test('creates a profile, restores a paused workout, and resets local data', async ({ page }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/');
  console.log('E2E checkpoint: app loaded');
  await expect(page.locator('#onboarding')).toHaveClass(/active/);

  await page.locator('#safetyAck').check();
  await page.locator('#createPlan').click();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  const savedState = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(savedState.profile.safetyAck).toBe(true);
  console.log('E2E checkpoint: profile saved');

  await page.locator('#startWorkout').click();
  await expect(page.locator('#workout')).toHaveClass(/active/);
  console.log('E2E checkpoint: workout started');
  const pauseButton = page.locator('#workoutPause');
  await expect(pauseButton).toContainText('Pauză');
  await pauseButton.click();
  await expect(pauseButton).toContainText('Continuă');

  const pausedTimer = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.activeTimer')));
  expect(pausedTimer.paused).toBe(true);
  console.log('E2E checkpoint: timer paused and persisted');
  await page.reload();
  await expect(page.locator('#workout')).toHaveClass(/active/);
  await expect(page.locator('#workoutPause')).toContainText('Continuă');
  console.log('E2E checkpoint: paused workout restored after reload');

  await page.locator('#workoutPause').click();
  await expect(page.locator('#workoutPause')).toContainText('Pauză');
  const resumedTimer = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.activeTimer')));
  expect(resumedTimer.paused).toBe(false);
  console.log('E2E checkpoint: workout resumed');

  await page.locator('#nav-profile').click();
  await expect(page.locator('#profile')).toHaveClass(/active/);
  console.log('E2E checkpoint: profile view opened');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#resetApp').click();
  await expect(page.locator('#onboarding')).toHaveClass(/active/);

  const remainingData = await page.evaluate(() => ({
    state: localStorage.getItem('scirun.state'),
    timer: localStorage.getItem('scirun.activeTimer'),
    pending: localStorage.getItem('scirun.pendingSession'),
  }));
  expect(remainingData).toEqual({ state: null, timer: null, pending: null });
  console.log('E2E checkpoint: reset completed');
  expect(pageErrors).toEqual([]);
});
