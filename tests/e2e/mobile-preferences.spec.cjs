const { expect, test } = require('@playwright/test');
const { createProfile, startWorkout } = require('./helpers.cjs');

test('mobile preferences show their state and persist across reload and language changes', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.addInitScript(() => {
    window.preferenceVibrations = [];
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: pattern => { window.preferenceVibrations.push(pattern); return true; } });
  });
  await createProfile(page);
  await page.locator('#nav-settings').click();
  const sound = page.locator('#soundPreference');
  const vibration = page.locator('#vibrationPreference');
  const theme = page.locator('#themeToggle');
  await expect(sound).toHaveAttribute('aria-pressed', 'true');
  await expect(vibration).toHaveAttribute('aria-pressed', 'false');
  await expect(theme).toHaveAttribute('aria-pressed', 'true');
  await expect(sound.locator('.preference-toggle-state')).toHaveText('Pornit');
  await sound.click();
  await vibration.click();
  await theme.click();
  expect(await page.evaluate(() => window.preferenceVibrations)).toEqual([12, 12]);
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await expect(vibration).toHaveAttribute('aria-pressed', 'true');
  await expect(theme).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(sound.locator('.preference-toggle-state')).toHaveText('Oprit');
  await expect(vibration.locator('.preference-toggle-state')).toHaveText('Pornit');
  const sizes = await page.evaluate(() => ['soundPreference', 'vibrationPreference', 'themeToggle'].map(id => {
    const rect = document.getElementById(id).getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  for (const size of sizes) { expect(size.width).toBeGreaterThanOrEqual(44); expect(size.height).toBeGreaterThanOrEqual(44); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.reload();
  await page.locator('#nav-settings').click();
  await expect(sound).toHaveAttribute('aria-pressed', 'false');
  await expect(vibration).toHaveAttribute('aria-pressed', 'true');
  await expect(theme).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#lang-en').click();
  await expect(sound.locator('.preference-toggle-state')).toHaveText('Off');
  await expect(vibration.locator('.preference-toggle-state')).toHaveText('On');
  await expect(theme.locator('.preference-toggle-state')).toHaveText('Off');
});

test('mobile timer uses a continuous liquid arc and phase-colored pulse', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date('2026-11-03T09:00:00Z') });
  await createProfile(page);
  await startWorkout(page);
  const ring = page.locator('#workoutRing');
  await expect(ring).toHaveAttribute('data-phase', 'warmup');
  await expect(ring).toHaveCSS('--phase-color', 'rgb(111, 169, 255)');
  expect(await ring.locator('.workout-progress-head').count()).toBe(0);
  const liquid = ring.locator('.workout-liquid');
  const wave = liquid.locator('.liquid-wave-front .liquid-surface');
  await expect(liquid).toBeVisible();
  await expect(wave).toHaveCSS('animation-name', 'liquid-flow');
  const layers = await ring.evaluate(el => {
    const arc = getComputedStyle(el, '::before');
    const center = getComputedStyle(el.querySelector('.workout-ring-center'));
    return { arcZ: Number(arc.zIndex), centerZ: Number(center.zIndex), mask: arc.maskImage };
  });
  expect(layers.arcZ).toBeGreaterThan(layers.centerZ);
  expect(layers.mask).toContain('radial-gradient');
  const firstLiquidLevel = await ring.evaluate(el => parseFloat(el.style.getPropertyValue('--liquid-level')));
  const arc = await ring.evaluate(el => getComputedStyle(el, '::before').backgroundImage);
  expect(arc).toContain('conic-gradient');
  expect(arc).toContain('rgb(111, 169, 255)');
  await page.clock.fastForward(2_000);
  expect(await ring.evaluate(el => parseFloat(el.style.getPropertyValue('--liquid-level')))).toBeGreaterThan(firstLiquidLevel);
  await expect.poll(() => ring.evaluate(el => parseFloat(getComputedStyle(el, '::before').getPropertyValue('--timer-progress')))).toBeGreaterThan(0.4);
  const remainingWarmup = await page.evaluate(() => currentTimer.segmentEnd - Date.now());
  await page.clock.fastForward(remainingWarmup - 4_500);
  await expect(ring).toHaveAttribute('data-imminent', 'true');
  const pulse = await ring.evaluate(el => {
    const style = getComputedStyle(el);
    return { animationName: style.animationName, animationDuration: style.animationDuration };
  });
  expect(pulse.animationName).toBe('handoff-pulse');
  expect(pulse.animationDuration).toBe('1.05s');
  await page.clock.fastForward(4_900);
  await expect(ring).toHaveAttribute('data-phase', 'run');
  await expect(ring).toHaveAttribute('data-imminent', 'false');
  expect(await ring.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await expect(wave).toHaveCSS('fill', 'rgb(244, 116, 130)');
  const untilCooldown = await page.evaluate(() =>
    currentTimer.segmentEnd - Date.now() + currentTimer.segments.slice(currentTimer.index + 1, -1).reduce((total, phase) => total + phase.seconds * 1000, 0)
  );
  await page.clock.fastForward(untilCooldown + 400);
  await expect(ring).toHaveAttribute('data-phase', 'cooldown');
  await expect(ring).toHaveCSS('--phase-color', 'rgb(137, 194, 238)');
  await expect(wave).toHaveCSS('fill', 'rgb(137, 194, 238)');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(wave).toHaveCSS('animation-name', 'none');
  expect(await ring.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
});
