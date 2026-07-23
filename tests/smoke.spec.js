const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const smokeTree = require('./fixtures/smoke-tree.cjs');

const productionDataPath = path.resolve(__dirname, '..', 'Bodensteiner.json');
const originalProductionDataHash = fileHash(productionDataPath);

function fileHash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function clearBrowserStorage(page) {
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    if (!indexedDB.databases) return;
    const databases = await indexedDB.databases();
    await Promise.all(databases.filter(database => database.name).map(database => new Promise(resolve => {
      const request = indexedDB.deleteDatabase(database.name);
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    })));
  });
}

test.afterAll(() => {
  expect(fileHash(productionDataPath), 'Bodensteiner.json must remain unchanged').toBe(originalProductionDataHash);
});

test('load, search, inspect, edit mode and save a new isolated person', async ({ page }) => {
  await page.route('**/Bodensteiner.json', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(smokeTree)
  }));

  try {
    await page.goto('/');
    await expect(page.getByTestId('welcome-surface')).toBeVisible();
    if (await page.getByTestId('welcome-continue').isVisible()) {
      await page.getByTestId('welcome-continue').click();
    } else {
      await page.getByTestId('welcome-demo').click();
    }
    await expect(page.getByTestId('app-shell')).toBeVisible();
    await expect(page.getByTestId('busy-indicator')).toBeHidden();
    await expect(page.getByTestId('person-card-smoke-root')).toBeVisible();

    await page.getByTestId('person-search-open').click();
    await page.getByTestId('person-search').fill('Smoke Root');
    const rootResult = page.getByTestId('person-search-result-smoke-root');
    await expect(rootResult).toBeVisible();
    await rootResult.click();

    await expect(page.getByTestId('person-dialog')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.getByTestId('person-details')).toContainText('Smoke Root');

    await page.getByTestId('app-mode-toggle').click();
    await expect(page.locator('body')).toHaveClass(/editMode/);
    await expect(page.getByTestId('person-save')).toBeVisible();
    await page.getByTestId('person-dialog-close').click();

    await page.locator('#addBtn').click();
    await expect(page.getByTestId('person-dialog')).toHaveAttribute('aria-hidden', 'false');
    await page.getByLabel('Vorname').fill('Smoke');
    await page.getByLabel('Nachname').fill('Neu');
    await page.getByLabel('Geboren').fill('2000');
    await page.getByTestId('person-save').click();
    await expect(page.getByTestId('person-dialog')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.getByTestId('person-detail-view')).toBeVisible();
    await expect(page.getByTestId('person-details')).toContainText(/Smoke\s*Neu/);
    await page.getByTestId('person-dialog-close').click();

    await page.getByTestId('person-search-open').click();
    await page.getByTestId('person-search').fill('Smoke Neu');
    await expect(page.getByTestId('person-search-results')).toContainText('Smoke Neu');
  } finally {
    await clearBrowserStorage(page);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  }
});
