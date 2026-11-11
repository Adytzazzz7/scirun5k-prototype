const { test, expect } = require('@playwright/test');
const { createProfile, startWorkout } = require('./helpers.cjs');

test('timer liquid rises from the bottom to the top without changing training data', async ({ page }) => {
  await createProfile(page);
  await startWorkout(page);
  const before = await page.evaluate(() => localStorage.getItem('scirun.state'));
  const ring = page.locator('#workoutRing');
  const front = ring.locator('.liquid-wave-front');
  const initial = await ring.evaluate(node => ({
    level: parseFloat(node.style.getPropertyValue('--liquid-level')),
    height: node.querySelector('.liquid-wave-front').getBoundingClientRect().height,
    surface: node.querySelectorAll('.liquid-surface').length,
  }));
  if (initial.level > .5 || initial.height > 2) throw new Error('Liquid is visible before the interval starts: ' + JSON.stringify(initial));
  expect(initial.surface).toBe(2);

  await page.evaluate(() => {
    const seconds = currentTimer.segments[currentTimer.index].seconds;
    currentTimer.segmentEnd = Date.now() + seconds * 500;
    updateWorkoutPage();
  });
  await page.waitForTimeout(700);
  const mid = await ring.evaluate(node => ({
    level: parseFloat(node.style.getPropertyValue('--liquid-level')),
    fill: node.querySelector('.liquid-wave-front').getBoundingClientRect().height,
    disk: node.querySelector('.workout-liquid').getBoundingClientRect().height,
    clipped: getComputedStyle(node.querySelector('.workout-liquid')).overflow,
  }));
  if (Math.abs(mid.level - 50) > 1 || mid.fill / mid.disk < .48 || mid.fill / mid.disk > .6 || mid.clipped !== 'hidden') {
    throw new Error('Liquid is not half full: ' + JSON.stringify(mid));
  }
  await page.evaluate(() => {
    const seconds = currentTimer.segments[currentTimer.index].seconds;
    currentTimer.segmentEnd = Date.now() + seconds * 10;
    updateWorkoutPage();
  });
  await page.waitForTimeout(700);
  const nearEnd = await ring.evaluate(node => ({
    level: parseFloat(node.style.getPropertyValue('--liquid-level')),
    fill: node.querySelector('.liquid-wave-front').getBoundingClientRect().height,
    disk: node.querySelector('.workout-liquid').getBoundingClientRect().height,
  }));
  if (nearEnd.level < 98 || nearEnd.fill / nearEnd.disk < .96) throw new Error('Liquid does not reach the top: ' + JSON.stringify(nearEnd));
  await page.locator('#workoutPause').click();
  expect(await front.locator('.liquid-surface').evaluate(node => getComputedStyle(node).animationPlayState)).toBe('paused');
  await page.locator('#workoutBack').click();
  if (await page.locator('#dashboardTimerDial').evaluate(node => parseFloat(node.style.getPropertyValue('--liquid-level'))) < 98) throw new Error('Dashboard liquid does not reach the top');
  expect(await page.evaluate(() => localStorage.getItem('scirun.state'))).toBe(before);
});
