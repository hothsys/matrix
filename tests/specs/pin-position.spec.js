const { test, expect } = require('@playwright/test');
const { setupApp, uploadTestPhotos, clearState } = require('../helpers/test-setup');

test.describe('Pin Position Accuracy', () => {
  test.beforeEach(async ({ page }) => {
    await setupApp(page);
    await clearState(page);
  });

  test('pin renders at correct geographic position', async ({ page }) => {
    // Upload paris.jpg — GPS: 48.8566, 2.3522
    await uploadTestPhotos(page, ['paris.jpg']);

    // Fly the map to Paris at zoom 12 so the pin is an individual marker (not clustered)
    await page.evaluate(() => {
      map.flyTo({ center: [2.3522, 48.8566], zoom: 12, duration: 0 });
    });

    // Wait for map to finish rendering
    await page.evaluate(() => new Promise(r => {
      if (map.loaded() && map.isStyleLoaded()) r();
      else map.once('idle', r);
    }));

    // Wait for pin icon to load (async image load + canvas draw) then trigger a repaint
    await page.waitForTimeout(1500);
    await page.evaluate(() => { refreshClusters(); });
    await page.waitForTimeout(500);

    // Project the expected GPS coordinates to pixel position
    const expected = await page.evaluate(() => {
      const px = map.project([2.3522, 48.8566]);
      return { x: px.x, y: px.y };
    });

    // Query rendered features at the expected pixel position (±5px bbox for sub-pixel rounding)
    const pinAtExpected = await page.evaluate(({ x, y }) => {
      const bbox = [[x - 5, y - 5], [x + 5, y + 5]];
      const features = map.queryRenderedFeatures(bbox, { layers: ['photo-pins-layer'] });
      if (!features.length) return null;
      return { lat: features[0].properties.lat, lng: features[0].properties.lng };
    }, expected);

    expect(pinAtExpected).not.toBeNull();
    expect(parseFloat(pinAtExpected.lat)).toBeCloseTo(48.8566, 3);
    expect(parseFloat(pinAtExpected.lng)).toBeCloseTo(2.3522, 3);
  });

  test('pin is not shifted south (y-offset regression)', async ({ page }) => {
    // Upload paris.jpg — GPS: 48.8566, 2.3522
    await uploadTestPhotos(page, ['paris.jpg']);

    await page.evaluate(() => {
      map.flyTo({ center: [2.3522, 48.8566], zoom: 12, duration: 0 });
    });

    await page.evaluate(() => new Promise(r => {
      if (map.loaded() && map.isStyleLoaded()) r();
      else map.once('idle', r);
    }));

    await page.waitForTimeout(1500);
    await page.evaluate(() => { refreshClusters(); });
    await page.waitForTimeout(500);

    const expected = await page.evaluate(() => {
      const px = map.project([2.3522, 48.8566]);
      return { x: px.x, y: px.y };
    });

    // Query 50px south of expected position — should NOT find the pin
    // (if it does, the pin has the y-offset bug)
    const pinBelow = await page.evaluate(({ x, y }) => {
      const shiftedY = y + 50;
      const bbox = [[x - 5, shiftedY - 5], [x + 5, shiftedY + 5]];
      const features = map.queryRenderedFeatures(bbox, { layers: ['photo-pins-layer'] });
      return features.length;
    }, expected);

    expect(pinBelow).toBe(0);
  });
});
