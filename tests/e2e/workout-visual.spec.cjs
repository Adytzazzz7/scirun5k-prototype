const { expect, test } = require('@playwright/test');
const { createProfile, startWorkout } = require('./helpers.cjs');

test('motion ring anticipates phase changes and controls use their action colors', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width:390, height:844 });
  await page.clock.install({ time: new Date('2026-11-03T09:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-03T09:00:01Z'));
  const errors=[],dialogs=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.dismiss();});
  await createProfile(page);
  await startWorkout(page);
  const ring=page.locator('#workoutRing'),wave=page.locator('.liquid-wave-front .liquid-surface');
  await expect(ring).toHaveAttribute('data-phase','warmup');
  await expect(ring).toHaveCSS('--phase-color','rgb(111, 169, 255)');
  for (const [id, color] of [['workoutPause','rgb(111, 169, 255)'],['workoutSkip','rgb(88, 214, 161)'],['workoutFinish','rgb(244, 116, 130)']]) {
    expect(await page.locator('#'+id).evaluate(button=>getComputedStyle(button).backgroundColor)).toBe(color);
  }
  await expect(wave).toHaveCSS('animation-name','liquid-flow');
  expect(await ring.locator('.workout-progress-head').count()).toBe(0);
  expect(await ring.evaluate(el=>getComputedStyle(el,'::before').backgroundImage.includes('conic-gradient('))).toBe(true);

  await page.locator('#workoutSkip').click();
  expect(dialogs).toEqual([]);
  await expect(ring).toHaveAttribute('data-phase','run');
  await expect(ring).toHaveCSS('--phase-color','rgb(244, 116, 130)');
  await page.locator('#workoutPause').click();
  await expect(ring).toHaveAttribute('data-phase','rest');
  await expect(ring).toHaveAttribute('data-imminent','false');
  await expect(ring).toHaveCSS('--phase-color','rgb(86, 220, 196)');
  await expect(wave).toHaveCSS('animation-play-state','paused');
  await page.screenshot({path:'test-results/workout-motion-paused.png',fullPage:true});
  await page.locator('#workoutPause').click();
  await expect(wave).toHaveCSS('animation-play-state','running');

  await page.clock.fastForward(109_000);
  await expect(ring).toHaveAttribute('data-anticipating','false');
  await expect(ring).toHaveAttribute('data-imminent','false');
  await expect(page.locator('#phaseCountdown')).toBeHidden();
  await page.clock.fastForward(1_000);
  await expect(ring).toHaveAttribute('data-anticipating','true');
  await expect(ring).toHaveAttribute('data-imminent','false');
  await expect(page.locator('#phaseCountdown')).toContainText('10 secunde');
  await expect(ring).toHaveCSS('--phase-color','rgb(244, 116, 130)');
  await expect(wave).toHaveCSS('animation-duration','6.5s');
  await page.screenshot({path:'test-results/workout-motion-running.png',fullPage:true});

  await page.clock.fastForward(5_000);
  await expect(ring).toHaveAttribute('data-imminent','true');
  expect(await ring.evaluate(el=>getComputedStyle(el).animationName)).toBe('handoff-pulse');
  expect(await ring.evaluate(el=>getComputedStyle(el).animationDuration)).toBe('1.05s');
  const blend=await ring.evaluate(el=>el.style.getPropertyValue('--phase-color'));
  expect(blend).not.toBe('rgb(244, 116, 130)');
  expect(blend).not.toBe('rgb(88, 214, 161)');
  await expect(page.locator('#phaseCountdown')).toContainText('5 secunde');
  await page.screenshot({path:'test-results/workout-motion-transition.png',fullPage:true});

  await page.clock.fastForward(4_000);
  await expect(ring).toHaveAttribute('data-imminent','true');
  await page.clock.fastForward(1_000);
  await expect(ring).toHaveAttribute('data-phase','walk');
  await expect(ring).toHaveAttribute('data-imminent','false');
  await expect(ring).toHaveCSS('--phase-color','rgb(88, 214, 161)');
  expect(await ring.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await page.screenshot({path:'test-results/workout-motion-walking.png',fullPage:true});

  await page.locator('#workoutFinish').click();
  expect(dialogs).toHaveLength(1);
  expect(dialogs[0]).toContain('parțială');
  await expect(page.locator('#workoutPause')).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(wave).toHaveCSS('animation-name','none');
  const before=await page.locator('#timerBig').textContent();
  await page.clock.fastForward(1_000);
  await expect(page.locator('#timerBig')).not.toHaveText(before);
  await page.locator('#workoutBack').click();
  await page.locator('#nav-settings').click();
  await page.locator('#themeToggle').click();
  await page.locator('#nav-dashboard').click();
  await startWorkout(page);
  await expect(page.locator('#currentInterval')).toHaveCSS('color','rgb(44, 107, 81)');
  await page.screenshot({path:'test-results/workout-motion-light.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('Aurora workout background follows the interval and light notices stay readable', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-11-03T09:00:00Z') });
  await createProfile(page);
  await startWorkout(page);

  async function expectPhaseHue(phase) {
    const root = page.locator('html'), body = page.locator('body');
    await expect(root).toHaveAttribute('data-workout-phase', phase);
    await expect(body).toHaveClass(/workout-active/);
    const theme = await root.getAttribute('data-theme');
    const colors = {
      dark: { run: 'rgb(74, 25, 36)', walk: 'rgb(18, 63, 47)', warmup: 'rgb(20, 57, 91)', cooldown: 'rgb(20, 57, 91)' },
      light: { run: 'rgb(255, 224, 229)', walk: 'rgb(223, 248, 233)', warmup: 'rgb(222, 235, 255)', cooldown: 'rgb(222, 235, 255)' },
    };
    const color = colors[theme]?.[phase];
    expect(color).toBeTruthy();
    await expect(root).toHaveCSS('background-color', color);
    await expect(body).toHaveCSS('background-color', color);
    await expect(body).toHaveCSS('background-image', /radial-gradient/);
  }

  async function contrastRatio(selector) {
    return page.locator(selector).evaluate(node => {
      const luminance = color => {
        const channels = color.match(/\d+/g).slice(0, 3).map(Number).map(value => {
          const v = value / 255;
          return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
        });
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
      };
      const style = getComputedStyle(node), a = luminance(style.color), b = luminance(style.backgroundColor);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    });
  }

  await expectPhaseHue('warmup');
  await page.locator('#workoutSkip').click();
  await expectPhaseHue('run');
  await page.locator('#workoutPause').click();
  await expect(page.locator('#workoutRing')).toHaveAttribute('data-phase', 'rest');
  await expectPhaseHue('run');
  await page.locator('#workoutPause').click();
  const untilWalk = await page.evaluate(() => currentTimer.segmentEnd - Date.now());
  await page.clock.fastForward(untilWalk + 400);
  await expectPhaseHue('walk');

  await page.locator('#workoutBack').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-workout-phase', /.+/);
  await page.clock.fastForward(1_000);
  await expect(page.locator('html')).not.toHaveAttribute('data-workout-phase', /.+/);
  await page.locator('#nav-settings').click();
  await page.locator('#themeToggle').click();
  await page.locator('#nav-dashboard').click();
  await page.evaluate(() => toast('Verificare contrast'));
  await expect(page.locator('#toast')).toBeVisible();
  expect(await contrastRatio('#toast')).toBeGreaterThanOrEqual(4.5);
  await startWorkout(page);
  await expectPhaseHue('walk');
  const untilCue = await page.evaluate(() => currentTimer.segmentEnd - Date.now() - 9_500);
  await page.clock.fastForward(untilCue);
  await expect(page.locator('#phaseCountdown')).toBeVisible();
  expect(await contrastRatio('#phaseCountdown')).toBeGreaterThanOrEqual(4.5);
  await page.evaluate(() => toast('Verificare contrast'));
  await expect(page.locator('#toast')).toBeVisible();
  expect(await contrastRatio('#toast')).toBeGreaterThanOrEqual(4.5);

  const untilCooldown = await page.evaluate(() =>
    currentTimer.segmentEnd - Date.now() + currentTimer.segments.slice(currentTimer.index + 1, -1).reduce((total, segment) => total + segment.seconds * 1000, 0)
  );
  await page.clock.fastForward(untilCooldown + 400);
  await expectPhaseHue('cooldown');
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#workoutFinish').click();
  await expect(page.locator('.workout-feedback-page')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-workout-phase', /.+/);
});
