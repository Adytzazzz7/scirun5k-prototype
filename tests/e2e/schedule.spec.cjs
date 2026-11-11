const { expect, test } = require('@playwright/test');
const { createProfile } = require('./helpers.cjs');

test('changes weekly frequency and moves a workout past unavailable dates', async ({ page }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(5_000);
  await page.clock.install({ time: new Date('2026-11-03T09:00:00Z') });
  await createProfile(page);
  await page.locator('#nav-account').click();
  await expect(page.locator('#account')).toHaveClass(/active/);

  await page.locator('#settingFrequency').selectOption('3');
  for (const day of [5]) await page.locator('#scheduleDays input[value="' + day + '"]').uncheck();
  for (const day of [1, 2, 3]) await page.locator('#scheduleDays input[value="' + day + '"]').check();
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

test('frequency fixes the exact number of selectable days in setup and Account', async ({ page }) => {
  await page.goto('/');
  await page.locator('#safetyAnswer').selectOption('no');
  await page.locator('#setupContinue').click();
  await page.locator('#sessionsPerWeek').selectOption('2');
  await expect(page.locator('#dayChoices input:checked')).toHaveCount(2);
  await expect(page.locator('#dayChoices input:not(:checked):disabled')).toHaveCount(5);
  await expect(page.locator('#setupDayHint')).toContainText('exact 2 zile');
  await page.locator('#createPlan').click();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  await page.locator('#nav-account').click();
  await expect(page.locator('#scheduleDays input:checked')).toHaveCount(2);
  await page.locator('#settingFrequency').selectOption('4');
  await expect(page.locator('#scheduleDays input:not(:checked):disabled')).toHaveCount(0);
  await page.locator('#scheduleDays input[value="2"]').check();
  await page.locator('#scheduleDays input[value="6"]').check();
  await expect(page.locator('#scheduleDays input:checked')).toHaveCount(4);
  await expect(page.locator('#scheduleDays input:not(:checked):disabled')).toHaveCount(3);
  await page.locator('#saveSchedule').click();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(state.profile.sessionsPerWeek).toBe(4);
  expect(state.profile.trainingDays).toHaveLength(4);
});

test('legacy extra weekdays migrate to the same scheduled subset without losing history', async ({ page }) => {
  await createProfile(page);
  const before = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('scirun.state'));
    state.profile.sessionsPerWeek = 2;
    state.profile.trainingDays = [1, 2, 3, 4, 5];
    state.history = [{ id: 708, date: '2026-10-01', completedAt: '2026-10-01T12:00:00.000Z', level: 0, status: 'done', effort: 'easy', completion: 1, timerCompletion: 1, elapsed: 600, week: 1, distanceKm: 2.1 }];
    localStorage.setItem('scirun.state', JSON.stringify(state));
    return state.history;
  });
  await page.reload();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(state.profile.trainingDays).toEqual([1, 4]);
  expect(state.history).toEqual(before);
  await page.locator('#nav-account').click();
  await expect(page.locator('#scheduleDays input:checked')).toHaveCount(2);
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
