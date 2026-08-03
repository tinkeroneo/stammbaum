const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const jsonPath = path.resolve(__dirname, '..', 'stammbaum_mit_familienbuch_full_v5_bereinigt.json');
const enabled = process.env.REBUILD_V5_CONNECTED_LAYOUT === '1' && fs.existsSync(jsonPath);
const tree = enabled ? JSON.parse(fs.readFileSync(jsonPath, 'utf8')) : null;

test.setTimeout(300_000);
test.skip(!enabled, 'Nur als expliziter V5-Datenpflege-Lauf ausführen.');

test('ordnet den vollständig verbundenen aktiven V5-Baum neu an', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('mobile-family-tree-v5-clean', JSON.stringify({
      rootIds: ['layout-bootstrap'],
      people: [{
        id: 'layout-bootstrap',
        name: 'Layout Bootstrap',
        x: 500,
        y: 300,
        parents: [],
        partners: [],
      }],
    }));
    localStorage.setItem('mobile-family-tree-v5-clean-help-seen-v1', JSON.stringify(['pan-zoom', 'search', 'edit']));
  });

  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
  await page.getByTestId('app-mode-toggle').click();
  await page.locator('#fileInput').setInputFiles({
    name: path.basename(jsonPath),
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(tree)),
  });
  await page.getByTestId('import-confirm').click();
  await expect.poll(
    () => page.evaluate(() => window.__uxDebug.getDataSnapshot().people.length),
    { timeout: 90_000 }
  ).toBe(4297);
  await expect(page.getByTestId('busy-indicator')).toHaveAttribute('aria-hidden', 'true', { timeout: 90_000 });
  if (await page.getByTestId('app-mode-toggle').getAttribute('aria-pressed') !== 'true') {
    await page.getByTestId('app-mode-toggle').click();
  }

  expect(await page.evaluate(() => window.__uxDebug.applyFullAutoLayoutForTest())).toBe(true);
  await expect.poll(
    () => page.getByTestId('busy-indicator').getAttribute('aria-hidden'),
    { timeout: 240_000 }
  ).toBe('true');

  const result = await page.evaluate(() => window.__uxDebug.getExportDataForTest());
  fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  const activePeople = result.people.filter(person => !person.pool);
  const occupiedCoordinates = new Set();
  const duplicateCoordinates = [];
  for (const person of activePeople) {
    const key = `${person.x},${person.y}`;
    if (occupiedCoordinates.has(key)) duplicateCoordinates.push(key);
    occupiedCoordinates.add(key);
  }

  expect(activePeople).toHaveLength(3257);
  expect(result.people.filter(person => person.pool)).toHaveLength(1040);
  expect(duplicateCoordinates).toEqual([]);
  expect(pageErrors).toEqual([]);
});
