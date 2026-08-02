const { test, expect } = require('@playwright/test');
const smokeTree = require('./fixtures/smoke-tree.cjs');

const storeKey = 'mobile-family-tree-v5-clean';

async function openTree(page) {
  await page.addInitScript(({ key, tree }) => {
    localStorage.setItem(key, JSON.stringify(tree));
    localStorage.setItem(`${key}-help-seen-v1`, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, tree: smokeTree });
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
}

async function chooseImport(page, tree, name = 'import.json') {
  await page.locator('#fileInput').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(tree))
  });
  await expect(page.getByTestId('import-dialog')).toBeVisible();
}

test('Import übernimmt Dateipositionen standardmäßig exakt', async ({ page }) => {
  await openTree(page);
  const imported = {
    rootIds: ['left'],
    people: [
      { id: 'left', name: 'Links', x: 120, y: 240, parents: [], partners: [] },
      { id: 'right', name: 'Rechts', x: 42120, y: 260, parents: [], partners: [] }
    ]
  };

  await chooseImport(page, imported, 'positionen.json');
  await expect(page.getByTestId('import-layout-preserve')).toBeChecked();
  await expect(page.getByTestId('import-summary')).toContainText('2 Personen');
  await page.getByTestId('import-confirm').click();

  await expect.poll(async () => page.evaluate(() => Object.fromEntries(
    window.__uxDebug.getDataSnapshot().people.map(person => [person.id, { x: person.x, y: person.y }])
  ))).toEqual({
    left: { x: 120, y: 240 },
    right: { x: 42120, y: 260 }
  });
});

test('automatische Import-Anordnung ist explizit wählbar', async ({ page }) => {
  await openTree(page);
  const imported = {
    rootIds: ['parent'],
    people: [
      { id: 'parent', name: 'Elternteil', x: 5000, y: 5000, parents: [], partners: [] },
      { id: 'child', name: 'Kind', x: 5000, y: 5000, parents: ['parent'], partners: [] }
    ]
  };

  await chooseImport(page, imported);
  await page.getByTestId('import-layout-auto').check();
  await page.getByTestId('import-confirm').click();

  await expect.poll(async () => page.evaluate(() => window.__uxDebug.getDataSnapshot().people
    .map(person => person.id).sort())).toEqual(['child', 'parent']);
  const positions = await page.evaluate(() => Object.fromEntries(
    window.__uxDebug.getDataSnapshot().people.map(person => [person.id, { x: person.x, y: person.y }])
  ));
  expect(positions.parent).not.toEqual({ x: 5000, y: 5000 });
  expect(positions.child).not.toEqual({ x: 5000, y: 5000 });
  expect(positions.child.y).toBeGreaterThan(positions.parent.y);
});

test('Abbrechen lässt den geöffneten Stammbaum unverändert', async ({ page }) => {
  await openTree(page);
  const before = await page.evaluate(() => window.__uxDebug.getDataSnapshot());
  await chooseImport(page, {
    rootIds: ['other'],
    people: [{ id: 'other', name: 'Nicht importieren', x: 10, y: 20, parents: [], partners: [] }]
  });

  await page.getByTestId('import-cancel').click();
  await expect(page.getByTestId('import-dialog')).toBeHidden();
  expect(await page.evaluate(() => window.__uxDebug.getDataSnapshot())).toEqual(before);
});

test('Import ohne vollständige Dateipositionen empfiehlt die automatische Anordnung', async ({ page }) => {
  await openTree(page);
  await chooseImport(page, {
    rootIds: ['without-position'],
    people: [
      { id: 'without-position', name: 'Ohne Position', parents: [], partners: [] },
      { id: 'with-position', name: 'Mit Position', x: 400, y: 300, parents: [], partners: [] }
    ]
  });

  await expect(page.getByTestId('import-layout-auto')).toBeChecked();
  await expect(page.getByTestId('import-summary')).toContainText('1 mit gespeicherter Position');
  await page.getByTestId('import-cancel').click();
});
