const { expect, test } = require('@playwright/test');

async function createProfile(page) {
  await page.goto('/');
  await expect(page.locator('#onboarding')).toHaveClass(/active/);
  await page.locator('#safetyAck').check();
  await page.locator('#createPlan').click();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
}

async function selectBackup(page, contents, name = 'backup.json') {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.locator('#importBackup').click();
  const fileChooser = await fileChooserPromise;
  const json = typeof contents === 'string' ? contents : JSON.stringify(contents);
  await fileChooser.setFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(json),
  });
}

test('rejects invalid backups and restores a valid backup after confirmation', async ({ page }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await createProfile(page);
  await page.locator('#nav-profile').click();
  await expect(page.locator('#profile')).toHaveClass(/active/);
  const originalState = await page.evaluate(() => localStorage.getItem('scirun.state'));

  await selectBackup(page, '{broken json', 'invalid.json');
  await expect(page.locator('#importError')).toContainText('Fișier invalid');
  expect(await page.evaluate(() => localStorage.getItem('scirun.state'))).toBe(originalState);

  const backup = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('scirun.state'));
    state.level = Math.min(state.level + 1, 14);
    state.profile.steps = 9876;
    state.goalReached = true;
    state.history = [{
      id: 555,
      date: state.profile.startDate,
      level: state.level,
      status: 'done',
      effort: 'easy',
      completion: 1,
      timerCompletion: 1,
      elapsed: 600,
      week: 1,
      completedAt: state.profile.startDate + 'T12:00:00.000Z',
    }];
    return JSON.stringify(state);
  });
  const expected = JSON.parse(backup);
  const dialogPromise = page.waitForEvent('dialog');
  await selectBackup(page, backup);
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe('confirm');
  expect(dialog.message()).toContain('înlocui');
  await dialog.accept();

  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  await expect(page.locator('#importError')).toHaveText('');
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(restored.profile.steps).toBe(9876);
  expect(restored.level).toBe(expected.level);
  expect(restored.goalReached).toBe(true);
  expect(restored.history).toHaveLength(1);
  expect(restored.history[0]).toMatchObject({ id: 555, status: 'done', effort: 'easy' });

  await page.reload();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(afterReload.profile.steps).toBe(9876);
  expect(afterReload.history[0].id).toBe(555);
  expect(pageErrors).toEqual([]);
});

test('does not overwrite existing data when backup storage fails', async ({ page }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);

  await createProfile(page);
  await page.locator('#nav-profile').click();
  const originalState = await page.evaluate(() => localStorage.getItem('scirun.state'));
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'scirun.state') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    };
  });

  const backup = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('scirun.state'));
    state.profile.steps = 4321;
    return JSON.stringify(state);
  });
  const dialogPromise = page.waitForEvent('dialog');
  await selectBackup(page, backup);
  const dialog = await dialogPromise;
  await dialog.accept();

  await expect(page.locator('#importError')).toContainText('Stocarea locală');
  expect(await page.evaluate(() => localStorage.getItem('scirun.state'))).toBe(originalState);
  await page.reload();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(persisted.profile.steps).not.toBe(4321);
});

test('blocks backup import while a workout is active', async ({ page }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);

  await createProfile(page);
  await page.locator('#startWorkout').click();
  await expect(page.locator('#workout')).toHaveClass(/active/);
  const originalState = await page.evaluate(() => localStorage.getItem('scirun.state'));
  await page.locator('#workoutBack').click();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  await page.locator('#nav-profile').click();
  await expect(page.locator('#profile')).toHaveClass(/active/);

  await selectBackup(page, '{not a backup}', 'ignored.json');
  await expect(page.locator('#importError')).toContainText('Încheie sau abandonează');
  expect(await page.evaluate(() => localStorage.getItem('scirun.state'))).toBe(originalState);
  const activeTimer = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.activeTimer')));
  expect(activeTimer).not.toBeNull();
});
