const { test, expect } = require('@playwright/test');
const tree = require('../Bodensteiner.json');

const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = `${storeKey}-help-seen-v1`;

function fixtureWithUsefulRoot() {
  const copy = structuredClone(tree);
  const childCounts = new Map();
  for (const person of copy.people) {
    for (const parentId of person.parents || []) {
      childCounts.set(parentId, (childCounts.get(parentId) || 0) + 1);
    }
  }
  const root = [...copy.people]
    .filter(person => !person.pool)
    .sort((a, b) => {
      const score = person => (person.parents?.length || 0)
        + (person.partners?.length || 0)
        + (person.partner ? 1 : 0)
        + (childCounts.get(person.id) || 0);
      return score(b) - score(a);
    })[0];
  copy.rootIds = [root.id];
  return { copy, rootId: root.id };
}

async function openRealTree(page) {
  const { copy, rootId } = fixtureWithUsefulRoot();
  await page.addInitScript(({ key, seenKey, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(seenKey, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, seenKey: helpSeenKey, value: copy });
  await page.goto('/?ux-debug=1');
  await expect.poll(() => page.evaluate(() => !!window.__uxDebug)).toBe(true);
  return rootId;
}

async function renderedCardBoxes(page) {
  return page.locator('#nodes > .person').evaluateAll(cards => cards.map(card => {
    const rect = card.getBoundingClientRect();
    return { id: card.dataset.id, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  }));
}

function overlapPairs(boxes) {
  const overlaps = [];
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left];
      const b = boxes[right];
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2
        && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) overlaps.push({ a, b });
    }
  }
  return overlaps;
}

test('Baum und Kreis sind fokussierte, kollisionsfreie Leseansichten', async ({ page }) => {
  const rootId = await openRealTree(page);
  const classic = await page.evaluate(() => Object.fromEntries(
    window.__uxDebug.getDataSnapshot().people.map(person => [person.id, { x: person.x, y: person.y }])
  ));

  await page.evaluate(() => window.__uxDebug.setLayoutModeForTest('tree'));
  await expect.poll(() => page.locator('#nodes > .person').count()).toBeGreaterThan(1);
  expect(await page.locator('#nodes > .person').count()).toBeLessThanOrEqual(48);
  expect(overlapPairs(await renderedCardBoxes(page))).toEqual([]);
  await expect(page.locator('.collapseBtn')).toHaveCount(0);
  await expect(page.getByTestId('app-mode-toggle')).toHaveAttribute('aria-pressed', 'false');

  await page.evaluate(() => window.__uxDebug.setLayoutModeForTest('radial'));
  await expect.poll(() => page.locator('#nodes > .person').count()).toBeGreaterThan(1);
  expect(await page.locator('#nodes > .person').count()).toBeLessThanOrEqual(28);
  expect(overlapPairs(await renderedCardBoxes(page))).toEqual([]);
  await expect(page.locator('.collapseBtn')).toHaveCount(0);
  expect(await page.locator('.radialRelationLine, .radialPartnerLine').count()).toBeGreaterThan(0);
  await expect(page.getByTestId(`person-card-${rootId}`)).toBeVisible();

  await page.evaluate(() => window.__uxDebug.setLayoutModeForTest('classic'));
  const restored = await page.evaluate(() => Object.fromEntries(
    window.__uxDebug.getDataSnapshot().people.map(person => [person.id, { x: person.x, y: person.y }])
  ));
  expect(restored).toEqual(classic);
  expect((await page.evaluate(() => window.__uxDebug.getCommandHistoryState())).length).toBe(0);
});

test('Radialansicht bleibt auf Mobile lesbar und speichert niemals ihre abgeleiteten Positionen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const rootId = await openRealTree(page);
  const classicRoot = await page.evaluate(id => {
    const person = window.__uxDebug.getDataSnapshot().people.find(entry => entry.id === id);
    return { x: person.x, y: person.y };
  }, rootId);

  await page.evaluate(() => window.__uxDebug.setLayoutModeForTest('radial'));
  expect(await page.locator('#nodes > .person').count()).toBeLessThanOrEqual(28);
  expect(overlapPairs(await renderedCardBoxes(page))).toEqual([]);
  const zoom = await page.evaluate(() => window.__uxDebug.getView().s);
  expect(zoom).toBeGreaterThanOrEqual(0.42);
  const exportedRoot = await page.evaluate(id => {
    const person = window.__uxDebug.getExportDataForTest().people.find(entry => entry.id === id);
    return { x: person.x, y: person.y };
  }, rootId);
  expect(exportedRoot).toEqual(classicRoot);

  await page.evaluate(id => window.__uxDebug.savePersonNoteForTest(id, 'Persistenzprüfung Kreis'), rootId);
  await page.evaluate(() => window.__uxDebug.waitForPersistence());
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!window.__uxDebug)).toBe(true);
  const reloaded = await page.evaluate(id => {
    const snapshot = window.__uxDebug.getDataSnapshot();
    const person = snapshot.people.find(entry => entry.id === id);
    return { layoutMode: snapshot.layoutMode, x: person.x, y: person.y, note: person.note };
  }, rootId);
  expect(reloaded).toEqual({
    layoutMode: 'classic',
    ...classicRoot,
    note: 'Persistenzprüfung Kreis'
  });
});
