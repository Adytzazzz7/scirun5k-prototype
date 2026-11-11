const { expect, test } = require('@playwright/test');
const { createProfile, startWorkout } = require('./helpers.cjs');

test('restores a paused treadmill workout from the service worker cache while offline', async ({ page }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await createProfile(page);
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return Boolean(registration?.active && navigator.serviceWorker.controller);
  }, { timeout: 15_000 });
  await startWorkout(page);
  await page.locator('#workoutPause').click();
  await expect(page.locator('#workoutPause')).toContainText('Reia');
  const savedTimer = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.activeTimer')));
  expect(savedTimer.paused).toBe(true);

  await page.context().setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await page.reload();
  await expect(page.locator('#workout')).toHaveClass(/active/);
  await expect(page.locator('#workoutPause')).toContainText('Reia');
  const restored = await page.evaluate(() => ({
    offline: !navigator.onLine,
    controlled: Boolean(navigator.serviceWorker.controller),
    timer: JSON.parse(localStorage.getItem('scirun.activeTimer')),
    profile: JSON.parse(localStorage.getItem('scirun.state'))?.profile,
  }));
  expect(restored.offline).toBe(true);
  expect(restored.controlled).toBe(true);
  expect(restored.timer.paused).toBe(true);
  expect(restored.profile.safetyAnswer).toBe('no');
  expect(pageErrors).toEqual([]);
});
