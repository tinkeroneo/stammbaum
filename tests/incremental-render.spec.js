const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';
const tree = {
  rootIds: ['root'],
  people: [
    { id: 'root', name: 'Wurzel Person', firstName: 'Wurzel', lastName: 'Person', x: 500, y: 300, parents: [], partners: [] },
    { id: 'child', name: 'Kind Person', firstName: 'Kind', lastName: 'Person', x: 500, y: 650, parents: ['root'], partners: [] },
    { id: 'other', name: 'Andere Person', firstName: 'Andere', lastName: 'Person', x: 900, y: 650, parents: ['root'], partners: [] }
  ]
};

async function openTree(page) {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(`${key}-help-seen-v1`, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, value: tree });
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
}

test('unveränderte Karten und Linien behalten DOM-Identität und Fokus', async ({ page }) => {
  await openTree(page);
  const child = page.getByTestId('person-card-child');
  await child.focus();
  await page.evaluate(() => {
    document.querySelector('[data-testid="person-card-child"]').closest('.person').dataset.identity = 'child-card';
    document.querySelector('svg.lines > *').dataset.identity = 'relationship-line';
    window.__uxDebug.renderForTest();
  });

  await expect(child).toBeFocused();
  await expect(child.locator('xpath=ancestor::*[contains(@class,"person")][1]')).toHaveAttribute('data-identity', 'child-card');
  await expect(page.locator('svg.lines > [data-identity="relationship-line"]')).toHaveCount(1);
});

test('Personenpatch ersetzt nur die geänderte Karte und nicht Beziehungen', async ({ page }) => {
  await openTree(page);
  await page.evaluate(() => {
    document.querySelector('[data-testid="person-card-root"]').closest('.person').dataset.identity = 'root-before';
    document.querySelector('[data-testid="person-card-child"]').closest('.person').dataset.identity = 'child-before';
    document.querySelector('svg.lines > *').dataset.identity = 'line-before';
    window.__uxDebug.updatePersonForTest('root', { note: 'Neu dokumentiert' });
  });

  await expect(page.locator('.person[data-identity="root-before"]')).toHaveCount(0);
  await expect(page.locator('.person[data-identity="child-before"]')).toHaveCount(1);
  await expect(page.locator('svg.lines > [data-identity="line-before"]')).toHaveCount(1);
  await expect(page.getByTestId('person-card-root')).toContainText('Neu dokumentiert');
});

test('reine Detailöffnung baut den Canvas nicht neu auf', async ({ page }) => {
  await openTree(page);
  await page.evaluate(() => {
    document.querySelector('[data-testid="person-card-child"]').closest('.person').dataset.identity = 'before-detail';
  });
  await page.getByTestId('person-card-child').click();
  await expect(page.getByTestId('person-dialog')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('.person[data-identity="before-detail"]')).toHaveCount(1);
  await expect(page.getByTestId('person-card-child')).toHaveAttribute('aria-current', 'true');
});
