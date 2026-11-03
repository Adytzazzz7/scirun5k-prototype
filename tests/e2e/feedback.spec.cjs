const { expect, test } = require('@playwright/test');
const { createProfile, startWorkout, submitWorkoutFeedback } = require('./helpers.cjs');

test('saves actual distance and effort, adapts the plan, and restores history after reload', async ({ page }) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(5_000);
  page.setDefaultNavigationTimeout(15_000);
  await page.clock.install({ time: new Date('2026-11-03T09:00:00Z') });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await createProfile(page);
  const initialState = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  const startingLevel = initialState.level;
  expect(initialState.easyStreak).toBe(0);

  for (let sessionNumber = 1; sessionNumber <= 2; sessionNumber += 1) {
    await startWorkout(page);
    await page.clock.fastForward(60 * 60 * 1000);
    await expect(page.locator('#saveFeedback')).toBeVisible();
    const pendingSession = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.pendingSession')));
    expect(pendingSession.completedNaturally).toBe(true);
    expect(pendingSession.completion).toBe(1);

    await submitWorkoutFeedback(page, { distance: sessionNumber === 1 ? '2.40' : '2.65', effort: 'easy' });
    await page.locator('#saveFeedback').click();
    await expect(page.locator('#dashboard')).toHaveClass(/active/);
    const savedState = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
    expect(savedState.history).toHaveLength(sessionNumber);
    expect(savedState.history.at(-1).status).toBe('done');
    expect(savedState.history.at(-1).distanceKm).toBe(sessionNumber === 1 ? 2.4 : 2.65);
    expect(savedState.history.at(-1).effort).toBe('easy');
  }

  const completedState = await page.evaluate(() => ({
    state: JSON.parse(localStorage.getItem('scirun.state')),
    activeTimer: localStorage.getItem('scirun.activeTimer'),
    pendingSession: localStorage.getItem('scirun.pendingSession'),
  }));
  expect(completedState.state.level).toBe(startingLevel + 1);
  expect(completedState.state.easyStreak).toBe(0);
  expect(completedState.state.profile.firstSessionFeedbackDone).toBe(true);
  expect(completedState.state.history).toHaveLength(2);
  expect(completedState.activeTimer).toBeNull();
  expect(completedState.pendingSession).toBeNull();

  await page.locator('#nav-history').click();
  await expect(page.locator('#history')).toHaveClass(/active/);
  await expect(page.locator('#historyList')).toContainText('2,65 km');
  await page.reload();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  const restoredState = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(restoredState.level).toBe(startingLevel + 1);
  expect(restoredState.history).toHaveLength(2);
  expect(restoredState.history.every(session => session.status === 'done')).toBe(true);
  expect(pageErrors).toEqual([]);
});


test('preserves feedback drafts and saves 5 km total without claiming a continuous 5 km goal', async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.install({ time: new Date('2026-11-03T09:00:00Z') });
  await createProfile(page);
  await startWorkout(page);
  await page.clock.fastForward(60 * 60 * 1000);
  await expect(page.locator('#actualDistance')).toBeVisible();
  await page.locator('#actualDistance').fill('5.20');
  await page.locator('#runPaceFeel').selectOption('right');
  await page.locator('#walkPaceFeel').selectOption('right');
  await page.locator('#workout [data-effort="moderate"]').click();
  await expect(page.locator('#actualDistance')).toHaveValue('5.20');
  await expect(page.locator('#runPaceFeel')).toHaveValue('right');
  await page.reload();
  await expect(page.locator('#actualDistance')).toHaveValue('5.20');
  await expect(page.locator('#walkPaceFeel')).toHaveValue('right');
  await expect(page.locator('#goalContinuous')).not.toBeChecked();
  await page.locator('#saveFeedback').click();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')));
  expect(saved.history.at(-1).distanceKm).toBe(5.2);
  expect(saved.history.at(-1).status).toBe('done');
  expect(saved.goalReached).toBe(false);
});
