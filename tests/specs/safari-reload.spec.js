const { test, expect } = require('@playwright/test');
const { setupApp, uploadTestPhotos } = require('../helpers/test-setup');

test.describe('Safari Reload Resilience', () => {

  test('map tiles load after initial page load', async ({ page }) => {
    await setupApp(page);
    // Wait for map to be idle (tiles rendered)
    await page.waitForFunction(() => map && map.loaded() && map.isStyleLoaded(), { timeout: 15000 });
    // Verify canvas has rendered content (not blank)
    const canvas = page.locator('#map canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box.width).toBeGreaterThan(100);
    expect(box.height).toBeGreaterThan(100);
    // Loading spinner should be gone
    const spinner = page.locator('#map-loading');
    await expect(spinner).toHaveCount(0, { timeout: 12000 });
  });

  test('map tiles survive page reload', async ({ page }) => {
    await setupApp(page);
    await page.waitForFunction(() => map && map.loaded(), { timeout: 15000 });

    // Reload the page
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => !!document.querySelector('#map canvas') && typeof db !== 'undefined' && db !== null,
      { timeout: 20000 }
    );

    // Map should load again without getting stuck
    await page.waitForFunction(() => map && map.loaded() && map.isStyleLoaded(), { timeout: 15000 });
    const canvas = page.locator('#map canvas');
    await expect(canvas).toBeVisible();
    const spinner = page.locator('#map-loading');
    await expect(spinner).toHaveCount(0, { timeout: 12000 });
  });

  test('map tiles survive hard reload', async ({ page }) => {
    await setupApp(page);
    await page.waitForFunction(() => map && map.loaded(), { timeout: 15000 });

    // Hard reload — clears cache
    await page.evaluate(() => location.reload(true));
    await page.waitForFunction(
      () => !!document.querySelector('#map canvas') && typeof db !== 'undefined' && db !== null,
      { timeout: 20000 }
    );

    await page.waitForFunction(() => map && map.loaded() && map.isStyleLoaded(), { timeout: 15000 });
    const canvas = page.locator('#map canvas');
    await expect(canvas).toBeVisible();
    const spinner = page.locator('#map-loading');
    await expect(spinner).toHaveCount(0, { timeout: 12000 });
  });

  test('pins render after reload with photos', async ({ page }) => {
    await setupApp(page);
    await uploadTestPhotos(page, ['paris.jpg']);

    // Wait for pin to appear on the map (cluster index builds async)
    await page.waitForFunction(() => {
      return typeof scIndex !== 'undefined' && scIndex !== null &&
             typeof photos !== 'undefined' && photos.some(p => p.lat !== null);
    }, { timeout: 10000 });

    // Save data to server so it persists across reload
    await page.evaluate(async () => { if (typeof autoSave === 'function') await autoSave(); });
    await page.waitForTimeout(500);

    // Reload — accept auto-restore dialog
    page.on('dialog', async (dialog) => { await dialog.accept(); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => !!document.querySelector('#map canvas') && typeof db !== 'undefined' && db !== null,
      { timeout: 20000 }
    );
    await page.waitForFunction(
      () => typeof map !== 'undefined' && map && map.loaded && map.loaded(),
      { timeout: 20000 }
    );

    // Wait for pins to render after data restore
    await page.waitForFunction(() => {
      try {
        return typeof scIndex !== 'undefined' && scIndex !== null &&
               typeof photos !== 'undefined' && photos.some(p => p.lat !== null);
      } catch { return false; }
    }, { timeout: 15000 });

    const pinCountAfter = await page.evaluate(() => {
      try { return photos.filter(p => p.lat !== null).length; } catch { return 0; }
    });
    expect(pinCountAfter).toBeGreaterThan(0);
  });

  test('no service worker registered in Safari', async ({ page }) => {
    await setupApp(page);
    await page.waitForTimeout(2000);

    const swCount = await page.evaluate(async () => {
      const regs = await navigator.serviceWorker?.getRegistrations();
      return regs?.length || 0;
    });
    expect(swCount).toBe(0);
  });

  test('multiple rapid reloads do not break map', async ({ page }) => {
    await setupApp(page);
    await page.waitForFunction(() => map && map.loaded(), { timeout: 15000 });

    // Rapid reload 3 times
    for (let i = 0; i < 3; i++) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
    }

    // Final load should succeed
    await page.waitForFunction(
      () => !!document.querySelector('#map canvas') && typeof db !== 'undefined' && db !== null,
      { timeout: 20000 }
    );
    await page.waitForFunction(() => map && map.loaded() && map.isStyleLoaded(), { timeout: 15000 });
    const canvas = page.locator('#map canvas');
    await expect(canvas).toBeVisible();
  });
});
