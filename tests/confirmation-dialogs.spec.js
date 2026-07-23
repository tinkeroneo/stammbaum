const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = `${storeKey}-help-seen-v1`;

const tree = {
  rootIds: ['current'],
  people: [
    { id: 'current', name: 'Dialog Person', firstName: 'Dialog', lastName: 'Person', born: '1950', x: 123, y: 456, parents: [], partners: [] },
    { id: 'child', name: 'Dialog Kind', firstName: 'Dialog', lastName: 'Kind', born: '1980', x: 1700, y: 1450, parents: ['current'], partners: [] }
  ]
};

async function openTree(page) {
  await page.addInitScript(({ key, value, seenKey }) => {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(seenKey, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, value: tree, seenKey: helpSeenKey });
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
}

async function openEditForm(page) {
  await page.getByTestId('person-search-open').click();
  await page.getByTestId('person-search').fill('Dialog Person');
  await page.getByTestId('person-search-result-current').click();
  await page.getByTestId('app-mode-toggle').click();
}

test('Verwerfen-Dialog bietet Weiterarbeiten, Speichern und bewusstes Verwerfen', async ({ page }) => {
  await openTree(page);
  await openEditForm(page);
  await page.getByLabel('Vorname').fill('Geändert');

  const close = page.getByTestId('person-dialog-close');
  await close.click();
  const dialog = page.getByTestId('decision-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Änderungen verwerfen?');
  await expect(page.getByTestId('decision-cancel')).toHaveText('Weiter bearbeiten');
  await expect(page.getByTestId('decision-cancel')).toBeFocused();
  await expect(page.getByTestId('decision-confirm')).toHaveClass(/danger/);
  await expect(page.getByTestId('decision-confirm')).not.toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(close).toBeFocused();
  await expect(page.getByLabel('Vorname')).toHaveValue('Geändert');

  await close.click();
  await page.getByTestId('decision-secondary').click();
  await expect(page.getByTestId('person-detail-view')).toBeVisible();
  await expect(page.getByTestId('person-details')).toContainText('Geändert Person');

  await page.getByTestId('person-edit-open').click();
  await page.getByLabel('Vorname').fill('Nicht speichern');
  await close.click();
  await page.getByTestId('decision-confirm').click();
  await expect(page.getByTestId('person-dialog')).toHaveAttribute('aria-hidden', 'true');
});

test('Auto-Layout lässt sich sicher abbrechen und bestätigt ausführen', async ({ page }) => {
  await openTree(page);
  await page.getByTestId('app-mode-toggle').click();
  const before = await page.evaluate(() => window.__uxDebug.getPerson('current'));

  await page.getByTestId('main-nav-more').click();
  const auto = page.locator('#autoBtn');
  await auto.click();
  await expect(page.getByTestId('decision-dialog')).toContainText('Stammbaum automatisch neu anordnen?');
  await expect(page.getByTestId('decision-cancel')).toHaveText('Positionen behalten');
  await page.keyboard.press('Escape');
  await expect(auto).toBeFocused();

  await auto.click();
  await page.getByTestId('decision-confirm').click();
  await expect.poll(async () => page.evaluate(() => window.__uxDebug.getPerson('current'))).not.toEqual(before);
});

test('Vorratverschiebung nennt die Folge und kehrt bei Abbruch zu Speichern zurück', async ({ page }) => {
  await openTree(page);
  await openEditForm(page);
  await page.getByTestId('form-section-admin').click();
  await page.getByLabel(/Hauptwurzel festlegen/).uncheck();
  await page.getByLabel(/Vorrat behalten/).check();

  const save = page.getByTestId('person-save');
  await save.click();
  await expect(page.getByTestId('decision-dialog')).toContainText('2 Person(en) dieses Zweigs');
  await expect(page.getByTestId('decision-confirm')).toHaveText('In Vorrat verschieben');
  await page.getByTestId('decision-cancel').click();
  await expect(save).toBeFocused();
  await expect(page.getByTestId('person-edit-form')).toBeVisible();

  await save.click();
  await page.getByTestId('decision-confirm').click();
  await expect.poll(async () => page.evaluate(key => {
    const stored = JSON.parse(localStorage.getItem(key));
    return stored.people.find(person => person.id === 'current')?.pool;
  }, storeKey)).toBe(true);
});

test('Reset ist destruktiv gekennzeichnet, abbrechbar und ersetzt erst nach Bestätigung', async ({ page }) => {
  await openTree(page);
  await page.getByTestId('main-nav-more').click();
  const reset = page.locator('#resetBtn');
  await reset.click();
  await expect(page.getByTestId('decision-dialog')).toContainText('Beispieldaten zurücksetzen?');
  await expect(page.getByTestId('decision-confirm')).toHaveClass(/danger/);
  await expect(page.getByTestId('decision-cancel')).toHaveText('Aktuelle Daten behalten');
  await page.getByTestId('decision-cancel').click();
  await expect(reset).toBeFocused();
  expect(await page.evaluate(() => window.__uxDebug.getPerson('current')?.id)).toBe('current');

  await reset.click();
  await page.getByTestId('decision-confirm').click();
  await expect.poll(async () => page.evaluate(() => window.__uxDebug.getPerson('current'))).toBeNull();
});
