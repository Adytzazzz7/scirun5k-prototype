const { test, expect } = require('@playwright/test');
const { createProfile } = require('./helpers.cjs');

test('mobile navigation separates activity, visuals and account controls', async ({ page }) => {
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
  expect(await page.locator('#history #recentSessions').count()).toBe(1);
  expect(await page.locator('#history .recent-card').isVisible()).toBe(false);
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
