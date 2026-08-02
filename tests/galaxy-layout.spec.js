const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const demoTree = require('../Bodensteiner.json');

const storeKey = 'mobile-family-tree-v5-clean';
const screenshotDir = path.resolve(__dirname, '..', 'docs', 'galaxy-beta-screenshots');
const captureScreenshots = process.env.UPDATE_GALAXY_SCREENSHOTS === '1';
const tree = {
  rootIds: ['root-a'],
  people: [
    { id: 'root-a', name: 'Anna Bodensteiner', firstName: 'Anna', lastName: 'Bodensteiner', born: '1820', x: 400, y: 300, parents: [], partners: ['root-b'] },
    { id: 'root-b', name: 'Max Müller', firstName: 'Max', lastName: 'Müller', born: '1818', x: 680, y: 300, parents: [], partners: ['root-a'] },
    { id: 'child-a', name: 'Clara Bodensteiner', firstName: 'Clara', lastName: 'Bodensteiner', born: '1845', x: 520, y: 620, parents: ['root-a', 'root-b'], partners: ['partner-a'] },
    { id: 'partner-a', name: 'Paul Clark', firstName: 'Paul', lastName: 'Clark', born: '1842', x: 800, y: 620, parents: [], partners: ['child-a'] },
    { id: 'child-b', name: 'Emil Bodensteiner', firstName: 'Emil', lastName: 'Bodensteiner', born: '1870', x: 620, y: 940, parents: ['child-a', 'partner-a'], partners: [] },
    { id: 'miller-a', name: 'Maria Müller', firstName: 'Maria', lastName: 'Müller', born: '1848', x: 1060, y: 620, parents: ['root-b'], partners: ['reil-a'] },
    { id: 'reil-a', name: 'Franz Reil', firstName: 'Franz', lastName: 'Reil', born: '1844', x: 1320, y: 620, parents: [], partners: ['miller-a'] },
    { id: 'clark-a', name: 'Louise Clark', firstName: 'Louise', lastName: 'Clark', born: '1872', x: 920, y: 940, parents: ['child-a', 'partner-a'], partners: [] }
  ]
};

async function openTree(page, viewport = { width: 1280, height: 800 }) {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(`${key}-help-seen-v1`, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, value: tree });
  await page.setViewportSize(viewport);
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
}

test('Galaxie verdichtet Familien, zoomt in Cluster und stellt klassische Positionen wieder her', async ({ page }) => {
  await openTree(page);
  const classic = await page.evaluate(() => Object.fromEntries(
    window.__uxDebug.getDataSnapshot().people.map(person => [person.id, { x: person.x, y: person.y }])
  ));

  await page.evaluate(() => window.__uxDebug.setLayoutModeForTest('galaxy'));
  await expect(page.getByTestId('galaxy-hud')).toBeVisible();
  await expect(page.getByTestId('galaxy-clusters')).toBeVisible();
  expect(await page.locator('.galaxyCluster').count()).toBe(4);
  expect(await page.locator('.galaxyEdge').count()).toBeGreaterThan(0);
  await expect(page.locator('#nodes > .person')).toHaveCount(0);
  await expect(page.locator('body')).toHaveClass(/galaxyLayout/);
  expect((await page.evaluate(() => window.__uxDebug.getGalaxyState())).clusterCount).toBe(4);
  expect(await page.evaluate(() => Object.fromEntries(
    window.__uxDebug.getExportDataForTest().people.map(person => [person.id, { x: person.x, y: person.y }])
  ))).toEqual(classic);

  await page.getByTestId('galaxy-cluster-bodensteiner').click();
  await expect(page.getByTestId('galaxy-back')).toBeVisible();
  await expect(page.getByTestId('galaxy-hud')).toContainText('Bodensteiner');
  await expect(page.locator('#nodes > .person')).toHaveCount(3);
  await expect(page.getByTestId('person-card-child-a')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.__uxDebug.getView().s)).toBeGreaterThanOrEqual(0.7);
  expect((await page.evaluate(() => window.__uxDebug.getGalaxyState())).activeClusterId).toBe('family:bodensteiner');

  await page.getByTestId('galaxy-back').click();
  await expect(page.locator('#nodes > .person')).toHaveCount(0);
  await expect(page.getByTestId('galaxy-cluster-muller')).toBeVisible();
  await expect(page.getByTestId('galaxy-cluster-bodensteiner')).toBeFocused();

  await page.getByTestId('galaxy-exit').click();
  expect(await page.evaluate(() => Object.fromEntries(
    window.__uxDebug.getDataSnapshot().people.map(person => [person.id, { x: person.x, y: person.y }])
  ))).toEqual(classic);
  expect((await page.evaluate(() => window.__uxDebug.getCommandHistoryState())).length).toBe(0);
});

