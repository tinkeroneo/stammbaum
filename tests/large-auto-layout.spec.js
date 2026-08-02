const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';
const v5Path = path.resolve(__dirname, '..', 'stammbaum_mit_familienbuch_full_v5_bereinigt.json');
const v5Tree = fs.existsSync(v5Path) ? JSON.parse(fs.readFileSync(v5Path, 'utf8')) : null;

function standaloneTree(count = 1250, familyCount = 20, coordinateOffset = 0) {
  const people = Array.from({ length: count }, (_, index) => {
    const generation = Math.floor(index / familyCount);
    const partnerIndex = index % 2 === 0 ? index + 1 : index - 1;
    return {
      id: `standalone-${index}`,
      name: `Person ${index}`,
      firstName: `Person ${index}`,
      lastName: `Familie ${index % familyCount}`,
      born: String(1650 + generation * 3),
      x: coordinateOffset + (count - index) * 791,
      y: coordinateOffset - generation * 613,
      parents: index >= familyCount ? [`standalone-${index - familyCount}`] : [],
      partners: partnerIndex >= 0 && partnerIndex < count ? [`standalone-${partnerIndex}`] : []
    };
  });
  return { rootIds: ['standalone-0'], people };
}

async function openApp(page) {
  await page.addInitScript(key => {
    localStorage.setItem(key, JSON.stringify({
      rootIds: ['bootstrap'],
      people: [{ id: 'bootstrap', name: 'Bootstrap', x: 500, y: 300, parents: [], partners: [] }]
    }));
    localStorage.setItem(`${key}-help-seen-v1`, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, storeKey);
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
  await page.getByTestId('app-mode-toggle').click();
}

async function importAndArrange(page, tree, fileName) {
  const fileInput = page.locator('#fileInput');
  await fileInput.setInputFiles([]);
  await fileInput.setInputFiles({
    name: fileName,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(tree))
  });
  await expect(page.getByTestId('import-dialog')).toBeVisible();
  await expect(page.getByTestId('import-summary')).toContainText(fileName);
  await page.getByTestId('import-confirm').click();
  await expect.poll(() => page.evaluate(firstId => {
    const snapshot = window.__uxDebug.getDataSnapshot();
    return {
      count: snapshot.people.length,
      firstX: snapshot.people.find(person => person.id === firstId)?.x
    };
  }, tree.people[0].id), {
    timeout: 90_000
  }).toEqual({ count: tree.people.length, firstX: tree.people[0].x });
  await expect(page.getByTestId('busy-indicator')).toHaveAttribute('aria-hidden', 'true', { timeout: 90_000 });
  if (await page.getByTestId('app-mode-toggle').getAttribute('aria-pressed') !== 'true') {
    await page.getByTestId('app-mode-toggle').click();
  }
  expect(await page.evaluate(() => window.__uxDebug.applyFullAutoLayoutForTest())).toBe(true);
  return page.evaluate(() => window.__uxDebug.getExportDataForTest());
}

function layoutMetrics(dataset) {
  const people = dataset.people.filter(person => !person.pool);
  const byId = new Map(people.map(person => [String(person.id), person]));
  const xs = people.map(person => Number(person.x));
  const ys = people.map(person => Number(person.y));
  const partnerPairs = new Set();
  let backwardParentEdges = 0;
  let ancestryPartnerPairs = 0;
  let regularPartnerPairsOffLevel = 0;
  let maxRegularPartnerGap = 0;

  const ancestorOf = (ancestorId, descendantId) => {
    const seen = new Set();
    const queue = [...(byId.get(descendantId)?.parents || [])];
    while (queue.length) {
      const id = String(queue.shift());
      if (id === ancestorId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push(...(byId.get(id)?.parents || []));
    }
    return false;
  };

  for (const child of people) {
    for (const parentId of child.parents || []) {
      const parent = byId.get(String(parentId));
      if (parent && Number(child.y) <= Number(parent.y)) backwardParentEdges += 1;
    }
    for (const partnerId of [...(child.partners || []), child.partner].filter(Boolean)) {
      const partner = byId.get(String(partnerId));
      if (!partner) continue;
      const pairKey = [String(child.id), String(partner.id)].sort().join('|');
      if (partnerPairs.has(pairKey)) continue;
      partnerPairs.add(pairKey);
      if (ancestorOf(String(child.id), String(partner.id)) || ancestorOf(String(partner.id), String(child.id))) {
        ancestryPartnerPairs += 1;
        continue;
      }
      if (Number(child.y) !== Number(partner.y)) regularPartnerPairsOffLevel += 1;
      maxRegularPartnerGap = Math.max(maxRegularPartnerGap, Math.abs(Number(child.x) - Number(partner.x)));
    }
  }

  const coordinateKeys = people.map(person => `${person.x},${person.y}`);
  return {
    people: people.length,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    duplicateCoordinates: coordinateKeys.length - new Set(coordinateKeys).size,
    backwardParentEdges,
    ancestryPartnerPairs,
    regularPartnerPairsOffLevel,
    maxRegularPartnerGap
  };
}

async function visibleCardOverlapCount(page) {
  return page.locator('#nodes > .person').evaluateAll(cards => {
    const boxes = cards.map(card => card.getBoundingClientRect());
    let overlaps = 0;
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        const a = boxes[left];
        const b = boxes[right];
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2
          && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) overlaps += 1;
      }
    }
    return overlaps;
  });
}

