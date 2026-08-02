const path = require('node:path');
const { test, expect } = require('@playwright/test');

const storeKey = 'mobile-family-tree-v5-clean';
const screenshotRoot = path.resolve(__dirname, '..', 'docs', 'ux-acceptance-screenshots');
const captureScreenshots = process.env.UPDATE_ACCEPTANCE_SCREENSHOTS === '1';
test.setTimeout(60_000);
const tree = {
  rootIds: ['accept-root'],
  people: [
    { id: 'accept-root', name: 'Anna Abnahme', firstName: 'Anna', lastName: 'Abnahme', born: '1940', x: 500, y: 250, parents: [], partners: ['accept-partner'] },
    { id: 'accept-partner', name: 'Paul Partner', firstName: 'Paul', lastName: 'Partner', born: '1942', x: 800, y: 250, parents: [], partners: ['accept-root'] },
    { id: 'accept-child', name: 'Clara Kernflow', firstName: 'Clara', lastName: 'Kernflow', born: '1970', x: 650, y: 620, parents: ['accept-root', 'accept-partner'], partners: [] }
  ]
};

async function openTree(page, viewport, value = tree) {
  await page.addInitScript(({ key, data }) => {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem(`${key}-help-seen-v1`, JSON.stringify(['pan-zoom', 'search', 'edit']));
  }, { key: storeKey, data: value });
  await page.setViewportSize(viewport);
  await page.goto('/?ux-debug=1');
  await page.getByTestId('welcome-continue').click();
  await expect(page.getByTestId('app-main-nav')).toBeVisible();
}

async function capture(page, filename) {
  if (!captureScreenshots) return;
  await page.screenshot({ path: path.join(screenshotRoot, filename) });
}

for (const scenario of [
  { label: '390x844', viewport: { width: 390, height: 844 } },
  { label: '768x1024', viewport: { width: 768, height: 1024 } },
  { label: '1440x900', viewport: { width: 1440, height: 900 } }
]) {
  test(`Abnahme-Kernflow bei ${scenario.label}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openTree(page, scenario.viewport);
    await expect(page.getByTestId('app-mode-toggle')).toContainText('Ansehen');
    await expect(page.getByTestId('app-mode-toggle')).toContainText('Bearbeiten');
    await capture(page, `start-${scenario.label}.png`);

    await page.getByTestId('person-search-open').click();
    await page.getByTestId('person-search').fill('Clara Kernflow');
    await page.getByTestId('person-search-result-accept-child').click();
    await expect(page.getByTestId('person-details')).toContainText('Clara Kernflow');
    await expect(page.getByTestId('person-dialog')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.getByTestId('person-dialog')).toBeVisible();
    await expect(page.getByTestId('people-directory')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByTestId('people-directory')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__uxStartupDebug.getUiState().surfaces.openSurfaceCount)).toBe(1);
    await expect(page.getByTestId('person-dialog')).toBeInViewport();
    await page.waitForTimeout(300);
    const personGeometry = await page.getByTestId('person-dialog').evaluate(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        width: rect.width,
        transform: style.transform,
        visibility: style.visibility,
        textLength: element.innerText.trim().length,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      };
    });
    expect(personGeometry.visibility).toBe('visible');
    expect(personGeometry.textLength).toBeGreaterThan(20);
    expect(personGeometry.width).toBeGreaterThan(300);
    expect(personGeometry.left).toBeGreaterThanOrEqual(0);
    expect(personGeometry.right).toBeLessThanOrEqual(personGeometry.viewportWidth + 1);
    expect(personGeometry.top).toBeGreaterThanOrEqual(0);
    expect(personGeometry.bottom).toBeLessThanOrEqual(personGeometry.viewportHeight + 1);
    await capture(page, `person-${scenario.label}.png`);

    await page.getByTestId('person-edit-open').click();
    await expect(page.getByTestId('app-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('form-section-additional').click();
    await page.getByLabel('Notiz', { exact: true }).fill(`Abnahme ${scenario.label}`);
    await page.getByTestId('person-save').click();
    await expect(page.getByTestId('person-details')).toContainText(`Abnahme ${scenario.label}`);
    await page.getByTestId('person-dialog-close').click();
    await expect(page.getByTestId('person-dialog')).toHaveAttribute('aria-hidden', 'true');
    await page.waitForTimeout(300);
    if (await page.getByTestId('person-search-sheet').isVisible().catch(() => false)) {
      await page.getByTestId('person-search-close').click();
      await expect(page.getByTestId('person-search-sheet')).toHaveAttribute('aria-hidden', 'true');
      await page.waitForTimeout(300);
    }

    await page.locator('body').focus();
    await page.keyboard.press('Control+z');
    await expect.poll(() => page.evaluate(() =>
      window.__uxDebug.getDataSnapshot().people.find(person => person.id === 'accept-child')?.note || ''
    )).toBe('');
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => page.evaluate(() =>
      window.__uxDebug.getDataSnapshot().people.find(person => person.id === 'accept-child')?.note || ''
    )).toBe(`Abnahme ${scenario.label}`);

    await page.getByTestId('app-file-menu-toggle').click();
    await page.getByTestId('json-export').click();
    await expect(page.getByTestId('export-dialog')).toBeVisible();
    await expect(page.getByTestId('export-summary')).toContainText('3');
    await capture(page, `export-${scenario.label}.png`);
    await page.getByTestId('export-cancel').click();
    expect(errors).toEqual([]);
  });
}

test('JSON-Import und Root-Auswahl sind als Abschlussflow funktionsfähig', async ({ page }) => {
  await openTree(page, { width: 768, height: 1024 });
  const imported = {
    rootIds: [],
    people: [{ id: 'import-final', name: 'Import Abschluss', x: 400, y: 300, parents: [], partners: [] }]
  };
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('app-mode-toggle').click();
  await page.getByTestId('app-file-menu-toggle').click();
  await page.getByTestId('json-import').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'abschluss.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
  await expect(page.getByTestId('import-layout-preserve')).toBeChecked();
  await page.getByTestId('import-confirm').click();
  await expect(page.getByTestId('root-selection-dialog')).toHaveAttribute('aria-hidden', 'false');
  await page.getByTestId('root-selection-search').fill('Import Abschluss');
  await capture(page, 'root-selection-768x1024.png');
  await page.getByTestId('root-selection-result-import-final').click();
  await expect(page.getByTestId('person-card-import-final')).toBeVisible();
  expect(await page.evaluate(() => window.__uxDebug.getDataSnapshot().rootIds)).toEqual(['import-final']);
});

test('Mobile-Überblick und Kernsuche funktionieren tastaturgesteuert', async ({ page }) => {
  await openTree(page, { width: 390, height: 844 });
  const overviewButton = page.getByTestId('overview-open');
  await overviewButton.click();
  await expect(page.getByTestId('overview-sheet')).toHaveAttribute('aria-hidden', 'false');
  await capture(page, 'overview-390x844.png');
  await page.getByTestId('overview-close').click();
  await expect(overviewButton).toBeFocused();

  const searchButton = page.getByTestId('person-search-open');
  await searchButton.focus();
  await page.keyboard.press('Enter');
  const search = page.getByTestId('person-search');
  await expect(search).toBeFocused();
  await page.keyboard.type('Clara');
  const result = page.getByTestId('person-search-result-accept-child');
  await result.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('person-dialog')).toHaveAttribute('aria-hidden', 'false');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('person-dialog')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator(':focus')).toBeVisible();
});
