const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = `${storeKey}-help-seen-v1`;

const tree = {
  rootIds: ['target'],
  people: [
    { id: 'parent-a', name: 'Eltern A', firstName: 'Eltern', lastName: 'A', x: 300, y: 100, parents: [], partners: [] },
    { id: 'parent-b', name: 'Eltern B', firstName: 'Eltern', lastName: 'B', x: 600, y: 100, parents: [], partners: [] },
    {
      id: 'target',
      name: 'Ziel Person',
      firstName: 'Ziel',
      lastName: 'Person',
      x: 450,
      y: 400,
      parents: ['parent-a', 'parent-b'],
      partner: 'spouse',
      partners: ['spouse']
    },
    {
      id: 'spouse',
      name: 'Partner Person',
      firstName: 'Partner',
      lastName: 'Person',
      x: 700,
      y: 400,
      parents: [],
      partner: 'target',
      partners: ['target']
    },
    { id: 'child-a', name: 'Kind A', firstName: 'Kind', lastName: 'A', x: 450, y: 700, parents: ['target', 'spouse'], partners: [] },
    { id: 'child-b', name: 'Kind B', firstName: 'Kind', lastName: 'B', x: 700, y: 700, parents: ['target'], partners: [] }
  ]
};

async function openEditForm(page) {
  await page.addInitScript(({ key, value, seenKey }) => {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(seenKey, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, value: tree, seenKey: helpSeenKey });
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
  await page.getByTestId('person-search-open').click();
  await page.getByTestId('person-search').fill('Ziel Person');
  await page.getByTestId('person-search-result-target').click();
  await page.getByTestId('app-mode-toggle').click();
  await page.getByTestId('form-section-admin').click();
}

test('Auswirkungsanalyse ist rein und zählt alle Verknüpfungsarten', async ({ page }) => {
  await openEditForm(page);
  const analysis = await page.evaluate(() => {
    const before = JSON.stringify(window.__uxDebug.getDataSnapshot());
    const impact = window.__uxDebug.analyzeDeletionImpact('target');
    return {
      impact,
      unchanged: before === JSON.stringify(window.__uxDebug.getDataSnapshot())
    };
  });

  expect(analysis.unchanged).toBe(true);
  expect(analysis.impact.partnerIds).toEqual(['spouse']);
  expect(analysis.impact.parentIds).toEqual(['parent-a', 'parent-b']);
  expect(analysis.impact.childIds).toEqual(['child-a', 'child-b']);
  expect(analysis.impact.rootLinks).toBe(1);
  expect(analysis.impact.relationshipCount).toBe(6);
});

test('Löschdialog nennt Folgen, Escape bricht ab und Vorrat erhält alle Beziehungen', async ({ page }) => {
  await openEditForm(page);
  const initial = await page.evaluate(() => window.__uxDebug.getDataSnapshot());
  const deleteButton = page.locator('#deleteBtn');
  await deleteButton.click();

  const dialog = page.getByTestId('decision-dialog');
  await expect(dialog).toContainText('Person und Verknüpfungen löschen?');
  await expect(dialog).toContainText('1 Partner-Verknüpfung(en)');
  await expect(dialog).toContainText('2 Eltern-Verknüpfung(en)');
  await expect(dialog).toContainText('2 Kind-Verknüpfung(en)');
  await expect(dialog).toContainText('1 Startwurzel-Verknüpfung(en)');
  await expect(dialog).toContainText('Keine weitere Person wird gelöscht');
  await expect(page.getByTestId('decision-confirm')).toHaveText('Person löschen');
  await expect(page.getByTestId('decision-secondary')).toHaveText('In Vorrat verschieben');
  await expect(page.getByTestId('decision-confirm')).not.toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(deleteButton).toBeFocused();
  expect(await page.evaluate(() => window.__uxDebug.getDataSnapshot())).toEqual(initial);

  await deleteButton.click();
  await page.getByTestId('decision-secondary').click();
  await expect.poll(() => page.evaluate(() => window.__uxDebug.getCommandHistoryState().undoLabel))
    .toBe('In Vorrat verschieben');

  const pooled = await page.evaluate(() => window.__uxDebug.getDataSnapshot());
  expect(pooled.people).toHaveLength(initial.people.length);
  expect(pooled.people.find(person => person.id === 'target').partners).toEqual(['spouse']);
  expect(pooled.people.find(person => person.id === 'child-a').parents).toEqual(['target', 'spouse']);
  expect(pooled.people.filter(person => ['target', 'spouse', 'child-a', 'child-b'].includes(person.id))
    .every(person => person.pool)).toBe(true);
  expect(pooled.rootIds).toEqual([]);

  await page.evaluate(() => window.__uxDebug.undoCommand());
  expect(await page.evaluate(() => window.__uxDebug.getDataSnapshot())).toEqual(initial);
});

test('bestätigtes Löschen entfernt nur die Person, ist rückgängig und fordert neue Rootwahl', async ({ page }) => {
  await openEditForm(page);
  const initial = await page.evaluate(() => window.__uxDebug.getDataSnapshot());
  await page.locator('#deleteBtn').click();
  await page.getByTestId('decision-confirm').click();

  const deleted = await page.evaluate(() => window.__uxDebug.getDataSnapshot());
  expect(deleted.people).toHaveLength(initial.people.length - 1);
  expect(deleted.people.some(person => person.id === 'target')).toBe(false);
  expect(deleted.people.find(person => person.id === 'spouse').partners).toEqual([]);
  expect(deleted.people.find(person => person.id === 'child-a').parents).toEqual(['spouse']);
  expect(deleted.people.find(person => person.id === 'child-b').parents).toEqual([]);
  expect(deleted.rootIds).toEqual([]);
  await expect(page.getByTestId('root-selection-dialog')).toBeVisible();

  await page.evaluate(() => window.__uxDebug.undoCommand());
  expect(await page.evaluate(() => window.__uxDebug.getDataSnapshot())).toEqual(initial);
});
