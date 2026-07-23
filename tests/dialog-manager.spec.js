const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = `${storeKey}-help-seen-v1`;
const tree = {
  rootIds: ['source'],
  people: [
    {
      id: 'source',
      name: 'Dialog Quelle',
      firstName: 'Dialog',
      lastName: 'Quelle',
      born: '1950',
      x: 600,
      y: 500,
      parents: [],
      partners: []
    },
    {
      id: 'target',
      name: 'Dialog Ziel',
      firstName: 'Dialog',
      lastName: 'Ziel',
      born: '1975',
      x: 900,
      y: 800,
      parents: [],
      partners: []
    }
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
  await page.getByTestId('person-search').fill('Dialog Quelle');
  await page.getByTestId('person-search-result-source').click();
  await page.getByTestId('app-mode-toggle').click();
}

test('verschachtelter Beziehungsdialog isoliert die Personenansicht und hält den Fokus', async ({ page }) => {
  await openTree(page);
  await openEditForm(page);
  await page.getByTestId('form-section-relations').click();
  const trigger = page.locator('#quickPartner');
  await trigger.click();

  await expect.poll(() => page.evaluate(() => window.__uxDebug.getDialogStack()))
    .toEqual(['sheet', 'relationshipDialog']);
  await expect(page.getByTestId('person-dialog')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.getByTestId('person-dialog')).toHaveJSProperty('inert', true);
  await expect(page.getByTestId('relationship-dialog')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('header')).toHaveJSProperty('inert', true);

  await page.locator('#relationshipStep1Next').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('relationship-close')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#relationshipStep1Next')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('relationship-dialog')).toBeHidden();
  await expect(page.getByTestId('person-dialog')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.getByTestId('person-dialog')).toHaveJSProperty('inert', false);
  await expect(trigger).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.__uxDebug.getDialogStack())).toEqual(['sheet']);
});

test('Bestätigungsdialog liegt allein oben und gibt den Fokus an den Auslöser zurück', async ({ page }) => {
  await openTree(page);
  await openEditForm(page);
  await page.getByLabel('Vorname').fill('Ungespeichert');
  const close = page.getByTestId('person-dialog-close');
  await close.click();

  await expect.poll(() => page.evaluate(() => window.__uxDebug.getDialogStack()))
    .toEqual(['sheet', 'decisionDialog']);
  await expect(page.getByTestId('decision-cancel')).toBeFocused();
  await expect(page.locator('#backdrop')).not.toHaveClass(/show/);
  await expect(page.getByTestId('person-dialog')).toHaveJSProperty('inert', true);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('decision-dialog')).toBeHidden();
  await expect(close).toBeFocused();
  await expect(page.locator('#backdrop')).toHaveClass(/show/);
  await expect(page.getByTestId('person-dialog')).toHaveJSProperty('inert', false);
});

test('Export, Überblick und Verzeichnis nutzen dieselbe Fokus- und Escape-Steuerung', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTree(page);
  const fileButton = page.getByTestId('app-file-menu-toggle');
  await fileButton.click();
  await page.getByTestId('json-export').click();
  await expect.poll(() => page.evaluate(() => window.__uxDebug.getDialogStack())).toEqual(['exportDialog']);

  await page.getByTestId('export-submit').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('export-cancel')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('export-dialog')).toBeHidden();
  await expect(fileButton).toBeFocused();

  const overviewButton = page.getByTestId('overview-open');
  await overviewButton.click();
  await expect.poll(() => page.evaluate(() => window.__uxDebug.getDialogStack())).toEqual(['overviewSheet']);
  await page.keyboard.press('Escape');
  await expect(overviewButton).toBeFocused();

  const peopleButton = page.getByTestId('main-nav-people');
  await peopleButton.click();
  await expect.poll(() => page.evaluate(() => window.__uxDebug.getDialogStack())).toEqual(['listSheet']);
  await expect(page.getByTestId('directory-search')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__uxDebug.getDialogStack())).toEqual([]);
  await expect(peopleButton).toBeFocused();
});