test('Suchsprung behält die Zielperson auch jenseits des Beta-Limits im Cluster', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { buildGalaxyClusterDetail, buildGalaxyLayout } = await import('/modules/galaxy-layout.js');
    const people = Array.from({ length: 170 }, (_, index) => ({
      id: `person-${index}`,
      name: `Person ${index} Großfamilie`,
      lastName: 'Großfamilie',
      born: String(1700 + index),
      parents: []
    }));
    const layout = buildGalaxyLayout(people);
    const detail = buildGalaxyClusterDetail(layout, layout.clusters[0].id, people, {
      maxPeople: 160,
      focusPersonId: 'person-169'
    });
    return { included: detail.ids.has('person-169'), shown: detail.ids.size, omitted: detail.omitted };
  });
  expect(result).toEqual({ included: true, shown: 160, omitted: 10 });
});

test('Galaxie bleibt auf Mobile bedienbar und löst Detail beim Herauszoomen wieder auf', async ({ page }) => {
  await openTree(page, { width: 390, height: 844 });
  await page.evaluate(() => window.__uxDebug.setLayoutModeForTest('galaxy'));
  const cluster = page.getByTestId('galaxy-cluster-bodensteiner');
  const target = await cluster.boundingBox();
  expect(target.width).toBeGreaterThanOrEqual(44);
  expect(target.height).toBeGreaterThanOrEqual(44);
  await cluster.click();
  await expect(page.getByTestId('person-card-root-a')).toBeVisible();

  await page.getByTestId('zoom-toggle').click();
  const zoomOut = page.locator('#zout');
  for (let index = 0; index < 14; index += 1) await zoomOut.click();
  await expect(page.locator('#nodes > .person')).toHaveCount(0);
  expect((await page.evaluate(() => window.__uxDebug.getGalaxyState())).activeClusterId).toBe('');
  await expect(page.getByTestId('galaxy-cluster-bodensteiner')).toBeVisible();
});

test('Mobile hält Galaxy-Hinweise und Zoomtasten kompakt und klappt beide gezielt auf', async ({ page }) => {
  await openTree(page, { width: 390, height: 844 });
  await page.evaluate(() => window.__uxDebug.setLayoutModeForTest('galaxy'));

  const hud = page.getByTestId('galaxy-hud');
  const hudToggle = page.getByTestId('galaxy-hud-toggle');
  const zoomToggleButton = page.getByTestId('zoom-toggle');
  await expect(hudToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#galaxyHudText')).toBeHidden();
  await expect(page.getByTestId('galaxy-exit')).toBeHidden();
  expect((await hud.boundingBox()).height).toBeLessThanOrEqual(58);
  await expect(zoomToggleButton).toBeVisible();
  await expect(page.locator('#zin')).toBeHidden();
  await expect(page.locator('#zout')).toBeHidden();
  if (captureScreenshots) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'galaxie-mobile-kompakt-390x844.png') });
  }

  await hudToggle.click();
  await expect(hudToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#galaxyHudText')).toBeVisible();
  await expect(page.getByTestId('galaxy-exit')).toBeVisible();
  const openHudBox = await hud.boundingBox();
  expect(openHudBox.width).toBeLessThanOrEqual(320);
  expect(openHudBox.height).toBeLessThan(190);
  if (captureScreenshots) {
    await page.screenshot({ path: path.join(screenshotDir, 'galaxie-mobile-info-390x844.png') });
  }
  await hudToggle.click();
  await expect(page.locator('#galaxyHudText')).toBeHidden();

  await zoomToggleButton.click();
  await expect(zoomToggleButton).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#zin')).toBeVisible();
  await expect(page.locator('#zout')).toBeVisible();
  await zoomToggleButton.click();
  await expect(page.locator('#zin')).toBeHidden();
});

