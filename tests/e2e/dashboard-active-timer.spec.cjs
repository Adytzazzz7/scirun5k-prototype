const { test, expect } = require('@playwright/test');
const { createProfile, startWorkout } = require('./helpers.cjs');

test('dashboard return card mirrors the live timer without changing training state', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-03T09:00:00Z') });
  await createProfile(page);
  await startWorkout(page);
  const before = await page.evaluate(() => localStorage.getItem('scirun.state'));
  await page.locator('#workoutBack').click();
  await expect(page.locator('#dashboardTimerPreview')).toBeVisible();
  await expect(page.locator('#heroStart')).toContainText('Revino la sesiune');
  expect(await page.locator('#heroStart').evaluate(button => button.parentElement.id)).toBe('dashboardTimerAction');
  const first = await page.locator('#dashboardTimerRemaining').textContent();
  await page.clock.fastForward(10_000);
  const second = await page.locator('#dashboardTimerRemaining').textContent();
  if (first === second) throw new Error('The dashboard timer did not advance');
  expect(await page.evaluate(() => localStorage.getItem('scirun.state'))).toBe(before);

  await page.locator('#heroStart').click();
  await page.locator('#workoutPause').click();
  await page.locator('#workoutBack').click();
  const paused = await page.locator('#dashboardTimerRemaining').textContent();
  await page.clock.fastForward(10_000);
  expect(await page.locator('#dashboardTimerRemaining').textContent()).toBe(paused);
  await page.locator('#heroStart').click();
  await expect(page.locator('#workout')).toHaveClass(/active/);
});
