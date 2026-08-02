const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = `${storeKey}-help-seen-v1`;
const connectedPoolIds = ['pool-parent', 'pool-partner', 'pool-child', 'pool-grandchild'];

const tree = {
  rootIds: ['active-root'],
  people: [
    { id: 'active-root', name: 'Aktive Wurzel', x: 300, y: 200, pool: false, parents: [], partners: [] },
    { id: 'pool-parent', name: 'Vorrat Elternteil', x: 700, y: 200, pool: true, parents: [], partner: 'pool-partner', partners: ['pool-partner'] },
    { id: 'pool-partner', name: 'Vorrat Partner', x: 940, y: 200, pool: true, parents: [], partner: 'pool-parent', partners: ['pool-parent'] },
    { id: 'pool-child', name: 'Vorrat Kind', x: 820, y: 480, pool: true, parents: ['pool-parent', 'pool-partner'], partners: [] },
    { id: 'pool-grandchild', name: 'Vorrat Enkel', x: 820, y: 760, pool: true, parents: ['pool-child'], partners: [] },
    { id: 'pool-unrelated', name: 'Vorrat Unverbunden', x: 1250, y: 200, pool: true, parents: [], partners: [] }
  ]
};

async function openPool(page) {
  await page.addInitScript(({ key, seenKey, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(seenKey, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, seenKey: helpSeenKey, value: tree });
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
  await page.getByTestId('main-nav-people').click();
  await page.getByTestId('directory-pool-tab').click();
}

test('Wiedereingliedern holt die vollständig verknüpfte Vorratsgruppe zurück', async ({ page }) => {
  await openPool(page);
  const row = page.getByTestId('directory-row-pool-child');
  await row.locator('summary').click();
  await row.getByRole('button', { name: 'In den Stammbaum eingliedern' }).click();

  await expect(page.getByTestId('decision-dialog')).toContainText('Verknüpften Zweig eingliedern?');
  await expect(page.getByTestId('decision-dialog')).toContainText('Alle 4 Personen');
  await expect(page.getByTestId('decision-cancel')).toHaveText('Im Vorrat lassen');
  await page.getByTestId('decision-confirm').click();

  const after = await page.evaluate(() => window.__uxDebug.getDataSnapshot());
  expect(after.people.filter(person => connectedPoolIds.includes(person.id)).every(person => !person.pool)).toBe(true);
  expect(after.people.find(person => person.id === 'pool-unrelated').pool).toBe(true);
  expect(after.people.find(person => person.id === 'pool-child').parents).toEqual(['pool-parent', 'pool-partner']);
  expect(after.people.find(person => person.id === 'pool-parent').partners).toContain('pool-partner');
  expect(after.people.find(person => person.id === 'pool-grandchild').parents).toEqual(['pool-child']);
  expect(after.rootIds).toEqual(['active-root']);
  expect((await page.evaluate(() => window.__uxDebug.getCommandHistoryState())).undoLabel).toBe('Aus Vorrat eingliedern');

  await page.evaluate(() => window.__uxDebug.undoCommand());
  const undone = await page.evaluate(() => window.__uxDebug.getDataSnapshot());
  expect(undone.people.filter(person => connectedPoolIds.includes(person.id)).every(person => person.pool)).toBe(true);

  await page.evaluate(() => window.__uxDebug.redoCommand());
  await page.evaluate(() => window.__uxDebug.waitForPersistence());
  const persisted = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storeKey);
  expect(persisted.people.filter(person => connectedPoolIds.includes(person.id)).every(person => !person.pool)).toBe(true);
  expect(persisted.people.find(person => person.id === 'pool-unrelated').pool).toBe(true);
});

test('Abbruch lässt die gesamte Vorratsgruppe unverändert', async ({ page }) => {
  await openPool(page);
  const row = page.getByTestId('directory-row-pool-parent');
  await row.locator('summary').click();
  const activate = row.getByRole('button', { name: 'In den Stammbaum eingliedern' });
  await activate.click();
  await page.getByTestId('decision-cancel').click();

  await expect(page.getByTestId('people-directory')).toBeVisible();
  await expect(activate).toBeFocused();
  const unchanged = await page.evaluate(() => window.__uxDebug.getDataSnapshot());
  expect(unchanged.people.filter(person => connectedPoolIds.includes(person.id)).every(person => person.pool)).toBe(true);
  expect((await page.evaluate(() => window.__uxDebug.getCommandHistoryState())).length).toBe(0);
});