test('Desktop kann die Galaxy-Info einklappen und beim Überfahren kurz einblenden', async ({ page }) => {
  await openTree(page, { width: 1280, height: 800 });
  await page.evaluate(() => window.__uxDebug.setLayoutModeForTest('galaxy'));
  const hud = page.getByTestId('galaxy-hud');
  const hudToggle = page.getByTestId('galaxy-hud-toggle');
  await expect(hudToggle).toHaveAttribute('aria-expanded', 'true');
  await hudToggle.click();
  await page.mouse.move(900, 700);
  await expect(hudToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#galaxyHudText')).toBeHidden();
  await hud.hover();
  await expect(page.locator('#galaxyHudText')).toBeVisible();
});

test('semantischer Mobile-Zoom hält Cluster stabil, zeigt ein Sternbild und öffnet erst danach Karten', async ({ page }) => {
  await openTree(page, { width: 390, height: 844 });
  await page.evaluate(() => window.__uxDebug.setLayoutModeForTest('galaxy'));
  const clusterId = 'family:bodensteiner';

  await page.evaluate(id => window.__uxDebug.zoomGalaxyToClusterForTest(id, 1.05), clusterId);
  const overviewBox = await page.getByTestId('galaxy-cluster-bodensteiner').boundingBox();
  expect((await page.evaluate(() => window.__uxDebug.getGalaxyState())).semanticStage).toBe('overview');

  await page.evaluate(id => window.__uxDebug.zoomGalaxyToClusterForTest(id, 1.8), clusterId);
  const constellationBox = await page.getByTestId('galaxy-cluster-bodensteiner').boundingBox();
  const constellationState = await page.evaluate(() => window.__uxDebug.getGalaxyState());
  expect(constellationState.semanticStage).toBe('constellation');
  expect(constellationState.constellationClusterId).toBe(clusterId);
  expect(Math.abs(constellationBox.width - overviewBox.width)).toBeLessThan(1.5);
  expect(Math.abs(constellationBox.height - overviewBox.height)).toBeLessThan(1.5);
  await expect(page.locator('.galaxyConstellationStar')).toHaveCount(3);
  expect(await page.locator('.galaxyConstellationLine').count()).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() =>
    getComputedStyle(document.querySelector('.galaxyCluster.constellationFocus')).opacity
  )).toBe('0');
  const starTargets = await page.locator('.galaxyConstellationStar').evaluateAll(elements =>
    elements.map(element => element.getBoundingClientRect().width)
  );
  expect(Math.min(...starTargets)).toBeGreaterThanOrEqual(45.9);
  expect(Math.max(...starTargets)).toBeLessThan(47);
  await expect(page.locator('#nodes > .person')).toHaveCount(0);
  await expect(page.getByTestId('galaxy-hud')).toContainText('Sternbild');
  if (captureScreenshots) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'galaxie-sternbild-390x844.png') });
  }

  await page.evaluate(id => window.__uxDebug.zoomGalaxyToClusterForTest(id, 3.2, true), clusterId);
  await expect(page.getByTestId('person-card-root-a')).toBeVisible();
  expect((await page.evaluate(() => window.__uxDebug.getGalaxyState())).semanticStage).toBe('detail');
});

