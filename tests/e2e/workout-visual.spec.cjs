const { expect, test } = require('@playwright/test');
const { createProfile, startWorkout } = require('./helpers.cjs');

test('liquid ring anticipates phase changes and controls use their action colors', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width:390, height:844 });
  await page.clock.install({ time: new Date('2026-11-03T09:00:00Z') });
  const errors=[],dialogs=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.dismiss();});
  await createProfile(page);
  await startWorkout(page);
  const ring=page.locator('#workoutRing'),wave=page.locator('.liquid-wave-front');
  await expect(ring).toHaveAttribute('data-phase','warmup');
  await expect(ring).toHaveCSS('--phase-color','rgb(88, 230, 199)');
  await expect(page.locator('#workoutPause')).toHaveCSS('background-color','rgb(243, 196, 86)');
  await expect(page.locator('#workoutSkip')).toHaveCSS('background-color','rgb(88, 230, 199)');
  await expect(page.locator('#workoutFinish')).toHaveCSS('background-color','rgb(220, 63, 82)');
  await expect(wave).toHaveCSS('animation-name','liquid-tide');

  await page.locator('#workoutSkip').click();
  expect(dialogs).toEqual([]);
  await expect(ring).toHaveAttribute('data-phase','run');
  await expect(ring).toHaveCSS('--phase-color','rgb(244, 84, 104)');
  await page.locator('#workoutPause').click();
  await expect(ring).toHaveAttribute('data-phase','rest');
  await expect(ring).toHaveAttribute('data-imminent','false');
  await expect(ring).toHaveCSS('--phase-color','rgb(88, 230, 199)');
  await expect(wave).toHaveCSS('animation-play-state','paused');
  await page.screenshot({path:'test-results/workout-liquid-paused.png',fullPage:true});
  await page.locator('#workoutPause').click();
  await expect(wave).toHaveCSS('animation-play-state','running');

  await page.clock.fastForward(109_000);
  await expect(ring).toHaveAttribute('data-anticipating','false');
  await expect(ring).toHaveAttribute('data-imminent','false');
  await page.clock.fastForward(1_000);
  await expect(ring).toHaveAttribute('data-anticipating','true');
  await expect(ring).toHaveAttribute('data-imminent','false');
  await expect(ring).toHaveCSS('--phase-color','rgb(244, 84, 104)');
  await expect(wave).toHaveCSS('animation-duration','8s');
  await page.screenshot({path:'test-results/workout-liquid-running.png',fullPage:true});

  await page.clock.fastForward(5_000);
  await expect(ring).toHaveAttribute('data-imminent','true');
  await expect(wave).toHaveCSS('animation-duration','1.8s');
  const blend=await ring.evaluate(el=>el.style.getPropertyValue('--phase-color'));
  expect(blend).not.toBe('rgb(244, 84, 104)');
  expect(blend).not.toBe('rgb(54, 211, 139)');
  await expect(page.locator('#phaseCountdown')).toContainText('5 secunde');
  await page.screenshot({path:'test-results/workout-liquid-transition.png',fullPage:true});

  await page.clock.fastForward(4_000);
  await expect(ring).toHaveAttribute('data-imminent','true');
  await page.clock.fastForward(1_000);
  await expect(ring).toHaveAttribute('data-phase','walk');
  await expect(ring).toHaveAttribute('data-imminent','false');
  await expect(ring).toHaveCSS('--phase-color','rgb(54, 211, 139)');
  await page.screenshot({path:'test-results/workout-liquid-walking.png',fullPage:true});

  await page.locator('#workoutFinish').click();
  expect(dialogs).toHaveLength(1);
  expect(dialogs[0]).toContain('parțială');
  await expect(page.locator('#workoutPause')).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(wave).toHaveCSS('animation-name','none');
  const before=await page.locator('#timerBig').textContent();
  await page.clock.fastForward(1_000);
  await expect(page.locator('#timerBig')).not.toHaveText(before);
  expect(errors).toEqual([]);
});
