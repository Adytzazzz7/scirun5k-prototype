const { expect, test } = require('@playwright/test');
const { createProfile } = require('./helpers.cjs');

test('changes weekly frequency and moves a workout past unavailable dates', async ({ page }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(5_000);
  await page.clock.install({ time: new Date('2026-11-03T09:00:00Z') });
  await createProfile(page);
  await page.locator('#nav-settings').click();
  await expect(page.locator('#settings')).toHaveClass(/active/);

  await page.locator('#settingFrequency').selectOption('3');
  for (const day of [1, 2, 3]) await page.locator('#scheduleDays input[value="' + day + '"]').check();
  for (const day of [5]) await page.locator('#scheduleDays input[value="' + day + '"]').uncheck();
  await page.locator('#saveSchedule').click();
  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(state.profile.sessionsPerWeek).toBe(3);
  expect(state.profile.trainingDays).toEqual([1, 2, 3]);

  const estimateBefore = await page.locator('#goalDate').textContent();
  await page.locator('#unavailableStart').fill('2026-11-03');
  await page.locator('#unavailableEnd').fill('2026-11-09');
  await page.locator('#addUnavailable').click();
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(state.blackoutDates).toHaveLength(7);
  expect(state.blackoutDates).toContain('2026-11-03');
  await expect(page.locator('#unavailableList')).toContainText('3 nov.');
  await expect(page.locator('#goalDate')).not.toHaveText(estimateBefore);
});
