const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';

async function openTree(page) {
  await page.addInitScript(key => {
    localStorage.setItem(key, JSON.stringify({
      rootIds: ['focus-person'],
      people: [
        { id: 'focus-person', name: 'Fokus Person', firstName: 'Fokus', lastName: 'Person', x: 1000, y: 1000, parents: [], partners: [] },
        { id: 'focus-child', name: 'Kind Person', firstName: 'Kind', lastName: 'Person', x: 1000, y: 1260, parents: ['focus-person'], partners: [] }
      ]
    }));
  }, storeKey);
  await page.goto('/?ux-debug=1');
  if (await page.getByTestId('welcome-continue').isVisible().catch(() => false)) {
    await page.getByTestId('welcome-continue').click();
  }
}

async function openFocusPerson(page) {
  await page.getByTestId('person-search-open').click();
  await page.getByTestId('person-search').fill('Fokus Person');
  await page.getByTestId('person-search-result-focus-person').click();
}

test('Nahbereich ist in der Detailansicht verständlich benannt und umschaltbar', async ({ page }) => {
  await openTree(page);
  await openFocusPerson(page);

  const toggle = page.getByTestId('person-focus-toggle');
  await expect(toggle).toHaveText('Nahbereich zeigen');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#personFocusHint')).toHaveText('Zeigt zwei Generationen davor und danach.');

  await toggle.click();
  await expect(toggle).toHaveText('Gesamten Baum zeigen');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__uxStartupDebug.getUiState().mode.focusMode)).toBe(true);

  await toggle.click();
  await expect(toggle).toHaveText('Nahbereich zeigen');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.__uxStartupDebug.getUiState().mode.focusMode)).toBe(false);
});

test('aktiver Nahbereich lässt sich über die Hauptnavigation beenden', async ({ page }) => {
  await openTree(page);
  await openFocusPerson(page);
  await page.getByTestId('person-focus-toggle').click();
  await page.getByTestId('person-dialog-close').click();
  if (await page.getByTestId('person-search-sheet').isVisible().catch(() => false)) {
    await page.getByTestId('person-search-close').click();
  }

  await page.getByTestId('main-nav-more').click();
  const settingsToggle = page.getByTestId('focus-mode-toggle');
  await expect(settingsToggle).toContainText('Gesamten Baum zeigen');
  await expect(settingsToggle).toHaveAttribute('aria-pressed', 'true');

  await settingsToggle.click();
  expect(await page.evaluate(() => window.__uxStartupDebug.getUiState().mode.focusMode)).toBe(false);

  await page.getByTestId('main-nav-more').click();
  await expect(settingsToggle).toContainText('Nahbereich zeigen');
  await expect(settingsToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('body')).not.toContainText('2/2');
});
