const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const jsonPath = path.resolve(__dirname, '..', 'stammbaum_mit_familienbuch_full_v5_bereinigt.json');
const screenshotDir = path.resolve(__dirname, '..', 'docs', 'familienbuch-v5-screenshots');
const hasLocalFamilybook = fs.existsSync(jsonPath);
const tree = hasLocalFamilybook ? JSON.parse(fs.readFileSync(jsonPath, 'utf8')) : null;
fs.mkdirSync(screenshotDir, { recursive: true });

test.setTimeout(120_000);
test.skip(!hasLocalFamilybook, 'Lokaler, bewusst nicht eingecheckter Genealogie-Datensatz fehlt.');

test('bereinigter US-Zweig lädt, ist verknüpft und visuell prüfbar', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('mobile-family-tree-v5-clean', JSON.stringify({
      rootIds: ['test-root'],
      people: [{ id: 'test-root', name: 'Test Root', x: 500, y: 300, parents: [], partners: [] }],
    }));
    localStorage.setItem('mobile-family-tree-v5-clean-help-seen-v1', JSON.stringify(['pan-zoom', 'search', 'edit']));
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
  await page.getByTestId('app-mode-toggle').click();
  await page.locator('#fileInput').setInputFiles({
    name: path.basename(jsonPath),
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(tree)),
  });
  await page.getByTestId('import-confirm').click();

  await expect.poll(() => page.evaluate(() => window.__uxDebug.getDataSnapshot().people.length), { timeout: 60_000 }).toBe(4338);
  const importedState = await page.evaluate(() => window.__uxDebug.getDataSnapshot());
  expect(importedState.people.filter(person => !person.pool)).toHaveLength(3245);
  expect(importedState.people.filter(person => person.pool)).toHaveLength(1093);
  expect(importedState.people.find(person => person.id === 'fb0001')?.parents).toEqual(['fbbridge0001']);
  expect(importedState.people.find(person => person.id === 'fbbridge0001')?.parents).toEqual(['p334', 'p335']);
  await expect.poll(
    () => page.evaluate(() => window.__uxDebug.getDataSnapshot().layoutMode),
    { timeout: 30_000 }
  ).toBe('galaxy');
  expect(await page.evaluate(() => window.__uxDebug.getLargeTreeState())).toMatchObject({
    active: true,
    personCount: 3245,
    overviewCached: true,
    overviewPending: false,
    layoutSource: 'worker'
  });
  await expect(page.locator('#nodes > .person')).toHaveCount(0);
  const clusterMetrics = await page.locator('.galaxyCluster').evaluateAll(elements => {
    const boxes = elements.map(element => element.getBoundingClientRect());
    let largestOverlap = 0;
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        const a = boxes[left];
        const b = boxes[right];
        const area = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
          * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        if (area > 0) largestOverlap = Math.max(largestOverlap, area / Math.min(a.width * a.height, b.width * b.height));
      }
    }
    return {
      count: boxes.length,
      minimumTarget: Math.min(...boxes.map(box => Math.min(box.width, box.height))),
      largestOverlap
    };
  });
  expect(clusterMetrics.count).toBe(53);
  expect(clusterMetrics.minimumTarget).toBeGreaterThanOrEqual(44);
  expect(clusterMetrics.largestOverlap).toBeLessThan(0.2);
  await page.screenshot({ path: path.join(screenshotDir, 'familienuebersicht-v5-1440x900.png') });

  await page.getByTestId('person-search-open').click();
  await page.getByTestId('person-search').fill('Ungeklärter Bodensteiner-Anschluss');
  await page.getByTestId('person-search-result-fbbridge0001').click();
  await expect(page.getByTestId('person-dialog')).toBeVisible();
  await page.getByTestId('person-dialog-close').click();
  await page.getByTestId('person-search-close').click();
  await page.evaluate(() => window.__uxDebug.setLayoutModeForTest('radial'));
  await expect(page.getByTestId('person-card-p334')).toBeInViewport();
  await expect(page.getByTestId('person-card-fbbridge0001')).toBeInViewport();
  await expect(page.getByTestId('person-card-fb0001')).toBeInViewport();
  await page.screenshot({ path: path.join(screenshotDir, 'anschluss-uebersicht-1440x900.png') });

  await page.evaluate(() => window.__uxDebug.setLayoutModeForTest('classic'));
  await expect(page.getByTestId('person-card-fbbridge0001')).toBeVisible();
  await expect(page.getByTestId('person-card-fb0001')).toBeVisible();
  await expect(page.getByTestId('person-card-fb0002')).toBeVisible();
  await page.screenshot({ path: path.join(screenshotDir, 'anschluss-detail-1440x900.png') });

  await page.getByTestId('person-search-open').click();
  await page.getByTestId('person-search').fill('About 1734 Unterlind');
  await page.getByTestId('person-search-result-fb0001').click();
  await expect(page.getByTestId('person-dialog')).toBeVisible();
  await page.getByTestId('person-dialog-close').click();
  await page.getByTestId('person-search-close').click();
  await expect(page.getByTestId('person-card-fb0001')).toBeInViewport();
  await page.screenshot({ path: path.join(screenshotDir, 'us-linie-detail-1440x900.png') });

  expect(errors).toEqual([]);
});
