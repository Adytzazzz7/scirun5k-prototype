const { test, expect } = require('@playwright/test');
const { createProfile, startWorkout } = require('./helpers.cjs');

test('palette selection is independent of training history and survives reload', async ({ page }) => {
  await createProfile(page);
  const before = await page.evaluate(() => localStorage.getItem('scirun.state'));
  await page.locator('#nav-settings').click();
  for (const [palette, darkColor] of [
    ['energetic', '#1b1519'],
    ['standard', '#06191d'],
  ]) {
    await page.locator('[data-palette-choice="' + palette + '"]').click();
    await expect(page.locator('[data-palette-choice="' + palette + '"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.getItem('scirun.palette'))).toBe(palette);
    expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe(darkColor);
    expect(await page.evaluate(() => localStorage.getItem('scirun.state'))).toBe(before);
    expect(await page.locator('#heroStart').evaluate(button => getComputedStyle(button).backgroundImage.includes('linear-gradient'))).toBe(true);
  }
  await page.locator('[data-palette-choice="energetic"]').click();
  await page.reload();
  await page.locator('#nav-settings').click();
  await expect(page.locator('[data-palette-choice="energetic"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('scirun.state')).history.length)).toBe(0);
});

test('both palettes keep selected controls readable in light mode', async ({ page }) => {
  await createProfile(page);
  await page.locator('#nav-settings').click();
  await page.locator('#themeToggle').click();
  for (const [palette, lightColor] of [
    ['standard', '#f1faf9'],
    ['energetic', '#fff7f0'],
  ]) {
    await page.locator('[data-palette-choice="' + palette + '"]').click();
    await page.waitForTimeout(250);
    expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe(lightColor);
    const contrast = await page.evaluate(() => {
      const luminance = value => {
        const channels = value.match(/[0-9.]+/g).slice(0, 3).map(Number).map(number => {
          const v = number / 255;
          return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
        });
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
      };
      return ['#nav-settings', '[data-palette-choice][aria-pressed="true"] .palette-choice-check']
        .map(selector => {
          const element = document.querySelector(selector);
          const style = getComputedStyle(element);
          const background = style.backgroundColor === 'rgba(0, 0, 0, 0)'
            ? getComputedStyle(element.closest('[data-palette-choice]')).backgroundColor
            : style.backgroundColor;
          const a = luminance(style.color), b = luminance(background);
          return [selector, (Math.max(a, b) + .05) / (Math.min(a, b) + .05)];
        });
    });
    for (const [selector, ratio] of contrast) {
      if (ratio < 4.5) throw new Error(selector + ' contrast is ' + ratio);
    }
  }
});

test('palette choice updates workout phase colors and action meanings together', async ({ page }) => {
  await createProfile(page);
  await page.locator('#nav-settings').click();
  await page.locator('[data-palette-choice="energetic"]').click();
  await page.locator('#nav-dashboard').click();
  await startWorkout(page);
  const phase = await page.locator('#workoutRing').evaluate(ring => ring.style.getPropertyValue('--phase-rgb'));
  expect(phase.replace(/\s/g, '')).toBe('111,181,255');
  for (const [id, color] of [
    ['workoutPause', 'rgb(111, 181, 255)'],
    ['workoutSkip', 'rgb(103, 217, 148)'],
    ['workoutFinish', 'rgb(255, 101, 117)'],
  ]) {
    expect(await page.locator('#' + id).evaluate(button => getComputedStyle(button).backgroundColor)).toBe(color);
  }
  await page.locator('#workoutBack').click();
  await page.locator('#nav-settings').click();
  await page.locator('[data-palette-choice="standard"]').click();
  await page.locator('#nav-dashboard').click();
  await page.locator('#heroStart').click();
  expect((await page.locator('#workoutRing').evaluate(ring => ring.style.getPropertyValue('--phase-rgb'))).replace(/\s/g, '')).toBe('111,169,255');
  await page.locator('#workoutSkip').click();
  expect(await page.locator('#workoutRing').evaluate(ring => ring.style.getPropertyValue('--phase-color'))).toBe('rgb(244, 116, 130)');
  await page.locator('#workoutSkip').click();
  expect(await page.locator('#workoutRing').evaluate(ring => ring.style.getPropertyValue('--phase-color'))).toBe('rgb(88, 214, 161)');
});

test('removed palettes fall back to Standard without changing training data', async ({ page }) => {
  await createProfile(page);
  const before = await page.evaluate(() => localStorage.getItem('scirun.state'));
  for (const removed of ['calm', 'cyberpunk', 'sea', 'winter', 'classic']) {
    await page.evaluate(value => localStorage.setItem('scirun.palette', value), removed);
    await page.reload();
    await page.locator('#nav-settings').click();
    expect(await page.locator('.palette-option').count()).toBe(2);
    await expect(page.locator('[data-palette-choice="standard"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.getItem('scirun.palette'))).toBe('standard');
    expect(await page.evaluate(() => localStorage.getItem('scirun.state'))).toBe(before);
  }
});

test('SciRun wordmark shows a separate 5K edition on mobile', async ({ page }) => {
  await createProfile(page);
  const brand = page.locator('.topbar .brand');
  await expect(brand).toHaveAttribute('aria-label', 'SciRun 5K');
  expect(await brand.locator('.brand-wordmark').textContent()).toBe('SciRun');
  expect(await brand.locator('.brand-edition').textContent()).toBe('5K');
  const layout = await brand.evaluate(node => {
    const word = node.querySelector('.brand-wordmark');
    const edition = node.querySelector('.brand-edition');
    return {
      font: getComputedStyle(word).fontFamily,
      weight: getComputedStyle(word).fontWeight,
      wordRight: word.getBoundingClientRect().right,
      editionLeft: edition.getBoundingClientRect().left,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(layout.font).toContain('Barlow');
  expect(layout.weight).toBe('900');
  if (layout.editionLeft <= layout.wordRight) throw new Error('5K overlaps the wordmark');
  expect(layout.overflow).toBe(false);
});

test('high contrast works in every palette and survives reload', async ({ page }) => {
  await createProfile(page);
  await page.locator('#nav-settings').click();
  await page.locator('#contrastToggle').click();
  await expect(page.locator('#contrastToggle')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('scirun.highContrast'))).toBe('true');
  for (const palette of ['standard', 'energetic']) {
    await page.locator('[data-palette-choice="' + palette + '"]').click();
    const surface = await page.locator('.palette-settings-card').evaluate(card => getComputedStyle(card).backgroundColor);
    if (/rgba\(|\/\s*0\./.test(surface)) throw new Error(palette + ' high contrast surface is translucent: ' + surface);
  }
  await page.locator('#themeToggle').click();
  const lightSurface = await page.locator('.palette-settings-card').evaluate(card => getComputedStyle(card).backgroundColor);
  expect(lightSurface).toBe('rgb(255, 255, 255)');
  await page.reload();
  await page.locator('#nav-settings').click();
  await expect(page.locator('#contrastToggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-palette-choice="energetic"]')).toHaveAttribute('aria-pressed', 'true');
});
