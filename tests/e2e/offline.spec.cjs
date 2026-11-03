const { expect, test } = require('@playwright/test');

test('restores a paused workout from the service worker cache while offline', async ({ page }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#onboarding')).toHaveClass(/active/);
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return Boolean(registration?.active && navigator.serviceWorker.controller);
  }, { timeout: 15_000 });

  await page.locator('#safetyAck').check();
  await page.locator('#createPlan').click();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  await page.locator('#startWorkout').click();
  await expect(page.locator('#workout')).toHaveClass(/active/);
  await page.locator('#workoutPause').click();
  await expect(page.locator('#workoutPause')).toContainText('Continuă');

  const savedTimer = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.activeTimer')));
  expect(savedTimer.paused).toBe(true);

  await page.context().setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await page.reload();

  await expect(page.locator('#workout')).toHaveClass(/active/);
  await expect(page.locator('#workoutPause')).toContainText('Continuă');
  const restoredState = await page.evaluate(() => ({
    offline: !navigator.onLine,
    controlled: Boolean(navigator.serviceWorker.controller),
    timer: JSON.parse(localStorage.getItem('scirun.activeTimer')),
    profile: JSON.parse(localStorage.getItem('scirun.state'))?.profile,
  }));
  expect(restoredState.offline).toBe(true);
  expect(restoredState.controlled).toBe(true);
  expect(restoredState.timer.paused).toBe(true);
  expect(restoredState.profile.safetyAck).toBe(true);
  expect(pageErrors).toEqual([]);
});
