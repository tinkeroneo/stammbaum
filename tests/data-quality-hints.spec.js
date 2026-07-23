const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = `${storeKey}-help-seen-v1`;

const tree = {
  rootIds: ['incomplete'],
  people: [
    { id: 'parent-a', name: 'Eltern A', firstName: 'Eltern', lastName: 'A', born: '1920', x: 300, y: 200, parents: [], partners: [] },
    { id: 'parent-b', name: 'Eltern B', firstName: 'Eltern', lastName: 'B', born: '1922', x: 600, y: 200, parents: [], partners: [] },
    {
      id: 'incomplete',
      name: 'Offene Person',
      firstName: 'Offene',
      lastName: 'Unbekannt',
      born: '',
      x: 450,
      y: 500,
      parents: ['parent-a'],
      partners: []
    },
    {
      id: 'complete',
      name: 'Komplette Person',
      firstName: 'Komplette',
      lastName: 'Person',
      born: '1950',
      x: 800,
      y: 500,
      parents: ['parent-a', 'parent-b'],
      partners: []
    }
  ]
};

async function openEditForm(page, personName, personId) {
  await page.addInitScript(({ key, value, seenKey }) => {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(seenKey, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, value: tree, seenKey: helpSeenKey });
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
  await page.getByTestId('person-search-open').click();
  await page.getByTestId('person-search').fill(personName);
  await page.getByTestId(`person-search-result-${personId}`).click();
  await page.getByTestId('app-mode-toggle').click();
}

test('unvollständige historische Daten werden gespeichert und neutral erklärt', async ({ page }) => {
  const dialogs = [];
  page.on('dialog', async dialog => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await openEditForm(page, 'Offene Unbekannt', 'incomplete');
  await page.getByTestId('person-save').click();

  const hint = page.getByTestId('data-quality-hint');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('Die Person wurde gespeichert');
  await expect(hint).toContainText('Geburtsdatum oder ungefähres Geburtsjahr fehlt');
  await expect(hint).toContainText('Nachname ist nicht eindeutig dokumentiert');
  await expect(hint).toContainText('Bisher ist nur ein Elternteil verknüpft');
  await expect(page.getByTestId('data-quality-complete')).toBeFocused();
  expect(dialogs).toEqual([]);

  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storeKey);
  expect(stored.people.find(person => person.id === 'incomplete')).toBeTruthy();

  await page.getByTestId('data-quality-later').click();
  await expect(hint).toBeHidden();
  await expect(page.getByTestId('person-edit-open')).toBeFocused();
});

test('Jetzt ergänzen führt nacheinander zum passenden Feld oder Beziehungsflow', async ({ page }) => {
  await openEditForm(page, 'Offene Unbekannt', 'incomplete');
  await page.getByTestId('person-save').click();
  await page.getByTestId('data-quality-complete').click();
  await expect(page.getByLabel('Geboren')).toBeFocused();
  await page.getByLabel('Geboren').fill('1955');
  await page.getByTestId('person-save').click();

  await expect(page.getByTestId('data-quality-hint')).not.toContainText('Geburtsdatum');
  await page.getByTestId('data-quality-complete').click();
  await expect(page.getByLabel('Nachname')).toBeFocused();
  await page.getByLabel('Nachname').fill('Person');
  await page.getByTestId('person-save').click();

  await expect(page.getByTestId('data-quality-hint')).toContainText('nur ein Elternteil');
  await page.getByTestId('data-quality-complete').click();
  await expect(page.locator('#quickParents')).toBeVisible();
  await expect(page.locator('#quickParents')).toBeFocused();
});

test('vollständige Person zeigt nach dem Speichern keinen Hinweis', async ({ page }) => {
  await openEditForm(page, 'Komplette Person', 'complete');
  await page.getByTestId('person-save').click();
  await expect(page.getByTestId('data-quality-hint')).toBeHidden();
  await expect(page.getByTestId('person-detail-view')).toBeVisible();
});
