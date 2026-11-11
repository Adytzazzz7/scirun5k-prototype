const { test, expect } = require('@playwright/test');
const { createProfile, startWorkout, submitWorkoutFeedback } = require('./helpers.cjs');

async function installFakeGoogle(page) {
  await page.addInitScript(() => {
    const read = () => JSON.parse(localStorage.getItem('scirun.testGoogleBackups') || '[]');
    const write = value => localStorage.setItem('scirun.testGoogleBackups', JSON.stringify(value));
    window.SciRunNative = {
      isNative: true,
      platform: 'android',
      googleBackup: {
        async signIn() {
          localStorage.setItem('scirun.testGoogleConnected', '1');
          return { accountId: 'runner@example.com', email: 'runner@example.com', signedIn: true };
        },
        async getStatus() {
          const signedIn = localStorage.getItem('scirun.testGoogleConnected') === '1';
          return { accountId: signedIn ? 'runner@example.com' : null, email: signedIn ? 'runner@example.com' : null, signedIn };
        },
        async listBackups() {
          return { backups: read().map(({ id, modifiedTime }) => ({ id, modifiedTime, name: id })) };
        },
        async uploadBackup({ json }) {
          const items = read();
          const id = `backup-${items.length + 1}`;
          const modifiedTime = new Date().toISOString();
          items.push({ id, modifiedTime, json });
          write(items);
          return { id, modifiedTime };
        },
        async downloadBackup({ id }) {
          const item = read().find(entry => entry.id === id);
          if (!item) throw new Error('Missing backup');
          return { json: item.json };
        },
        async signOut() { localStorage.removeItem('scirun.testGoogleConnected'); }
      }
    };
  });
}

async function openGoogleAccountPanel(page) {
  await page.locator('#nav-account').click();
  const details = page.locator('#googleConnect').locator('xpath=ancestor::details[1]');
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
  return details;
}

test('Google backup saves a validated snapshot and restores without losing the local rollback copy', async ({ page }) => {
  await installFakeGoogle(page);
  await createProfile(page);
  await openGoogleAccountPanel(page);
  await page.locator('#googleConnect').click();
  await expect(page.locator('#googleSave')).toBeEnabled();
  await page.locator('#googleSave').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('scirun.testGoogleBackups') || '[]').length)).toBe(1);
  const uploaded = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.testGoogleBackups'))[0].json);
  expect(JSON.parse(uploaded)).toMatchObject({ app: 'scirun5k', version: 2, activeTimer: null, pendingSession: null });

  await page.evaluate(() => {
    const items = JSON.parse(localStorage.getItem('scirun.testGoogleBackups'));
    const bundle = JSON.parse(items[0].json);
    bundle.state.history.push({
      id: 'cloud-session', date: bundle.state.profile.startDate, level: bundle.state.level,
      status: 'done', effort: 'easy', completion: 1, timerCompletion: 1,
      elapsed: 600, week: 1, completedAt: bundle.state.profile.startDate + 'T12:00:00.000Z'
    });
    items.push({ id: 'cloud-with-history', modifiedTime: new Date(Date.now() + 1000).toISOString(), json: JSON.stringify(bundle) });
    localStorage.setItem('scirun.testGoogleBackups', JSON.stringify(items));
  });
  await page.locator('#googleRefresh').click();
  await expect(page.locator('#googleBackupList .google-backup-row')).toHaveCount(2);
  await Promise.all([
    page.waitForEvent('dialog').then(async dialog => {
      expect(dialog.message()).toContain('1 antrenamente');
      expect(dialog.message()).toContain('0');
      await dialog.accept();
    }),
    page.locator('#googleBackupList .google-backup-row').first().locator('button').click()
  ]);
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  const result = await page.evaluate(() => ({
    history: JSON.parse(localStorage.getItem('scirun.state')).history,
    rollback: JSON.parse(localStorage.getItem('scirun.preImportBackup'))
  }));
  expect(result.history).toHaveLength(1);
  expect(result.history[0].id).toBe('cloud-session');
  expect(JSON.parse(result.rollback.keys['scirun.state']).history).toHaveLength(0);
});

test('Google copies can be restored from onboarding on a new device', async ({ page }) => {
  await installFakeGoogle(page);
  await createProfile(page);
  await page.evaluate(() => {
    const bundle = SciRunStateBackup.createBundle(state, backupPreferences(), null, null, Date.now());
    localStorage.setItem('scirun.testGoogleBackups', JSON.stringify([{
      id: 'first-phone', modifiedTime: new Date().toISOString(), json: JSON.stringify(bundle)
    }]));
    localStorage.removeItem('scirun.state');
  });
  await page.reload();
  await expect(page.locator('#onboarding')).toHaveClass(/active/);
  await page.locator('#googleSetupRestore').click();
  await expect(page.locator('#googleSetupBackups .google-backup-row')).toHaveCount(1);
  await Promise.all([
    page.waitForEvent('dialog').then(dialog => dialog.accept()),
    page.locator('#googleSetupBackups .google-backup-row button').click()
  ]);
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')).profile.trainingDays.length)).toBe(3);
});

test('invalid Google copy never changes local training history', async ({ page }) => {
  await installFakeGoogle(page);
  await createProfile(page);
  await openGoogleAccountPanel(page);
  const before = await page.evaluate(() => localStorage.getItem('scirun.state'));
  await page.locator('#googleConnect').click();
  await page.evaluate(() => localStorage.setItem('scirun.testGoogleBackups', JSON.stringify([
    { id: 'invalid', modifiedTime: new Date().toISOString(), json: '{broken json' }
  ])));
  await page.locator('#googleRefresh').click();
  await page.locator('#googleBackupList .google-backup-row button').click();
  await expect(page.locator('#googleBackupError')).toContainText('invalidă');
  expect(await page.evaluate(() => localStorage.getItem('scirun.state'))).toBe(before);
});

test('a completed workout creates a new cloud copy after feedback is saved', async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.install({ time: new Date('2026-11-03T09:00:00Z') });
  await installFakeGoogle(page);
  await createProfile(page);
  await openGoogleAccountPanel(page);
  await page.locator('#googleConnect').click();
  await page.locator('#googleSave').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('scirun.testGoogleBackups') || '[]').length)).toBe(1);

  await page.locator('#nav-dashboard').click();
  await startWorkout(page);
  await page.clock.fastForward(60 * 60 * 1000);
  await expect(page.locator('#saveFeedback')).toBeVisible();
  await submitWorkoutFeedback(page, { distance: '2.40', effort: 'easy' });
  await page.locator('#saveFeedback').click();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  await page.clock.runFor(1700);
  const snapshots = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.testGoogleBackups')));
  expect(snapshots).toHaveLength(2);
  expect(JSON.parse(snapshots[1].json).state.history).toHaveLength(1);
});
