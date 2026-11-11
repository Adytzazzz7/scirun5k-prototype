const { expect, test } = require('@playwright/test');
const { createProfile } = require('./helpers.cjs');

test('changes weekly frequency and moves a workout past unavailable dates', async ({ page }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(5_000);
  await page.clock.install({ time: new Date('2026-11-03T09:00:00Z') });
  await createProfile(page);
  await page.locator('#nav-account').click();
  await expect(page.locator('#account')).toHaveClass(/active/);
  await page.locator('#account .concept-program-summary').click();

  await page.locator('#settingFrequency').selectOption('3');
  for (const day of [1, 2, 3]) await page.locator('#scheduleDays input[value="' + day + '"]').check();
  for (const day of [5]) await page.locator('#scheduleDays input[value="' + day + '"]').uncheck();
  await page.locator('#saveSchedule').click();
  let state = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(state.profile.sessionsPerWeek).toBe(3);
  expect(state.profile.trainingDays).toEqual([1, 2, 3]);

  const estimateBefore = await page.locator('#goalDate').textContent();
  await page.locator('#account .concept-account-detail').first().locator('summary').click();
  await page.locator('#unavailableStart').fill('2026-11-03');
  await page.locator('#unavailableEnd').fill('2026-11-09');
  await page.locator('#addUnavailable').click();
  state = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(state.blackoutDates).toHaveLength(7);
  expect(state.blackoutDates).toContain('2026-11-03');
  await expect(page.locator('#unavailableList')).toContainText('3 nov.');
  await expect(page.locator('#goalDate')).not.toHaveText(estimateBefore);
});


test('automatically reprograms a missed workout and reports the new day', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-03T09:00:00Z') });
  await createProfile(page);
  const initial = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(initial.nextSessionDate).toBe('2026-11-04');
  await page.clock.fastForward(2 * 24 * 60 * 60 * 1000);
  await page.reload();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  await expect(page.locator('#toast')).toContainText('Sesiunea a fost reprogramată pentru');
  const moved = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(moved.nextSessionDate).toBe('2026-11-06');
  expect(moved.history).toHaveLength(0);
  expect(moved.level).toBe(initial.level);
});
