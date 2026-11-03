const { expect, test } = require('@playwright/test');
const { createProfile } = require('./helpers.cjs');

test('dashboard fits desktop and mobile in both themes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-11-03T09:00:00Z') });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await createProfile(page);
  await page.clock.fastForward(5_000);
  const checkWidth = async () => {
    const size = await page.evaluate(() => ({ viewport: window.innerWidth, content: document.documentElement.scrollWidth }));
    if (size.content > size.viewport + 1) console.log('Overflowing elements', await page.evaluate(() => [...document.querySelectorAll('body *')].map(el => ({id:el.id,className:el.className,right:el.getBoundingClientRect().right})).filter(el => el.right > innerWidth + 1).slice(0,12)));
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const nav = await page.locator('#nav').boundingBox();
    expect(nav.x).toBeGreaterThanOrEqual(0);
    expect(nav.x + nav.width).toBeLessThanOrEqual(size.viewport + 1);
  };
  await checkWidth();
  await page.screenshot({ path: 'test-results/dashboard-desktop-dark.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await checkWidth();
  await expect.poll(async () => (await page.locator('#nav').boundingBox()).y).toBeGreaterThan(700);
  await expect.poll(async () => { const nav = await page.locator('#nav').boundingBox(); return nav.y + nav.height; }).toBeLessThanOrEqual(844);
  await expect.poll(async () => (await page.locator('#nav').boundingBox()).width).toBeGreaterThanOrEqual(360);
  await page.screenshot({ path: 'test-results/dashboard-mobile-dark.png', fullPage: true, animations: 'disabled' });
  await page.locator('#nav-settings').click();
  await page.locator('#themeToggle').click();
  await page.locator('#nav-dashboard').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('#planReason')).toHaveCSS('color', 'rgb(97, 112, 134)');
  await checkWidth();
  await page.screenshot({ path: 'test-results/dashboard-mobile-light.png', fullPage: true, animations: 'disabled' });
});
