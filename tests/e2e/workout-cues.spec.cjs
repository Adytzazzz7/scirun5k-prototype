const { expect, test } = require('@playwright/test');
const { createProfile, startWorkout } = require('./helpers.cjs');

async function trackSignals(page) {
  await page.clock.install({ time: new Date('2026-11-03T09:00:00Z') });
  await page.addInitScript(() => {
    window.vibrationLog = [];
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: pattern => { window.vibrationLog.push(pattern); return true; },
    });
  });
}

const vibrations = page => page.evaluate(() => window.vibrationLog);

async function crossNextBoundary(page, extra = 400) {
  const remaining = await page.evaluate(() => currentTimer.segmentEnd - Date.now());
  await page.clock.fastForward(Math.max(0, remaining) + extra);
}

test('announces a live phase change once and uses a distinct completion cue', async ({ page }) => {
  await trackSignals(page);
  await createProfile(page);
  await page.locator('#nav-settings').click();
  const setting = page.locator('#vibrationPreference');
  await expect(setting).toBeVisible();
  await expect(setting).toHaveAttribute('aria-pressed', 'false');
  await setting.click();
  await page.reload();
  await page.locator('#nav-settings').click();
  await expect(setting).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#nav-dashboard').click();
  await startWorkout(page);
  expect(await vibrations(page)).toEqual([]);

  await crossNextBoundary(page);
  await expect(page.locator('#currentInterval')).toContainText('ALERGARE');
  await expect(page.locator('#workoutRing')).toHaveAttribute('data-workout-signal', 'phase');
  expect(await vibrations(page)).toHaveLength(1);
  await page.clock.fastForward(1_800);
  expect(await vibrations(page)).toHaveLength(1);
  await page.locator('#workoutPause').click();
  await page.locator('#workoutPause').click();
  expect(await vibrations(page)).toHaveLength(1);

  await page.locator('#workoutSkip').click();
  await expect(page.locator('#currentInterval')).toContainText('MERS');
  expect(await vibrations(page)).toHaveLength(2);

  const untilCooldown = await page.evaluate(() =>
    currentTimer.segmentEnd - Date.now() +
    currentTimer.segments.slice(currentTimer.index + 1, -1).reduce((total, phase) => total + phase.seconds * 1000, 0)
  );
  await page.clock.fastForward(untilCooldown + 400);
  await expect(page.locator('#currentInterval')).toContainText('REVENIRE');
  expect(await vibrations(page)).toHaveLength(2);
  await crossNextBoundary(page);
  await expect(page.locator('.workout-feedback-summary')).toHaveAttribute('data-workout-signal', 'complete');
  const log = await vibrations(page);
  expect(log).toHaveLength(3);
  expect(typeof log[0]).toBe('number');
  expect(log[2]).toHaveLength(3);
  await page.reload();
  await expect(page.locator('#actualDistance')).toBeVisible();
  expect(await vibrations(page)).toEqual([]);
});

test('keeps visual feedback with reduced motion and stays silent when vibration is off', async ({ page }) => {
  await trackSignals(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await createProfile(page);
  await startWorkout(page);
  await crossNextBoundary(page);
  const ring = page.locator('#workoutRing');
  await expect(ring).toHaveAttribute('data-workout-signal', 'phase');
  expect(await ring.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  expect(await ring.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('none');
  expect(await vibrations(page)).toEqual([]);
});
