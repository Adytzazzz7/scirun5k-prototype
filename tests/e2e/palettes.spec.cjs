const { test, expect } = require('@playwright/test');
const { createProfile, startWorkout } = require('./helpers.cjs');

test('legacy palette preference yields Aurora Standard and preserves training data', async ({ page }) => {
  await createProfile(page);
  const before = await page.evaluate(() => localStorage.getItem('scirun.state'));
  await page.evaluate(() => localStorage.setItem('scirun.palette', 'energetic'));
  await page.reload();
  await page.locator('#nav-settings').click();
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'standard');
  await expect(page.locator('#paletteHeading, [data-palette-choice]')).toHaveCount(0);
  expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#06191d');
  expect(await page.evaluate(() => localStorage.getItem('scirun.palette'))).toBe('energetic');
  expect(await page.evaluate(() => localStorage.getItem('scirun.state'))).toBe(before);
});

test('Aurora Standard keeps selected navigation readable in light mode', async ({ page }) => {
  await createProfile(page);
  await page.locator('#nav-settings').click();
  await page.locator('#themeToggle').click();
  expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).toBe('#f1faf9');
  await expect(page.locator('#nav-settings')).toHaveCSS('background-color', 'rgb(23, 111, 108)');
  const colors = await page.locator('#nav-settings').evaluate(element => {
    const luminance = color => {
      const channels = color.match(/[0-9.]+/g).slice(0, 3).map(Number).map(number => {
        const v = number / 255;
        return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
      });
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    const style = getComputedStyle(element);
    const a = luminance(style.color), b = luminance(style.backgroundColor);
    return { ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), foreground: style.color, background: style.backgroundColor };
  });
  expect(colors.ratio, JSON.stringify(colors)).toBeGreaterThanOrEqual(4.5);
});

test('Aurora Standard keeps phase colors and workout actions meaningful', async ({ page }) => {
  await createProfile(page);
  await startWorkout(page);
  expect((await page.locator('#workoutRing').evaluate(ring => ring.style.getPropertyValue('--phase-rgb'))).replace(/\s/g, '')).toBe('111,169,255');
  for (const [id, color] of [
    ['workoutPause', 'rgb(111, 169, 255)'],
    ['workoutSkip', 'rgb(88, 214, 161)'],
    ['workoutFinish', 'rgb(244, 116, 130)'],
  ]) {
    expect(await page.locator('#' + id).evaluate(button => getComputedStyle(button).backgroundColor)).toBe(color);
  }
  await page.locator('#workoutSkip').click();
  expect(await page.locator('#workoutRing').evaluate(ring => ring.style.getPropertyValue('--phase-color'))).toBe('rgb(244, 116, 130)');
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

test('high contrast works with Aurora Standard and survives reload', async ({ page }) => {
  await createProfile(page);
  await page.locator('#nav-settings').click();
  await page.locator('#contrastToggle').click();
  await expect(page.locator('#contrastToggle')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('scirun.highContrast'))).toBe('true');
  const surface = await page.locator('.palette-settings-card').evaluate(card => getComputedStyle(card).backgroundColor);
  if (/rgba\(|\/\s*0\./.test(surface)) throw new Error('High contrast surface is translucent: ' + surface);
  await page.locator('#themeToggle').click();
  await expect(page.locator('.palette-settings-card')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.reload();
  await page.locator('#nav-settings').click();
  await expect(page.locator('#contrastToggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'standard');
});