test.setTimeout(300_000);

test('großes Auto-Layout ist eigenständig, deterministisch und koordinatenunabhängig', async ({ browser }) => {
  const arrangeInFreshContext = async (tree, fileName) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await openApp(page);
    const result = await importAndArrange(page, tree, fileName);
    await context.close();
    return result;
  };
  const first = await arrangeInFreshContext(standaloneTree(1250, 20, 0), 'standalone-a.json');
  const firstMetrics = layoutMetrics(first);
  expect(firstMetrics).toMatchObject({
    people: 1250,
    duplicateCoordinates: 0,
    backwardParentEdges: 0,
    ancestryPartnerPairs: 0,
    regularPartnerPairsOffLevel: 0
  });
  expect(firstMetrics.width).toBeLessThan(20_000);
  expect(firstMetrics.height).toBeLessThan(20_000);
  expect(firstMetrics.maxRegularPartnerGap).toBeLessThanOrEqual(224);

  const second = await arrangeInFreshContext(standaloneTree(1250, 20, 9_000_000), 'standalone-b.json');
  const positions = dataset => Object.fromEntries(dataset.people.map(person => [person.id, { x: person.x, y: person.y }]));
  expect(positions(second)).toEqual(positions(first));
});

test('vollständiger V5-Graph bleibt kompakt und generationsrichtig', async ({ page }, testInfo) => {
  test.skip(!v5Tree, 'Lokaler V5-Datensatz fehlt.');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openApp(page);
  const arranged = await importAndArrange(page, v5Tree, path.basename(v5Path));
  const metrics = layoutMetrics(arranged);
  expect(metrics).toMatchObject({
    people: 3245,
    duplicateCoordinates: 0,
    backwardParentEdges: 0,
    ancestryPartnerPairs: 2,
    regularPartnerPairsOffLevel: 0
  });
  expect(metrics.width).toBeLessThan(30_000);
  expect(metrics.height).toBeLessThan(20_000);
  expect(metrics.maxRegularPartnerGap).toBeLessThanOrEqual(1120);
  expect(errors).toEqual([]);
  expect(await visibleCardOverlapCount(page)).toBe(0);
  await page.getByTestId('app-mode-toggle').click();
  await expect(page.getByTestId('app-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
  expect(await visibleCardOverlapCount(page)).toBe(0);
  fs.writeFileSync(testInfo.outputPath('layout-metrics.json'), JSON.stringify(metrics, null, 2));
  await page.screenshot({ path: testInfo.outputPath('auto-layout-v5-1440x900.png') });
});