test('echte Zwei-Finger-Geste durchläuft auf Mobile beide semantischen Zoomstufen', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  });
  const page = await context.newPage();
  await openTree(page, { width: 390, height: 844 });
  await page.evaluate(() => window.__uxDebug.setLayoutModeForTest('galaxy'));

  const pinchAtCluster = async (scale, movement = { x: 0, y: 0 }) => page.evaluate(({ clusterId, scale, movement }) => {
    const state = window.__uxDebug.getGalaxyState();
    const cluster = state.clusters.find(entry => entry.id === clusterId);
    const view = window.__uxDebug.getView();
    const main = document.querySelector('#main');
    const rect = main.getBoundingClientRect();
    const center = {
      x: rect.left + rect.width / 2 + view.x + cluster.x * view.s,
      y: rect.top + rect.height / 2 + view.y + cluster.y * view.s
    };
    const createTouches = (distance, offset = { x: 0, y: 0 }, identifiers = [1, 2]) => identifiers.map((identifier, index) => new Touch({
      identifier,
      target: main,
      clientX: center.x + offset.x + (index === 0 ? -distance / 2 : distance / 2),
      clientY: center.y + offset.y,
      pageX: center.x + offset.x + (index === 0 ? -distance / 2 : distance / 2),
      pageY: center.y + offset.y,
      radiusX: 8,
      radiusY: 8,
      force: 0.5
    }));
    const startTouches = createTouches(80);
    main.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true,
      cancelable: true,
      touches: startTouches,
      targetTouches: startTouches,
      changedTouches: startTouches
    }));
    const movedTouches = createTouches(80 * scale, movement);
    main.dispatchEvent(new TouchEvent('touchmove', {
      bubbles: true,
      cancelable: true,
      touches: movedTouches,
      targetTouches: movedTouches,
      changedTouches: movedTouches
    }));
    main.dispatchEvent(new TouchEvent('touchend', {
      bubbles: true,
      cancelable: true,
      touches: [],
      targetTouches: [],
      changedTouches: movedTouches
    }));
    const after = window.__uxDebug.getView();
    const anchoredScreen = {
      x: rect.left + rect.width / 2 + after.x + cluster.x * after.s,
      y: rect.top + rect.height / 2 + after.y + cluster.y * after.s
    };
    return Math.hypot(
      anchoredScreen.x - (center.x + movement.x),
      anchoredScreen.y - (center.y + movement.y)
    );
  }, { clusterId: 'family:bodensteiner', scale, movement });

  const anchorDrift = await pinchAtCluster(1.8, { x: 28, y: -18 });
  expect(anchorDrift).toBeLessThan(1);
  await expect(page.locator('.galaxyConstellationStar')).toHaveCount(3);
  expect((await page.evaluate(() => window.__uxDebug.getGalaxyState())).semanticStage).toBe('constellation');
  await pinchAtCluster(1.8);
  await expect(page.getByTestId('person-card-root-a')).toBeVisible();
  expect((await page.evaluate(() => window.__uxDebug.getGalaxyState())).semanticStage).toBe('detail');
  await context.close();
});

test('synthetische Demo-Galaxie bleibt kollisionsarm und visuell prüfbar', async ({ page }) => {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(`${key}-help-seen-v1`, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, value: demoTree });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
  await page.evaluate(() => window.__uxDebug.setLayoutModeForTest('galaxy'));

  const overlaps = await page.locator('.galaxyCluster').evaluateAll(elements => {
    const boxes = elements.map(element => ({
      id: element.dataset.clusterId,
      rect: element.getBoundingClientRect()
    }));
    const ratios = [];
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        const a = boxes[left].rect;
        const b = boxes[right].rect;
        const area = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
          * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        if (area > 0) ratios.push({
          a: boxes[left].id,
          b: boxes[right].id,
          ratio: area / Math.min(a.width * a.height, b.width * b.height)
        });
      }
    }
    return ratios;
  });
  const largestOverlap = overlaps.sort((a, b) => b.ratio - a.ratio)[0] || { ratio: 0 };
  expect(largestOverlap).toMatchObject({ ratio: expect.any(Number) });
  expect(largestOverlap.ratio, JSON.stringify(largestOverlap)).toBeLessThan(0.18);

  if (captureScreenshots) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'galaxie-uebersicht-1440x900.png') });
  }

  const largestCluster = await page.evaluate(() => [...window.__uxDebug.getGalaxyState().clusters]
    .sort((a, b) => b.count - a.count)[0]);
  await page.evaluate(id => window.__uxDebug.openGalaxyClusterForTest(id), largestCluster.id);
  await expect(page.locator('#nodes > .person')).not.toHaveCount(0);
  if (captureScreenshots) {
    await page.waitForTimeout(320);
    await page.screenshot({ path: path.join(screenshotDir, 'galaxie-cluster-1440x900.png') });
  }

  await page.getByTestId('galaxy-back').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('galaxy-hud')).toBeInViewport();
  await expect.poll(async () => page.locator('.galaxyCluster').evaluateAll(elements =>
    Math.max(...elements.map(element => element.getBoundingClientRect().width))
  )).toBeLessThan(140);
  if (captureScreenshots) {
    await page.screenshot({ path: path.join(screenshotDir, 'galaxie-uebersicht-390x844.png') });
  }
});
