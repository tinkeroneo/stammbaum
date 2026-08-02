const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';
const screenshotDir = path.resolve(__dirname, '..', 'docs', 'large-tree-screenshots');
const captureScreenshots = process.env.UPDATE_LARGE_TREE_SCREENSHOTS === '1';

function largeTree(count = 1250, familyCount = 20) {
  const people = Array.from({ length: count }, (_, index) => {
    const family = index % familyCount;
    const generation = Math.floor(index / familyCount);
    const id = `large-${index}`;
    const parentIndex = index - familyCount;
    const partnerIndex = index % 2 === 0 && index + 1 < count ? index + 1 : index - 1;
    return {
      id,
      name: `Person ${index} Familie ${family}`,
      firstName: `Person ${index}`,
      lastName: `Familie ${family}`,
      born: String(1650 + generation * 3),
      x: 200 + index * 230,
      y: 220 + generation * 190,
      parents: parentIndex >= 0 ? [`large-${parentIndex}`] : [],
      partners: partnerIndex >= 0 && partnerIndex < count ? [`large-${partnerIndex}`] : []
    };
  });
  return { rootIds: ['large-0'], people };
}

async function openLargeTree(page, viewport = { width: 1440, height: 900 }) {
  const tree = largeTree();
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(`${key}-help-seen-v1`, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, value: tree });
  await page.setViewportSize(viewport);
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
  await expect.poll(
    () => page.evaluate(() => window.__uxDebug.getDataSnapshot().layoutMode),
    { timeout: 30_000 }
  ).toBe('galaxy');
}

test('großer Stammbaum startet in semantischer Übersicht und verwendet Cluster-Minimap', async ({ page }) => {
  await openLargeTree(page, { width: 390, height: 844 });
  await expect(page.locator('body')).toHaveClass(/galaxyLayout/);
  await expect(page.getByTestId('galaxy-hud')).toContainText('1.250 Personen');
  await expect(page.locator('#nodes > .person')).toHaveCount(0);
  await expect(page.locator('#startNavBtn .mainNavLabel')).toHaveText('Übersicht');

  const state = await page.evaluate(() => window.__uxDebug.getLargeTreeState());
  expect(state).toMatchObject({
    active: true,
    personCount: 1250,
    overviewCached: true,
    overviewPending: false,
    classicScoped: false,
    layoutSource: 'worker'
  });
  expect(state.layoutDurationMs).toBeGreaterThanOrEqual(0);

  await page.getByTestId('overview-open').click();
  await expect(page.getByTestId('overview-sheet')).toContainText('Familienübersicht');
  await expect(page.locator('#overviewSvg .galaxyMiniCluster')).toHaveCount(20);
  await expect(page.locator('#overviewSvg .node')).toHaveCount(0);

  if (captureScreenshots) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'familienuebersicht-390x844.png') });
  }
});

test('Cluster, Verwandtschaft und Karten-Nahbereich bilden eine durchgängige Zoomkette', async ({ page }) => {
  await openLargeTree(page);
  await page.getByTestId('galaxy-cluster-familie-0').click();
  await expect(page.getByTestId('galaxy-relations')).toBeVisible();
  await expect(page.locator('#nodes > .person')).not.toHaveCount(0);
  await expect(page.locator('#nodes > .person')).toHaveCount(63);

  await page.getByTestId('galaxy-relations').click();
  await expect.poll(() => page.evaluate(() => window.__uxDebug.getDataSnapshot().layoutMode)).toBe('radial');
  await expect(page.locator('#nodes > .person')).not.toHaveCount(0);

  await page.locator('#startNavBtn').click();
  await expect.poll(() => page.evaluate(() => window.__uxDebug.getDataSnapshot().layoutMode)).toBe('galaxy');
  expect((await page.evaluate(() => window.__uxDebug.getLargeTreeState())).overviewCached).toBe(true);

  await page.getByTestId('galaxy-exit').click();
  await expect.poll(() => page.evaluate(() => window.__uxDebug.getDataSnapshot().layoutMode)).toBe('classic');
  expect(await page.evaluate(() => window.__uxDebug.getLargeTreeState())).toMatchObject({
    active: true,
    classicScoped: true
  });
  await expect(page.locator('#nodes > .person')).not.toHaveCount(0);
  await expect(page.locator('#nodes > .person')).not.toHaveCount(1250);
  await page.getByTestId('app-mode-toggle').click();
  await page.getByTestId('main-nav-more').click();
  await expect(page.getByTestId('layout-auto')).toBeDisabled();
  await expect(page.getByTestId('layout-auto')).toHaveAttribute('title', /vollständige große Baum/);

  if (captureScreenshots) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'karten-nahbereich-1440x900.png') });
  }
});
