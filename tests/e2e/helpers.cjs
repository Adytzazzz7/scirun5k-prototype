const { expect } = require('@playwright/test');

async function createProfile(page) {
  await page.goto('/');
  await expect(page.locator('#onboarding')).toHaveClass(/active/);
  await page.locator('#safetyAnswer').selectOption('no');
  await page.locator('#runStatus').selectOption('known');
  await page.locator('#runMinutes').fill('3');
  await page.locator('#setupContinue').click();
  await expect(page.locator('#setupStepTwo')).toBeVisible();
  await page.locator('#sessionsPerWeek').selectOption('3');
  await page.locator('#createPlan').click();
  await expect(page.locator('#dashboard')).toHaveClass(/active/);
}

async function startWorkout(page) {
  await page.locator('#heroStart').click();
  const calibration = page.locator('#saveCalibration');
  if (await calibration.isVisible()) {
    await page.locator('#calibrationWalk').fill('4.5');
    await page.locator('#calibrationRun').fill('6.5');
    await calibration.click();
  }
  await expect(page.locator('#workout')).toHaveClass(/active/);
}

async function submitWorkoutFeedback(page, { distance = '2.40', effort = 'moderate', runFeel = 'right', walkFeel = 'right' } = {}) {
  await page.locator('#workout [data-effort="' + effort + '"]').click();
  await page.locator('#actualDistance').fill(distance);
  if (await page.locator('#runPaceFeel').count()) {
    await page.locator('#runPaceFeel').selectOption(runFeel);
    await page.locator('#walkPaceFeel').selectOption(walkFeel);
  }
}

module.exports = { createProfile, startWorkout, submitWorkoutFeedback };
