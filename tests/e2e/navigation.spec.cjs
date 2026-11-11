const { expect, test } = require('@playwright/test');
const { createProfile, startWorkout, submitWorkoutFeedback } = require('./helpers.cjs');

const startTime = '2026-11-03T09:00:00Z';
const savedState = page => page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
const savedTimer = page => page.evaluate(() => JSON.parse(localStorage.getItem('scirun.activeTimer')));
const savedDraft = page => page.evaluate(() => JSON.parse(localStorage.getItem('scirun.pendingSession')));

test('returns from feedback without abandoning the draft and saves it once', async ({ page }) => {
  await page.clock.install({ time: new Date(startTime) });
  await createProfile(page);
  await startWorkout(page);
  await page.clock.fastForward(60 * 60 * 1000);
  await submitWorkoutFeedback(page, { distance: '2.40', effort: 'easy' });
  const draft = await savedDraft(page);
  const before = await savedState(page);

  await page.locator('#workoutBack').click();
  await expect(page.locator('#dashboard')).toBeVisible();
  await expect(page.locator('#heroStart')).toContainText('Finalizează feedbackul');
  expect(await savedDraft(page)).toEqual(draft);
  expect(await savedState(page)).toEqual(before);
  await page.locator('#heroStart').click();
  await expect(page.locator('#actualDistance')).toHaveValue('2.40');
  await expect(page.locator('[data-effort="easy"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#runPaceFeel')).toHaveValue('right');
  await expect(page.locator('#walkPaceFeel')).toHaveValue('right');

  await page.locator('#discardFeedback').click();
  await expect(page.locator('#confirmDiscardFeedback')).toBeVisible();
  await page.locator('#keepFeedback').click();
  expect(await savedDraft(page)).toEqual(draft);
  await page.locator('#saveFeedback').click();
  await expect(page.locator('#heroStart')).toContainText('Începe sesiunea');
  await page.reload();
  await expect(page.locator('#dashboard')).toBeVisible();
  const saved = await savedState(page);
  expect(saved.history).toHaveLength(1);
  expect(saved.history[0]).toMatchObject({ id: draft.id, distanceKm: 2.4 });
  expect(saved.easyStreak).toBe(before.easyStreak + 1);
  expect(await savedDraft(page)).toBeNull();
});

test('dashboard returns to the same running or paused timer', async ({ page }) => {
  await page.clock.install({ time: new Date(startTime) });
  await createProfile(page);
  const action = page.locator('#heroStart');
  await expect(action).toContainText('Începe sesiunea');
  await startWorkout(page);
  const running = await savedTimer(page);
  await page.locator('#workoutBack').click();
  await expect(action).toContainText('Revino la sesiune');
  await page.clock.fastForward(10_000);
  await action.click();
  await expect(page.locator('#workoutPause')).toContainText('Pauză');
  expect(await savedTimer(page)).toEqual(running);
  await page.locator('#workoutPause').click();
  const paused = await savedTimer(page);
  expect(paused.remaining).toBeLessThan(running.remaining);

  await page.locator('#workoutBack').click();
  await page.locator('#nav-settings').click();
  await page.locator('#settings .concept-language-row summary').click();
  await page.locator('#lang-en').click();
  await page.locator('#nav-dashboard').click();
  await expect(action).toContainText('Return to workout');
  await action.click();
  await expect(page.locator('#workoutPause')).toContainText('Resume');
  expect(await savedTimer(page)).toEqual(paused);
  expect((await savedState(page)).history).toHaveLength(0);
});

test('achievement opens history and cancelling reset keeps saved data', async ({ page }) => {
  await page.clock.install({ time: new Date(startTime) });
  await createProfile(page);
  await startWorkout(page);
  await page.clock.fastForward(60 * 60 * 1000);
  await submitWorkoutFeedback(page, { distance: '5.20' });
  await page.locator('#goalContinuous').check();
  await page.locator('#saveFeedback').click();
  const before = await savedState(page);
  expect(before.goalReached).toBe(true);
  const dialogs = [];
  page.on('dialog', async dialog => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });

  await page.locator('#goalCelebration').getByRole('button', { name: 'Vezi istoricul' }).click();
  await expect(page.locator('#history')).toBeVisible();
  await expect(page.locator('#historyList')).toContainText('5,2 km');
  expect(dialogs).toEqual([]);
  expect(await savedState(page)).toEqual(before);

  await page.locator('#nav-account').click();
  await page.locator('#account .concept-account-detail').nth(2).locator('summary').click();
  await page.locator('#resetApp').click();
  expect(dialogs).toHaveLength(1);
  expect(dialogs[0]).toContain('vor fi șterse');
  await expect(page.locator('#account')).toBeVisible();
  expect(await savedState(page)).toEqual(before);
});
