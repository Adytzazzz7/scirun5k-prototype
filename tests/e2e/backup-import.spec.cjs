const { expect, test } = require('@playwright/test');
const fs = require('node:fs/promises');
const { createProfile, startWorkout, submitWorkoutFeedback } = require('./helpers.cjs');

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
  await page.locator('#nav-settings').click();
  await expect(page.locator('#settings')).toHaveClass(/active/);
  const originalState = await page.evaluate(() => localStorage.getItem('scirun.state'));

  await selectBackup(page, '{broken json', 'invalid.json');
  await expect(page.locator('#importError')).toContainText('Fișier invalid');
  expect(await page.evaluate(() => localStorage.getItem('scirun.state'))).toBe(originalState);

  const backup = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('scirun.state'));
    state.level = Math.min(state.level + 1, 14);
    state.profile.runSpeed = 7.5;
    state.profile.walkSpeed = 4.7;
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
  expect(restored.profile.runSpeed).toBe(7.5);
  expect(restored.profile.walkSpeed).toBe(4.7);
  expect(restored.level).toBe(expected.level);
  expect(restored.goalReached).toBe(true);
  expect(restored.history).toHaveLength(1);
  expect(restored.history[0]).toMatchObject({ id: 555, status: 'done', effort: 'easy' });

  await page.reload();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(afterReload.profile.runSpeed).toBe(7.5);
  expect(afterReload.history[0].id).toBe(555);
  expect(pageErrors).toEqual([]);
});

test('does not overwrite existing data when backup storage fails', async ({ page }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);

  await createProfile(page);
  await page.locator('#nav-settings').click();
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
    state.profile.runSpeed = 8.4;
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
  expect(persisted.profile.runSpeed).not.toBe(8.4);
});

test('blocks backup import while a workout is active', async ({ page }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);

  await createProfile(page);
  await startWorkout(page);
  await expect(page.locator('#workout')).toHaveClass(/active/);
  const originalState = await page.evaluate(() => localStorage.getItem('scirun.state'));
  await page.locator('#workoutBack').click();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  await page.locator('#nav-settings').click();
  await expect(page.locator('#settings')).toHaveClass(/active/);

  await selectBackup(page, '{not a backup}', 'ignored.json');
  await expect(page.locator('#importError')).toContainText('Încheie sau abandonează');
  expect(await page.evaluate(() => localStorage.getItem('scirun.state'))).toBe(originalState);
  const activeTimer = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.activeTimer')));
  expect(activeTimer).not.toBeNull();
});


test('restores the actual exported profile and history after reset', async ({ page }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);
  await page.clock.install({ time: new Date('2026-11-03T09:00:00Z') });

  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await createProfile(page);
  await startWorkout(page);
  await expect(page.locator('#workout')).toHaveClass(/active/);
  await page.clock.fastForward(60 * 60 * 1000);
  await expect(page.locator('#saveFeedback')).toBeVisible();
  await submitWorkoutFeedback(page, { distance: '2.40', effort: 'moderate' });
  await page.locator('#saveFeedback').click();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);

  const expectedState = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(expectedState.history).toHaveLength(1);
  expect(expectedState.history[0].status).toBe('done');

  await page.locator('#nav-settings').click();
  await expect(page.locator('#settings')).toHaveClass(/active/);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#exportData').click(),
  ]);
  expect(download.suggestedFilename()).toBe('scirun5k-personal-data.json');
  const downloadPath = await download.path();
  const backupContents = await fs.readFile(downloadPath, 'utf8');
  expect(JSON.parse(backupContents)).toEqual(expectedState);

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#resetApp').click();
  await expect(page.locator('#onboarding')).toHaveClass(/active/);
  const cleared = await page.evaluate(() => ({
    state: localStorage.getItem('scirun.state'),
    timer: localStorage.getItem('scirun.activeTimer'),
    pending: localStorage.getItem('scirun.pendingSession'),
  }));
  expect(cleared).toEqual({ state: null, timer: null, pending: null });

  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#restoreSetupBackup').click();
  const chooser = await chooserPromise;
  const importDialogPromise = page.waitForEvent('dialog');
  await chooser.setFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: Buffer.from(backupContents, 'utf8'),
  });
  const importDialog = await importDialogPromise;
  await importDialog.accept();

  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  const restoredState = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(restoredState).toEqual(expectedState);
  expect(pageErrors).toEqual([]);
});
