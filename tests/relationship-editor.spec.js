const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = `${storeKey}-help-seen-v1`;

const tree = {
  rootIds: ['source'],
  people: [
    { id: 'source', name: 'Quelle Person', firstName: 'Quelle', lastName: 'Person', x: 600, y: 500, parents: [], partners: [] },
    { id: 'parent-candidate', name: 'Kandidat Eltern', firstName: 'Kandidat', lastName: 'Eltern', x: 300, y: 200, parents: [], partners: [] },
    { id: 'child-candidate', name: 'Kandidat Kind', firstName: 'Kandidat', lastName: 'Kind', x: 900, y: 800, parents: [], partners: [] },
    { id: 'descendant', name: 'Bestehendes Kind', firstName: 'Bestehendes', lastName: 'Kind', x: 600, y: 800, parents: ['source'], partners: [] },
    { id: 'partner-candidate', name: 'Kandidat Partner', firstName: 'Kandidat', lastName: 'Partner', x: 900, y: 500, parents: [], partners: [] }
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
  await page.getByTestId('person-search').fill('Quelle Person');
  await page.getByTestId('person-search-result-source').click();
  await page.getByTestId('app-mode-toggle').click();
  await page.getByTestId('form-section-relations').click();
}

async function chooseExistingPerson(page, id, query) {
  await page.locator('#relationshipStep1Next').click();
  await page.getByTestId('relationship-search').fill(query);
  await page.locator(`[data-relationship-target="${id}"]`).click();
  await page.locator('#relationshipStep2Next').click();
}

test('Elternteil und Kind werden über Auswahl, Zusammenfassung und Command ergänzt', async ({ page }) => {
  await openEditForm(page);
  await page.locator('#quickParents').click();
  await chooseExistingPerson(page, 'parent-candidate', 'Kandidat Eltern');
  await expect(page.getByTestId('relationship-summary')).toContainText(
    'Kandidat Eltern wird als Elternteil von Quelle Person gespeichert'
  );
  await page.getByTestId('relationship-confirm').click();

  let snapshot = await page.evaluate(() => window.__uxDebug.getDataSnapshot());
  expect(snapshot.people.find(person => person.id === 'source').parents).toEqual(['parent-candidate']);
  expect(await page.evaluate(() => window.__uxDebug.getCommandHistoryState().undoLabel)).toBe('Beziehung hinzufügen');

  await page.evaluate(() => window.__uxDebug.undoCommand());
  snapshot = await page.evaluate(() => window.__uxDebug.getDataSnapshot());
  expect(snapshot.people.find(person => person.id === 'source').parents).toEqual([]);

  await page.getByTestId('person-edit-open').click();
  if (!await page.locator('#quickChild').isVisible()) {
    await page.getByTestId('form-section-relations').click();
  }
  await page.locator('#quickChild').click();
  await chooseExistingPerson(page, 'child-candidate', 'Kandidat Kind');
  await expect(page.getByTestId('relationship-summary')).toContainText(
    'Kandidat Kind wird als Kind von Quelle Person gespeichert'
  );
  await page.getByTestId('relationship-confirm').click();
  snapshot = await page.evaluate(() => window.__uxDebug.getDataSnapshot());
  expect(snapshot.people.find(person => person.id === 'child-candidate').parents).toEqual(['source']);
});

test('neue Partnerschaft ist immer gegenseitig und teilt das Heiratsdatum', async ({ page }) => {
  const nativeDialogs = [];
  page.on('dialog', async dialog => {
    nativeDialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await openEditForm(page);
  await page.locator('#quickPartner').click();
  await page.locator('#relationshipStep1Next').click();
  await page.locator('input[name="relationshipMode"][value="new"]').check();
  await page.locator('#relationshipFirstName').fill('Neue');
  await page.locator('#relationshipLastName').fill('Partnerperson');
  await page.locator('#relationshipMarriageDate').fill('12.05.2001');
  await page.locator('#relationshipStep2Next').click();

  await expect(page.getByTestId('relationship-summary')).toContainText(
    'immer gegenseitig als Partner/innen verknüpft'
  );
  await expect(page.getByTestId('relationship-summary')).toContainText('Heiratsdatum: 12.05.2001');
  await page.getByTestId('relationship-confirm').click();

  const result = await page.evaluate(() => {
    const snapshot = window.__uxDebug.getDataSnapshot();
    const source = snapshot.people.find(person => person.id === 'source');
    const target = snapshot.people.find(person => person.name === 'Neue Partnerperson');
    return { source, target };
  });
  expect(result.target).toBeTruthy();
  expect(result.source.partners).toContain(result.target.id);
  expect(result.target.partners).toContain('source');
  expect(result.source.partnerDetails[result.target.id].married).toBe('12.05.2001');
  expect(result.target.partnerDetails.source.married).toBe('12.05.2001');

  await page.locator('#quickPartner').click();
  await chooseExistingPerson(page, 'partner-candidate', 'Kandidat Partner');
  await page.getByTestId('relationship-confirm').click();
  const multiple = await page.evaluate(() => {
    const snapshot = window.__uxDebug.getDataSnapshot();
    return {
      source: snapshot.people.find(person => person.id === 'source'),
      candidate: snapshot.people.find(person => person.id === 'partner-candidate')
    };
  });
  expect(multiple.source.partners).toHaveLength(2);
  expect(multiple.source.partners).toContain('partner-candidate');
  expect(multiple.candidate.partners).toContain('source');
  expect(nativeDialogs).toEqual([]);
});

test('Selbstbezug und Elternzyklen werden vor der Bestätigung blockiert', async ({ page }) => {
  await openEditForm(page);
  const pure = await page.evaluate(() => ({
    self: window.__uxDebug.validateRelationshipChoice('source', 'partner', 'source'),
    cycle: window.__uxDebug.validateRelationshipChoice('source', 'parent', 'descendant')
  }));
  expect(pure.self.valid).toBe(false);
  expect(pure.self.error).toContain('nicht mit sich selbst');
  expect(pure.cycle.valid).toBe(false);
  expect(pure.cycle.error).toContain('Kreis');

  await page.locator('#quickParents').click();
  await page.locator('#relationshipStep1Next').click();
  await page.getByTestId('relationship-search').fill('Bestehendes Kind');
  await page.locator('[data-relationship-target="descendant"]').click();
  await page.locator('#relationshipStep2Next').click();
  await expect(page.locator('#relationshipError')).toContainText('Kreis');
  await expect(page.locator('[data-relationship-step="2"]')).toBeVisible();
  await expect(page.getByTestId('relationship-confirm')).toBeHidden();
});

test('Abbruch in Auswahl und Zusammenfassung behält den Personendraft und erzeugt nichts', async ({ page }) => {
  await openEditForm(page);
  const beforeCount = await page.evaluate(() => window.__uxDebug.getDataSnapshot().people.length);
  await page.getByLabel('Vorname').fill('Ungespeicherter Vorname');
  const trigger = page.locator('#quickPartner');

  await trigger.click();
  await page.locator('#relationshipStep1Next').click();
  await page.locator('input[name="relationshipMode"][value="new"]').check();
  await page.locator('#relationshipFirstName').fill('Nicht');
  await page.locator('#relationshipLastName').fill('Anlegen');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('relationship-dialog')).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByLabel('Vorname')).toHaveValue('Ungespeicherter Vorname');

  await trigger.click();
  await page.locator('#relationshipStep1Next').click();
  await page.locator('input[name="relationshipMode"][value="new"]').check();
  await page.locator('#relationshipFirstName').fill('Auch');
  await page.locator('#relationshipLastName').fill('Nicht');
  await page.locator('#relationshipStep2Next').click();
  await page.getByTestId('relationship-close').click();

  expect(await page.evaluate(() => window.__uxDebug.getDataSnapshot().people.length)).toBe(beforeCount);
  await expect(page.getByLabel('Vorname')).toHaveValue('Ungespeicherter Vorname');
});
