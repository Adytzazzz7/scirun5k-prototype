const { test, expect } = require('@playwright/test');
const { createProfile } = require('./helpers.cjs');

test('mobile navigation separates activity, visuals and account controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createProfile(page);
  expect(await page.locator('#nav button').count()).toBe(4);
  for (const [view, label] of [
    ['dashboard', 'Panou'], ['history', 'Istoric'], ['settings', 'Setări'], ['account', 'Cont'],
  ]) {
    const button = page.locator('#nav-' + view);
    await expect(button).toContainText(label);
    expect(await button.locator('svg').count()).toBe(1);
    const box = await button.boundingBox();
    if (!box || box.height < 44) throw new Error(view + ' has a small touch target');
  }
  const navBox = await page.locator('#nav').boundingBox();
  if (navBox.y < page.viewportSize().height / 2) throw new Error('Mobile navigation is not at the bottom');
  if (await page.locator('#dashboard #weeklyView').count()) throw new Error('Weekly schedule stayed on Dashboard');
  if (await page.locator('#dashboard #recentSessions').count()) throw new Error('Recent workouts stayed on Dashboard');
  if (await page.locator('#workoutTypeTag').count()) throw new Error('Timed intervals badge stayed on Dashboard');

  await page.locator('#nav-history').click();
  expect(await page.locator('#history #recentSessions').count()).toBe(0);
  expect(await page.locator('#history .recent-card').count()).toBe(0);
  await expect(page.locator('#historyList .history-empty')).toBeVisible();
  await page.locator('#nav-settings').click();
  await expect(page.locator('.palette-settings-card')).toBeVisible();
  await expect(page.locator('.palette-settings-card h2')).toContainText('Visuals');
  const themeBox = await page.locator('#themeToggle').boundingBox();
  const contrastBox = await page.locator('#contrastToggle').boundingBox();
  if (!themeBox || !contrastBox || Math.abs(themeBox.y - contrastBox.y) > 3) throw new Error('Visual toggles are not side by side');
  if (themeBox.height < 44 || contrastBox.height < 44) throw new Error('Visual toggle touch target is too small');
  if (await page.locator('#settings #saveSchedule').count()) throw new Error('Schedule stayed in Settings');
  await page.locator('#lang-en').click();
  await expect(page.locator('#nav-account')).toContainText('Account');
  await page.locator('#nav-account').click();
  await expect(page.locator('#account #weeklyView')).toBeVisible();
  for (const id of ['settingFrequency', 'unavailableStart', 'editProfile', 'exportData', 'importBackup', 'resetApp']) {
    expect(await page.locator('#account #' + id).count()).toBe(1);
  }
  expect(await page.locator('#weeklyView').evaluate(element => element.closest('article.card').querySelector('h2').textContent)).toBe('Schedule');
});

test('account schedule and unavailable dates still save without touching history', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createProfile(page);
  const historyBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')).history);
  await page.locator('#nav-account').click();
  await page.locator('#settingFrequency').selectOption('2');
  await page.locator('#saveSchedule').click();
  const frequency = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')).profile.sessionsPerWeek);
  expect(frequency).toBe(2);

  await page.locator('#addUnavailable').click();
  await expect(page.locator('#unavailableMessage')).toContainText('Alege o perioadă validă');
  await page.locator('#unavailableStart').fill('2026-11-10');
  await page.locator('#unavailableEnd').fill('2026-11-10');
  await page.locator('#addUnavailable').click();
  await expect(page.locator('#unavailableMessage')).toContainText('Perioada a fost marcată');
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(state.blackoutDates.includes('2026-11-10')).toBe(true);
  expect(state.history).toEqual(historyBefore);
});

test('mobile Panou shows one speed value and Istoric lists each saved session once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createProfile(page);
  const original = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('scirun.state'));
    state.profile.runSpeed = 8.5;
    state.profile.walkSpeed = 5.5;
    state.history = [{
      id: 555, date: state.profile.startDate, level: state.level,
      status: 'done', effort: 'easy', completion: 1, timerCompletion: 1,
      elapsed: 600, week: 1, distanceKm: 2.4,
      completedAt: state.profile.startDate + 'T12:00:00.000Z',
    }];
    localStorage.setItem('scirun.state', JSON.stringify(state));
    return JSON.stringify(state.history);
  });
  await page.reload();
  await expect(page.locator('#dashboard #suggestedSpeed')).toHaveText('8.5 km/h');
  await expect(page.locator('#dashboard #homeRunSpeed')).toHaveCount(0);
  await expect(page.locator('#dashboard #totalDistance')).toContainText('2,4 km');
  const metricRows = await page.locator('#dashboard .workout-metrics > div').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().top)));
  const summaryRows = await page.locator('#dashboard .home-stats .stat').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().top)));
  expect(new Set(metricRows).size).toBe(1);
  expect(new Set(summaryRows).size).toBe(1);
  await expect(page.locator('#toast')).toHaveClass(/hidden/);
  await page.screenshot({ path: 'test-results/premium-panou-dark.png', fullPage: true, animations: 'disabled' });
  await page.locator('#nav-history').click();
  await expect(page.locator('#historyList .history-entry')).toHaveCount(1);
  await expect(page.locator('#history .recent-session')).toHaveCount(0);
  const historyRows = await page.locator('#history .history-stats .stat').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().top)));
  expect(new Set(historyRows).size).toBe(1);
  await page.screenshot({ path: 'test-results/premium-history-dark.png', fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('scirun.state')).history))).toBe(original);
});

test('history distinguishes earlier years while the distance chart uses saved sessions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2026-11-07T12:00:00Z'));
  await createProfile(page);
  const original = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('scirun.state'));
    state.history = [
      { id: 501, date: '2025-11-07', completedAt: '2025-11-07T12:00:00.000Z', level: 0, status: 'done', effort: 'easy', completion: 1, timerCompletion: 1, elapsed: 600, week: 1, distanceKm: 2.1 },
      { id: 502, date: '2026-11-07', completedAt: '2026-11-07T12:00:00.000Z', level: 0, status: 'done', effort: 'easy', completion: 1, timerCompletion: 1, elapsed: 650, week: 1, distanceKm: 2.4 },
    ];
    localStorage.setItem('scirun.state', JSON.stringify(state));
    return JSON.stringify(state.history);
  });
  await page.reload();
  await expect(page.locator('#dashboard .distance-column')).toHaveCount(2);
  await page.locator('#nav-history').click();
  await expect(page.locator('#historyList .history-entry')).toHaveCount(2);
  await expect(page.locator('#historyList .history-year')).toHaveText('2025');
  expect(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('scirun.state')).history))).toBe(original);
});
